"use strict";
/**
 * _fetch_stocked_item_images.js'in gevşek (loose) versiyonu.
 * - Filtre yok: ilk geçerli http(s) image URL'i kabul (sosyal medya/küçük hariç)
 * - Birinci tur'da kalan jenerik SVG ürünler için
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
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const DELAY_MS = 1500;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function ddgImageSearch(query) {
  const r1 = await fetch("https://duckduckgo.com/?q=" + encodeURIComponent(query), {
    headers: { "User-Agent": UA },
  });
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

function pickFirstUsable(results) {
  // Sadece sosyal medya + bilinen kötü kaynakları ele
  const blacklist = ["pinterest.", "facebook.", "instagram.", "twitter.", "x.com", "tiktok.", "youtube.", "imgur."];
  for (const r of results) {
    if (!r.image || !r.image.startsWith("http")) continue;
    const url = r.image.toLowerCase();
    const src = (r.source || "").toLowerCase();
    if (blacklist.some((b) => url.includes(b) || src.includes(b))) continue;
    if (r.width && r.width < 100) continue;
    return r;
  }
  return null;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const stockSql = `COALESCE((SELECT SUM(CASE WHEN type='entry' THEN quantity ELSE -quantity END) FROM movements WHERE item_id = items.id), 0)`;
  const r = await c.query(`
    SELECT id, name, brand, category, barcode, image_url
    FROM items
    WHERE is_active = true AND ${stockSql} > 0
      AND (image_url LIKE '/assets/categories/%' OR COALESCE(image_url,'') = '')
    ORDER BY id
  `);
  console.log(`İşlenecek ürün: ${r.rows.length}`);

  let found = 0, skipped = 0, errors = 0;
  for (let i = 0; i < r.rows.length; i += 1) {
    const item = r.rows[i];
    const query = [item.brand, item.name].filter(Boolean).join(" ").trim().slice(0, 110);
    if (!query) { skipped++; continue; }

    try {
      const results = await ddgImageSearch(query);
      const best = pickFirstUsable(results);
      if (best?.image) {
        await c.query("UPDATE items SET image_url = $1 WHERE id = $2", [best.image, item.id]);
        found++;
        console.log(`[OK ] #${item.id} ${item.brand || "—"} | ${item.name?.substring(0, 50)}`);
      } else {
        skipped++;
        console.log(`[--] #${item.id} bulunamadı (${results.length} sonuç)`);
      }
    } catch (e) {
      errors++;
      console.error(`[ERR] #${item.id} ${e.message}`);
      // 5 sn bekle, devam
      await sleep(5000);
    }

    if (i < r.rows.length - 1) await sleep(DELAY_MS);
  }

  console.log("");
  console.log(`=== Bitti: bulundu=${found}, atlandı=${skipped}, hata=${errors} ===`);
  await c.end();
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
