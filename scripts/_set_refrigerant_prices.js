"use strict";
/**
 * 5 sogutucu akiskan icin Almanya piyasasi fiyatlari yaz.
 * Kaynak: WebSearch (refribear.de, voll-gas.de, kaeltemittel-direkt.com, skh-kaeltetechnik.de, vb)
 *
 * Fiyat stratejisi:
 *  - sale_price = piyasa orta fiyatinin biraz altinda (rekabetci, ~%10-15 alti)
 *  - list_price = sale_price * 1.2 (KDV/markup gibi)
 */
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) { const v = m[2].replace(/^["']|["']$/g, ""); if (!process.env[m[1]]) process.env[m[1]] = v; }
}
const { Client } = require("pg");

// Almanya piyasasi orta fiyatlari (WebSearch sonuclari)
const PRICES = [
  // [id, sale_price, list_price, market_note]
  { id: 2,   sale: 520, list: 624, note: "R449a 10 kg flasche (Frigotechnik 11 kg, voll-gas 10kg €490, kaeltemittel-direkt €642)" },
  { id: 3,   sale: 420, list: 504, note: "R134a 12 kg flasche (refribear €390, dederichs €702, ortalama ~€450)" },
  { id: 4,   sale: 25,  list: 30,  note: "R290 370g/750ml einwegdose (skh-kaeltetechnik €67, Amazon ~€15-30, orta €25)" },
  { id: 6,   sale: 22,  list: 26,  note: "R600a 370g/750ml einwegdose (kaeltemittel-direkt €18.94, ersatzteil-check piyasa)" },
  { id: 137, sale: 340, list: 408, note: "R1234yf 5 kg flasche (refribear NUR Fullung €299, kaeltemittel-direkt €389)" },
];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const before = await c.query(
    `SELECT id, brand, name, sale_price, list_price FROM items WHERE id = ANY($1::int[]) ORDER BY id`,
    [PRICES.map(p => p.id)]
  );
  console.log("\n=== ONCE ===");
  console.table(before.rows.map(x => ({ id: x.id, brand: x.brand, name: (x.name||"").slice(0,55), sale: x.sale_price, list: x.list_price })));

  await c.query("BEGIN");
  try {
    for (const p of PRICES) {
      await c.query(
        "UPDATE items SET sale_price = $1, list_price = $2 WHERE id = $3",
        [p.sale, p.list, p.id]
      );
      console.log(`#${p.id}: €${p.sale} / €${p.list}  [${p.note}]`);
    }
    await c.query("COMMIT");
    console.log("\n[COMMIT] Basarili");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("[ROLLBACK]", e.message);
    throw e;
  }

  const after = await c.query(
    `SELECT id, brand, name, sale_price, list_price FROM items WHERE id = ANY($1::int[]) ORDER BY id`,
    [PRICES.map(p => p.id)]
  );
  console.log("\n=== SONRA ===");
  console.table(after.rows.map(x => ({ id: x.id, brand: x.brand, name: (x.name||"").slice(0,55), sale: x.sale_price, list: x.list_price })));
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
