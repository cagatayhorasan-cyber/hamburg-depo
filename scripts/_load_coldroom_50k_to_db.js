"use strict";
/**
 * scripts/drc_man_coldroom_design_50k_faq.json'u
 * assistant_troubleshooting_bank tablosuna context_id="coldroom_design_50k"
 * altında batch insert eder. Önce mevcut kayitlari siler, sonra ekler.
 *
 * Not: server/app.js içindeki /api/admin/drc-man/import endpoint'inin
 * Vercel timeout'suz lokal versiyonu.
 */

const fs = require("fs");
const path = require("path");

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
const FAQ_PATH = path.join(__dirname, "drc_man_coldroom_design_50k_faq.json");
const SLUG = "coldroom_design_50k";
const SOURCE_SUMMARY = "DRC MAN 50K soguk oda design + ekipman secimi + montaj bilgi bankasi";

async function main() {
  console.log(`FAQ dosyası okunuyor: ${FAQ_PATH}`);
  const entries = JSON.parse(fs.readFileSync(FAQ_PATH, "utf8"));
  console.log(`  ${entries.length} entry bulundu`);

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // DELETE atlandi: ON CONFLICT UPDATE ile idempotent calismasi icin.
  // Bu sayede yarida kalan (timeout) yuklemeler tekrar koşmakla tamamlanabilir.
  const exists = await c.query("SELECT COUNT(*) AS n FROM assistant_troubleshooting_bank WHERE context_id = $1", [SLUG]);
  console.log(`  Mevcut ${SLUG} satır: ${exists.rows[0].n}`);
  console.log("  DELETE atlandi (UPSERT modunda eksik tamamlanir).");

  // Batch insert (50'lik gruplar)
  const BATCH = 50;
  let inserted = 0;
  const startTs = Date.now();

  for (let i = 0; i < entries.length; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let pIdx = 1;

    for (const e of slice) {
      const bankKey = e.id || `${SLUG}_${i + values.length}`;
      const familyId = e.family_id || "";
      const keywords = JSON.stringify(e.keywords || []);
      const trSub = e.tr_subject || "";
      const deSub = e.de_subject || "";
      const trAns = e.tr_answer || "";
      const deAns = e.de_answer || "";

      values.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NOW())`);
      params.push(
        bankKey, SLUG, familyId, SOURCE_SUMMARY,
        keywords, trSub, deSub, "", "",
        trAns, deAns, "", true
      );
    }

    await c.query(
      `INSERT INTO assistant_troubleshooting_bank (
         bank_key, context_id, family_id, source_summary,
         keywords, tr_subject, de_subject, tr_questions, de_questions,
         tr_answer, de_answer, suggestions, is_active, updated_at
       ) VALUES ${values.join(",")}
       ON CONFLICT (bank_key) DO UPDATE SET
         tr_subject = EXCLUDED.tr_subject,
         de_subject = EXCLUDED.de_subject,
         tr_answer = EXCLUDED.tr_answer,
         de_answer = EXCLUDED.de_answer,
         keywords = EXCLUDED.keywords,
         updated_at = NOW()`,
      params
    );

    inserted += slice.length;
    const pct = Math.round(inserted / entries.length * 100);
    process.stdout.write(`\r  [${pct.toString().padStart(3)}%] ${inserted}/${entries.length} insert edildi`);
  }

  console.log("");
  console.log("");
  console.log("=== Tamam ===");
  console.log(`  Süre        : ${Math.round((Date.now() - startTs) / 1000)}s`);
  console.log(`  Insert      : ${inserted}`);

  // Doğrula
  const verify = await c.query("SELECT COUNT(*) AS n FROM assistant_troubleshooting_bank WHERE context_id = $1", [SLUG]);
  console.log(`  DB'de doğrulanan: ${verify.rows[0].n}`);

  await c.end();
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
