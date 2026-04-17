const fs = require("fs");
const path = require("path");
const {
  initDatabase,
  query,
  withTransaction,
  dbClient,
  dbPath,
} = require("../server/db");

const csvPath = process.argv[2] || path.join(process.cwd(), "admin-tools", "coldroompro-source", "malzeme_listesi.csv");
const invalidLogPath = process.argv[3] || path.join(path.dirname(dbPath), "import-malzeme-invalid.log");

async function main() {
  await initDatabase();

  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) {
    console.log(JSON.stringify({ dbClient, dbPath, source: csvPath, created: 0, updated: 0, skipped: 0 }, null, 2));
    return;
  }

  const headers = lines[0].split(";");
  const rows = lines.slice(1).map((line) => parseLine(headers, line));
  const existingItems = await query(`
    SELECT id, name, brand, category, product_code, notes, default_price, sale_price
    FROM items
  `);

  const exactNameMap = new Map();
  const relaxedNameMap = new Map();
  const productCodeMap = new Map();

  existingItems.forEach((item) => {
    indexItem(exactNameMap, normalizeName(item.name), item);
    indexItem(relaxedNameMap, normalizeName(stripParentheses(item.name)), item);
    indexItem(productCodeMap, normalizeCode(item.product_code || extractProductCode(item.notes)), item);
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let invalid = 0;
  const invalidRows = [];

  await withTransaction(async (tx) => {
    for (const row of rows) {
      const name = clean(row["Ürün Adı"]);
      const brand = clean(row["Marka"]);
      const category = normalizeCategory(clean(row["Kategori"]));
      const productCode = normalizeCode(clean(row["Ürün Kodu"]));
      const categoryCode = clean(row["Kategori Kodu"]);
      const displacement = clean(row["Spec: displacement_cm3"]);
      const price = Number.parseFloat(String(row["Fiyat (EUR)"] || "").replace(",", "."));

      if (!isImportableRow(name, price)) {
        invalid += 1;
        invalidRows.push({
          name,
          brand,
          category,
          productCode,
          rawPrice: row["Fiyat (EUR)"] || "",
        });
        continue;
      }

      const noteText = buildNotes({ productCode, categoryCode, displacement });
      const mergedCandidate = findExistingItem({
        exactNameMap,
        relaxedNameMap,
        productCodeMap,
        name,
        productCode,
      });
      const defaultPrice = Number(price.toFixed(2));
      const salePrice = deriveSalePrice(defaultPrice);

      if (!mergedCandidate) {
        const result = await tx.execute(
          `
            INSERT INTO items (name, brand, category, unit, min_stock, product_code, barcode, notes, default_price, sale_price)
            VALUES (?, ?, ?, 'adet', 0, ?, NULL, ?, ?, ?)
          `,
          [name, brand, category, productCode, noteText, defaultPrice, salePrice]
        );
        const inserted = {
          id: Number(result.lastInsertId || 0),
          name,
          brand,
          category,
          product_code: productCode,
          notes: noteText,
          default_price: defaultPrice,
          sale_price: salePrice,
        };
        indexItem(exactNameMap, normalizeName(name), inserted);
        indexItem(relaxedNameMap, normalizeName(stripParentheses(name)), inserted);
        indexItem(productCodeMap, productCode, inserted);
        created += 1;
        continue;
      }

      const nextBrand = brand || String(mergedCandidate.brand || "");
      const nextCategory = category || String(mergedCandidate.category || "Genel");
      const nextProductCode = productCode || String(mergedCandidate.product_code || "");
      const nextNotes = mergeNotes(mergedCandidate.notes, noteText);
      const sameRecord =
        Number(mergedCandidate.default_price || 0) === defaultPrice &&
        Number(mergedCandidate.sale_price || 0) === salePrice &&
        String(mergedCandidate.brand || "") === nextBrand &&
        String(mergedCandidate.category || "") === nextCategory &&
        String(mergedCandidate.product_code || "") === nextProductCode &&
        String(mergedCandidate.notes || "") === nextNotes;

      if (sameRecord) {
        skipped += 1;
        continue;
      }

      await tx.execute(
        `
          UPDATE items
          SET brand = ?, category = ?, product_code = ?, notes = ?, default_price = ?, sale_price = ?
          WHERE id = ?
        `,
        [nextBrand, nextCategory, nextProductCode, nextNotes, defaultPrice, salePrice, mergedCandidate.id]
      );

      mergedCandidate.brand = nextBrand;
      mergedCandidate.category = nextCategory;
      mergedCandidate.product_code = nextProductCode;
      mergedCandidate.notes = nextNotes;
      mergedCandidate.default_price = defaultPrice;
      mergedCandidate.sale_price = salePrice;
      updated += 1;
    }
  });

  if (invalidRows.length) {
    fs.writeFileSync(
      invalidLogPath,
      invalidRows
        .map((row) =>
          JSON.stringify(
            {
              source: csvPath,
              note: "Import disi satir",
              ...row,
            },
            null,
            2
          )
        )
        .join("\n\n"),
      "utf8"
    );
  }

  console.log(
    JSON.stringify(
      {
        dbClient,
        dbPath,
        source: csvPath,
        scanned: rows.length,
        created,
        updated,
        skipped,
        invalid,
        invalidLogPath: invalidRows.length ? invalidLogPath : null,
      },
      null,
      2
    )
  );
}

function parseLine(headers, line) {
  const cells = line.split(";");
  return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
}

function clean(value) {
  return String(value || "").trim();
}

function normalizeCategory(value) {
  const mappings = {
    Kompresörler: "Kompresor",
    "Klima Sistemleri (HVAC)": "Klima Sistemleri",
    "Soğuk Oda Yedek Parçaları": "Sogutma Ekipmani",
  };
  return mappings[value] || value || "Genel";
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

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function extractProductCode(notes) {
  const match = String(notes || "").match(/urun kodu:\s*([^|]+)/i);
  return normalizeCode(match ? match[1] : "");
}

function buildNotes({ productCode, categoryCode, displacement }) {
  return [
    "DRX malzeme listesi",
    productCode ? `urun kodu: ${productCode}` : "",
    categoryCode ? `kategori kodu: ${categoryCode}` : "",
    displacement ? `displacement: ${displacement}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function isImportableRow(name, price) {
  if (!name || !Number.isFinite(price) || price <= 0) {
    return false;
  }

  const normalized = normalizeName(name);
  if (!normalized) {
    return false;
  }

  return normalized !== "complete recharge time 110h";
}

function deriveSalePrice(price) {
  return Number((Number(price || 0) * 1.22).toFixed(2));
}

function indexItem(map, key, item) {
  if (!key) {
    return;
  }

  const current = map.get(key);
  if (!current || Number(item.id) < Number(current.id)) {
    map.set(key, item);
  }
}

function findExistingItem({ exactNameMap, relaxedNameMap, productCodeMap, name, productCode }) {
  const exactKey = normalizeName(name);
  const relaxedKey = normalizeName(stripParentheses(name));
  return (
    exactNameMap.get(exactKey) ||
    relaxedNameMap.get(relaxedKey) ||
    productCodeMap.get(productCode) ||
    null
  );
}

function mergeNotes(existingNotes, importedNotes) {
  const keepExisting = String(existingNotes || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isDrxManagedNote(part));
  const nextParts = String(importedNotes || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  return [...keepExisting, ...nextParts].join(" | ");
}

function isDrxManagedNote(notePart) {
  return (
    notePart === "DRX malzeme listesi" ||
    /^urun kodu:/i.test(notePart) ||
    /^kategori kodu:/i.test(notePart) ||
    /^displacement:/i.test(notePart)
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
