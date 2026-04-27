// drcman-live-retry.js
// Sadece basarisiz olan sorulari yeniden calistirir.
// Onceki cikti: /tmp/drcman-live-1000-detail.jsonl (1000 row, 627 fail)
// Yeni cikti:   /tmp/drcman-live-retry-detail.jsonl (sadece retried)
//               /tmp/drcman-live-final-detail.jsonl (merge OK lines + retry results)
//               /tmp/drcman-live-final-summary.json
"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const Keygrip = require("keygrip");
const { Pool } = require("pg");

process.on("unhandledRejection", (err) => {
  console.error("[retry] unhandledRejection:", err && err.message ? err.message : err);
});
process.on("uncaughtException", (err) => {
  console.error("[retry] uncaughtException:", err && err.message ? err.message : err);
});

// .env yukle
try {
  const txt = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
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
const TEST_PORT = Number(process.env.LIVE_TEST_PORT || 13701);
const ORIG_DETAIL = "/tmp/drcman-live-1000-detail.jsonl";
const RETRY_DETAIL = "/tmp/drcman-live-retry-detail.jsonl";
const FINAL_DETAIL = "/tmp/drcman-live-final-detail.jsonl";
const FINAL_SUMMARY = "/tmp/drcman-live-final-summary.json";

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

function postQuery(cookie, body, timeoutMs = 90000) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    let settled = false;
    const settle = (val) => { if (settled) return; settled = true; resolve(val); };
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
          "user-agent": "drcman-live-retry",
        },
        timeout: timeoutMs,
      },
      (res) => {
        let chunks = "";
        res.on("data", (c) => (chunks += c));
        res.on("end", () => {
          let parsed = null;
          try { parsed = JSON.parse(chunks); }
          catch (_e) { parsed = { rawError: chunks.slice(0, 200) }; }
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
  // 1) Onceki run'dan basarisizlari ayikla
  const origLines = fs.readFileSync(ORIG_DETAIL, "utf8").trim().split("\n").filter(Boolean);
  const okRows = [];
  const failed = [];
  for (const line of origLines) {
    let r; try { r = JSON.parse(line); } catch (e) { continue; }
    if (r.status === 200 && r.provider && r.provider !== "none") okRows.push(r);
    else failed.push(r);
  }
  console.log(`[retry] OK satirlar: ${okRows.length}, retry edilecek: ${failed.length}`);

  // 2) Admin user ve session
  const pg = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1, connectionTimeoutMillis: 30000,
  });
  const adminQ = await pg.query(
    "SELECT id, name, username, email, role FROM users WHERE role='admin' ORDER BY id LIMIT 1"
  );
  if (adminQ.rows.length === 0) throw new Error("admin not found");
  const adminRow = adminQ.rows[0];
  const adminUser = {
    id: adminRow.id, name: adminRow.name, username: adminRow.username,
    email: adminRow.email, role: adminRow.role,
  };
  await pg.end();
  console.log("[retry] admin:", adminUser.username);

  // 3) initDatabase + start app
  // Sustained load icin connection timeout'u uzat, pool'u kuculmt (pgbouncer
  // tarafinda fewer-but-longer-lived connections).
  process.env.PG_POOL_MAX = process.env.PG_POOL_MAX || "5";
  process.env.PG_CONN_TIMEOUT_MS = process.env.PG_CONN_TIMEOUT_MS || "60000";
  console.log(`[retry] pool max=${process.env.PG_POOL_MAX} conn_timeout=${process.env.PG_CONN_TIMEOUT_MS}`);
  const dbModule = require(path.join(__dirname, "..", "server", "db"));
  await dbModule.initDatabase();
  const { createApp } = require(path.join(__dirname, "..", "server", "app"));
  const app = createApp();
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(TEST_PORT, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  console.log("[retry] server up on", TEST_PORT);

  const cookie = buildAdminCookie(adminUser);

  // 4) Smoke check
  const meCheck = await new Promise((resolve) => {
    http.get({ host: "127.0.0.1", port: TEST_PORT, path: "/api/me", headers: { cookie } },
      (res) => {
        let buf = ""; res.on("data", (c) => (buf += c));
        res.on("end", () => resolve({ status: res.statusCode, body: buf.slice(0, 400) }));
      }).on("error", (err) => resolve({ status: 0, body: err.message }));
  });
  console.log("[retry] /api/me", meCheck.status);
  if (meCheck.status !== 200) { server.close(); process.exit(2); }

  // 5) Retry queries
  // Re-use existing retry results so we can resume after kills
  let preExisting = [];
  try {
    const txt = fs.readFileSync(RETRY_DETAIL, "utf8").trim();
    if (txt) preExisting = txt.split("\n").map((l) => JSON.parse(l));
  } catch (_e) {}
  // OK kriteri: status===200 ise kabul. provider=none olsa bile sistem cevap
  // verdi (eşleşme yok demek). Aksi halde muadil/tr sorgular hep none döner ve
  // sonsuz döngü olur. Final raporda provider=none ayrıca sayılır.
  const okIdxFromRetry = new Set(
    preExisting.filter((r) => r.status === 200).map((r) => r.i)
  );
  const remainingFailed = failed.filter((r) => !okIdxFromRetry.has(r.i));
  // muadil queries yavas+stressful; en sona biraktik. stok/adet/fiyat once.
  const orderRank = (cat) => (cat === "muadil" ? 1 : 0);
  remainingFailed.sort((a, b) => orderRank(a.category) - orderRank(b.category) || a.i - b.i);
  console.log(`[retry] retry detail mevcut: ${preExisting.length}, daha once OK: ${okIdxFromRetry.size}, kalan: ${remainingFailed.length} (muadil sona biraktirildi)`);

  const retried = preExisting.filter((r) => okIdxFromRetry.has(r.i));
  let nextIdx = 0, done = 0;
  const CONCURRENCY = Number(process.env.LIVE_CONCURRENCY || 2);
  // Chunk limit: server pool is fragile under sustained load. Exit cleanly after
  // RETRY_CHUNK_SIZE queries so wrapper can restart with fresh pool.
  const CHUNK_SIZE = Number(process.env.RETRY_CHUNK_SIZE || 1e9);
  const t0 = Date.now();

  async function worker() {
    while (true) {
      const k = nextIdx++;
      if (k >= remainingFailed.length) return;
      // Chunk limit: stop when chunk full
      if (done >= CHUNK_SIZE) return;
      const orig = remainingFailed[k];
      const qStart = Date.now();
      let result = null;
      // 2 retry on transient errors, with longer back-off
      for (let attempt = 0; attempt < 3; attempt++) {
        result = await postQuery(cookie, {
          message: orig.question,
          language: orig.lang,
          history: [],
        });
        if (result && result.status === 200 && result.body && result.body.provider) break;
        const backoff = (attempt + 1) * 4000;
        await new Promise((r) => setTimeout(r, backoff));
      }
      const elapsed = Date.now() - qStart;
      const provider = (result && result.body && result.body.provider) || "none";
      const answer = (result && result.body && (result.body.answer || result.body.error)) || "";
      const sourceSummary = (result && result.body && result.body.sourceSummary) || "";
      const row = {
        i: orig.i,
        category: orig.category,
        lang: orig.lang,
        question: orig.question,
        itemName: orig.itemName,
        status: result ? result.status : 0,
        provider,
        sourceSummary,
        elapsedMs: elapsed,
        answerSnippet: String(answer).slice(0, 240).replace(/\s+/g, " "),
        retried: true,
      };
      fs.appendFileSync(RETRY_DETAIL, JSON.stringify(row) + "\n");
      retried.push(row);
      done++;
      if (done % 25 === 0) {
        const sec = Math.floor((Date.now() - t0) / 1000);
        console.log(`[retry] ${done}/${remainingFailed.length} (${sec}s) provider=${provider} cat=${orig.category}/${orig.lang}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // 6) Merge: OK lines + retried (replace by index)
  const byIdx = new Map();
  for (const r of okRows) byIdx.set(r.i, r);
  for (const r of retried) byIdx.set(r.i, r);
  const merged = Array.from(byIdx.values()).sort((a, b) => a.i - b.i);

  fs.writeFileSync(FINAL_DETAIL, merged.map((r) => JSON.stringify(r)).join("\n") + "\n");

  // 7) Build summary
  const summary = {
    total: merged.length,
    byCategory: {}, byLang: {}, byProvider: {}, byCategoryLang: {},
    failures: 0,
    finishedAt: new Date().toISOString(),
  };
  for (const r of merged) {
    const p = r.provider || "none";
    summary.byCategory[r.category] = summary.byCategory[r.category] || { total: 0 };
    summary.byCategory[r.category].total += 1;
    summary.byCategory[r.category][p] = (summary.byCategory[r.category][p] || 0) + 1;
    summary.byLang[r.lang] = summary.byLang[r.lang] || { total: 0 };
    summary.byLang[r.lang].total += 1;
    summary.byLang[r.lang][p] = (summary.byLang[r.lang][p] || 0) + 1;
    const k = `${r.category}.${r.lang}`;
    summary.byCategoryLang[k] = summary.byCategoryLang[k] || { total: 0 };
    summary.byCategoryLang[k].total += 1;
    summary.byCategoryLang[k][p] = (summary.byCategoryLang[k][p] || 0) + 1;
    summary.byProvider[p] = (summary.byProvider[p] || 0) + 1;
    if (r.status !== 200) summary.failures += 1;
  }
  fs.writeFileSync(FINAL_SUMMARY, JSON.stringify(summary, null, 2));

  console.log("\n=== FINAL ===");
  console.log("Total:", summary.total, "Failures:", summary.failures);
  console.log("Providers:", JSON.stringify(summary.byProvider));
  console.log("Cat x Lang:");
  for (const k of Object.keys(summary.byCategoryLang).sort()) {
    const obj = summary.byCategoryLang[k];
    const p = Object.entries(obj).filter(([k]) => k !== "total").map(([k, v]) => `${k}=${v}`).join(" ");
    console.log(`  ${k.padEnd(12)} total=${obj.total}  ${p}`);
  }
  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
