"use strict";
/**
 * Kullanici onayli ZMT-453 konsolidasyonu:
 *  - #145 Kontak 6HP Kompresor ZMT-453 = ANA KART
 *  - #23141'den fiyat (sale=350, list=420) ve gorsel #145'e tasi
 *  - #23141'deki 1 adet stok #145'e devret (movement transfer)
 *  - #23141 pasifize
 *
 * #23753 generic Copeland Scroll (14 adet) konusu kullaniciya raporlanir,
 * onay alinmadan dokunulmaz.
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

  await c.query("BEGIN");
  try {
    // 1) #145'e #23141'in fiyat ve gorselini aktar
    console.log("[1] #145'e fiyat (350/420) ve Copeland Scroll gorseli aktariliyor");
    const src = await c.query("SELECT image_url FROM items WHERE id = 23141");
    const imgUrl = src.rows[0]?.image_url;
    await c.query(
      "UPDATE items SET sale_price = 350, list_price = 420, image_url = $1 WHERE id = 145",
      [imgUrl]
    );

    // 2) Stok devri: #23141 -> #145 (1 adet)
    console.log("[2] 1 adet ZMT-453 #23141 -> #145 devri");
    await c.query(
      `INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id, created_at)
       VALUES (145, 'entry', 1, 0, $1::date, $2, $3, $4::timestamptz)`,
      [nowIso, "Konsolidasyon: kart #23141 (Copeland Scroll ZMT-453 380V 3 Faz) icinden devir", adminId, nowIso]
    );
    await c.query(
      `INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id, created_at)
       VALUES (23141, 'exit', 1, 0, $1::date, $2, $3, $4::timestamptz)`,
      [nowIso, "Konsolidasyon: kart #145 (Kontak 6HP Kompresor ZMT-453) icine devir", adminId, nowIso]
    );

    // 3) #23141 pasifize
    console.log("[3] #23141 pasifize");
    await c.query("UPDATE items SET is_active = false WHERE id = 23141");

    await c.query("COMMIT");
    console.log("\n[COMMIT] Basarili.");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("[ROLLBACK]", e.message);
    throw e;
  }

  // Verification
  const r = await c.query(
    `SELECT i.id, i.brand, i.name, i.is_active, i.sale_price, i.list_price, i.image_url,
            COALESCE(SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END), 0) AS stock
       FROM items i LEFT JOIN movements m ON m.item_id = i.id
      WHERE i.id = ANY($1::int[])
      GROUP BY i.id ORDER BY i.id`,
    [[145, 23141, 23753]]
  );
  console.log("\n=== Sonuc ===");
  console.table(r.rows.map(x => ({ id: x.id, brand: x.brand, name: x.name, active: x.is_active, stock: Number(x.stock), sale: x.sale_price, list: x.list_price, image: (x.image_url||"").slice(0, 50) })));
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
