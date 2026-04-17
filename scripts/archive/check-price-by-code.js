const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, query } = require("../server/db");

const CODES = [
  "UNEU2168U",
  "319125",
  "469544",
  "455461",
  "455458",
  "WGC86S",
  "IN 01",
  "IN 02",
  "068Z3414",
  "068Z3415",
  "068Z3348",
  "RFKH022",
  "018F6701",
  "DCB 311",
  "EX-100",
  "YZF10-20",
  "YZF25-40",
  "YZF18-30",
  "YZF34-45",
  "A1",
  "M1",
  "ECO LINE",
  "GMH-1/4",
  "GMH-3/8",
  "RFD 052S",
  "NS88",
  "ECO WHITE",
  "VLR.A.30B",
];

async function main() {
  await initDatabase();

  const results = [];
  for (const code of CODES) {
    const rows = await query(
      `
        SELECT
          id,
          name,
          brand,
          category,
          product_code AS "productCode",
          barcode,
          default_price AS "defaultPrice",
          sale_price AS "salePrice",
          notes
        FROM items
        WHERE UPPER(COALESCE(product_code, '')) = UPPER(?)
           OR UPPER(COALESCE(notes, '')) LIKE UPPER(?)
        ORDER BY sale_price DESC, default_price DESC, id DESC
      `,
      [code, `%${code}%`]
    );

    results.push({
      code,
      matches: rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        brand: row.brand || "",
        category: row.category,
        productCode: row.productCode || "",
        barcode: row.barcode || "",
        defaultPrice: Number(row.defaultPrice || 0),
        salePrice: Number(row.salePrice || 0),
      })),
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
