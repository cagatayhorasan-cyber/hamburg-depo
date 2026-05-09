"use strict";
/**
 * Stoklu (stock > 0) ürünler için DuckDuckGo Image Search'ten ilk
 * gerçek görseli çekip items.image_url'e yazar.
 *
 * - Yalnızca image_url şu an /assets/categories/ ile başlayan (jenerik
 *   SVG) ürünler güncellenir; admin manuel atamış olanlar dokunulmaz.
 * - Her arama arasında 1.8 sn bekler (rate-limit için).
 * - Hot-link mimarisi (image_url string olarak DB'de, browser external load).
 *
 * Kullanım:
 *   node scripts/_fetch_stocked_item_images.js              # gerçekten yaz
 *   node scripts/_fetch_stocked_item_images.js --dry-run    # yazmadan göster
 *   node scripts/_fetch_stocked_item_images.js --limit 20   # ilk 20 ile sınırla
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
const DELAY_MS = 1800;
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = Number(args.includes("--limit") ? args[args.indexOf("--limit") + 1] : 0) || Infinity;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ddgImageSearch(query) {
  // 1) vqd token
  const r1 = await fetch("https://duckduckgo.com/?q=" + encodeURIComponent(query), {
    headers: { "User-Agent": UA },
  });
  const html = await r1.text();
  const m = html.match(/vqd=['"]([\d-]+)['"]|vqd=([\d-]+)/);
  const vqd = m?.[1] || m?.[2];
  if (!vqd) return [];

  await sleep(120);

  // 2) image search JSON
  const r2 = await fetch(
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&p=1`,
    {
      headers: {
        "User-Agent": UA,
        "Referer": "https://duckduckgo.com/",
        "X-Requested-With": "XMLHttpRequest",
      },
    }
  );
  if (!r2.ok) return [];
  const data = await r2.json();
  return Array.isArray(data?.results) ? data.results : [];
}

function pickBestImage(results, item) {
  if (!results.length) return null;

  // Domain blacklist (yavaş / unreliable / NSFW risk)
  const blacklist = ["pinterest.", "facebook.", "instagram.", "twitter.", "x.com", "tiktok.", "youtube.", "imgur."];
  const filtered = results.filter((r) => {
    if (!r.image || !r.image.startsWith("http")) return false;
    if (blacklist.some((b) => (r.source || "").toLowerCase().includes(b) || r.image.toLowerCase().includes(b))) return false;
    // Resim boyutu: çok küçükse atla
    if (r.width && r.height && r.width < 150) return false;
    return true;
  });

  if (!filtered.length) return null;

  // Domain priority: manufacturer / wholesale / known catalog > rest
  const priority = ["danfoss", "embraco", "sanhua", "frigocraft", "tecumseh", "copeland", "bitzer",
                    "carel", "alco", "weiguang", "buzyapsan", "ets", "systemair",
                    "kalt", "kuhl", "refrigeration", "compressor", "kompresor",
                    "yedekparca", "mfmref", "kaelte4you"];
  const brand = (item.brand || "").toLowerCase();

  // 1. Marka adı geçen kaynak
  if (brand) {
    const brandMatch = filtered.find((r) => (r.image || "").toLowerCase().includes(brand) || (r.source || "").toLowerCase().includes(brand));
    if (brandMatch) return brandMatch;
  }

  // 2. Priority domain'lerden biri
  const priorityMatch = filtered.find((r) => priority.some((p) => (r.image || "").toLowerCase().includes(p)));
  if (priorityMatch) return priorityMatch;

  // 3. İlk uygun
  return filtered[0];
}

function buildQuery(item) {
  const parts = [item.brand, item.name, item.barcode].filter(Boolean);
  return parts.join(" ").trim().slice(0, 120);
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // Stoklu + jenerik kategori SVG'sinde olan ürünler
  const stockSql = `
    COALESCE((SELECT SUM(CASE WHEN type='entry' THEN quantity ELSE -quantity END)
              FROM movements WHERE item_id = items.id), 0)
  `;
  const r = await c.query(`
    SELECT id, name, brand, category, barcode, image_url
    FROM items
    WHERE is_active = true
      AND ${stockSql} > 0
      AND (image_url LIKE '/assets/categories/%' OR COALESCE(image_url,'') = '')
    ORDER BY id
  `);

  const items = r.rows.slice(0, LIMIT === Infinity ? r.rows.length : LIMIT);
  console.log(`İşlenecek stoklu ürün: ${items.length}`);
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN" : "WRITE"}, delay=${DELAY_MS}ms`);
  console.log("");

  const stats = { processed: 0, found: 0, skipped: 0, errors: 0 };
  const startTs = Date.now();

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const query = buildQuery(item);
    if (!query) {
      stats.skipped += 1;
      continue;
    }

    try {
      const results = await ddgImageSearch(query);
      const best = pickBestImage(results, item);

      if (best?.image) {
        if (!DRY_RUN) {
          await c.query("UPDATE items SET image_url = $1 WHERE id = $2", [best.image, item.id]);
        }
        stats.found += 1;
        const tag = DRY_RUN ? "[DRY]" : "[WRITE]";
        console.log(`${tag} #${item.id} ${item.brand || "—"} | ${item.name?.substring(0, 50)}`);
        console.log(`        → ${best.image.substring(0, 120)}`);
      } else {
        stats.skipped += 1;
        console.log(`[SKIP] #${item.id} ${item.brand || "—"} | ${item.name?.substring(0, 50)} → bulunamadı`);
      }
    } catch (e) {
      stats.errors += 1;
      console.error(`[ERR ] #${item.id}: ${e.message}`);
    }

    stats.processed += 1;

    // Rate limit
    if (i < items.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log("");
  console.log("=== Bitti ===");
  console.log(`  Süre      : ${Math.round((Date.now() - startTs) / 1000)}s`);
  console.log(`  Toplam    : ${stats.processed}`);
  console.log(`  Bulundu   : ${stats.found}`);
  console.log(`  Atlandı   : ${stats.skipped}`);
  console.log(`  Hata      : ${stats.errors}`);

  await c.end();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
