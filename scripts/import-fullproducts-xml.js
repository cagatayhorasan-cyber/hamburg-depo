const fs = require("fs");
const { db } = require("../server/db");

const xmlPath = "/Users/anilakbas/Desktop/Katalog/fullproducts.xml";
const raw = fs.readFileSync(xmlPath, "utf8");

const productBlocks = raw.match(/<product>[\s\S]*?<\/product>/g) || [];

const existingItems = db.prepare("SELECT id, name, brand, category, notes, default_price, sale_price FROM items").all();
const insertItemStmt = db.prepare(`
  INSERT INTO items (name, brand, category, unit, min_stock, barcode, notes, default_price, sale_price)
  VALUES (?, ?, ?, 'adet', 0, NULL, ?, ?, ?)
`);
const updateItemStmt = db.prepare(`
  UPDATE items
  SET brand = ?, category = ?, notes = ?, default_price = ?, sale_price = ?
  WHERE id = ?
`);

const exactNameMap = new Map();
const relaxedNameMap = new Map();

for (const item of existingItems) {
  addIndex(exactNameMap, normalizeName(item.name), item);
  addIndex(relaxedNameMap, normalizeName(stripParentheses(item.name)), item);
}

let created = 0;
let updated = 0;
let skipped = 0;
let duplicatesInXml = 0;
let nonEuroConverted = 0;

const seenInXml = new Set();

db.exec("BEGIN");
try {
  for (const block of productBlocks) {
    const name = decodeXml(getTag(block, "name"));
    const category = mapCategory(decodeXml(getTag(block, "category")));
    const type = decodeXml(getTag(block, "type"));
    const technical = getTag(block, "technical_specifications");
    const brand = decodeXml(getTag(technical, "brand"));
    const bom = decodeXml(getTag(technical, "bom"));
    const model = decodeXml(getTag(technical, "compressor_model"));
    const productUrl = decodeXml(getTag(technical, "product_url"));
    const refrigerant = decodeXml(getTag(technical, "refrigerant"));
    const powerSupply = decodeXml(getTag(technical, "power_supply"));
    const coolingCapacity = decodeXml(getTag(technical, "cooling_capacity_watt"));
    const productionFacility = decodeXml(getTag(technical, "production_facility"));
    const parsedPrice = parsePrice(decodeXml(getTag(block, "price")));

    if (!name || !parsedPrice || !Number.isFinite(parsedPrice.amount) || parsedPrice.amount <= 0) {
      skipped += 1;
      continue;
    }

    if (parsedPrice.currency !== "EUR") {
      nonEuroConverted += 1;
    }

    const exactKey = normalizeName(name);
    if (seenInXml.has(exactKey)) {
      duplicatesInXml += 1;
      continue;
    }
    seenInXml.add(exactKey);

    const relaxedKey = normalizeName(stripParentheses(name));
    const current =
      pickIndexedItem(exactNameMap.get(exactKey)) ||
      pickIndexedItem(relaxedNameMap.get(relaxedKey)) ||
      null;

    const euroPrice = Number(parsedPrice.amount.toFixed(2));
    const salePrice = deriveSalePrice(euroPrice);
    const noteParts = [
      "XML katalog import",
      type ? `tip: ${type}` : "",
      bom && bom !== "-" ? `bom: ${bom}` : "",
      model && model !== "-" ? `model: ${model}` : "",
      refrigerant && refrigerant !== "-" ? `gas: ${refrigerant}` : "",
      powerSupply && powerSupply !== "-" ? `voltaj: ${powerSupply}` : "",
      coolingCapacity && coolingCapacity !== "-" ? `kapasite_w: ${coolingCapacity}` : "",
      productionFacility && productionFacility !== "-" ? `uretim: ${productionFacility}` : "",
      productUrl ? `url: ${productUrl}` : "",
    ].filter(Boolean);
    const noteText = noteParts.join(" | ");

    if (!current) {
      insertItemStmt.run(name, brand, category || "Genel", noteText, euroPrice, salePrice);
      const inserted = { id: Number(db.prepare("SELECT last_insert_rowid() AS id").get().id), name, brand, category, notes: noteText };
      addIndex(exactNameMap, exactKey, inserted);
      addIndex(relaxedNameMap, relaxedKey, inserted);
      created += 1;
      continue;
    }

    const mergedNotes = mergeNotes(current.notes, noteText);
    const samePrice =
      Number(current.default_price || 0) === euroPrice &&
      Number(current.sale_price || 0) === salePrice &&
      String(current.brand || "") === String(brand || "") &&
      String(current.category || "") === String(category || "Genel") &&
      String(current.notes || "") === mergedNotes;

    if (samePrice) {
      skipped += 1;
      continue;
    }

    updateItemStmt.run(
      brand || current.brand || "",
      category || current.category || "Genel",
      mergedNotes,
      euroPrice,
      salePrice,
      current.id
    );
    current.brand = brand || current.brand || "";
    current.category = category || current.category || "Genel";
    current.notes = mergedNotes;
    current.default_price = euroPrice;
    current.sale_price = salePrice;
    updated += 1;
  }

  db.exec("COMMIT");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

console.log(
  JSON.stringify(
    {
      scanned: productBlocks.length,
      created,
      updated,
      skipped,
      duplicatesInXml,
      nonEuroConverted,
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
  const cleaned = String(rawPrice || "").trim().replace(/\s+/g, " ");
  const match = cleaned.match(/^([\d.,]+)\s*([A-Z]{3}|TL)$/i);
  if (!match) {
    return null;
  }

  const amount = Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  const currency = match[2].toUpperCase() === "TL" ? "TRY" : match[2].toUpperCase();

  return {
    amount: convertToEuro(amount, currency),
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

  return amount * (rates[currency] || 1);
}

function mapCategory(category) {
  const value = String(category || "").trim();
  const mappings = {
    Kompressoren: "Kompresor",
    "Verfluessigungssaetze": "Sogutma Grubu",
    Verdampfer: "Evaporator",
    Ventile: "Valfler & Genlesme Valfleri",
    "Kuehlgeraete": "Sogutma Ekipmani",
  };

  return mappings[value] || value || "Genel";
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

function stripParentheses(value) {
  return String(value || "").replace(/\([^)]*\)/g, " ");
}

function addIndex(map, key, item) {
  if (!key) {
    return;
  }
  const list = map.get(key) || [];
  list.push(item);
  map.set(key, list);
}

function pickIndexedItem(items) {
  if (!items || items.length !== 1) {
    return null;
  }
  return items[0];
}

function mergeNotes(existing, incoming) {
  const existingText = String(existing || "").trim();
  const incomingText = String(incoming || "").trim();
  if (!existingText) {
    return incomingText;
  }
  if (!incomingText || existingText.includes(incomingText)) {
    return existingText;
  }
  return `${existingText} | ${incomingText}`;
}
