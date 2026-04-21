const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { DatabaseSync } = require("node:sqlite");

const isPostgres = Boolean(process.env.DATABASE_URL);

const configuredDataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "..", "data");
const configuredDbPath = process.env.SQLITE_PATH ? path.resolve(process.env.SQLITE_PATH) : path.join(configuredDataDir, "hamburg-depo.sqlite");
const dataDir = path.dirname(configuredDbPath);
const dbPath = isPostgres ? process.env.DATABASE_URL : configuredDbPath;

const DEFAULT_USERS = [];

let sqliteDb = null;
let pgPool = null;
let postgresInitPromise = null;
let pgSchemaClient = null;
const POSTGRES_SCHEMA_LOCK_KEY = 41290413;

const sqliteSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    phone TEXT,
    email_verified INTEGER NOT NULL DEFAULT 1,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'operator', 'staff', 'customer'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    min_stock REAL NOT NULL DEFAULT 0,
    product_code TEXT DEFAULT '',
    barcode TEXT UNIQUE,
    notes TEXT DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    list_price REAL NOT NULL DEFAULT 0,
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
    reversal_of INTEGER,
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

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_user_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    order_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    item_id INTEGER,
    item_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY(item_id) REFERENCES items(id)
  );

  CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_type TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS agent_training (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT DEFAULT '',
    audience TEXT NOT NULL DEFAULT 'all',
    keywords TEXT DEFAULT '',
    tr_question TEXT NOT NULL,
    tr_answer TEXT NOT NULL,
    de_question TEXT DEFAULT '',
    de_answer TEXT DEFAULT '',
    suggestions TEXT DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by_user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS assistant_troubleshooting_bank (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_key TEXT NOT NULL UNIQUE,
    context_id TEXT NOT NULL DEFAULT '',
    family_id TEXT NOT NULL DEFAULT '',
    source_summary TEXT DEFAULT '',
    keywords TEXT DEFAULT '[]',
    tr_subject TEXT NOT NULL,
    de_subject TEXT DEFAULT '',
    tr_questions TEXT DEFAULT '[]',
    de_questions TEXT DEFAULT '[]',
    tr_answer TEXT NOT NULL,
    de_answer TEXT DEFAULT '',
    suggestions TEXT DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS security_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_role TEXT DEFAULT '',
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    ip_address TEXT DEFAULT '',
    identifier TEXT DEFAULT '',
    request_path TEXT DEFAULT '',
    request_method TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    details TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS security_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    event_type TEXT DEFAULT '',
    event_count INTEGER NOT NULL DEFAULT 0,
    block_until TEXT NOT NULL,
    released_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_user_id INTEGER NOT NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'request',
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL,
    customer_user_id INTEGER,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    project_type TEXT NOT NULL DEFAULT 'custom',
    parameters TEXT DEFAULT '{}',
    calculation_result TEXT DEFAULT '{}',
    note TEXT DEFAULT '',
    quote_id INTEGER,
    order_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_user_id) REFERENCES users(id),
    FOREIGN KEY(customer_user_id) REFERENCES users(id),
    FOREIGN KEY(quote_id) REFERENCES quotes(id),
    FOREIGN KEY(order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS project_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    item_id INTEGER,
    item_name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT DEFAULT 'adet',
    unit_price REAL NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    source TEXT DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(item_id) REFERENCES items(id)
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_type TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    mime TEXT DEFAULT 'application/octet-stream',
    uploaded_by_user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(uploaded_by_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS pricelist_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT NOT NULL,
    document_id INTEGER,
    status TEXT NOT NULL DEFAULT 'parsed',
    parsed_rows TEXT DEFAULT '[]',
    applied_rows INTEGER DEFAULT 0,
    total_rows INTEGER DEFAULT 0,
    created_by_user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_at TEXT DEFAULT NULL,
    FOREIGN KEY(document_id) REFERENCES documents(id),
    FOREIGN KEY(created_by_user_id) REFERENCES users(id)
  );
`;

const postgresSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    phone TEXT,
    email_verified BOOLEAN NOT NULL DEFAULT TRUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'operator', 'staff', 'customer'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT DEFAULT '',
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    min_stock NUMERIC NOT NULL DEFAULT 0,
    product_code TEXT DEFAULT '',
    barcode TEXT UNIQUE,
    notes TEXT DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    default_price NUMERIC NOT NULL DEFAULT 0,
    list_price NUMERIC NOT NULL DEFAULT 0,
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
    reversal_of BIGINT,
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

  CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    customer_user_id BIGINT NOT NULL REFERENCES users(id),
    customer_name TEXT NOT NULL,
    order_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_id BIGINT REFERENCES items(id),
    item_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    unit TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_type TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS agent_training (
    id BIGSERIAL PRIMARY KEY,
    topic TEXT DEFAULT '',
    audience TEXT NOT NULL DEFAULT 'all',
    keywords TEXT DEFAULT '',
    tr_question TEXT NOT NULL,
    tr_answer TEXT NOT NULL,
    de_question TEXT DEFAULT '',
    de_answer TEXT DEFAULT '',
    suggestions TEXT DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS assistant_troubleshooting_bank (
    id BIGSERIAL PRIMARY KEY,
    bank_key TEXT NOT NULL UNIQUE,
    context_id TEXT NOT NULL DEFAULT '',
    family_id TEXT NOT NULL DEFAULT '',
    source_summary TEXT DEFAULT '',
    keywords TEXT DEFAULT '[]',
    tr_subject TEXT NOT NULL,
    de_subject TEXT DEFAULT '',
    tr_questions TEXT DEFAULT '[]',
    de_questions TEXT DEFAULT '[]',
    tr_answer TEXT NOT NULL,
    de_answer TEXT DEFAULT '',
    suggestions TEXT DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS security_events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    user_role TEXT DEFAULT '',
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    ip_address TEXT DEFAULT '',
    identifier TEXT DEFAULT '',
    request_path TEXT DEFAULT '',
    request_method TEXT DEFAULT '',
    user_agent TEXT DEFAULT '',
    details TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS security_blocks (
    id BIGSERIAL PRIMARY KEY,
    ip_address TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    event_type TEXT DEFAULT '',
    event_count INTEGER NOT NULL DEFAULT 0,
    block_until TIMESTAMPTZ NOT NULL,
    released_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS admin_messages (
    id BIGSERIAL PRIMARY KEY,
    sender_user_id BIGINT NOT NULL REFERENCES users(id),
    sender_name TEXT NOT NULL,
    sender_role TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'request',
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS projects (
    id BIGSERIAL PRIMARY KEY,
    owner_user_id BIGINT NOT NULL REFERENCES users(id),
    customer_user_id BIGINT REFERENCES users(id),
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    project_type TEXT NOT NULL DEFAULT 'custom',
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculation_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    note TEXT DEFAULT '',
    quote_id BIGINT REFERENCES quotes(id),
    order_id BIGINT REFERENCES orders(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS project_items (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    item_id BIGINT REFERENCES items(id),
    item_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit TEXT DEFAULT 'adet',
    unit_price NUMERIC NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    source TEXT DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS documents (
    id BIGSERIAL PRIMARY KEY,
    owner_type TEXT NOT NULL,
    owner_id BIGINT NOT NULL,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    size_bytes BIGINT DEFAULT 0,
    mime TEXT DEFAULT 'application/octet-stream',
    uploaded_by_user_id BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS pricelist_imports (
    id BIGSERIAL PRIMARY KEY,
    supplier_name TEXT NOT NULL,
    document_id BIGINT REFERENCES documents(id),
    status TEXT NOT NULL DEFAULT 'parsed',
    parsed_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
    applied_rows INTEGER DEFAULT 0,
    total_rows INTEGER DEFAULT 0,
    created_by_user_id BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_at TIMESTAMPTZ NULL
  );
`;

async function initDatabase() {
  if (isPostgres) {
    if (!pgPool) {
      const { Pool } = require("pg");
      // Vercel serverless + Supabase pgbouncer uyumlu pool ayarları:
      // - max: her serverless instance için 3 bağlantı yeterli (pgbouncer tx mode
      //   zaten server-side multiplexing yapıyor, çok fazla client connection açmak
      //   pgbouncer'ı tüketir ve "too many clients" hatasına yol açar).
      // - idleTimeoutMillis: 10 saniye idle sonrası bağlantı kapansın → soğuk
      //   fonksiyonlarda dangling connection kalmasın.
      // - connectionTimeoutMillis: 8 saniyeye kadar bağlantı bekle → pgbouncer
      //   doluysa kullanıcıya hızlı hata dön, 30 saniye asılıp Vercel timeout'a
      //   girmektense.
      const poolMax = Number(process.env.PG_POOL_MAX || (process.env.VERCEL ? 3 : 10));
      pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
        max: poolMax,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 8_000,
        keepAlive: true,
      });
      pgPool.on("error", (err) => {
        console.warn("[pg-pool] idle client error:", err.message);
      });
    }

    if (!postgresInitPromise) {
      postgresInitPromise = (async () => {
        const client = await pgPool.connect();
        let lockAcquired = false;
        try {
          const lockResult = await client.query("SELECT pg_try_advisory_lock($1) AS acquired", [POSTGRES_SCHEMA_LOCK_KEY]);
          lockAcquired = Boolean(lockResult.rows[0]?.acquired);
          if (!lockAcquired && await hasPostgresRuntimeSchema()) {
            return;
          }
          if (!lockAcquired) {
            await client.query("SELECT pg_advisory_lock($1)", [POSTGRES_SCHEMA_LOCK_KEY]);
            lockAcquired = true;
          }

          pgSchemaClient = client;
          await runPostgresSchemaInit();
        } finally {
          pgSchemaClient = null;
          if (lockAcquired) {
            await client.query("SELECT pg_advisory_unlock($1)", [POSTGRES_SCHEMA_LOCK_KEY]).catch(() => {});
          }
          client.release();
        }
      })().catch((error) => {
        postgresInitPromise = null;
        throw error;
      });
    }

    await postgresInitPromise;
    return;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec("PRAGMA journal_mode = WAL;");
  sqliteDb.exec(sqliteSchema);
  ensureUserColumnsSqlite();
  ensureUserRoleConstraintSqlite();
  ensureUserColumnsSqlite();
  ensureItemColumnsSqlite();
  ensureItemIndexesSqlite();
  ensureMovementColumnsSqlite();
  ensureMovementIndexesSqlite();
  ensureQuoteColumnsSqlite();
  ensureAgentTrainingIndexesSqlite();
  ensureTroubleshootingBankIndexesSqlite();
  ensureSecurityIndexesSqlite();
  ensureAdminMessageIndexesSqlite();
  await seedUsers({
    get: async (sql, params) => sqlitePrepare(sql).get(...params),
    run: async (sql, params) => sqlitePrepare(sql).run(...params),
    exec: async (sql) => sqliteDb.exec(sql),
  });
}

function postgresSchemaQuery(sql, params = []) {
  return (pgSchemaClient || pgPool).query(sql, params);
}

async function hasPostgresRuntimeSchema() {
  const result = await pgPool.query(`
    SELECT
      to_regclass('public.users') IS NOT NULL AS has_users,
      to_regclass('public.items') IS NOT NULL AS has_items,
      to_regclass('public.assistant_troubleshooting_bank') IS NOT NULL AS has_troubleshooting_bank
  `);
  const row = result.rows[0] || {};
  return Boolean(row.has_users && row.has_items && row.has_troubleshooting_bank);
}

async function runPostgresSchemaInit() {
  await postgresSchemaQuery(postgresSchema);
  await ensureUserRoleConstraintPostgres();
  await ensureUserColumnsPostgres();
  await ensureItemColumnsPostgres();
  await ensureItemIndexesPostgres();
  await ensureMovementColumnsPostgres();
  await ensureMovementIndexesPostgres();
  await ensureAgentTrainingIndexesPostgres();
  await ensureTroubleshootingBankIndexesPostgres();
  await ensureSecurityIndexesPostgres();
  await ensureAdminMessageIndexesPostgres();
  await ensureQuoteColumnsPostgres();
  await ensureProjectIndexesPostgres();
  await seedUsers({
    get: async (sql, params) => firstRow(await query(sql, params, pgSchemaClient)),
    run: async (sql, params) => execute(sql, params, pgSchemaClient),
    exec: async (sql) => {
      await postgresSchemaQuery(sql);
    },
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
  if (!columns.includes("product_code")) {
    sqliteDb.exec("ALTER TABLE items ADD COLUMN product_code TEXT DEFAULT ''");
  }
  if (!columns.includes("default_price")) {
    sqliteDb.exec("ALTER TABLE items ADD COLUMN default_price REAL NOT NULL DEFAULT 0");
  }
  if (!columns.includes("list_price")) {
    sqliteDb.exec("ALTER TABLE items ADD COLUMN list_price REAL NOT NULL DEFAULT 0");
  }
  if (!columns.includes("sale_price")) {
    sqliteDb.exec("ALTER TABLE items ADD COLUMN sale_price REAL NOT NULL DEFAULT 0");
  }
  if (!columns.includes("is_active")) {
    sqliteDb.exec("ALTER TABLE items ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");
  }
}

function ensureUserColumnsSqlite() {
  const columns = sqliteDb.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!columns.includes("email")) {
    sqliteDb.exec("ALTER TABLE users ADD COLUMN email TEXT");
  }
  if (!columns.includes("phone")) {
    sqliteDb.exec("ALTER TABLE users ADD COLUMN phone TEXT");
  }
  if (!columns.includes("email_verified")) {
    sqliteDb.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1");
  }
  sqliteDb.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users(LOWER(email))
    WHERE email IS NOT NULL AND TRIM(email) <> ''
  `);
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_auth_tokens_lookup ON auth_tokens(token_type, token_hash)");
}

function ensureUserRoleConstraintSqlite() {
  const table = sqliteDb.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  const createSql = String(table?.sql || "");
  if (createSql.includes("'staff'") && createSql.includes("'customer'")) {
    return;
  }

  sqliteDb.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      phone TEXT,
      email_verified INTEGER NOT NULL DEFAULT 1,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'operator', 'staff', 'customer'))
    );
    INSERT INTO users_new (id, name, username, email, phone, email_verified, password_hash, role)
    SELECT
      id,
      name,
      username,
      email,
      phone,
      COALESCE(email_verified, 1),
      password_hash,
      CASE
        WHEN role IN ('admin', 'operator', 'staff', 'customer') THEN role
        ELSE 'operator'
      END
    FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function ensureItemIndexesSqlite() {
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_items_product_code ON items(product_code COLLATE NOCASE)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_items_name ON items(name COLLATE NOCASE)");
}

function ensureMovementColumnsSqlite() {
  const columns = sqliteDb.prepare("PRAGMA table_info(movements)").all().map((column) => column.name);
  if (columns.length && !columns.includes("reversal_of")) {
    sqliteDb.exec("ALTER TABLE movements ADD COLUMN reversal_of INTEGER");
  }
}

function ensureMovementIndexesSqlite() {
  sqliteDb.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_movements_reversal_of ON movements(reversal_of)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_movements_item_id ON movements(item_id)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_movements_item_type_date ON movements(item_id, type, movement_date DESC, id DESC)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_movements_created ON movements(created_at DESC, id DESC)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at DESC, id DESC)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders(customer_user_id, created_at DESC, id DESC)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_cashbook_created ON cashbook(created_at DESC, id DESC)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at DESC, id DESC)");
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
  if (columns.length && !columns.includes("customer_user_id")) {
    sqliteDb.exec("ALTER TABLE quotes ADD COLUMN customer_user_id INTEGER");
  }

  const orderColumns = sqliteDb.prepare("PRAGMA table_info(orders)").all().map((column) => column.name);
  if (orderColumns.length && !orderColumns.includes("quote_id")) {
    sqliteDb.exec("ALTER TABLE orders ADD COLUMN quote_id INTEGER");
  }
}

async function ensureQuoteColumnsPostgres() {
  const columns = await postgresSchemaQuery(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes'
  `);
  const names = new Set(columns.rows.map((row) => row.column_name));
  if (!names.has("customer_user_id")) {
    await postgresSchemaQuery("ALTER TABLE quotes ADD COLUMN customer_user_id BIGINT REFERENCES users(id)");
  }
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_quotes_customer_user ON quotes (customer_user_id)");

  const orderColumns = await postgresSchemaQuery(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
  `);
  const orderNames = new Set(orderColumns.rows.map((row) => row.column_name));
  if (!orderNames.has("quote_id")) {
    await postgresSchemaQuery("ALTER TABLE orders ADD COLUMN quote_id BIGINT REFERENCES quotes(id) ON DELETE SET NULL");
  }
  if (!orderNames.has("payment_type")) {
    await postgresSchemaQuery("ALTER TABLE orders ADD COLUMN payment_type TEXT DEFAULT 'open_account'");
  }
  if (!orderNames.has("payment_status")) {
    await postgresSchemaQuery("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'unpaid'");
  }
  if (!orderNames.has("paid_amount")) {
    await postgresSchemaQuery("ALTER TABLE orders ADD COLUMN paid_amount NUMERIC DEFAULT 0");
  }
  if (!orderNames.has("stock_deducted_at")) {
    await postgresSchemaQuery("ALTER TABLE orders ADD COLUMN stock_deducted_at TIMESTAMPTZ");
  }
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_orders_quote_id ON orders (quote_id)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status)");

  const orderItemColumns = await postgresSchemaQuery(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items'
  `);
  const orderItemNames = new Set(orderItemColumns.rows.map((row) => row.column_name));
  if (!orderItemNames.has("unit_price")) {
    await postgresSchemaQuery("ALTER TABLE order_items ADD COLUMN unit_price NUMERIC DEFAULT 0");
  }
}

async function ensureProjectIndexesPostgres() {
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_projects_owner_created ON projects (owner_user_id, created_at DESC, id DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_projects_customer_created ON projects (customer_user_id, created_at DESC, id DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status, updated_at DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_project_items_project ON project_items (project_id)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents (owner_type, owner_id, created_at DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_pricelist_imports_status ON pricelist_imports (status, created_at DESC)");
}

function ensureAgentTrainingIndexesSqlite() {
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_agent_training_active_created ON agent_training(is_active, created_at DESC)");
}

function ensureTroubleshootingBankIndexesSqlite() {
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_troubleshooting_bank_active_updated ON assistant_troubleshooting_bank(is_active, updated_at DESC)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_troubleshooting_bank_context ON assistant_troubleshooting_bank(context_id)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_troubleshooting_bank_family ON assistant_troubleshooting_bank(family_id)");
}

function ensureSecurityIndexesSqlite() {
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at DESC, id DESC)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_security_events_ip_created ON security_events(ip_address, created_at DESC, id DESC)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_security_events_user_created ON security_events(user_id, created_at DESC, id DESC)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_security_events_type_created ON security_events(event_type, created_at DESC, id DESC)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_security_blocks_until ON security_blocks(block_until)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_security_blocks_released ON security_blocks(released_at)");
}

function ensureAdminMessageIndexesSqlite() {
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_admin_messages_sender_created ON admin_messages(sender_user_id, created_at DESC, id DESC)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_admin_messages_status_created ON admin_messages(status, created_at DESC, id DESC)");
}

async function seedUsers(adapter) {
  await withOptionalTransaction(adapter, async (tx) => {
    for (const user of DEFAULT_USERS) {
      const existing = await adapter.get("SELECT id FROM users WHERE username = ?", [user.username]);
      if (existing) {
        continue;
      }

      try {
        await tx.run("INSERT INTO users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)", [
          user.name,
          user.username,
          user.email || null,
          bcrypt.hashSync(user.password, 10),
          user.role,
        ]);
      } catch (error) {
        if (!isPostgres && /CHECK constraint failed/i.test(String(error.message || ""))) {
          continue;
        }
        throw error;
      }
    }
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

async function ensureItemColumnsPostgres() {
  const columns = await postgresSchemaQuery(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'items'
  `);
  const names = new Set(columns.rows.map((row) => row.column_name));
  if (!names.has("brand")) {
    await postgresSchemaQuery("ALTER TABLE items ADD COLUMN brand TEXT DEFAULT ''");
  }
  if (!names.has("product_code")) {
    await postgresSchemaQuery("ALTER TABLE items ADD COLUMN product_code TEXT DEFAULT ''");
  }
  if (!names.has("default_price")) {
    await postgresSchemaQuery("ALTER TABLE items ADD COLUMN default_price NUMERIC NOT NULL DEFAULT 0");
  }
  if (!names.has("list_price")) {
    await postgresSchemaQuery("ALTER TABLE items ADD COLUMN list_price NUMERIC NOT NULL DEFAULT 0");
  }
  if (!names.has("sale_price")) {
    await postgresSchemaQuery("ALTER TABLE items ADD COLUMN sale_price NUMERIC NOT NULL DEFAULT 0");
  }
  if (!names.has("is_active")) {
    await postgresSchemaQuery("ALTER TABLE items ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE");
  }
}

async function ensureItemIndexesPostgres() {
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_items_product_code ON items (LOWER(product_code))");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_items_name ON items (LOWER(name))");
}

async function ensureMovementColumnsPostgres() {
  const columns = await postgresSchemaQuery(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'movements'
  `);
  const names = new Set(columns.rows.map((row) => row.column_name));
  if (!names.has("reversal_of")) {
    await postgresSchemaQuery("ALTER TABLE movements ADD COLUMN reversal_of BIGINT");
  }
}

async function ensureMovementIndexesPostgres() {
  await postgresSchemaQuery("CREATE UNIQUE INDEX IF NOT EXISTS idx_movements_reversal_of ON movements (reversal_of)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_movements_item_id ON movements (item_id)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_movements_item_type_date ON movements (item_id, type, movement_date DESC, id DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_movements_created ON movements (created_at DESC, id DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items (quote_id)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes (created_at DESC, id DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders (customer_user_id, created_at DESC, id DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_cashbook_created ON cashbook (created_at DESC, id DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses (created_at DESC, id DESC)");
}

async function ensureAgentTrainingIndexesPostgres() {
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_agent_training_active_created ON agent_training (is_active, created_at DESC)");
}

async function ensureTroubleshootingBankIndexesPostgres() {
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_troubleshooting_bank_active_updated ON assistant_troubleshooting_bank (is_active, updated_at DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_troubleshooting_bank_context ON assistant_troubleshooting_bank (context_id)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_troubleshooting_bank_family ON assistant_troubleshooting_bank (family_id)");
}

async function ensureSecurityIndexesPostgres() {
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events (created_at DESC, id DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_security_events_ip_created ON security_events (ip_address, created_at DESC, id DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_security_events_user_created ON security_events (user_id, created_at DESC, id DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_security_events_type_created ON security_events (event_type, created_at DESC, id DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_security_blocks_until ON security_blocks (block_until)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_security_blocks_released ON security_blocks (released_at)");
}

async function ensureAdminMessageIndexesPostgres() {
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_admin_messages_sender_created ON admin_messages (sender_user_id, created_at DESC, id DESC)");
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_admin_messages_status_created ON admin_messages (status, created_at DESC, id DESC)");
}

async function ensureUserColumnsPostgres() {
  const columns = await postgresSchemaQuery(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
  `);
  const names = new Set(columns.rows.map((row) => row.column_name));
  if (!names.has("email")) {
    await postgresSchemaQuery("ALTER TABLE users ADD COLUMN email TEXT");
  }
  if (!names.has("phone")) {
    await postgresSchemaQuery("ALTER TABLE users ADD COLUMN phone TEXT");
  }
  if (!names.has("email_verified")) {
    await postgresSchemaQuery("ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT TRUE");
  }
  await postgresSchemaQuery(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users (LOWER(email))
    WHERE email IS NOT NULL AND BTRIM(email) <> ''
  `);
  await postgresSchemaQuery("CREATE INDEX IF NOT EXISTS idx_auth_tokens_lookup ON auth_tokens (token_type, token_hash)");
}

async function ensureUserRoleConstraintPostgres() {
  await postgresSchemaQuery("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
  await postgresSchemaQuery(`
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'operator', 'staff', 'customer'))
  `);
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
