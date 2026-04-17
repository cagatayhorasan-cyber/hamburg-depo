const XLSX = require("xlsx");
const { db } = require("../server/db");

const workbookPath = "/Users/anilakbas/Desktop/Burak2 /ENDÜSTRİYEL SPLİT FİYAT LİSTESİ-2025-REV1.xlsx";
const workbook = XLSX.readFile(workbookPath);

const targetSheets = ["BİTZER", "DORİN", "FRASCOLD", "GEA BOCK"];

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
  for (const sheetName of targetSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
    });

    for (const row of rows) {
      if (!row || !row.length) {
        continue;
      }

      importRow(sheetName, row[0], row[1], row[8], "Endustriyel Split Dis Unite", `${sheetName} split fiyat listesi`);
      importRow("FrigoCraft", row[9], row[10], row[13], "Endustriyel Split Ic Unite", `${sheetName} split fiyat listesi`);
      importRow("Danfoss", row[14], row[15], row[17], "Dijital Kontrol", `${sheetName} split fiyat listesi`);
    }
  }

  db.exec("COMMIT");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

console.log(JSON.stringify({ created, updated, skipped }, null, 2));

function importRow(brand, code, name, price, category, noteSource) {
  if (!code || !name || !Number(price)) {
    return;
  }

  const cleanedName = String(name).replace(/\s+/g, " ").trim();
  const notes = `${noteSource} | kod: ${String(code).trim()}`;
  const item = findItemStmt.get(cleanedName);

  if (!item) {
    insertItemStmt.run(cleanedName, brand, category, notes, Number(price), deriveSalePrice(price));
    created += 1;
    return;
  }

  if (Number(item.default_price || 0) === Number(price)) {
    skipped += 1;
    return;
  }

  updateItemStmt.run(brand, category, notes, Number(price), deriveSalePrice(price), item.id);
  updated += 1;
}

function deriveSalePrice(price) {
  return Number((Number(price || 0) * 1.22).toFixed(2));
}
