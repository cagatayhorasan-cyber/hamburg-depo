const fs = require("fs");
const { db } = require("../server/db");

const csvPath = "/Users/anilakbas/Desktop/DRX_PRO_v11/coldroompro/malzeme_listesi.csv";
const raw = fs.readFileSync(csvPath, "utf8");
const lines = raw.split(/\r?\n/).filter(Boolean);

if (lines.length <= 1) {
  console.log(JSON.stringify({ created: 0, updated: 0, skipped: 0 }, null, 2));
  process.exit(0);
}

const headers = lines[0].split(";");
const rows = lines.slice(1).map(parseLine);

const findItemStmt = db.prepare("SELECT id, default_price FROM items WHERE name = ?");
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

db.exec("BEGIN");
try {
  for (const row of rows) {
    const name = clean(row["Ürün Adı"]);
    const brand = clean(row["Marka"]);
    const category = normalizeCategory(clean(row["Kategori"]));
    const productCode = clean(row["Ürün Kodu"]);
    const categoryCode = clean(row["Kategori Kodu"]);
    const displacement = clean(row["Spec: displacement_cm3"]);
    const price = Number.parseFloat(String(row["Fiyat (EUR)"] || "").replace(",", "."));

    if (!name || !Number.isFinite(price) || price <= 0) {
      skipped += 1;
      continue;
    }

    const notes = [
      "DRX malzeme listesi",
      productCode ? `urun kodu: ${productCode}` : "",
      categoryCode ? `kategori kodu: ${categoryCode}` : "",
      displacement ? `displacement: ${displacement}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    const item = findItemStmt.get(name);
    if (!item) {
      insertItemStmt.run(name, brand, category, notes, price, deriveSalePrice(price));
      created += 1;
      continue;
    }

    if (Number(item.default_price || 0) === price) {
      skipped += 1;
      continue;
    }

    updateItemStmt.run(brand, category, notes, price, deriveSalePrice(price), item.id);
    updated += 1;
  }

  db.exec("COMMIT");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

console.log(JSON.stringify({ created, updated, skipped, columns: headers.length }, null, 2));

function parseLine(line) {
  const cells = line.split(";");
  return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeCategory(value) {
  if (!value) {
    return "Genel";
  }
  if (value === "Kompresörler") {
    return "Kompresor";
  }
  return value;
}

function deriveSalePrice(price) {
  return Number((Number(price || 0) * 1.22).toFixed(2));
}
