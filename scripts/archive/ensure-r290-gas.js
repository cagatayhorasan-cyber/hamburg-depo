const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function loadEnv(filePath) {
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1)];
      })
  );
}

async function main() {
  const env = loadEnv(path.join(process.cwd(), ".env"));
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    const existing = await client.query(
      `
        SELECT id, name, brand, category, barcode, default_price, sale_price
        FROM items
        WHERE (
          lower(name) LIKE '%r290%'
          OR lower(coalesce(notes, '')) LIKE '%r290%'
        )
          AND lower(category) IN ('soğutucu akışkanlar', 'sogutucu akiskanlar')
        ORDER BY id ASC
        LIMIT 1
      `
    );

    if (existing.rows.length) {
      console.log(JSON.stringify({ ok: true, action: "exists", item: existing.rows[0] }, null, 2));
      return;
    }

    const lastBarcode = await client.query(
      `
        SELECT barcode
        FROM items
        WHERE barcode LIKE 'DRC-%'
        ORDER BY barcode DESC
        LIMIT 1
      `
    );
    const lastValue = Number(String(lastBarcode.rows[0]?.barcode || "DRC-00000").replace("DRC-", ""));
    const nextBarcode = `DRC-${String(lastValue + 1).padStart(5, "0")}`;

    const inserted = await client.query(
      `
        INSERT INTO items (
          name,
          brand,
          category,
          unit,
          min_stock,
          barcode,
          notes,
          default_price,
          sale_price,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
        RETURNING id, name, brand, category, unit, barcode, default_price, sale_price
      `,
      [
        "R290 Gazı (Soğutucu Gaz / Propan)",
        "Genel",
        "Soğutucu Akışkanlar",
        "kg",
        0,
        nextBarcode,
        "Manuel eklenen genel kart | alias: r290 gazı, r290 gazi, propan, propane, soğutucu gaz, sogutucu gaz, refrigerant gas | net ambalaj ve fiyat daha sonra netlestirilecek",
        0,
        0,
      ]
    );

    console.log(JSON.stringify({ ok: true, action: "inserted", item: inserted.rows[0] }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
