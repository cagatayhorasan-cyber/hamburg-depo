const fs = require("fs");
const { Pool } = require("pg");
const { initDatabase, query, execute, withTransaction, dbClient, dbPath } = require("../server/db");

const CANTAS_PATH = process.argv[2] || "/Users/anilakbas/Desktop/cantas-scraper/cantas_urunler.csv";
const ESEN_PATH = process.argv[3] || "/Users/anilakbas/Desktop/esen-scraper/esen_urunler.csv";

// ECB euro foreign exchange reference rates, 2026-03-10:
// 1 EUR = 1.1641 USD, so 1 USD = 0.85899 EUR.
const USD_PER_EUR = 1.1641;
const TRY_PER_EUR = 51.8294;

async function main() {
  await initDatabase();

  const merged = mergeProducts([
    ...readCantasProducts(CANTAS_PATH),
    ...readEsenProducts(ESEN_PATH),
  ]);

  let inserted = 0;
  let updated = 0;

  if (dbClient === "postgres") {
    ({ inserted, updated } = await syncPostgresFast([...merged.values()]));
  } else {
    ({ inserted, updated } = await syncSqliteFallback(merged));
  }

  const activeCountRow = await query("SELECT COUNT(*) AS count FROM items WHERE COALESCE(is_active, TRUE)");
  const inactiveCountRow = await query("SELECT COUNT(*) AS count FROM items WHERE NOT COALESCE(is_active, TRUE)");

  console.log(
    JSON.stringify(
      {
        dbClient,
        dbPath,
        sources: {
          cantas: CANTAS_PATH,
          esen: ESEN_PATH,
        },
        mergedProducts: merged.size,
        updated,
        inserted,
        activeItems: Number(activeCountRow[0]?.count || 0),
        hiddenItems: Number(inactiveCountRow[0]?.count || 0),
      },
      null,
      2
    )
  );
}

