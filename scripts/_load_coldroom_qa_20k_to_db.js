"use strict";
/**
 * 21K coldroom Q&A → assistant_troubleshooting_bank tablosu
 * + 20 ön teklif → quotes tablosu (cold room sample teklifleri)
 *
 * İdempotent: ON CONFLICT (bank_key) DO UPDATE
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
const FAQ_PATH = path.join(__dirname, "drc_man_coldroom_qa_20k_faq.json");
const OFFERS_PATH = path.join(__dirname, "drc_man_coldroom_offers_20.json");
const SLUG = "coldroom_qa_20k";
const SOURCE = "DRC MAN 20K coldroom canlı soru-cevap (ColdRoomPro opsiyonları)";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // === 1) FAQ entries — UPSERT ===
  const entries = JSON.parse(fs.readFileSync(FAQ_PATH, "utf8"));
  console.log(`FAQ entry: ${entries.length}`);

  const BATCH = 50;
  let inserted = 0;
  const startTs = Date.now();

  for (let i = 0; i < entries.length; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let pIdx = 1;
    for (const e of slice) {
      values.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NOW())`);
      params.push(
        e.id, SLUG, e.family_id, SOURCE,
        JSON.stringify(e.keywords || []),
        e.tr_subject, e.de_subject, "", "",
        e.tr_answer, e.de_answer, "", true
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
    if (inserted % 1000 < BATCH) {
      const pct = Math.round(inserted / entries.length * 100);
      process.stdout.write(`\r  [${pct.toString().padStart(3)}%] ${inserted}/${entries.length}`);
    }
  }
  console.log("");
  console.log(`✓ FAQ yükleme tamam: ${inserted} (${Math.round((Date.now() - startTs) / 1000)}s)`);

  // === 2) 20 örnek teklif — quotes tablosu ===
  const offers = JSON.parse(fs.readFileSync(OFFERS_PATH, "utf8"));
  console.log("");
  console.log(`Teklif kaydı: ${offers.length}`);

  // Admin user
  const admin = await c.query("SELECT id FROM users WHERE LOWER(name) LIKE '%anil%' OR LOWER(name) LIKE '%anıl%' LIMIT 1");
  const adminId = admin.rows[0]?.id || 46;

  // Önce eski sample teklifleri sil (note ile işaretli)
  await c.query("DELETE FROM quote_items WHERE quote_id IN (SELECT id FROM quotes WHERE note LIKE '[SAMPLE-COLDROOM]%')");
  await c.query("DELETE FROM quotes WHERE note LIKE '[SAMPLE-COLDROOM]%'");

  let quoteCount = 0;
  for (const offer of offers) {
    const subtotal = offer.lines.reduce((s, l) => s + l.total_eur, 0);
    const vatAmount = +(subtotal * 0.19).toFixed(2);
    const grossTotal = subtotal + vatAmount;

    // quotes'a insert (gerçek şemaya uyumlu: quote_date, vat_rate, is_export)
    const q = await c.query(
      `INSERT INTO quotes (
         quote_no, customer_name, title, vat_rate, is_export,
         subtotal, discount, net_total, vat_amount, gross_total, total,
         note, language, quote_date, created_at, user_id
       ) VALUES (
         $1, $2, $3, 19, false,
         $4, 0, $4, $5, $6, $6,
         $7, 'tr', CURRENT_DATE, NOW(), $8
       )
       RETURNING id`,
      [
        offer.offer_no,
        "DRC Sample Customer",
        offer.project + ` (${offer.target_temp_c}°C, ${offer.refrigerant})`,
        subtotal,
        vatAmount,
        grossTotal,
        `[SAMPLE-COLDROOM] ${offer.note}`,
        adminId,
      ]
    );
    const quoteId = q.rows[0].id;

    // Önceki kalemleri sil
    await c.query("DELETE FROM quote_items WHERE quote_id = $1", [quoteId]);

    // Lines
    for (const line of offer.lines) {
      await c.query(
        `INSERT INTO quote_items (quote_id, item_name, quantity, unit, unit_price, total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [quoteId, line.item, line.qty, line.unit, line.price_eur, line.total_eur]
      );
    }
    quoteCount += 1;
  }
  console.log(`✓ Teklif kaydı: ${quoteCount}`);

  // Doğrulama
  const v1 = await c.query(`SELECT COUNT(*) AS n FROM assistant_troubleshooting_bank WHERE context_id = '${SLUG}'`);
  const v2 = await c.query("SELECT COUNT(*) AS n FROM quotes WHERE note LIKE '[SAMPLE-COLDROOM]%'");
  console.log("");
  console.log("=== Doğrulama ===");
  console.log(`  ${SLUG} entry  : ${v1.rows[0].n}`);
  console.log(`  sample quotes : ${v2.rows[0].n}`);

  await c.end();
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
