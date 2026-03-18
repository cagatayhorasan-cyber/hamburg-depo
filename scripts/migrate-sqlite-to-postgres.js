const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { Pool } = require("pg");

const sqlitePath = process.env.SQLITE_SOURCE_PATH
  ? path.resolve(process.env.SQLITE_SOURCE_PATH)
  : path.join(__dirname, "..", "data", "hamburg-depo.sqlite");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL tanimli degil.");
  process.exit(1);
}

const sqliteDb = new DatabaseSync(sqlitePath);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("Supabase baglantisi acildi.");
    await client.query("BEGIN");
    console.log("Transaction basladi, hedef tablolar temizleniyor...");
    await clearTables(client);
    console.log("Hedef tablolar temizlendi.");

    const users = sqliteDb.prepare("SELECT * FROM users ORDER BY id ASC").all();
    console.log(`Users tasiniyor: ${users.length}`);
    for (const row of users) {
      await client.query(
        `
          INSERT INTO users (id, name, username, password_hash, role)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [row.id, row.name, row.username, row.password_hash, row.role]
      );
    }
    console.log("Users tamamlandi.");

    const items = sqliteDb.prepare("SELECT * FROM items ORDER BY id ASC").all();
    console.log(`Items tasiniyor: ${items.length}`);
    for (const row of items) {
      await client.query(
        `
          INSERT INTO items (
            id, name, brand, category, unit, min_stock, barcode, notes, default_price, sale_price, created_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `,
        [
          row.id,
          row.name,
          row.brand || "",
          row.category,
          row.unit,
          Number(row.min_stock || 0),
          row.barcode || null,
          row.notes || "",
          Number(row.default_price || 0),
          Number(row.sale_price || 0),
          normalizeTimestamp(row.created_at),
        ]
      );
    }
    console.log("Items tamamlandi.");

    const movements = sqliteDb.prepare("SELECT * FROM movements ORDER BY id ASC").all();
    console.log(`Movements tasiniyor: ${movements.length}`);
    for (const row of movements) {
      await client.query(
        `
          INSERT INTO movements (
            id, item_id, type, quantity, unit_price, movement_date, note, user_id, created_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          row.id,
          row.item_id,
          row.type,
          Number(row.quantity || 0),
          Number(row.unit_price || 0),
          row.movement_date,
          row.note || "",
          row.user_id || null,
          normalizeTimestamp(row.created_at),
        ]
      );
    }
    console.log("Movements tamamlandi.");

    const expenses = sqliteDb.prepare("SELECT * FROM expenses ORDER BY id ASC").all();
    console.log(`Expenses tasiniyor: ${expenses.length}`);
    for (const row of expenses) {
      await client.query(
        `
          INSERT INTO expenses (
            id, title, category, amount, expense_date, payment_type, note, user_id, created_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          row.id,
          row.title,
          row.category,
          Number(row.amount || 0),
          row.expense_date,
          row.payment_type,
          row.note || "",
          row.user_id || null,
          normalizeTimestamp(row.created_at),
        ]
      );
    }
    console.log("Expenses tamamlandi.");

    const cashbook = sqliteDb.prepare("SELECT * FROM cashbook ORDER BY id ASC").all();
    console.log(`Cashbook tasiniyor: ${cashbook.length}`);
    for (const row of cashbook) {
      await client.query(
        `
          INSERT INTO cashbook (
            id, type, title, amount, cash_date, reference, note, user_id, created_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          row.id,
          row.type,
          row.title,
          Number(row.amount || 0),
          row.cash_date,
          row.reference || "",
          row.note || "",
          row.user_id || null,
          normalizeTimestamp(row.created_at),
        ]
      );
    }
    console.log("Cashbook tamamlandi.");

    const quotes = sqliteDb.prepare("SELECT * FROM quotes ORDER BY id ASC").all();
    console.log(`Quotes tasiniyor: ${quotes.length}`);
    for (const row of quotes) {
      await client.query(
        `
          INSERT INTO quotes (
            id, customer_name, title, quote_date, discount, subtotal, total, note, user_id, created_at,
            language, quote_no, vat_rate, vat_amount, net_total, gross_total, is_export
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        `,
        [
          row.id,
          row.customer_name,
          row.title,
          row.quote_date,
          Number(row.discount || 0),
          Number(row.subtotal || 0),
          Number(row.total || 0),
          row.note || "",
          row.user_id || null,
          normalizeTimestamp(row.created_at),
          row.language || "de",
          row.quote_no || "",
          Number(row.vat_rate || 0),
          Number(row.vat_amount || 0),
          Number(row.net_total || row.total || 0),
          Number(row.gross_total || row.total || 0),
          row.is_export === 1 ? true : !!row.is_export,
        ]
      );
    }
    console.log("Quotes tamamlandi.");

    const quoteItems = sqliteDb.prepare("SELECT * FROM quote_items ORDER BY id ASC").all();
    console.log(`Quote items tasiniyor: ${quoteItems.length}`);
    for (const row of quoteItems) {
      await client.query(
        `
          INSERT INTO quote_items (
            id, quote_id, item_id, item_name, quantity, unit, unit_price, total
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          row.id,
          row.quote_id,
          row.item_id || null,
          row.item_name,
          Number(row.quantity || 0),
          row.unit,
          Number(row.unit_price || 0),
          Number(row.total || 0),
        ]
      );
    }
    console.log("Quote items tamamlandi.");

    console.log("Sequence degerleri guncelleniyor...");
    await reseedSequences(client);
    console.log("Sequence guncellemesi tamamlandi.");
    await client.query("COMMIT");
    console.log("Transaction commit edildi.");

    console.log(
      JSON.stringify(
        {
          sqlitePath,
          users: users.length,
          items: items.length,
          movements: movements.length,
          expenses: expenses.length,
          cashbook: cashbook.length,
          quotes: quotes.length,
          quoteItems: quoteItems.length,
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function clearTables(client) {
  await client.query("TRUNCATE TABLE quote_items, quotes, cashbook, expenses, movements, items, users RESTART IDENTITY CASCADE");
}

async function reseedSequences(client) {
  const tables = ["users", "items", "movements", "expenses", "cashbook", "quotes", "quote_items"];
  for (const table of tables) {
    await client.query(
      `
        SELECT setval(
          pg_get_serial_sequence($1, 'id'),
          COALESCE((SELECT MAX(id) FROM ${table}), 1),
          COALESCE((SELECT MAX(id) FROM ${table}), 0) > 0
        )
      `,
      [table]
    );
  }
}

function normalizeTimestamp(value) {
  if (!value) {
    return new Date().toISOString();
  }
  if (String(value).includes("T")) {
    return value;
  }
  return String(value).replace(" ", "T") + "Z";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
