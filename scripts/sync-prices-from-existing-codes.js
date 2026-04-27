const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, query, withTransaction } = require("../server/db");

async function main() {
  await initDatabase();

  const candidates = await query(`
    SELECT
      id,
      name,
      brand,
      product_code AS "productCode",
      barcode,
      default_price AS "defaultPrice",
      sale_price AS "salePrice"
    FROM items
    WHERE COALESCE(product_code, '') <> ''
      AND (COALESCE(default_price, 0) <= 0 OR COALESCE(sale_price, 0) <= 0)
    ORDER BY id DESC
  `);

  const updates = [];

  await withTransaction(async (tx) => {
    for (const item of candidates) {
      const refs = await tx.query(
        `
          SELECT
            id,
            name,
            brand,
            product_code AS "productCode",
            default_price AS "defaultPrice",
            sale_price AS "salePrice"
          FROM items
          WHERE id <> ?
            AND UPPER(COALESCE(product_code, '')) = UPPER(?)
            AND (COALESCE(default_price, 0) > 0 OR COALESCE(sale_price, 0) > 0)
          ORDER BY COALESCE(sale_price, 0) DESC, COALESCE(default_price, 0) DESC, id DESC
        `,
        [Number(item.id), item.productCode]
      );

      const best = refs[0];
      if (!best) {
        continue;
      }

      const nextDefault = Number(item.defaultPrice || 0) > 0 ? Number(item.defaultPrice || 0) : Number(best.defaultPrice || 0);
      const nextSale = Number(item.salePrice || 0) > 0 ? Number(item.salePrice || 0) : Number(best.salePrice || 0);

      if (nextDefault <= 0 && nextSale <= 0) {
        continue;
      }

      await tx.execute(
        `
          UPDATE items
          SET default_price = ?, sale_price = ?
          WHERE id = ?
        `,
        [nextDefault, nextSale, Number(item.id)]
      );

      updates.push({
        id: Number(item.id),
        name: item.name,
        productCode: item.productCode,
        barcode: item.barcode || "",
        defaultPrice: nextDefault,
        salePrice: nextSale,
        sourceId: Number(best.id),
        sourceName: best.name,
      });
    }
  });

  console.log(JSON.stringify({ updated: updates.length, updates }, null, 2));
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
