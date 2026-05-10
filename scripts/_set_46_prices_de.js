"use strict";
/**
 * Kalan 46 fiyatsiz aktif urun icin Almanya piyasasi tahmini fiyatlari yaz.
 * Kaynak: WebSearch sonuclari + sektor bilgisi (refribear, voll-gas, schiessl,
 *   coolpak.shop, fachklima24, panelsell.com, kupfersysteme.de, vb).
 *
 * sale_price = orta-piyasa rekabetci, list_price = sale * 1.20 (markup/KDV).
 * Kullanici sonra admin panelden ince ayar yapar.
 */
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) { const v = m[2].replace(/^["']|["']$/g, ""); if (!process.env[m[1]]) process.env[m[1]] = v; }
}
const { Client } = require("pg");

const PRICES = [
  // === BAKIR BORULAR (mt, 5m stang $30 / 5 = $6/mt baz) ===
  { id: 34,  sale: 6.00,  list: 7.20,  cat: "Bakir Boru" },     // Elektrosan 22x1 mt
  { id: 35,  sale: 7.20,  list: 8.64,  cat: "Bakir Boru" },     // Elektrosan 25x1 mt
  { id: 36,  sale: 8.40,  list: 10.08, cat: "Bakir Boru" },     // Elektrosan 28x1 mt
  { id: 107, sale: 6.00,  list: 7.20,  cat: "Bakir Boru" },     // Kontak 22x1 mt
  { id: 106, sale: 8.40,  list: 10.08, cat: "Bakir Boru" },     // Kontak 28x1 mt

  // === IZOLASYONLU BORULAR (mt, klima cifte aluminyum-folio) ===
  { id: 30,  sale: 15.00, list: 18.00, cat: "Izoleli" },        // 3/8
  { id: 31,  sale: 18.00, list: 21.60, cat: "Izoleli" },        // 1/2
  { id: 32,  sale: 22.00, list: 26.40, cat: "Izoleli" },        // 5/8
  { id: 33,  sale: 25.00, list: 30.00, cat: "Izoleli" },        // 3/4

  // === IZOLASYON HORTUMLARI (mt, Armaflex tipi) ===
  { id: 38,  sale: 4.50,  list: 5.40,  cat: "Hortum" },         // Elektrosan 19x22
  { id: 39,  sale: 5.00,  list: 6.00,  cat: "Hortum" },         // Elektrosan 19x28
  { id: 105, sale: 3.50,  list: 4.20,  cat: "Hortum" },         // Kontak 09x22
  { id: 104, sale: 4.00,  list: 4.80,  cat: "Hortum" },         // Kontak 9x28

  // === KOMPRESORLER (adet, FrigoPartners DE piyasasi) ===
  { id: 62,  sale: 420,  list: 504,   cat: "Kompresor" },       // Tecumseh CAJ 2464Z 1.5HP R404A
  { id: 63,  sale: 380,  list: 456,   cat: "Kompresor" },       // Tecumseh CAJ 4511Y 1HP R134A
  { id: 64,  sale: 400,  list: 480,   cat: "Kompresor" },       // Tecumseh CAJ 4492Y R134A
  { id: 159, sale: 350,  list: 420,   cat: "Kompresor" },       // NJX 2219 GS (Embraco) — ZMT-453 hikayesinde alis €220
  { id: 9,   sale: 260,  list: 312,   cat: "Kompresor" },       // Embraco Grup 6215GK (kondenser unite)

  // === YILDIZTEPE SYSVRF (adet, Systemair DE piyasa, kW basina) ===
  { id: 126, sale: 5800, list: 6960,  cat: "VRF" },             // SYSVRF2 280 AIR EVO HP R (~28kW)
  { id: 132, sale: 8500, list: 10200, cat: "VRF" },             // SYSVRF3 400 AIR EVO-S HP R (~40kW)
  { id: 128, sale: 450,  list: 540,   cat: "VRF" },             // SYSPANEL CASSETTE EVO (kontrol)
  { id: 127, sale: 1300, list: 1560,  cat: "VRF" },             // SYSVRF3 CASSETTE 71 Q (7.1kW)
  { id: 134, sale: 1500, list: 1800,  cat: "VRF" },             // SYSVRF3 CASSETTE 90 Q (9.0kW)
  { id: 133, sale: 750,  list: 900,   cat: "VRF" },             // SYSVRF3 WALL 36 Q (3.6kW)
  { id: 135, sale: 950,  list: 1140,  cat: "VRF" },             // SYSVRF3 WALL 56 Q (5.6kW)
  { id: 136, sale: 1100, list: 1320,  cat: "VRF" },             // SYSVRF3 WALL 71 Q (7.1kW)

  // === SOGUK ODA AKSESUARLARI ===
  { id: 152, sale: 25,   list: 30,    cat: "Aksesuar" },        // 1/2 Gozetleme Cami Kaynakli
  { id: 156, sale: 18,   list: 21.60, cat: "Aksesuar" },        // 3/8 Gozetleme Cami
  { id: 151, sale: 70,   list: 84,    cat: "Aksesuar" },        // Guven 6LT Depo 1/2 Vanali
  { id: 98,  sale: 30,   list: 36,    cat: "Aksesuar" },        // Kucuk Sase
  { id: 61,  sale: 1500, list: 1800,  cat: "Dolap" },           // Soguk Kahvalti Dolabi
  { id: 117, sale: 1200, list: 1440,  cat: "Dolap" },           // Vertical Single Door +2/+8
  { id: 118, sale: 1400, list: 1680,  cat: "Dolap" },           // Vertical Single Door -20/-18
  { id: 119, sale: 2200, list: 2640,  cat: "Dolap" },           // Vertical Double Door +2/+8
  { id: 120, sale: 2500, list: 3000,  cat: "Dolap" },           // Vertical Double Door -20/-18

  // === BUZDOLAPLARI / VITRINLER ===
  { id: 58,  sale: 4500, list: 5400,  cat: "Vitrin" },          // 187,5 CM DAISY VG
  { id: 57,  sale: 8500, list: 10200, cat: "Vitrin" },          // 375 CM DAISY VG
  { id: 147, sale: 350,  list: 420,   cat: "Vitrin" },          // 100x18 Sira Pasta Sog (alis €300)

  // === SERVIS EKIPMANLARI (CoolPak, Amazon DE piyasa) ===
  { id: 5,   sale: 18,   list: 22,    cat: "Servis" },          // CoolPak Gasfullstutze
  { id: 7,   sale: 120,  list: 144,   cat: "Servis" },          // Vakuum Pumpe VE115N (Amazon ~€110-180)
  { id: 8,   sale: 40,   list: 48,    cat: "Servis" },          // Schlauchleitung Manomete Value 150cm
  { id: 1,   sale: 8,    list: 9.60,  cat: "Servis" },          // Hidrolik Yag (litre)

  // === DIGERLERI ===
  { id: 95,  sale: 60,   list: 72,    cat: "Kontrol" },         // DCB100 (alis €50)
  { id: 43,  sale: 750,  list: 900,   cat: "Sogutma Grubu" },   // 1HP Tecumseh Komplu Sogutma
  { id: 51,  sale: 60,   list: 72,    cat: "Panel" },           // PANETS/PPWP-120 m2 (panelsell €19+, isolated PIR ~€60)
  { id: 52,  sale: 70,   list: 84,    cat: "Panel" },           // PANETS/PWFP-120 m2 (zemin paneli)
];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  console.log(`\n${PRICES.length} urune fiyat yazilacak...\n`);

  await c.query("BEGIN");
  try {
    for (const p of PRICES) {
      await c.query("UPDATE items SET sale_price = $1, list_price = $2 WHERE id = $3", [p.sale, p.list, p.id]);
    }
    await c.query("COMMIT");
    console.log("[COMMIT] Basarili");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("[ROLLBACK]", e.message);
    throw e;
  }

  // Sonuc
  const r = await c.query(
    `SELECT id, brand, name, unit, sale_price, list_price FROM items WHERE id = ANY($1::int[]) ORDER BY id`,
    [PRICES.map(p => p.id)]
  );
  console.log("\n=== Sonuc ===");
  console.table(r.rows.map(x => ({ id: x.id, brand: (x.brand||"").slice(0,15), name: (x.name||"").slice(0,45), unit: x.unit, sale: x.sale_price, list: x.list_price })));

  // Hala fiyatsiz var mi?
  const zero = await c.query(
    `SELECT COUNT(*) AS n FROM items WHERE is_active=true AND (sale_price IS NULL OR sale_price::numeric = 0)`
  );
  console.log(`\nHala fiyatsiz aktif urun: ${zero.rows[0].n}`);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