async function syncPostgresFast(products) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("CREATE TEMP TABLE import_items_raw (name TEXT, brand TEXT, category TEXT, barcode TEXT, notes TEXT, price_eur NUMERIC) ON COMMIT DROP");

    for (let index = 0; index < products.length; index += 250) {
      const batch = products.slice(index, index + 250);
      const values = [];
      const params = [];
      batch.forEach((product, offset) => {
        const base = offset * 6;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
        params.push(
          product.name,
          product.brand,
          product.category,
          product.code || null,
          buildNotes(product),
          product.priceEur
        );
      });
      await client.query(
        `INSERT INTO import_items_raw (name, brand, category, barcode, notes, price_eur) VALUES ${values.join(", ")}`,
        params
      );
    }

    await client.query(`
      CREATE TEMP TABLE import_items AS
      SELECT DISTINCT ON (
        COALESCE(NULLIF(barcode, ''), LOWER(name) || '::' || LOWER(COALESCE(brand, '')))
      )
        name,
        brand,
        category,
        barcode,
        notes,
        price_eur
      FROM import_items_raw
      ORDER BY
        COALESCE(NULLIF(barcode, ''), LOWER(name) || '::' || LOWER(COALESCE(brand, ''))),
        price_eur DESC,
        LENGTH(COALESCE(notes, '')) DESC
    `);

    const updated = await client.query(`
      UPDATE items AS target
      SET
        name = source.name,
        brand = source.brand,
        category = source.category,
        barcode = CASE
          WHEN source.barcode IS NULL OR source.barcode = '' THEN target.barcode
          WHEN target.barcode IS NULL OR target.barcode = '' OR target.barcode = source.barcode THEN source.barcode
          ELSE target.barcode
        END,
        notes = source.notes,
        default_price = source.price_eur,
        sale_price = source.price_eur,
        is_active = TRUE
      FROM import_items AS source
      WHERE
        (source.barcode IS NOT NULL AND source.barcode <> '' AND target.barcode = source.barcode)
        OR (
          (source.barcode IS NULL OR source.barcode = '')
          AND
          LOWER(target.name) = LOWER(source.name)
          AND LOWER(COALESCE(target.brand, '')) = LOWER(COALESCE(source.brand, ''))
        )
    `);

    const inserted = await client.query(`
      INSERT INTO items (name, brand, category, unit, min_stock, barcode, notes, default_price, sale_price, is_active)
      SELECT source.name, source.brand, source.category, 'adet', 0, source.barcode, source.notes, source.price_eur, source.price_eur, TRUE
      FROM import_items AS source
      WHERE NOT EXISTS (
        SELECT 1
        FROM items AS target
        WHERE
          (source.barcode IS NOT NULL AND source.barcode <> '' AND target.barcode = source.barcode)
          OR (
            (source.barcode IS NULL OR source.barcode = '')
            AND
            LOWER(target.name) = LOWER(source.name)
            AND LOWER(COALESCE(target.brand, '')) = LOWER(COALESCE(source.brand, ''))
          )
      )
    `);

    await client.query(`
      UPDATE items AS target
      SET is_active = FALSE
      WHERE NOT EXISTS (
        SELECT 1
        FROM import_items AS source
        WHERE
          (source.barcode IS NOT NULL AND source.barcode <> '' AND target.barcode = source.barcode)
          OR (
            (source.barcode IS NULL OR source.barcode = '')
            AND
            LOWER(target.name) = LOWER(source.name)
            AND LOWER(COALESCE(target.brand, '')) = LOWER(COALESCE(source.brand, ''))
          )
      )
    `);

    await client.query("COMMIT");
    return { updated: updated.rowCount || 0, inserted: inserted.rowCount || 0 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function syncSqliteFallback(merged) {
  const existingItems = await query(`
    SELECT id, name, brand, category, unit, min_stock, barcode, notes
    FROM items
  `);

  const byBarcode = new Map();
  const byName = new Map();
  existingItems.forEach((item) => {
    if (item.barcode) {
      byBarcode.set(item.barcode.trim(), item);
    }
    byName.set(buildNameKey(item.name, item.brand), item);
  });

  const touchedIds = new Set();
  let inserted = 0;
  let updated = 0;

  await withTransaction(async (tx) => {
    for (const product of merged.values()) {
      const existing = byBarcode.get(product.code) || byName.get(buildNameKey(product.name, product.brand));
      const notes = buildNotes(product);

      if (existing) {
        await tx.execute(
          `
            UPDATE items
            SET name = ?, brand = ?, category = ?, unit = ?, min_stock = ?, barcode = ?, notes = ?, default_price = ?, sale_price = ?, is_active = ?
            WHERE id = ?
          `,
          [
            product.name,
            product.brand,
            product.category,
            existing.unit || "adet",
            Number(existing.min_stock || 0),
            product.code || existing.barcode || null,
            notes,
            product.priceEur,
            product.priceEur,
            1,
            Number(existing.id),
          ]
        );
        touchedIds.add(Number(existing.id));
        updated += 1;
      } else {
        const result = await tx.execute(
          `
            INSERT INTO items (name, brand, category, unit, min_stock, barcode, notes, default_price, sale_price, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
          `,
          [
            product.name,
            product.brand,
            product.category,
            "adet",
            0,
            product.code || null,
            notes,
            product.priceEur,
            product.priceEur,
            1,
          ]
        );
        touchedIds.add(Number(result.rows?.[0]?.id || result.lastInsertId));
        inserted += 1;
      }
    }

    if (touchedIds.size) {
      await tx.execute(
        `UPDATE items SET is_active = ? WHERE id NOT IN (${[...touchedIds].map(() => "?").join(", ")})`,
        [0, ...touchedIds]
      );
    } else {
      await tx.execute("UPDATE items SET is_active = 0");
    }
  });

  return { inserted, updated };
}

function readCantasProducts(filePath) {
  const records = readLogicalCsvRecords(filePath).slice(1);
  return records
    .map(parseCsvRecord)
    .filter((row) => row.length >= 8)
    .map((row) => {
      const category = normalizeText(row[1] || row[0] || "Genel");
      const brand = normalizeText(row[2] || "");
      const name = normalizeText(row[3] || "");
      const code = normalizeCode(row[4] || "");
      const price = parsePriceToEur(row[5] || "");
      const url = normalizeText(row[6] || "");
      const specs = normalizeText(row[7] || "");
      return {
        key: code || buildNameKey(name, brand),
        source: "Cantas",
        category,
        brand,
        name,
        code,
        priceEur: price,
        url,
        details: specs,
      };
    })
    .filter((item) => item.name && item.priceEur > 0);
}

function readEsenProducts(filePath) {
  return readLogicalCsvRecords(filePath)
    .slice(1)
    .map(parseCsvRecord)
    .filter((row) => row.length >= 10)
    .map((row) => {
      const category = normalizeText(row[1] || row[0] || "Genel");
      const brand = normalizeText(row[2] || "") || deriveBrandFromName(row[3] || "");
      const name = normalizeText(row[3] || "");
      const code = normalizeCode(row[4] || "");
      const price = parsePriceToEur(`${row[5] || ""} ${row[6] || ""}`.trim());
      const stock = normalizeText(row[7] || "");
      const onSale = normalizeText(row[8] || "");
      const url = normalizeText(row[9] || "");
      return {
        key: code || buildNameKey(name, brand),
        source: "Esen",
        category,
        brand,
        name,
        code,
        priceEur: price,
        url,
        details: [stock && `Stok: ${stock}`, onSale && `Indirim: ${onSale}`].filter(Boolean).join(" | "),
      };
    })
    .filter((item) => item.name && item.priceEur > 0);
}

function mergeProducts(products) {
  const merged = new Map();
  for (const product of products) {
    const existing = merged.get(product.key);
    if (!existing) {
      merged.set(product.key, product);
      continue;
    }

    const priceWinner = product.priceEur >= existing.priceEur ? product : existing;
    merged.set(product.key, {
      ...priceWinner,
      details: longestText(existing.details, product.details),
      url: existing.url || product.url,
      source: `${existing.source}, ${product.source}`,
      category: priceWinner.category || existing.category,
      brand: priceWinner.brand || existing.brand,
      name: priceWinner.name || existing.name,
      code: priceWinner.code || existing.code,
    });
  }
  return merged;
}

function readLogicalCsvRecords(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const records = [];
  let buffer = "";

  for (const line of lines) {
    if (!line.trim() && !buffer) {
      continue;
    }

    buffer = buffer ? `${buffer}\n${line}` : line;
    if (quoteCount(buffer) % 2 === 0) {
      records.push(buffer);
      buffer = "";
    }
  }

  if (buffer.trim()) {
    records.push(buffer);
  }

  return records;
}

function parseCsvRecord(record) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < record.length; i += 1) {
    const char = record[i];
    const next = record[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ";" && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parsePriceToEur(raw) {
  const text = normalizeText(raw).toUpperCase();
  if (!text) {
    return 0;
  }

  const currency = text.includes("USD")
    ? "USD"
    : text.includes("TRY") || text.includes(" TL")
      ? "TRY"
      : "EUR";

  const cleaned = text
    .replace(/\+.*$/g, "")
    .replace(/[^0-9,.\-]/g, "")
    .trim();

  if (!cleaned) {
    return 0;
  }

  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }

  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) {
    return 0;
  }

  if (currency === "USD") {
    return roundPrice(amount / USD_PER_EUR);
  }

  if (currency === "TRY") {
    return roundPrice(amount / TRY_PER_EUR);
  }

  return roundPrice(amount);
}

function buildNameKey(name, brand) {
  return `${normalizeKey(brand)}::${normalizeKey(name)}`;
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&[#a-z0-9]+;/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim();
}

function normalizeText(value) {
  return decodeHtmlEntities(String(value || ""))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCode(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function deriveBrandFromName(name) {
  return normalizeText(name).split(" ").slice(0, 1).join("");
}

function buildNotes(product) {
  return [
    `Kaynak: ${product.source}`,
    product.code ? `Kod: ${product.code}` : "",
    product.details,
    product.url ? `URL: ${product.url}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function longestText(first, second) {
  return (normalizeText(second).length > normalizeText(first).length ? second : first) || "";
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&uuml;/gi, "ü")
    .replace(/&ouml;/gi, "ö")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&nbsp;/gi, " ");
}

function quoteCount(value) {
  return (value.match(/"/g) || []).length;
}

function roundPrice(value) {
  return Math.round(value * 100) / 100;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
