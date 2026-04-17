const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, query } = require("../server/db");

async function main() {
  await initDatabase();

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
      WHERE LOWER(name) LIKE LOWER(?)
         OR LOWER(COALESCE(product_code, '')) LIKE LOWER(?)
         OR LOWER(COALESCE(notes, '')) LIKE LOWER(?)
      ORDER BY COALESCE(sale_price, 0) DESC, COALESCE(default_price, 0) DESC, id DESC
    `,
    ["%dcb%", "%dcb%", "%dcb%"]
  );

  console.log(
    JSON.stringify(
      rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        brand: row.brand || "",
        category: row.category,
        productCode: row.productCode || "",
        barcode: row.barcode || "",
        defaultPrice: Number(row.defaultPrice || 0),
        salePrice: Number(row.salePrice || 0),
      })),
      null,
      2
    )
  );
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
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
