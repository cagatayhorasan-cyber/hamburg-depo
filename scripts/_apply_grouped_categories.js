"use strict";
/**
 * B2B 2-katmanlı temiz gruplandırma (Frigotechnik grouped):
 *   group_label (Tier 1, 9 üst grup)
 *   subgroup_label (Tier 2, ~80 alt grup)
 *
 * Adımlar:
 * 1. items.group_label + items.subgroup_label kolonları ekle
 * 2. Frigotechnik ürünleri (SKU eşleşmesi) → grouped.json'dan group+subgroup ata
 * 3. Hamburg eski ürünleri → main_category bazlı default group + subgroup ata
 */
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) { const v = m[2].replace(/^["']|["']$/g, ""); if (!process.env[m[1]]) process.env[m[1]] = v; }
}
const { Client } = require("pg");

const GROUPED_JSON = "/Users/anilakbas/Desktop/drcotomasyon/frigotechnik/logs/products_grouped.json";

// Hamburg main_category → (group, subgroup) default eşlemesi
// (Hamburg eski ürünleri için, Frigotechnik dışı)
const HAMBURG_TO_GROUP = {
  "Verdichter":                              { group: "Kompressoren & Sätze",          subgroup: "Verdichter Vollhermetisch" },
  "Verflüssigungssätze":                    { group: "Kompressoren & Sätze",          subgroup: "Verflüssigungssatz Vollhermetisch" },
  "Kältesatz & Kältesets":                  { group: "Kompressoren & Sätze",          subgroup: "Kältesatz" },
  "Kältesysteme":                            { group: "Kompressoren & Sätze",          subgroup: "Kältesatz" },
  "Wärmeübertrager":                        { group: "Wärmeübertrager",                subgroup: "Luftkühler" },
  "Klimatechnik":                            { group: "Klima & Wärmepumpen",            subgroup: "Klima Zubehör" },
  "Wärmepumpen":                             { group: "Klima & Wärmepumpen",            subgroup: "Wärmepumpe Luft-Wasser" },
  "Regel- & Schaltventile":                  { group: "Ventile & Regelarmaturen",       subgroup: "Absperrventile" },
  "Rohrleitungskomponenten":                 { group: "Rohrleitungskomponenten",        subgroup: "Filtertrockner & Schaugläser" },
  "Motoren & Ventilatoren":                  { group: "Elektro & Steuerung",            subgroup: "Motoren & Ventilatoren" },
  "Schalter, Steuerungen & Schaltschränke": { group: "Elektro & Steuerung",            subgroup: "Regler" },
  "Installationsmaterial":                   { group: "Rohr & Installation",            subgroup: "Rohre & Fittings" },
  "Werkzeuge & Messgeräte":                  { group: "Werkzeuge & Messgeräte",         subgroup: "Handwerkzeug" },
  "Kältemittel & Technische Gase":           { group: "Verbrauchsmittel & Kältemittel", subgroup: "Kältemittel" },
  "Öle & Solen":                             { group: "Verbrauchsmittel & Kältemittel", subgroup: "Kältemaschinenöle" },
  "Hilfs- & Verbrauchsmittel":               { group: "Verbrauchsmittel & Kältemittel", subgroup: "Reinigung & Pflege" },
  "Sonstiges":                                { group: "Sonstige",                       subgroup: "Sonstige" },
};

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // 1. Kolonları ekle
  console.log("📐 1. items.group_label + items.subgroup_label ekleniyor...");
  await c.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS group_label TEXT`);
  await c.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS subgroup_label TEXT`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_items_group ON items (group_label)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_items_subgroup ON items (subgroup_label)`);
  console.log("   ✓");

  // 2. Frigotechnik ürünleri için (SKU eşleşmesi)
  console.log("\n📦 2. Frigotechnik ürünleri SKU bazlı update...");
  const grouped = JSON.parse(fs.readFileSync(GROUPED_JSON, "utf8"));
  let frigoUpdated = 0;
  const BATCH = 500;
  for (let i = 0; i < grouped.length; i += BATCH) {
    const slice = grouped.slice(i, i + BATCH);
    // Bulk update with CASE
    const skus = slice.map(p => String(p.sku));
    const cases = slice.map((p, j) => ({
      sku: String(p.sku),
      group: p.group || "Sonstige",
      subgroup: p.subgroup || "Sonstige",
    }));

    // Tek query: lower(product_code) = sku ile match
    for (const cs of cases) {
      const r = await c.query(
        `UPDATE items SET group_label = $1, subgroup_label = $2
         WHERE LOWER(TRIM(product_code)) = LOWER($3) AND (group_label IS NULL OR group_label = '')`,
        [cs.group, cs.subgroup, cs.sku]
      );
      frigoUpdated += r.rowCount;
    }
    if (i % 2000 === 0) console.log(`   ${i}/${grouped.length} işlendi (${frigoUpdated} update)`);
  }
  console.log(`   ✓ ${frigoUpdated} Frigotechnik ürünü güncellendi`);

  // 3. Hamburg eski ürünleri (group_label hâlâ NULL olanlar) için default map
  console.log("\n🏷 3. Hamburg eski ürünleri main_category bazlı default...");
  let hamburgUpdated = 0;
  for (const [main, gs] of Object.entries(HAMBURG_TO_GROUP)) {
    const r = await c.query(
      `UPDATE items SET group_label = $1, subgroup_label = $2
       WHERE main_category = $3 AND (group_label IS NULL OR group_label = '')`,
      [gs.group, gs.subgroup, main]
    );
    if (r.rowCount > 0) {
      console.log(`   ${main.padEnd(45)} → ${gs.group} / ${gs.subgroup}: ${r.rowCount}`);
      hamburgUpdated += r.rowCount;
    }
  }
  // Geri kalanlar (Sonstige)
  await c.query(`UPDATE items SET group_label = 'Sonstige', subgroup_label = 'Sonstige' WHERE (group_label IS NULL OR group_label = '') AND is_active = true`);
  console.log(`   ✓ ${hamburgUpdated} Hamburg ürünü map'lendi`);

  // 4. Stats
  console.log("\n📊 Üst grup dağılımı (Tier 1):");
  const groups = await c.query(`SELECT group_label, COUNT(*) AS n FROM items WHERE is_active=true GROUP BY group_label ORDER BY n DESC`);
  console.table(groups.rows.map(x => ({ group: x.group_label, count: Number(x.n) })));

  console.log("\n📊 Top 20 alt grup (Tier 2):");
  const subs = await c.query(`SELECT group_label, subgroup_label, COUNT(*) AS n FROM items WHERE is_active=true GROUP BY group_label, subgroup_label ORDER BY n DESC LIMIT 20`);
  console.table(subs.rows.map(x => ({ group: x.group_label, subgroup: x.subgroup_label, count: Number(x.n) })));

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
