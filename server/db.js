const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { DatabaseSync } = require("node:sqlite");

const isPostgres = Boolean(process.env.DATABASE_URL);

const configuredDataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "..", "data");
const configuredDbPath = process.env.SQLITE_PATH ? path.resolve(process.env.SQLITE_PATH) : path.join(configuredDataDir, "hamburg-depo.sqlite");
const dataDir = path.dirname(configuredDbPath);
const dbPath = isPostgres ? process.env.DATABASE_URL : configuredDbPath;

let sqliteDb = null;
let pgPool = null;

const sqliteSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'operator'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    min_stock REAL NOT NULL DEFAULT 0,
    barcode TEXT UNIQUE,
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('entry', 'exit')),
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    movement_date TEXT NOT NULL,
    note TEXT DEFAULT '',
    user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(item_id) REFERENCES items(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    expense_date TEXT NOT NULL,
    payment_type TEXT NOT NULL,
    note TEXT DEFAULT '',
    user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS cashbook (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('in', 'out')),
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    cash_date TEXT NOT NULL,
    reference TEXT DEFAULT '',
    note TEXT DEFAULT '',
    user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    title TEXT NOT NULL,
    quote_date TEXT NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS quote_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL,
    item_id INTEGER,
    item_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    unit_price REAL NOT NULL,
    total REAL NOT NULL,
    FOREIGN KEY(quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
    FOREIGN KEY(item_id) REFERENCES items(id)
  );
`;

const postgresSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'operator'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT DEFAULT '',
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    min_stock NUMERIC NOT NULL DEFAULT 0,
    barcode TEXT UNIQUE,
    notes TEXT DEFAULT '',
    default_price NUMERIC NOT NULL DEFAULT 0,
    sale_price NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS movements (
    id BIGSERIAL PRIMARY KEY,
    item_id BIGINT NOT NULL REFERENCES items(id),
    type TEXT NOT NULL CHECK(type IN ('entry', 'exit')),
    quantity NUMERIC NOT NULL,
    unit_price NUMERIC NOT NULL,
    movement_date DATE NOT NULL,
    note TEXT DEFAULT '',
    user_id BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    expense_date DATE NOT NULL,
    payment_type TEXT NOT NULL,
    note TEXT DEFAULT '',
    user_id BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS cashbook (
    id BIGSERIAL PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('in', 'out')),
    title TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    cash_date DATE NOT NULL,
    reference TEXT DEFAULT '',
    note TEXT DEFAULT '',
    user_id BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id BIGSERIAL PRIMARY KEY,
    customer_name TEXT NOT NULL,
    title TEXT NOT NULL,
    quote_date DATE NOT NULL,
    discount NUMERIC NOT NULL DEFAULT 0,
    subtotal NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    user_id BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    language TEXT NOT NULL DEFAULT 'de',
    quote_no TEXT DEFAULT '',
    vat_rate NUMERIC NOT NULL DEFAULT 0,
    vat_amount NUMERIC NOT NULL DEFAULT 0,
    net_total NUMERIC NOT NULL DEFAULT 0,
    gross_total NUMERIC NOT NULL DEFAULT 0,
    is_export BOOLEAN NOT NULL DEFAULT TRUE
  );

  CREATE TABLE IF NOT EXISTS quote_items (
    id BIGSERIAL PRIMARY KEY,
    quote_id BIGINT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    item_id BIGINT REFERENCES items(id),
    item_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    unit_price NUMERIC NOT NULL,
    total NUMERIC NOT NULL
  );
`;

async function initDatabase() {
  if (isPostgres) {
    const { Pool } = require("pg");
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
    });
    await pgPool.query(postgresSchema);
    await seedUsers({
      get: async (sql, params) => firstRow(await query(sql, params)),
      run: async (sql, params) => query(sql, params),
      exec: async (sql) => {
        await pgPool.query(sql);
      },
    });
    return;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec("PRAGMA journal_mode = WAL;");
  sqliteDb.exec(sqliteSchema);
  ensureItemColumnsSqlite();
  ensureQuoteColumnsSqlite();
  await seedUsers({
    get: async (sql, params) => sqlitePrepare(sql).get(...params),
    run: async (sql, params) => sqlitePrepare(sql).run(...params),
    exec: async (sql) => sqliteDb.exec(sql),
  });
}

async function query(sql, params = [], client = null) {
  if (!isPostgres) {
    return sqlitePrepare(sql).all(...params);
  }

  const executor = client || pgPool;
  const result = await executor.query(convertSql(sql), params);
  return result.rows;
}

async function get(sql, params = [], client = null) {
  const rows = await query(sql, params, client);
  return rows[0] || null;
}

