// drcman-live-1000.js
// Canli 1000 sorulu DRC MAN regression testi.
// In-process express server + SESSION_SECRET ile imzali admin cookie.
// 4 kategori (stok, adet, fiyat, muadil) x 2 dil (tr, de) = 8 grup
// her gruptan 125 soru = 1000.
//
// Ciktilar:
//   /tmp/drcman-live-1000-detail.jsonl  -> her sorunun kayitli detayi
//   /tmp/drcman-live-1000-summary.json  -> kategori/dil/provider breakdown

"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const Keygrip = require("keygrip");
const { Pool } = require("pg");

// Server pool drops can throw 'Connection terminated unexpectedly' from
// pg-pool's internal handlers. Treat as warning, not crash.
process.on("unhandledRejection", (err) => {
  console.error("[live-1000] unhandledRejection:", err && err.message ? err.message : err);
});
process.on("uncaughtException", (err) => {
  console.error("[live-1000] uncaughtException:", err && err.message ? err.message : err);
});

// Manuel .env yukleme (dotenv yok)
try {
  const envPath = path.join(__dirname, "..", ".env");
  const txt = fs.readFileSync(envPath, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined && process.env[m[1]] !== "") continue;
    let v = m[2];
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
} catch (e) {
  console.error(".env okunamadi:", e.message);
}
process.env.DATABASE_URL = (process.env.DATABASE_URL || "").replace(/^"|"$/g, "");

const SESSION_SECRET = process.env.SESSION_SECRET;
const COOKIE_NAME = "hamburg_session";
const TEST_PORT = Number(process.env.LIVE_TEST_PORT || 13700);

if (!SESSION_SECRET) {
  console.error("SESSION_SECRET .env'de yok");
  process.exit(1);
}

const keygrip = new Keygrip([SESSION_SECRET]);

function buildAdminCookie(adminUser) {
  const sessionObj = { user: adminUser };
  const value = Buffer.from(JSON.stringify(sessionObj)).toString("base64");
  const sig = keygrip.sign(`${COOKIE_NAME}=${value}`);
  return `${COOKIE_NAME}=${value}; ${COOKIE_NAME}.sig=${sig}`;
}

function postQuery(cookie, body, timeoutMs = 75000) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    let settled = false;
    const settle = (val) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };
    const req = http.request(
      {
        host: "127.0.0.1",
        port: TEST_PORT,
        method: "POST",
        path: "/api/assistant/query",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(data),
          cookie,
          "user-agent": "drcman-live-1000",
        },
        timeout: timeoutMs,
      },
      (res) => {
        let chunks = "";
        res.on("data", (c) => (chunks += c));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = JSON.parse(chunks);
          } catch (_e) {
            parsed = { rawError: chunks.slice(0, 200) };
          }
          settle({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", (err) => settle({ status: 0, body: { error: err.message } }));
    req.on("timeout", () => {
      try { req.destroy(new Error("client timeout")); } catch (_e) {}
      settle({ status: 0, body: { error: "client timeout" } });
    });
    req.write(data);
    req.end();
  });
}

