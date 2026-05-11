"use strict";
/**
 * Mevcut Hamburg ürünlerinde (12K) items.category değerlerini
 * Frigotechnik 16 ana kategoriye map'le → items.main_category doldur.
 */
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) { const v = m[2].replace(/^["']|["']$/g, ""); if (!process.env[m[1]]) process.env[m[1]] = v; }
}
const { Client } = require("pg");

// Hamburg alt kategori → Frigotechnik ana kategori eşlemesi
const MAP = {
  "Kompresörler":                       "Verdichter",
  "Kondenser Üniteleri":                "Verflüssigungssätze",
  "Evaporatörler":                      "Wärmeübertrager",
  "Eşanjörler":                          "Wärmeübertrager",
  "Klima Sistemleri":                    "Klimatechnik",
  "Klima Yedek Parçaları":               "Klimatechnik",
  "Endüstriyel Split Dış Ünite":        "Klimatechnik",
  "Endüstriyel Split İç Ünite":         "Klimatechnik",
  "Hava Perdeleri":                      "Klimatechnik",
  "Soğutma Grupları":                    "Kältesysteme",
  "Soğutma Malzemeleri":                 "Kältesatz & Kältesets",
  "Genleşme Vanaları":                   "Regel- & Schaltventile",
  "Solenoid Vanaları":                   "Regel- & Schaltventile",
  "Vanalar ve Regülatörler":             "Regel- & Schaltventile",
  "Bakır Borular":                       "Rohrleitungskomponenten",
  "İzolasyonlu Borular":                 "Rohrleitungskomponenten",
  "Kapiler Hortumlar ve Rakorlar":       "Rohrleitungskomponenten",
  "Hat Aksesuarları":                    "Rohrleitungskomponenten",
  "Fan Motorları":                       "Motoren & Ventilatoren",
  "Basınç Kontrol ( Presostatlar )":     "Schalter, Steuerungen & Schaltschränke",
  "Termostat ve Termometreler":          "Schalter, Steuerungen & Schaltschränke",
  "Transmitter":                          "Schalter, Steuerungen & Schaltschränke",
  "Elektronik Kontrolörler":             "Schalter, Steuerungen & Schaltschränke",
  "Elektrik Malzemeleri":                "Schalter, Steuerungen & Schaltschränke",
  "Servis Ekipmanları ve El Aletleri":   "Werkzeuge & Messgeräte",
  "Soğutucu Akışkanlar":                 "Kältemittel & Technische Gase",
  "Soğutma Yağları":                     "Öle & Solen",
  "Filtreler & Kurutucular":             "Hilfs- & Verbrauchsmittel",
  "Yağ Ayırıcılar":                      "Hilfs- & Verbrauchsmittel",
  "Likit Tanklar":                       "Hilfs- & Verbrauchsmittel",
  "Kaynak Telleri":                      "Hilfs- & Verbrauchsmittel",
  "İzolasyonlar ve Bantlar":             "Installationsmaterial",
  "Isıtma Malzemeleri":                  "Installationsmaterial",
  "Pompa ve Drenaj":                     "Installationsmaterial",
  "Soğuk Oda Aksesuarları":              "Installationsmaterial",
  "Soğuk Oda Kapıları":                  "Installationsmaterial",
  "Panel":                                "Installationsmaterial",
  "Buzdolapları ve Vitrinler":           "Kältesysteme",
};

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  let totalUpdated = 0;
  for (const [hamburg, main] of Object.entries(MAP)) {
    const r = await c.query("UPDATE items SET main_category = $1 WHERE category = $2 AND (main_category IS NULL OR main_category = '')", [main, hamburg]);
    if (r.rowCount > 0) {
      console.log(`  ${hamburg.padEnd(45)} → ${main}: ${r.rowCount} kayit`);
      totalUpdated += r.rowCount;
    }
  }

  // Kalan eşleşmeyen
  const remaining = await c.query(`SELECT category, COUNT(*) AS n FROM items WHERE main_category IS NULL OR main_category = '' GROUP BY category ORDER BY n DESC LIMIT 10`);
  if (remaining.rowCount > 0) {
    console.log("\nMap'lenmeyen kategoriler (Sonstiges atanacak):");
    console.table(remaining.rows.map(x => ({ category: x.category, count: Number(x.n) })));
    await c.query("UPDATE items SET main_category = 'Sonstiges' WHERE main_category IS NULL OR main_category = ''");
  }

  // Stats
  console.log(`\n[OK] ${totalUpdated} kayit main_category atandi.`);
  const dist = await c.query(`SELECT main_category, COUNT(*) AS n FROM items WHERE is_active=true GROUP BY main_category ORDER BY n DESC`);
  console.log("\nAna kategori dagilimi (aktif urunler):");
  console.table(dist.rows.map(x => ({ main: x.main_category, count: Number(x.n) })));

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
