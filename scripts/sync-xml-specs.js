const fs = require("fs");
const { db } = require("../server/db");

const xmlPath = "/Users/anilakbas/Desktop/Katalog/fullproducts.xml";
const xml = fs.readFileSync(xmlPath, "utf8");
const products = xml.match(/<product>[\s\S]*?<\/product>/g) || [];

const items = db.prepare("SELECT id, name, brand, category, notes, default_price, sale_price FROM items").all();
const exactMap = new Map(items.map((item) => [normalizeName(item.name), item]));

const insertItemStmt = db.prepare(`
  INSERT INTO items (name, brand, category, unit, min_stock, barcode, notes, default_price, sale_price)
  VALUES (?, ?, ?, 'adet', 0, NULL, ?, ?, ?)
`);
const updateItemStmt = db.prepare(`
  UPDATE items
  SET brand = ?, category = ?, notes = ?, default_price = ?, sale_price = ?
  WHERE id = ?
`);

let created = 0;
let updated = 0;
let skipped = 0;
let unmatched = 0;
let invalid = 0;

db.exec("BEGIN");
try {
  for (const product of products) {
    const name = decodeXml(getTag(product, "name"));
    const technical = getTag(product, "technical_specifications");
    const priceInfo = parsePrice(decodeXml(getTag(product, "price")));

    if (!name || !priceInfo || !Number.isFinite(priceInfo.amount) || priceInfo.amount <= 0) {
      invalid += 1;
      continue;
    }

    const brand = decodeXml(getTag(technical, "brand"));
    const category = mapCategory(decodeXml(getTag(product, "category")));
    const salePrice = deriveSalePrice(priceInfo.amount);
    const xmlSection = buildXmlSection({
      type: decodeXml(getTag(product, "type")),
      brand,
      productUrl: decodeXml(getTag(technical, "product_url")),
      productionFacility: decodeXml(getTag(technical, "production_facility")),
      compressorType: decodeXml(getTag(technical, "compressor_type")),
      application: decodeXml(getTag(technical, "application")),
      hpower: decodeXml(getTag(technical, "hpower")),
      powerSupply: decodeXml(getTag(technical, "power_supply")),
      refrigerant: decodeXml(getTag(technical, "refrigerant")),
      coolingCapacity: decodeXml(getTag(technical, "cooling_capacity_watt")),
      motorType: decodeXml(getTag(technical, "motor_type")),
      bom: decodeXml(getTag(technical, "bom")),
      model: decodeXml(getTag(technical, "compressor_model")),
      displacement: decodeXml(getTag(technical, "diplacement_cm3rev")),
      frequency: decodeXml(getTag(technical, "frequency_hz")),
      suctionLine: decodeXml(getTag(technical, "suction_line")),
      dischargeLine: decodeXml(getTag(technical, "discharge_line")),
    });

    const existing = exactMap.get(normalizeName(name));
    if (!existing) {
      const notes = mergeNotes("", xmlSection);
      insertItemStmt.run(name, brand, category, notes, priceInfo.amount, salePrice);
      const inserted = {
        id: Number(db.prepare("SELECT last_insert_rowid() AS id").get().id),
        name,
        brand,
        category,
        notes,
        default_price: priceInfo.amount,
        sale_price: salePrice,
      };
      exactMap.set(normalizeName(name), inserted);
      created += 1;
      continue;
    }

    const mergedNotes = mergeNotes(existing.notes, xmlSection);
    const nextBrand = brand || existing.brand || "";
    const nextCategory = category || existing.category || "Genel";
    const priceChanged =
      Number(existing.default_price || 0) !== Number(priceInfo.amount) ||
      Number(existing.sale_price || 0) !== Number(salePrice);
    const metaChanged =
      String(existing.brand || "") !== String(nextBrand) ||
      String(existing.category || "") !== String(nextCategory) ||
      String(existing.notes || "") !== String(mergedNotes);

    if (!priceChanged && !metaChanged) {
      skipped += 1;
      continue;
    }

    updateItemStmt.run(nextBrand, nextCategory, mergedNotes, priceInfo.amount, salePrice, existing.id);
    existing.brand = nextBrand;
    existing.category = nextCategory;
    existing.notes = mergedNotes;
    existing.default_price = priceInfo.amount;
    existing.sale_price = salePrice;
    updated += 1;
  }

  db.exec("COMMIT");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

const xmlSectionCount = db
  .prepare("SELECT COUNT(*) AS count FROM items WHERE notes LIKE '%XML Teknik Bilgi%'")
  .get().count;

console.log(
  JSON.stringify(
    {
      scanned: products.length,
      created,
      updated,
      skipped,
      unmatched,
      invalid,
      xmlSectionCount,
    },
    null,
    2
  )
);

function getTag(source, tagName) {
  const match = String(source || "").match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? match[1].trim() : "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&#176;/g, "°")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parsePrice(rawPrice) {
  const cleaned = String(rawPrice || "")
    .replace(/\+/g, " + ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return null;
  }

  const numberMatch = cleaned.match(/[\d.,]+/);
  if (!numberMatch) {
    return null;
  }

  const rawCurrencyMatch = cleaned.match(/(EUR|USD|TRY|TL|€)/i);
  const rawCurrency = rawCurrencyMatch ? rawCurrencyMatch[1] : "EUR";
  const amount = Number.parseFloat(numberMatch[0].replace(/\./g, "").replace(",", "."));
  const currency = rawCurrency === "€" ? "EUR" : rawCurrency.toUpperCase() === "TL" ? "TRY" : rawCurrency.toUpperCase();
  return {
    amount: Number(convertToEuro(amount, currency).toFixed(2)),
    currency,
  };
}

function convertToEuro(amount, currency) {
  if (currency === "EUR") {
    return amount;
  }
  const rates = {
    USD: 0.92,
    TRY: 0.028,
  };
  return Number(amount || 0) * (rates[currency] || 1);
}

function mapCategory(category) {
  const mappings = {
    Kompressoren: "Kompresor",
    Verfluessigungssaetze: "Sogutma Grubu",
    Verdampfer: "Evaporator",
    Ventile: "Valfler & Genlesme Valfleri",
    Kuehlgeraete: "Sogutma Ekipmani",
  };
  return mappings[String(category || "").trim()] || String(category || "").trim() || "Genel";
}

function deriveSalePrice(price) {
  return Number((Number(price || 0) * 1.22).toFixed(2));
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function mergeNotes(existingNotes, xmlSection) {
  const base = String(existingNotes || "").trim();
  const cleanedBase = base.replace(/\n?XML Teknik Bilgi:[\s\S]*$/m, "").trim();
  return [cleanedBase, xmlSection].filter(Boolean).join("\n\n");
}

function buildXmlSection(spec) {
  const lines = [
    "XML Teknik Bilgi:",
    spec.type ? `Tip: ${spec.type}` : "",
    spec.model && spec.model !== "-" ? `Model: ${spec.model}` : "",
    spec.brand && spec.brand !== "-" ? `Marka: ${spec.brand}` : "",
    spec.bom && spec.bom !== "-" ? `BOM: ${spec.bom}` : "",
    spec.productionFacility && spec.productionFacility !== "-" ? `Uretim Yeri: ${spec.productionFacility}` : "",
    spec.compressorType && spec.compressorType !== "-" ? `Kompresor Tipi: ${spec.compressorType}` : "",
    spec.application && spec.application !== "-" ? `Uygulama: ${spec.application}` : "",
    spec.hpower && spec.hpower !== "-" ? `Guc: ${spec.hpower} HP` : "",
    spec.powerSupply && spec.powerSupply !== "-" ? `Besleme: ${spec.powerSupply}` : "",
    spec.refrigerant && spec.refrigerant !== "-" ? `Gaz: ${spec.refrigerant}` : "",
    spec.coolingCapacity && spec.coolingCapacity !== "-" ? `Kapasite: ${spec.coolingCapacity} W` : "",
    spec.motorType && spec.motorType !== "-" ? `Motor: ${spec.motorType}` : "",
    spec.displacement && spec.displacement !== "-" ? `Hacim: ${spec.displacement} cm3/rev` : "",
    spec.frequency && spec.frequency !== "-" ? `Frekans: ${spec.frequency} Hz` : "",
    spec.suctionLine && spec.suctionLine !== "-" ? `Emis Hatti: ${spec.suctionLine}` : "",
    spec.dischargeLine && spec.dischargeLine !== "-" ? `Basma Hatti: ${spec.dischargeLine}` : "",
    spec.productUrl ? `Urun Linki: ${spec.productUrl}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}