async function main() {
  const pg = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 60000,
  });

  // 1) Pick an admin user for session
  const adminQ = await pg.query(
    "SELECT id, name, username, email, role FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"
  );
  if (adminQ.rows.length === 0) {
    throw new Error("admin user not found");
  }
  const adminRow = adminQ.rows[0];
  const adminUser = {
    id: adminRow.id,
    name: adminRow.name,
    username: adminRow.username,
    email: adminRow.email,
    role: adminRow.role,
  };
  console.log("[live-1000] using admin:", adminUser.username || adminUser.email);

  // 2) Pull stocked items + a few muadil-friendly ones (compressors / fans / valves)
  const itemsQ = await pg.query(`
    SELECT id, name, name_de, brand, category, product_code, default_price, sale_price, list_price
    FROM items
    WHERE COALESCE(is_active, TRUE) = TRUE
    ORDER BY RANDOM()
    LIMIT 600
  `);
  const items = itemsQ.rows;
  if (items.length < 100) {
    throw new Error(`not enough items: ${items.length}`);
  }
  console.log("[live-1000] items pool:", items.length);

  // 3) Generate 1000 questions: 125 per (category x lang)
  const QUESTIONS = [];
  const trStokTpls = [
    (n) => `${n} stok var mi?`,
    (n) => `${n} stokta var mi?`,
    (n) => `Elinizde ${n} kaldi mi?`,
    (n) => `${n} mevcut mu?`,
  ];
  const trAdetTpls = [
    (n) => `${n} kac adet var?`,
    (n) => `${n} kac tane mevcut?`,
    (n) => `Depoda ${n} kac adet?`,
    (n) => `${n} stogu kac adet?`,
  ];
  const trFiyatTpls = [
    (n) => `${n} fiyati nedir?`,
    (n) => `${n} satis fiyati nedir?`,
    (n) => `${n} kaca satilir?`,
    (n) => `${n} ucreti nedir?`,
  ];
  const trMuadilTpls = [
    (n) => `${n} muadili nedir?`,
    (n) => `${n} alternatifi var mi?`,
    (n) => `${n} yerine ne kullanilir?`,
    (n) => `${n} esdegeri nedir?`,
  ];
  const deStokTpls = [
    (n) => `Ist ${n} auf Lager?`,
    (n) => `Habt ihr ${n} vorraetig?`,
    (n) => `${n} verfuegbar?`,
    (n) => `${n} noch da?`,
  ];
  const deAdetTpls = [
    (n) => `Wie viele ${n} sind auf Lager?`,
    (n) => `Wie viel Stueck ${n} habt ihr?`,
    (n) => `Wie viele ${n} im Bestand?`,
    (n) => `Wie viele ${n} verfuegbar?`,
  ];
  const deFiyatTpls = [
    (n) => `Was kostet ${n}?`,
    (n) => `Preis von ${n}?`,
    (n) => `Verkaufspreis fuer ${n}?`,
    (n) => `Wie teuer ist ${n}?`,
  ];
  const deMuadilTpls = [
    (n) => `Was ist das Aequivalent zu ${n}?`,
    (n) => `Welche Alternative gibt es fuer ${n}?`,
    (n) => `Ersatz fuer ${n}?`,
    (n) => `Womit kann man ${n} ersetzen?`,
  ];

  function pickName(it, lang) {
    const trName = it.name || it.name_de || it.product_code;
    const deName = it.name_de || it.name || it.product_code;
    return lang === "de" ? deName : trName;
  }

  function buildBatch(category, lang, tpls) {
    for (let i = 0; i < 125; i++) {
      const it = items[(i + category.length * 17 + lang.length * 13) % items.length];
      const tpl = tpls[i % tpls.length];
      const n = pickName(it, lang);
      QUESTIONS.push({
        category,
        lang,
        message: tpl(n),
        itemId: it.id,
        itemName: n,
      });
    }
  }
  buildBatch("stok", "tr", trStokTpls);
  buildBatch("adet", "tr", trAdetTpls);
  buildBatch("fiyat", "tr", trFiyatTpls);
  buildBatch("muadil", "tr", trMuadilTpls);
  buildBatch("stok", "de", deStokTpls);
  buildBatch("adet", "de", deAdetTpls);
  buildBatch("fiyat", "de", deFiyatTpls);
  buildBatch("muadil", "de", deMuadilTpls);
  console.log("[live-1000] questions:", QUESTIONS.length);

  await pg.end();

  // 4) Start in-process server
  // db.initDatabase() must run before app handlers can query the pool.
  const dbModule = require(path.join(__dirname, "..", "server", "db"));
  await dbModule.initDatabase();
  console.log("[live-1000] db initialized");
  const { createApp } = require(path.join(__dirname, "..", "server", "app"));
  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(TEST_PORT, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  console.log("[live-1000] in-process server up on", TEST_PORT);

  // 5) Build admin cookie
  const cookie = buildAdminCookie(adminUser);
  console.log("[live-1000] admin cookie crafted");

  // 6) Smoke check: hit /api/me to verify session is recognized
  const meCheck = await new Promise((resolve) => {
    http
      .get(
        {
          host: "127.0.0.1",
          port: TEST_PORT,
          path: "/api/me",
          headers: { cookie },
        },
        (res) => {
          let buf = "";
          res.on("data", (c) => (buf += c));
          res.on("end", () => resolve({ status: res.statusCode, body: buf.slice(0, 400) }));
        }
      )
      .on("error", (err) => resolve({ status: 0, body: err.message }));
  });
  console.log("[live-1000] /api/me status=" + meCheck.status, meCheck.body);

  if (meCheck.status !== 200 || !/admin/.test(meCheck.body)) {
    console.error("[live-1000] session not recognized. abort.");
    server.close();
    process.exit(2);
  }

  // 7) Fire 1000 queries (sequential, modest concurrency)
  const detailPath = "/tmp/drcman-live-1000-detail.jsonl";
  fs.writeFileSync(detailPath, "");
  const summary = {
    total: QUESTIONS.length,
    byCategory: {},
    byLang: {},
    byProvider: {},
    byCategoryLang: {},
    failures: 0,
    startedAt: new Date().toISOString(),
  };

  const CONCURRENCY = Number(process.env.LIVE_CONCURRENCY || 3);
  let nextIdx = 0;
  let done = 0;
  async function worker() {
    while (true) {
      const i = nextIdx++;
      if (i >= QUESTIONS.length) return;
      const q = QUESTIONS[i];
      const t0 = Date.now();
      let result = null;
      // 1 retry on transient server errors
      for (let attempt = 0; attempt < 2; attempt++) {
        result = await postQuery(cookie, {
          message: q.message,
          language: q.lang,
          history: [],
        });
        if (result && result.status === 200) break;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
      }
      const elapsed = Date.now() - t0;
      const provider = result?.body?.provider || "none";
      const answer = result?.body?.answer || result?.body?.error || "";
      const sourceSummary = result?.body?.sourceSummary || "";
      const trimmed = String(answer).slice(0, 240).replace(/\s+/g, " ");
      const row = {
        i,
        category: q.category,
        lang: q.lang,
        question: q.message,
        itemName: q.itemName,
        status: result.status,
        provider,
        sourceSummary,
        elapsedMs: elapsed,
        answerSnippet: trimmed,
      };
      fs.appendFileSync(detailPath, JSON.stringify(row) + "\n");

      summary.byCategory[q.category] = summary.byCategory[q.category] || { total: 0 };
      summary.byCategory[q.category].total += 1;
      summary.byCategory[q.category][provider] = (summary.byCategory[q.category][provider] || 0) + 1;

      summary.byLang[q.lang] = summary.byLang[q.lang] || { total: 0 };
      summary.byLang[q.lang].total += 1;
      summary.byLang[q.lang][provider] = (summary.byLang[q.lang][provider] || 0) + 1;

      const key = `${q.category}.${q.lang}`;
      summary.byCategoryLang[key] = summary.byCategoryLang[key] || { total: 0 };
      summary.byCategoryLang[key].total += 1;
      summary.byCategoryLang[key][provider] = (summary.byCategoryLang[key][provider] || 0) + 1;

      summary.byProvider[provider] = (summary.byProvider[provider] || 0) + 1;
      if (result.status !== 200) summary.failures += 1;

      done += 1;
      if (done % 50 === 0) {
        console.log(`[live-1000] ${done}/${QUESTIONS.length} provider=${provider} cat=${q.category}/${q.lang}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  summary.finishedAt = new Date().toISOString();
  fs.writeFileSync("/tmp/drcman-live-1000-summary.json", JSON.stringify(summary, null, 2));

  console.log("\n=== SUMMARY ===");
  console.log("Total:", summary.total, "Failures:", summary.failures);
  console.log("\nProviders:");
  for (const [p, n] of Object.entries(summary.byProvider).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${p.padEnd(20)} ${n}`);
  }
  console.log("\nCategory x Lang:");
  for (const key of Object.keys(summary.byCategoryLang).sort()) {
    const obj = summary.byCategoryLang[key];
    const provs = Object.entries(obj)
      .filter(([k]) => k !== "total")
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    console.log(`  ${key.padEnd(12)} total=${obj.total}  ${provs}`);
  }

  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
