const fs = require("fs");
const { Pool } = require("pg");
const { initDatabase, query, execute, withTransaction, dbClient, dbPath } = require("../server/db");

const CANTAS_PATH = process.argv[2] || "/Users/anilakbas/Desktop/cantas-scraper/cantas_urunler.csv";
const ESEN_PATH = process.argv[3] || "/Users/anilakbas/Desktop/esen-scraper/esen_urunler.csv";

// ECB euro foreign exchange reference rates, 2026-03-10:
// 1 EUR = 1.1641 USD, so 1 USD = 0.85899 EUR.
const USD_PER_EUR = 1.1641;
const TRY_PER_EUR = 51.8294;
const SQL_NAME_KEY = `
  TRIM(REGEXP_REPLACE(LOWER(COALESCE(brand, '')), '[^a-z0-9]+', ' ', 'g'))
  || '::' ||
  TRIM(REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', ' ', 'g'))
`;

async function main() {
  await initDatabase();

  const merged = mergeProducts([
    ...readCantasProducts(CANTAS_PATH),
    ...readEsenProducts(ESEN_PATH),
  ]);
  const normalizedProducts = assignDrcCodes([...merged.values()]);

  let inserted = 0;
  let updated = 0;

  if (dbClient === "postgres") {
    ({ inserted, updated } = await syncPostgresFast(normalizedProducts));
  } else {
    ({ inserted, updated } = await syncSqliteFallback(normalizedProducts));
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
        mergedProducts: normalizedProducts.length,
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
    await client.query("DROP TABLE IF EXISTS import_items_raw");
    await client.query("DROP TABLE IF EXISTS import_items");
    await client.query("DROP TABLE IF EXISTS keep_items");
    await client.query("UPDATE items SET barcode = NULL WHERE barcode LIKE 'DRC-%'");
    await client.query("CREATE TEMP TABLE import_items_raw (name_key TEXT, name TEXT, brand TEXT, category TEXT, barcode TEXT, notes TEXT, price_eur NUMERIC) ON COMMIT DROP");

    for (let index = 0; index < products.length; index += 250) {
      const batch = products.slice(index, index + 250);
      const values = [];
      const params = [];
      batch.forEach((product, offset) => {
        const base = offset * 7;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`);
        params.push(
          product.nameKey,
          product.name,
          product.brand,
          product.category,
          product.stockCode,
          buildNotes(product),
          product.priceEur
        );
      });
      await client.query(
        `INSERT INTO import_items_raw (name_key, name, brand, category, barcode, notes, price_eur) VALUES ${values.join(", ")}`,
        params
      );
    }

    await client.query(`
      CREATE TEMP TABLE import_items AS
      SELECT DISTINCT ON (name_key)
        name_key,
        name,
        brand,
        category,
        barcode,
        notes,
        price_eur
      FROM import_items_raw
      ORDER BY
        name_key,
        price_eur DESC,
        LENGTH(COALESCE(notes, '')) DESC
    `);

    await client.query(`
      CREATE TEMP TABLE keep_items AS
      SELECT
        ${SQL_NAME_KEY} AS name_key,
        MIN(id) AS keep_id
      FROM items
      GROUP BY 1
    `);

    await client.query(`
      UPDATE items AS target
      SET is_active = FALSE
      FROM keep_items AS keeper
      WHERE
        (LOWER(COALESCE(target.brand, '')) || '::' || LOWER(target.name)) = keeper.name_key
        AND target.id <> keeper.keep_id
    `);

    const updated = await client.query(`
      UPDATE items AS target
      SET
        name = source.name,
        brand = source.brand,
        category = source.category,
        barcode = source.barcode,
        notes = source.notes,
        default_price = source.price_eur,
        sale_price = source.price_eur,
        is_active = TRUE
      FROM import_items AS source
      JOIN keep_items AS keeper ON keeper.name_key = source.name_key
      WHERE target.id = keeper.keep_id
    `);

    const inserted = await client.query(`
      INSERT INTO items (name, brand, category, unit, min_stock, barcode, notes, default_price, sale_price, is_active)
      SELECT source.name, source.brand, source.category, 'adet', 0, source.barcode, source.notes, source.price_eur, source.price_eur, TRUE
      FROM import_items AS source
      WHERE NOT EXISTS (
        SELECT 1
        FROM keep_items AS keeper
        WHERE keeper.name_key = source.name_key
      )
    `);

    await client.query(`
      UPDATE items AS target
      SET is_active = FALSE
      WHERE NOT EXISTS (
        SELECT 1
        FROM import_items AS source
        WHERE source.name_key = (${SQL_NAME_KEY})
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

async function syncSqliteFallback(products) {
  const existingItems = await query(`
    SELECT id, name, brand, category, unit, min_stock, barcode, notes
    FROM items
  `);

  const byName = new Map();
  existingItems.forEach((item) => {
    const nameKey = buildNameKey(item.name, item.brand);
    if (!byName.has(nameKey) || Number(item.id) < Number(byName.get(nameKey).id)) {
      byName.set(nameKey, item);
    }
  });

  const touchedIds = new Set();
  let inserted = 0;
  let updated = 0;

  await withTransaction(async (tx) => {
    for (const product of products) {
      const existing = byName.get(product.nameKey);
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
            product.stockCode,
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
            product.stockCode,
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
        key: buildNameKey(name, brand),
        nameKey: buildNameKey(name, brand),
        source: "Cantas",
        sourcePriority: 2,
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
        key: buildNameKey(name, brand),
        nameKey: buildNameKey(name, brand),
        source: "Esen",
        sourcePriority: 1,
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

    const sourceWinner = product.sourcePriority === existing.sourcePriority
      ? (product.priceEur >= existing.priceEur ? product : existing)
      : (product.sourcePriority > existing.sourcePriority ? product : existing);
    merged.set(product.key, {
      ...sourceWinner,
      details: sourceWinner.source === "Cantas" ? sourceWinner.details : longestText(existing.details, product.details),
      source: sourceWinner.source,
      category: sourceWinner.category || existing.category,
      brand: sourceWinner.brand || existing.brand,
      name: sourceWinner.name || existing.name,
      code: sourceWinner.code || existing.code,
      nameKey: sourceWinner.nameKey || existing.nameKey,
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
    normalized = cleaned.lastIndexOf(".") > cleaned.lastIndexOf(",")
      ? cleaned.replace(/,/g, "")
      : cleaned.replace(/\./g, "").replace(",", ".");
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
  const simplifiedDetails = simplifyDetails(product.details);
  return [`Kaynak: ${product.source}`, simplifiedDetails].filter(Boolean).join(" | ");
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

function assignDrcCodes(products) {
  return [...products]
    .sort((a, b) => a.brand.localeCompare(b.brand, "tr") || a.name.localeCompare(b.name, "tr"))
    .map((product, index) => ({
      ...product,
      stockCode: `DRC-${String(index + 1).padStart(5, "0")}`,
    }));
}

function simplifyDetails(details) {
  return normalizeText(details)
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => !/(url|stok:|indirim:|palet|koli|paket|barkod|barcode|urun kodu|kod:|desi|net agirlik|brut agirlik)/i.test(segment))
    .slice(0, 5)
    .join(" | ");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
