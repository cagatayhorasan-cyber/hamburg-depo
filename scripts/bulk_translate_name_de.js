#!/usr/bin/env node
"use strict";
/**
 * Toplu name_de çevirisi (Google Translate, keysiz).
 *
 * Kullanım:
 *   node scripts/bulk_translate_name_de.js              # tüm boşları çevir
 *   node scripts/bulk_translate_name_de.js --limit 100  # maks 100 item çevir
 *   node scripts/bulk_translate_name_de.js --batch 30   # her batch'te 30 item
 *   node scripts/bulk_translate_name_de.js --dry-run    # DB yazmadan çevir + göster
 *
 * Var olan /api/admin/bulk-translate-items-de endpoint'inin Vercel timeout'u
 * (10s) olmadan, tek seferde tüm tabanı işleyebilen CLI versiyonu.
 */

const fs = require("fs");
const path = require("path");

// .env'i manuel yükle (dotenv'e bağımlı olmayalım)
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      const v = m[2].replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

const { Client } = require("pg");
const { translateBatch } = require("./lib/google-translate-client");

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
};
const hasFlag = (flag) => args.includes(flag);

const BATCH = Math.max(1, Math.min(100, Number(getArg("--batch", "40"))));
const HARD_LIMIT = Number(getArg("--limit", "0")) || Infinity;
const DRY_RUN = hasFlag("--dry-run");
const FORCE = hasFlag("--force"); // mevcut name_de'leri de yeniden çevir (default: sadece boşlar)

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("HATA: DATABASE_URL bulunamadı (.env)");
    process.exit(1);
  }

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // Toplam istatistik
  const stats = await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE is_active) AS active,
      COUNT(*) FILTER (WHERE is_active AND COALESCE(name_de,'')='') AS empty,
      COUNT(*) FILTER (WHERE is_active AND name_de = name) AS same_as_tr
    FROM items
  `);
  const { active, empty: emptyCount, same_as_tr } = stats.rows[0];
  console.log(`=== name_de bulk translate ===`);
  console.log(`  Aktif ürün     : ${active}`);
  console.log(`  name_de boş    : ${emptyCount}`);
  console.log(`  name_de = name : ${same_as_tr}`);
  console.log(`  Mode           : ${DRY_RUN ? "DRY-RUN" : "WRITE"}  batch=${BATCH}  limit=${HARD_LIMIT === Infinity ? "∞" : HARD_LIMIT}  force=${FORCE}`);
  console.log("");

  const whereClause = FORCE
    ? "is_active = true AND COALESCE(name,'') <> ''"
    : "is_active = true AND COALESCE(name,'') <> '' AND COALESCE(name_de,'') = ''";

  let processed = 0;
  let updated = 0;
  let lastId = 0;
  const startTs = Date.now();

  while (processed < HARD_LIMIT) {
    const remaining = Math.min(BATCH, HARD_LIMIT - processed);
    const r = await c.query(
      `SELECT id, name FROM items WHERE ${whereClause} AND id > $1 ORDER BY id ASC LIMIT $2`,
      [lastId, remaining]
    );
    if (!r.rows.length) break;

    const names = r.rows.map((x) => x.name);
    let translations;
    try {
      translations = await translateBatch(names, {
        sourceLang: "tr",
        targetLang: "de",
        concurrency: 3,
        delayMs: 200,
      });
    } catch (e) {
      console.error(`  [batch hatası] lastId=${lastId} → ${e.message}`);
      // 5 saniye bekle, devam et
      await new Promise((res) => setTimeout(res, 5000));
      continue;
    }

    if (DRY_RUN) {
      r.rows.forEach((row, i) => {
        const before = String(row.name).slice(0, 50);
        const after = String(translations[i] || "").slice(0, 50);
        const same = before.toLowerCase() === after.toLowerCase();
        console.log(`  #${row.id} ${same ? "=" : "→"} ${before}  →  ${after}`);
      });
    } else {
      // Tek transaction ile tüm batch'i UPDATE
      await c.query("BEGIN");
      try {
        for (let i = 0; i < r.rows.length; i += 1) {
          const row = r.rows[i];
          const t = String(translations[i] || "").trim();
          if (!t) continue;
          await c.query("UPDATE items SET name_de = $1 WHERE id = $2", [t, row.id]);
          updated += 1;
        }
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        console.error(`  [DB hatası] lastId=${lastId} → ${e.message}`);
        break;
      }
    }

    processed += r.rows.length;
    lastId = r.rows[r.rows.length - 1].id;

    // Progress log
    const pct = Math.round((processed / Math.min(emptyCount, HARD_LIMIT === Infinity ? emptyCount : HARD_LIMIT)) * 100);
    const elapsed = Math.round((Date.now() - startTs) / 1000);
    const rate = processed / Math.max(elapsed, 1);
    const remainingEst = (Math.min(emptyCount, HARD_LIMIT) - processed) / rate;
    process.stdout.write(
      `  [${pct.toString().padStart(3)}%] processed=${processed} updated=${updated} lastId=${lastId}` +
        ` | ${elapsed}s elapsed, ~${Math.round(remainingEst)}s remaining\r`
    );
  }

  console.log("");
  console.log("");
  console.log(`=== bitti ===`);
  console.log(`  İşlenen : ${processed}`);
  console.log(`  Güncel  : ${updated}`);
  console.log(`  Süre    : ${Math.round((Date.now() - startTs) / 1000)}s`);

  await c.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