async function execute(sql, params = [], client = null) {
  if (!isPostgres) {
    const result = sqlitePrepare(sql).run(...params);
    return {
      rowCount: Number(result.changes || 0),
      lastInsertId: Number(result.lastInsertRowid || 0),
      rows: [],
    };
  }

  const executor = client || pgPool;
  const result = await executor.query(convertSql(sql), params);
  return {
    rowCount: result.rowCount,
    lastInsertId: Number(result.rows?.[0]?.id || 0),
    rows: result.rows,
  };
}

async function withTransaction(callback) {
  if (!isPostgres) {
    sqliteDb.exec("BEGIN");
    const tx = sqliteTx();
    try {
      const result = await callback(tx);
      sqliteDb.exec("COMMIT");
      sqliteDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      return result;
    } catch (error) {
      sqliteDb.exec("ROLLBACK");
      throw error;
    }
  }

  const client = await pgPool.connect();
  const tx = pgTx(client);
  try {
    await client.query("BEGIN");
    const result = await callback(tx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function sqlitePrepare(sql) {
  return sqliteDb.prepare(sql);
}

function sqliteTx() {
  return {
    query: (sql, params = []) => query(sql, params),
    get: (sql, params = []) => get(sql, params),
    execute: (sql, params = []) => execute(sql, params),
  };
}

function pgTx(client) {
  return {
    query: (sql, params = []) => query(sql, params, client),
    get: (sql, params = []) => get(sql, params, client),
    execute: (sql, params = []) => execute(sql, params, client),
  };
}

function convertSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function firstRow(rows) {
  return rows[0] || null;
}

function ensureItemColumnsSqlite() {
  const columns = sqliteDb.prepare("PRAGMA table_info(items)").all().map((column) => column.name);
  if (!columns.includes("brand")) {
    sqliteDb.exec("ALTER TABLE items ADD COLUMN brand TEXT DEFAULT ''");
  }
  if (!columns.includes("default_price")) {
    sqliteDb.exec("ALTER TABLE items ADD COLUMN default_price REAL NOT NULL DEFAULT 0");
  }
  if (!columns.includes("sale_price")) {
    sqliteDb.exec("ALTER TABLE items ADD COLUMN sale_price REAL NOT NULL DEFAULT 0");
  }
}

function ensureQuoteColumnsSqlite() {
  const columns = sqliteDb.prepare("PRAGMA table_info(quotes)").all().map((column) => column.name);
  if (columns.length && !columns.includes("language")) {
    sqliteDb.exec("ALTER TABLE quotes ADD COLUMN language TEXT NOT NULL DEFAULT 'de'");
  }
  if (columns.length && !columns.includes("quote_no")) {
    sqliteDb.exec("ALTER TABLE quotes ADD COLUMN quote_no TEXT DEFAULT ''");
  }
  if (columns.length && !columns.includes("vat_rate")) {
    sqliteDb.exec("ALTER TABLE quotes ADD COLUMN vat_rate REAL NOT NULL DEFAULT 0");
  }
  if (columns.length && !columns.includes("vat_amount")) {
    sqliteDb.exec("ALTER TABLE quotes ADD COLUMN vat_amount REAL NOT NULL DEFAULT 0");
  }
  if (columns.length && !columns.includes("net_total")) {
    sqliteDb.exec("ALTER TABLE quotes ADD COLUMN net_total REAL NOT NULL DEFAULT 0");
  }
  if (columns.length && !columns.includes("gross_total")) {
    sqliteDb.exec("ALTER TABLE quotes ADD COLUMN gross_total REAL NOT NULL DEFAULT 0");
  }
  if (columns.length && !columns.includes("is_export")) {
    sqliteDb.exec("ALTER TABLE quotes ADD COLUMN is_export INTEGER NOT NULL DEFAULT 1");
  }
}

async function seedUsers(adapter) {
  const countRow = await adapter.get("SELECT COUNT(*) AS count FROM users", []);
  if (Number(countRow?.count || 0) > 0) {
    return;
  }

  await withOptionalTransaction(adapter, async (tx) => {
    await tx.run("INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)", [
      "Depo Admin",
      "admin",
      bcrypt.hashSync("admin123", 10),
      "admin",
    ]);
    await tx.run("INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)", [
      "Depo Operator",
      "operator",
      bcrypt.hashSync("operator123", 10),
      "operator",
    ]);
  });
}

async function withOptionalTransaction(adapter, callback) {
  if (adapter === undefined) {
    return callback({
      run: (sql, params) => execute(sql, params),
    });
  }

  if (!isPostgres) {
    sqliteDb.exec("BEGIN");
    try {
      await callback({
        run: (sql, params) => adapter.run(sql, params),
      });
      sqliteDb.exec("COMMIT");
    } catch (error) {
      sqliteDb.exec("ROLLBACK");
      throw error;
    }
    return;
  }

  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    await callback({
      run: (sql, params) => execute(sql, params, client),
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  dbPath,
  dbClient: isPostgres ? "postgres" : "sqlite",
  initDatabase,
  query,
  get,
  execute,
  withTransaction,
};
