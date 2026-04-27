const fs = require("fs");
const path = require("path");
const { initDatabase, query, withTransaction } = require("../server/db");

const ROOT_DIR = path.join(__dirname, "..");
const PRODUCTS_DIR = path.join(ROOT_DIR, "public", "assets", "products");
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
  { keys: ["ithalat arsiv", "arsiv"], imageUrl: "/assets/categories/archive.svg", source: "category-archive" },
  { keys: ["kompresor", "compressor", "verdichter"], imageUrl: "/assets/categories/compressor.svg", source: "category-compressor" },
  { keys: ["sogutma", "refrigeration", "gaz", "akiskan", "filtre", "kurutucu", "kimyasal", "yag", "sogutucu", "r410a", "r407c", "r404a", "r134a", "r1234yf", "beyaz esya"], imageUrl: "/assets/categories/refrigeration.svg", source: "category-refrigeration" },
  { keys: ["fan", "motor", "ventilator"], imageUrl: "/assets/categories/fan-motor.svg", source: "category-fan-motor" },
  { keys: ["valf", "vana", "genlesme", "solenoid", "expansion", "regulator", "regulatorler", "presostat", "manifold"], imageUrl: "/assets/categories/valve.svg", source: "category-valve" },
  { keys: ["kontrol", "controller", "elektronik", "termostat", "termometre", "transmitter", "sensor", "prob", "kumanda", "pano"], imageUrl: "/assets/categories/controller.svg", source: "category-controller" },
  { keys: ["bakir", "copper", "boru", "baglanti", "eleman", "kaynak teli", "kaynak", "dekapan", "flux"], imageUrl: "/assets/categories/copper.svg", source: "category-copper" },
  { keys: ["servis", "ekipman", "alet", "tool", "vakum pompasi", "geri toplama", "havsa", "hirdavat", "olcer", "pensampermetre", "montaj", "sarf"], imageUrl: "/assets/categories/tools.svg", source: "category-tools" },
  { keys: ["evaporator", "evaporatorler", "evaporatorler", "evaporatoru", "evaporator"], imageUrl: "/assets/categories/evaporator.svg", source: "category-evaporator" },
  { keys: ["kondenser", "condenser", "kondanser", "kondens", "kondenserler", "kondenser unit", "dis unite", "vrf", "hvac", "drainaj", "pompa", "klima", "split", "tank", "hortum"], imageUrl: "/assets/categories/condenser.svg", source: "category-condenser" },
  { keys: ["elektrik", "kontakt", "kablo", "role", "salter", "sigorta", "guvenlik", "izleme", "aydinlatma"], imageUrl: "/assets/categories/electrical.svg", source: "category-electrical" },
  { keys: ["isitma", "heater", "rezistans"], imageUrl: "/assets/categories/heating.svg", source: "category-heating" },
  { keys: ["soguk oda", "cold room", "hava perdesi", "aksesuar", "panel", "profil", "kapi", "dolap", "kabin", "reyon", "vitrin", "izolasyon", "bant", "conta", "yapi", "sase"], imageUrl: "/assets/categories/cold-room.svg", source: "category-cold-room" },
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
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeFileStem(value) {
  return normalizeSearchText(value).replace(/\s+/g, "-");
}

function buildProductImageIndex() {
  const index = new Map();
  if (!fs.existsSync(PRODUCTS_DIR)) {
    return index;
  }

  const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
  fs.readdirSync(PRODUCTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .forEach((entry) => {
      const ext = path.extname(entry.name).toLowerCase();
      if (!allowedExtensions.has(ext)) {
        return;
      }
      const stem = path.basename(entry.name, ext);
      const normalizedStem = normalizeFileStem(stem);
      if (!normalizedStem) {
        return;
      }
      index.set(normalizedStem, `/assets/products/${entry.name}`);
    });
  return index;
}

function uniqueCandidates(item) {
  const rawValues = [
    item.product_code,
    item.barcode,
    item.name,
    [item.brand, item.product_code].filter(Boolean).join(" "),
    [item.brand, item.name].filter(Boolean).join(" "),
  ];

  return [...new Set(rawValues
    .map((value) => normalizeFileStem(value))
    .filter(Boolean))];
}

function findProductSpecificImage(item, index) {
  const candidates = uniqueCandidates(item);
  for (const candidate of candidates) {
    if (index.has(candidate)) {
      return index.get(candidate);
    }
  }

  const entries = [...index.entries()];
  for (const candidate of candidates) {
    if (candidate.length < 5) {
      continue;
    }
    const partial = entries.find(([stem]) => stem.includes(candidate) || candidate.includes(stem));
    if (partial) {
      return partial[1];
    }
  }

  return "";
}

function findBrandVisual(item) {
  const brand = normalizeSearchText(item.brand);
  if (!brand) {
    return "";
  }
  const matched = BRAND_VISUALS.find((entry) => entry.keys.some((key) => brand.includes(key)));
  return matched?.imageUrl || "";
}

function findCategoryVisual(item) {
  const haystack = normalizeSearchText([item.category, item.name, item.brand].filter(Boolean).join(" "));
  const matched = CATEGORY_VISUALS.find((entry) => entry.keys.some((key) => haystack.includes(key)));
  return matched || { imageUrl: DEFAULT_IMAGE, source: "generic" };
}

function resolveImageForItem(item, productIndex) {
  const productImage = findProductSpecificImage(item, productIndex);
  if (productImage) {
    return { imageUrl: productImage, source: "product-file" };
  }

  const brandImage = findBrandVisual(item);
  if (brandImage) {
    return { imageUrl: brandImage, source: "brand-visual" };
  }

  return findCategoryVisual(item);
}

async function main() {
  const force = process.argv.includes("--force");
  await initDatabase();
  const productIndex = buildProductImageIndex();
  const items = await query(`
    SELECT id, name, brand, category, product_code, barcode, image_url
    FROM items
    ORDER BY id ASC
  `);

  const updates = [];
  const stats = {
    total: items.length,
    updated: 0,
    skippedExisting: 0,
    productFile: 0,
    brandVisual: 0,
    categoryVisual: 0,
    generic: 0,
  };

  items.forEach((item) => {
    const currentImage = String(item.image_url || "").trim();
    if (currentImage && !force) {
      stats.skippedExisting += 1;
      return;
    }

    const resolved = resolveImageForItem(item, productIndex);
    if (!resolved.imageUrl) {
      return;
    }

    updates.push({ id: Number(item.id), imageUrl: resolved.imageUrl });
    stats.updated += 1;
    if (resolved.source === "product-file") stats.productFile += 1;
    else if (resolved.source === "brand-visual") stats.brandVisual += 1;
    else if (resolved.source === "generic") stats.generic += 1;
    else stats.categoryVisual += 1;
  });

  await withTransaction(async (tx) => {
    for (const entry of updates) {
      await tx.execute("UPDATE items SET image_url = ? WHERE id = ?", [entry.imageUrl, entry.id]);
    }
  });

  console.log(JSON.stringify({
    force,
    productFilesIndexed: productIndex.size,
    ...stats,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
