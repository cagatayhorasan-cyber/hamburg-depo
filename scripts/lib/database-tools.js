const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { Pool } = require("pg");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const REPORTS_DIR = path.join(DATA_DIR, "reports");
const ENV_PATH = path.join(PROJECT_ROOT, ".env");
const LOCAL_SQLITE_PATH = path.join(DATA_DIR, "hamburg-depo.sqlite");
const LIVE_SNAPSHOT_SQLITE_PATH = path.join(DATA_DIR, "hamburg-depo.live-postgres.sqlite");
const SALE_PRICE_MULTIPLIER = 1.22;

const TABLE_ORDER = [
  "users",
  "items",
  "movements",
  "expenses",
  "cashbook",
  "quotes",
  "quote_items",
  "orders",
  "order_items",
  "auth_tokens",
  "agent_training",
  "assistant_troubleshooting_bank",
  "security_events",
  "security_blocks",
  "admin_messages",
];

const TABLE_CLEAR_ORDER = [...TABLE_ORDER].reverse();

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
  return targetPath;
}

function stripWrappingQuotes(value) {
  const text = String(value || "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function loadEnvFile(filePath = ENV_PATH) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1));
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function todayStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildJsonReportPath(prefix, stamp = todayStamp()) {
  ensureDir(REPORTS_DIR);
  return path.join(REPORTS_DIR, `${prefix}-${stamp}.json`);
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function redactDatabaseUrl(connectionString) {
  if (!connectionString) {
    return "";
  }

  try {
    const parsed = new URL(connectionString);
    const databaseName = parsed.pathname.replace(/^\//, "") || "postgres";
    return `${parsed.protocol}//***:***@${parsed.host}/${databaseName}`;
  } catch (_error) {
    return "postgres://***:***@***";
  }
}

function toSqliteValue(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

function convertSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function createPostgresAdapter({ connectionString, sslMode }) {
  if (!connectionString) {
    return null;
  }

  const pool = new Pool({
    connectionString,
    ssl: sslMode === "disable" ? false : { rejectUnauthorized: false },
  });

  return {
    kind: "postgres",
    label: "live-postgres",
    target: redactDatabaseUrl(connectionString),
    async query(sql, params = []) {
      const result = await pool.query(convertSql(sql), params);
      return result.rows;
    },
    async get(sql, params = []) {
      const rows = await this.query(sql, params);
      return rows[0] || null;
    },
    async close() {
      await pool.end();
    },
  };
}

function createSqliteAdapter(filePath, label) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const db = new DatabaseSync(filePath);
  return {
    kind: "sqlite",
    label,
    target: filePath,
    async query(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async get(sql, params = []) {
      return db.prepare(sql).get(...params) || null;
    },
    async close() {
      if (typeof db.close === "function") {
        db.close();
      }
    },
  };
}

async function getTableCounts(adapter) {
  const counts = {};
  for (const table of TABLE_ORDER) {
    const row = await adapter.get(`SELECT COUNT(*) AS count FROM ${table}`);
    counts[table] = Number(row?.count || 0);
  }
  return counts;
}

async function getActiveUsers(adapter) {
  const rows = await adapter.query(`
    SELECT
      id,
      name,
      username,
      role
    FROM users
    ORDER BY
      CASE role
        WHEN 'admin' THEN 1
        WHEN 'operator' THEN 2
        WHEN 'staff' THEN 3
        WHEN 'customer' THEN 4
        ELSE 9
      END,
      username ASC
  `);

  return rows.map((row) => ({
    id: Number(row.id || 0),
    name: String(row.name || ""),
    username: String(row.username || ""),
    role: String(row.role || ""),
  }));
}

async function getCashbookSummary(adapter) {
  const row = await adapter.get(`
    SELECT
      COUNT(*) AS row_count,
      COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0) AS total_out,
      COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE -amount END), 0) AS net_balance
    FROM cashbook
  `);

  return {
    rowCount: Number(row?.row_count || 0),
    totalIn: Number(row?.total_in || 0),
    totalOut: Number(row?.total_out || 0),
    netBalance: Number(row?.net_balance || 0),
  };
}

async function getExpenseSummary(adapter) {
  const row = await adapter.get("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses");
  return {
    total: Number(row?.total || 0),
  };
}

async function getItemSummary(adapter) {
  const activeValue = adapter.kind === "postgres" ? true : 1;
  const row = await adapter.get(
    `
      WITH movement_summary AS (
        SELECT
          item_id,
          SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END) AS current_stock,
          SUM(CASE WHEN type = 'entry' THEN quantity * unit_price ELSE 0 END) / NULLIF(SUM(CASE WHEN type = 'entry' THEN quantity ELSE 0 END), 0) AS average_purchase_price
        FROM movements
        GROUP BY item_id
      ),
      last_entry AS (
        SELECT item_id, unit_price
        FROM (
          SELECT
            item_id,
            unit_price,
            ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY movement_date DESC, id DESC) AS row_number
          FROM movements
          WHERE type = 'entry'
        ) ranked_entries
        WHERE row_number = 1
      )
      SELECT
        COUNT(items.id) AS total_items,
        COALESCE(SUM(CASE WHEN COALESCE(movement_summary.current_stock, 0) > 0 THEN 1 ELSE 0 END), 0) AS in_stock_items,
        COALESCE(SUM(CASE WHEN COALESCE(movement_summary.current_stock, 0) = 0 THEN 1 ELSE 0 END), 0) AS zero_stock_items,
        COALESCE(SUM(CASE WHEN COALESCE(movement_summary.current_stock, 0) < 0 THEN 1 ELSE 0 END), 0) AS negative_stock_items,
        COALESCE(SUM(COALESCE(movement_summary.current_stock, 0) * COALESCE(NULLIF(last_entry.unit_price, 0), items.default_price, 0)), 0) AS stock_cost_value,
        COALESCE(
          SUM(
            COALESCE(movement_summary.current_stock, 0) * COALESCE(
              NULLIF(items.sale_price, 0),
              NULLIF(items.list_price, 0),
              ROUND(COALESCE(NULLIF(last_entry.unit_price, 0), movement_summary.average_purchase_price, items.default_price, 0) * ?, 2),
              0
            )
          ),
          0
        ) AS stock_sale_value,
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(items.min_stock, 0) > 0
                AND COALESCE(movement_summary.current_stock, 0) <= COALESCE(items.min_stock, 0)
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS critical_count
      FROM items
      LEFT JOIN movement_summary ON movement_summary.item_id = items.id
      LEFT JOIN last_entry ON last_entry.item_id = items.id
      WHERE COALESCE(items.is_active, ?) = ?
    `,
    [SALE_PRICE_MULTIPLIER, activeValue, activeValue]
  );

  return {
    totalItems: Number(row?.total_items || 0),
    inStockItems: Number(row?.in_stock_items || 0),
    zeroStockItems: Number(row?.zero_stock_items || 0),
    negativeStockItems: Number(row?.negative_stock_items || 0),
    stockCostValue: Number(row?.stock_cost_value || 0),
    stockSaleValue: Number(row?.stock_sale_value || 0),
    criticalCount: Number(row?.critical_count || 0),
  };
}

async function getDatabaseSummary(adapter) {
  const [tableCounts, users, itemSummary, cashbook, expenses] = await Promise.all([
    getTableCounts(adapter),
    getActiveUsers(adapter),
    getItemSummary(adapter),
    getCashbookSummary(adapter),
    getExpenseSummary(adapter),
  ]);

  return {
    source: adapter.label,
    kind: adapter.kind,
    target: adapter.target,
    tableCounts,
    users,
    itemSummary,
    cashbook,
    expenses,
  };
}

async function closeAdapter(adapter) {
  if (adapter && typeof adapter.close === "function") {
    await adapter.close();
  }
}

module.exports = {
  PROJECT_ROOT,
  DATA_DIR,
  REPORTS_DIR,
  ENV_PATH,
  LOCAL_SQLITE_PATH,
  LIVE_SNAPSHOT_SQLITE_PATH,
  TABLE_ORDER,
  TABLE_CLEAR_ORDER,
  buildJsonReportPath,
  closeAdapter,
  createPostgresAdapter,
  createSqliteAdapter,
  ensureDir,
  getDatabaseSummary,
  loadEnvFile,
  redactDatabaseUrl,
  todayStamp,
  toSqliteValue,
  writeJson,
};
