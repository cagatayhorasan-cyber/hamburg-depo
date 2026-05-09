"use strict";
/**
 * assign-item-images.js içindeki eşleştirme mantığını kullanarak
 * Postgres'e direkt UPDATE atar (initDatabase'i bypass eder).
 * Vercel canlı DB'sinde 10K+ ürünün image_url alanını kategori/marka SVG'siyle doldurur.
 */

const fs = require("fs");
const path = require("path");

// .env yükle
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

// assign-item-images.js'ten kopya: marka + kategori eşleştirme
const DEFAULT_IMAGE = "/assets/categories/generic.svg";

const BRAND_VISUALS = [
  { keys: ["danfoss"], imageUrl: "/assets/brands/danfoss.png" },
  { keys: ["embraco"], imageUrl: "/assets/brands/embraco.png" },
  { keys: ["sanhua"], imageUrl: "/assets/brands/sanhua.png" },
  { keys: ["frigocraft", "frigo craft"], imageUrl: "/assets/brands/frigocraft.png" },
  { keys: ["copeland"], imageUrl: "/assets/brands/copeland.png" },
  { keys: ["bitzer"], imageUrl: "/assets/brands/bitzer-logo.png" },
];

const CATEGORY_VISUALS = [
  { keys: ["ithalat arsiv", "arsiv"], imageUrl: "/assets/categories/archive.svg" },
  { keys: ["kompresor", "compressor", "verdichter"], imageUrl: "/assets/categories/compressor.svg" },
  { keys: ["sogutma", "refrigeration", "gaz", "akiskan", "filtre", "kurutucu", "kimyasal", "yag", "sogutucu", "r410a", "r407c", "r404a", "r134a", "r1234yf", "beyaz esya"], imageUrl: "/assets/categories/refrigeration.svg" },
  { keys: ["fan", "motor", "ventilator"], imageUrl: "/assets/categories/fan-motor.svg" },
  { keys: ["valf", "vana", "genlesme", "solenoid", "expansion", "regulator", "regulatorler", "presostat", "manifold"], imageUrl: "/assets/categories/valve.svg" },
  { keys: ["kontrol", "controller", "elektronik", "termostat", "termometre", "transmitter", "sensor", "prob", "kumanda", "pano"], imageUrl: "/assets/categories/controller.svg" },
  { keys: ["bakir", "copper", "boru", "baglanti", "eleman", "kaynak teli", "kaynak", "dekapan", "flux"], imageUrl: "/assets/categories/copper.svg" },
  { keys: ["servis", "ekipman", "alet", "tool", "vakum pompasi", "geri toplama", "havsa", "hirdavat", "olcer", "pensampermetre", "montaj", "sarf"], imageUrl: "/assets/categories/tools.svg" },
  { keys: ["evaporator"], imageUrl: "/assets/categories/evaporator.svg" },
  { keys: ["kondenser", "condenser", "kondanser", "kondens", "kondenserler", "kondenser unit", "dis unite", "vrf", "hvac", "drainaj", "pompa", "klima", "split", "tank", "hortum"], imageUrl: "/assets/categories/condenser.svg" },
  { keys: ["elektrik", "kontakt", "kablo", "role", "salter", "sigorta", "guvenlik", "izleme", "aydinlatma"], imageUrl: "/assets/categories/electrical.svg" },
  { keys: ["isitma", "heater", "rezistans"], imageUrl: "/assets/categories/heating.svg" },
  { keys: ["soguk oda", "cold room", "hava perdesi", "aksesuar", "panel", "profil", "kapi", "dolap", "kabin", "reyon", "vitrin", "izolasyon", "bant", "conta", "yapi", "sase"], imageUrl: "/assets/categories/cold-room.svg" },
];

function normalizeSearchText(value) {
  return String(value || "")
    .replace(/[İIı]/g, "i")
    .replace(/[Şş]/g, "s")
    .replace(/[Ğğ]/g, "g")
    .replace(/[Çç]/g, "c")
    .replace(/[Öö]/g, "o")
    .replace(/[Üü]/g, "u")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findBrandVisual(brand) {
  const b = normalizeSearchText(brand);
  if (!b) return "";
  const matched = BRAND_VISUALS.find((entry) => entry.keys.some((key) => b.includes(key)));
  return matched?.imageUrl || "";
}

function findCategoryVisual(category, name, brand) {
  const haystack = normalizeSearchText([category, name, brand].filter(Boolean).join(" "));
  const matched = CATEGORY_VISUALS.find((entry) => entry.keys.some((key) => haystack.includes(key)));
  return matched?.imageUrl || DEFAULT_IMAGE;
}

function resolveImage(item) {
  // Önce kategori bazlı (en spesifik)
  const cat = findCategoryVisual(item.category, item.name, item.brand);
  if (cat && cat !== DEFAULT_IMAGE) {
    return { url: cat, source: "category" };
  }
  // Sonra marka logo
  const brand = findBrandVisual(item.brand);
  if (brand) {
    return { url: brand, source: "brand" };
  }
  return { url: DEFAULT_IMAGE, source: "generic" };
}

async function main() {
  const force = process.argv.includes("--force");
  const dryRun = process.argv.includes("--dry-run");

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const whereClause = force
    ? "is_active = true"
    : "is_active = true AND COALESCE(image_url,'') = ''";
  const r = await c.query(
    `SELECT id, name, brand, category FROM items WHERE ${whereClause} ORDER BY id`
  );
  console.log(`İşlenecek ürün: ${r.rows.length} (${force ? "force" : "yalnızca boş"})`);
  if (dryRun) console.log("(DRY-RUN — DB yazılmayacak)");

  const stats = { category: 0, brand: 0, generic: 0, total: 0 };
  const startTs = Date.now();

  // Batch UPDATE — 50'lik gruplarda (Supabase pooler timeout için küçük)
  const BATCH = 50;
  for (let i = 0; i < r.rows.length; i += BATCH) {
    const slice = r.rows.slice(i, i + BATCH);
    const updates = slice.map((item) => {
      const resolved = resolveImage(item);
      stats[resolved.source] += 1;
      stats.total += 1;
      return { id: item.id, url: resolved.url };
    });

    if (!dryRun) {
      // Tek transaction'da batch UPDATE: UPDATE items SET image_url = c.url FROM (VALUES (...)) c WHERE items.id = c.id
      const valuesSql = updates.map((u, idx) => `($${idx * 2 + 1}::int, $${idx * 2 + 2}::text)`).join(",");
      const params = updates.flatMap((u) => [u.id, u.url]);
      await c.query(
        `UPDATE items SET image_url = v.url FROM (VALUES ${valuesSql}) AS v(id, url) WHERE items.id = v.id`,
        params
      );
    }

    const pct = Math.round(stats.total / r.rows.length * 100);
    process.stdout.write(`\r  [${pct.toString().padStart(3)}%] ${stats.total}/${r.rows.length} işlendi`);
  }

  console.log("");
  console.log("");
  console.log("=== Tamam ===");
  console.log(`  Süre        : ${Math.round((Date.now() - startTs) / 1000)}s`);
  console.log(`  Toplam      : ${stats.total}`);
  console.log(`  Kategori    : ${stats.category}`);
  console.log(`  Marka logo  : ${stats.brand}`);
  console.log(`  Generic     : ${stats.generic}`);

  await c.end();
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
