"use strict";
/**
 * Onceki konsolidasyon hatasi geri alma:
 * Fatura DR02026000000011'e gore 14 adet hepsi ZMT-453.
 * Yanlislikla 7+7 ZMT-380 + ZMT-580 olarak boldum.
 *
 * Geri alma:
 *  - #23906 (ZMT-380, 7 adet): -7 exit + pasifize
 *  - #23907 (ZMT-580, 7 adet): -7 exit + pasifize
 *  - #145 (Kontak ZMT-453): +14 entry (kartlardan toplam devir)
 * Sonuc: #145 = 1 (mevcut) + 14 (devir) = 15 adet
 */
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) { const v = m[2].replace(/^["']|["']$/g, ""); if (!process.env[m[1]]) process.env[m[1]] = v; }
}
const { Client } = require("pg");

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const adminUser = await c.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
  const adminId = adminUser.rows[0]?.id || null;
  const nowIso = new Date().toISOString();
  const reason = "Geri alma: fatura DR02026000000011 satir 8'de hepsi ZMT-453, alt/ust HP modeli yok";

  await c.query("BEGIN");
  try {
    // 1) #23906 ZMT-380'den 7 adet cikis
    console.log("[1] #23906 ZMT-380 (7 adet) -> #145 devir");
    await c.query(
      `INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id, created_at)
       VALUES (23906, 'exit', 7, 0, $1::date, $2, $3, $4::timestamptz)`,
      [nowIso, `${reason} | 7 adet #145 ZMT-453'e devredildi`, adminId, nowIso]
    );
    await c.query("UPDATE items SET is_active = false WHERE id = 23906");

    // 2) #23907 ZMT-580'den 7 adet cikis
    console.log("[2] #23907 ZMT-580 (7 adet) -> #145 devir");
    await c.query(
      `INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id, created_at)
       VALUES (23907, 'exit', 7, 0, $1::date, $2, $3, $4::timestamptz)`,
      [nowIso, `${reason} | 7 adet #145 ZMT-453'e devredildi`, adminId, nowIso]
    );
    await c.query("UPDATE items SET is_active = false WHERE id = 23907");

    // 3) #145'e +14 entry
    console.log("[3] #145 ZMT-453'e +14 entry");
    await c.query(
      `INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id, created_at)
       VALUES (145, 'entry', 14, 0, $1::date, $2, $3, $4::timestamptz)`,
      [nowIso, `${reason} | 7 #23906 + 7 #23907 toplam 14 adet devredildi`, adminId, nowIso]
    );

    await c.query("COMMIT");
    console.log("\n[COMMIT] Basarili.");

    const r = await c.query(
      `SELECT i.id, i.brand, i.name, i.is_active,
              COALESCE(SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END), 0) AS stock
         FROM items i LEFT JOIN movements m ON m.item_id = i.id
        WHERE i.id = ANY($1::int[])
        GROUP BY i.id ORDER BY i.id`,
      [[145, 23141, 23753, 23906, 23907]]
    );
    console.log("\n=== Sonuc ===");
    console.table(r.rows.map(x => ({ id: x.id, brand: x.brand, name: (x.name||"").slice(0, 50), active: x.is_active, stock: Number(x.stock) })));
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("[ROLLBACK]", e.message);
    throw e;
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
