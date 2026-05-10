"use strict";
/**
 * Evaporatorlerin (389) hepsinin resmi yanlis veya placeholder.
 * Isme gore tipi cikar, tipe gore DuckDuckGo'dan dogru gorsel bul,
 * uygulanan URL'i ayni tipteki tum ürünlere yaz.
 *
 * Tipi: ceiling, generic_ceiling, plastic_ceiling, static, small_ceiling, wall
 */
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) { const v = m[2].replace(/^["']|["']$/g, ""); if (!process.env[m[1]]) process.env[m[1]] = v; }
}
const { Client } = require("pg");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function classify(name) {
  const n = (name || "").toLowerCase();
  if (/plastik/i.test(n)) return "plastic_ceiling";
  if (/yan tip|wall|duvar tip|lateral|tezgah|gnkf/i.test(n)) return "wall";
  if (/kanal|ducted|kanallı/i.test(n)) return "ducted";
  if (/fansız|statik|fansiz|borulu|tea[0-9]+/i.test(n)) return "static";
  if (/küçük|kucuk|mini|gnc 1[0-9]{2,3}-1/i.test(n)) return "small_ceiling";
  if (/tavan|ceiling|cubic|kübik|gnky|zl940|act zl/i.test(n)) return "ceiling";
  return "generic_ceiling";
}

const QUERIES = {
  ceiling: "soğuk oda tavan tipi evaporatör 3 fanlı",
  generic_ceiling: "soğuk oda evaporatör fanlı",
  plastic_ceiling: "plastik tavan tipi evaporatör soğuk oda",
  static: "fansız statik evaporatör soğuk oda",
  small_ceiling: "küçük tek fanlı evaporatör soğuk oda",
  wall: "yan tipi evaporatör soğuk oda",
  ducted: "kanal tipi evaporatör soğuk oda",
};

async function ddgImageSearch(query) {
  const r1 = await fetch("https://duckduckgo.com/?q=" + encodeURIComponent(query), { headers: { "User-Agent": UA } });
  const html = await r1.text();
  const m = html.match(/vqd=['"]([\d-]+)['"]|vqd=([\d-]+)/);
  const vqd = m?.[1] || m?.[2];
  if (!vqd) return [];
  await sleep(120);
  const r2 = await fetch(
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&p=1`,
    { headers: { "User-Agent": UA, "Referer": "https://duckduckgo.com/", "X-Requested-With": "XMLHttpRequest" } }
  );
  if (!r2.ok) return [];
  const data = await r2.json();
  return Array.isArray(data?.results) ? data.results : [];
}

function pickBest(results) {
  const blacklist = ["pinterest.", "facebook.", "instagram.", "twitter.", "x.com", "tiktok.", "youtube.", "imgur.", "amazon."];
  const filtered = results.filter((r) => {
    if (!r.image || !r.image.startsWith("http")) return false;
    if (blacklist.some((b) => (r.source || "").toLowerCase().includes(b) || r.image.toLowerCase().includes(b))) return false;
    if (r.width && r.height && (r.width < 200 || r.height < 200)) return false;
    return true;
  });
  // Prefer trusted refrigeration domains
  const trusted = filtered.find((r) =>
    /refkar|nazma|gunay|gunay-soğutma|sogutma|buzcelik|buzyapsan|seckin|otomasyon|makinaturkiye|sogutmaonline|esensoguma|sogutmamarketim|tdsogutma/i.test(r.source || r.image)
  );
  return (trusted || filtered[0])?.image || null;
}

async function findImageForType(type) {
  console.log(`\n[SEARCH] ${type}: "${QUERIES[type]}"`);
  const results = await ddgImageSearch(QUERIES[type]);
  console.log(`  ${results.length} sonuc`);
  const top5 = results.slice(0, 5).map((r, i) => `  ${i+1}. ${r.image?.slice(0, 90)} (${r.width}x${r.height}, ${r.source?.slice(0, 30)})`).join("\n");
  if (top5) console.log(top5);
  const url = pickBest(results);
  console.log(`  -> ${url}`);
  return url;
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const evaps = await c.query(
    `SELECT id, brand, name FROM items WHERE is_active=true AND category='Evaporatörler' ORDER BY brand, name`
  );
  console.log(`\n${evaps.rows.length} evaporator var.`);

  // 1) Tip bazli arama
  const types = [...new Set(evaps.rows.map(r => classify(r.name)))];
  const typeImage = {};
  for (const t of types) {
    typeImage[t] = await findImageForType(t);
    await sleep(2000);
  }

  console.log("\n=== Bulunan tip-resim eslesmeleri ===");
  console.table(typeImage);

  // Type-image dosyaya kaydet (debug için)
  fs.writeFileSync(
    path.join(__dirname, "_evap_image_map.json"),
    JSON.stringify(typeImage, null, 2)
  );

  // 2) DB guncelle (her ürüne tipine göre URL yaz)
  let updated = 0;
  for (const r of evaps.rows) {
    const t = classify(r.name);
    const img = typeImage[t];
    if (!img) continue;
    await c.query("UPDATE items SET image_url = $1 WHERE id = $2", [img, r.id]);
    updated++;
  }
  console.log(`\n[DONE] ${updated}/${evaps.rows.length} evaporator guncellendi.`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
