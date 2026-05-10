"use strict";
/**
 * Onaylanmis 5 mukerrer kart konsolidasyonu.
 *  - TTR Kablo 5x1.5: #23604 Genel -> #23898 Kontak (transfer 100)
 *  - TTR Kablo 3x1.5: #23605 Genel -> #23899 Kontak (transfer 100)
 *  - Soğutucu Elektrik Panosu: #23757 Genel -> #146 Kontak (transfer 28)
 *  - #324 Embraco Scroll Kompresor: pasifize (supheli, transfer yok)
 *  - #23753 Copeland Scroll Kompresor: pasifize (generic, ZH21/ZH30 ile karisiyor)
 * Her transfer DB transaction icinde:
 *   - target item'a +qty entry movement (note: konsolidasyon kaynak ID'si)
 *   - source item'dan -qty exit movement
 *   - source items.is_active = false
 */
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) { const v = m[2].replace(/^["']|["']$/g, ""); if (!process.env[m[1]]) process.env[m[1]] = v; }
}
const { Client } = require("pg");

const TRANSFERS = [
  { source: 23604, target: 23898, qty: 100, label: "TTR Kablo 5x1.5 (Genel -> Kontak)" },
  { source: 23605, target: 23899, qty: 100, label: "TTR Kablo 3x1.5 (Genel -> Kontak)" },
  { source: 23757, target: 146,   qty: 28,  label: "Sogutucu Elektrik Panosu (Genel -> Kontak)" },
];
const DEACTIVATE_ONLY = [
  { id: 324,   reason: "Supheli: Embraco scroll kompresor uretmiyor" },
  { id: 23753, reason: "Generic kart, ZH21K4E #23889 ve ZH30K4E #23888 ile cakisiyor" },
];

function nowIso() { return new Date().toISOString(); }

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const adminUser = await c.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
  const adminId = adminUser.rows[0]?.id || null;

  await c.query("BEGIN");
  try {
    for (const t of TRANSFERS) {
      const src = await c.query("SELECT id, name, brand, is_active FROM items WHERE id=$1", [t.source]);
      const tgt = await c.query("SELECT id, name, brand, is_active FROM items WHERE id=$1", [t.target]);
      if (!src.rows[0] || !tgt.rows[0]) throw new Error(`Eksik kart: source=${t.source} target=${t.target}`);
      console.log(`[TRANSFER] ${t.label}`);
      console.log(`  src #${t.source} ${src.rows[0].brand} / ${src.rows[0].name}`);
      console.log(`  tgt #${t.target} ${tgt.rows[0].brand} / ${tgt.rows[0].name}`);

      // Target +qty entry (fiyat 0: devir transferi, maliyetlendirme yok)
      await c.query(
        `INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id, created_at)
         VALUES ($1, 'entry', $2, 0, $3, $4, $5, $6)`,
        [t.target, t.qty, nowIso(), `Konsolidasyon: kart #${t.source} (${src.rows[0].name}) icinden devir`, adminId, nowIso()]
      );
      // Source -qty exit
      await c.query(
        `INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id, created_at)
         VALUES ($1, 'exit', $2, 0, $3, $4, $5, $6)`,
        [t.source, t.qty, nowIso(), `Konsolidasyon: kart #${t.target} (${tgt.rows[0].name}) icine devir`, adminId, nowIso()]
      );
      // Source pasifize
      await c.query("UPDATE items SET is_active = false WHERE id = $1", [t.source]);
      console.log(`  [OK] +${t.qty} -> #${t.target}, -${t.qty} <- #${t.source}, source pasifize.`);
    }

    for (const d of DEACTIVATE_ONLY) {
      const r = await c.query("SELECT id, name, brand FROM items WHERE id=$1", [d.id]);
      if (!r.rows[0]) throw new Error(`Eksik kart: id=${d.id}`);
      console.log(`[DEACTIVATE] #${d.id} ${r.rows[0].brand} / ${r.rows[0].name}`);
      console.log(`  reason: ${d.reason}`);
      await c.query("UPDATE items SET is_active = false WHERE id = $1", [d.id]);
      console.log(`  [OK] pasifize.`);
    }

    await c.query("COMMIT");
    console.log("\n[COMMIT] Tum islemler basarili.");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("[ROLLBACK]", e.message);
    throw e;
  }

  // Verification
  const ids = [23898, 23604, 23899, 23605, 146, 23757, 324, 23753];
  const final = await c.query(
    `SELECT i.id, i.brand, i.name, i.is_active,
            COALESCE(SUM(CASE WHEN m.type='entry' THEN m.quantity
                              WHEN m.type='exit' THEN -m.quantity ELSE 0 END), 0) AS stock
       FROM items i LEFT JOIN movements m ON m.item_id = i.id
      WHERE i.id = ANY($1::int[])
      GROUP BY i.id ORDER BY i.id`,
    [ids]
  );
  console.log("\nKonsolidasyon sonrasi durum:");
  console.table(final.rows.map(x => ({ id: x.id, brand: x.brand, name: (x.name||"").slice(0, 45), active: x.is_active, stock: Number(x.stock) })));

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
