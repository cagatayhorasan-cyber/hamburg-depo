"use strict";
/**
 * Kullanici onaylı: #23753 generic Copeland Scroll (14 adet) ->
 *   7 adet Copeland Scroll ZMT-380 (5HP) — yeni kart
 *   7 adet Copeland Scroll ZMT-580 (8HP) — yeni kart
 * #23753 pasifize.
 *
 * Fiyatlar acik (sale=0, list=0) — kullanici sonra duzeltir.
 * Image_url: ZMT-453 ile ayni gercek Copeland scroll resmi.
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

  // ZMT-453 ile ayni gorseli kullan
  const ref = await c.query("SELECT image_url FROM items WHERE id = 145");
  const imgUrl = ref.rows[0]?.image_url || null;

  await c.query("BEGIN");
  try {
    // 1) ZMT-380 yeni kart
    console.log("[1] ZMT-380 (5HP) yeni kart olusturuluyor");
    const r380 = await c.query(
      `INSERT INTO items (name, brand, category, unit, min_stock, default_price, sale_price, list_price, product_code, image_url, is_active, created_at, lead_time_days, allow_backorder)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11::timestamptz, 10, true)
       RETURNING id`,
      [
        "Copeland Scroll ZMT-380 (5HP, 380V 3 Faz)",
        "Copeland",
        "Kompresörler",
        "adet",
        0,
        0, 0, 0,
        "ZMT-380",
        imgUrl,
        nowIso,
      ]
    );
    const id380 = r380.rows[0].id;
    console.log(`  -> #${id380}`);

    // 2) ZMT-580 yeni kart
    console.log("[2] ZMT-580 (8HP) yeni kart olusturuluyor");
    const r580 = await c.query(
      `INSERT INTO items (name, brand, category, unit, min_stock, default_price, sale_price, list_price, product_code, image_url, is_active, created_at, lead_time_days, allow_backorder)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11::timestamptz, 10, true)
       RETURNING id`,
      [
        "Copeland Scroll ZMT-580 (8HP, 380V 3 Faz)",
        "Copeland",
        "Kompresörler",
        "adet",
        0,
        0, 0, 0,
        "ZMT-580",
        imgUrl,
        nowIso,
      ]
    );
    const id580 = r580.rows[0].id;
    console.log(`  -> #${id580}`);

    // 3) #23753'ten 14 adet cikis (devir)
    console.log("[3] #23753'ten 14 adet cikis (Copeland Scroll generic)");
    await c.query(
      `INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id, created_at)
       VALUES (23753, 'exit', 14, 0, $1::date, $2, $3, $4::timestamptz)`,
      [nowIso, `Konsolidasyon: 14 adet 7+7 olarak ZMT-380 (#${id380}) + ZMT-580 (#${id580}) kartlarina devredildi`, adminId, nowIso]
    );

    // 4) ZMT-380'e +7, ZMT-580'e +7 girisleri
    console.log("[4] +7 ZMT-380 ve +7 ZMT-580 girisleri");
    await c.query(
      `INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id, created_at)
       VALUES ($1, 'entry', 7, 0, $2::date, $3, $4, $5::timestamptz)`,
      [id380, nowIso, "Konsolidasyon: kart #23753 (Copeland Scroll generic) icinden devir (alt model 5HP)", adminId, nowIso]
    );
    await c.query(
      `INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id, created_at)
       VALUES ($1, 'entry', 7, 0, $2::date, $3, $4, $5::timestamptz)`,
      [id580, nowIso, "Konsolidasyon: kart #23753 (Copeland Scroll generic) icinden devir (ust model 8HP)", adminId, nowIso]
    );

    // 5) #23753 pasifize
    console.log("[5] #23753 pasifize");
    await c.query("UPDATE items SET is_active = false WHERE id = 23753");

    await c.query("COMMIT");
    console.log("\n[COMMIT] Basarili.");

    // Verification
    const r = await c.query(
      `SELECT i.id, i.brand, i.name, i.is_active, i.sale_price, i.list_price,
              COALESCE(SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END), 0) AS stock
         FROM items i LEFT JOIN movements m ON m.item_id = i.id
        WHERE i.id = ANY($1::int[])
        GROUP BY i.id ORDER BY i.id`,
      [[145, 23141, 23753, id380, id580]]
    );
    console.log("\n=== Sonuc ===");
    console.table(r.rows.map(x => ({ id: x.id, brand: x.brand, name: x.name, active: x.is_active, stock: Number(x.stock), sale: x.sale_price, list: x.list_price })));
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("[ROLLBACK]", e.message);
    throw e;
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
