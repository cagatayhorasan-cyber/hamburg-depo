#!/usr/bin/env node

const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const {
  ENV_PATH,
  LIVE_SNAPSHOT_SQLITE_PATH,
  TABLE_CLEAR_ORDER,
  TABLE_ORDER,
  buildJsonReportPath,
  closeAdapter,
  createPostgresAdapter,
  createSqliteAdapter,
  ensureDir,
  getDatabaseSummary,
  loadEnvFile,
  redactDatabaseUrl,
  toSqliteValue,
  writeJson,
} = require("./lib/database-tools");

loadEnvFile(ENV_PATH);

const liveDatabaseUrl = process.env.DATABASE_URL || "";
const livePgssl = process.env.PGSSL || "";

if (!liveDatabaseUrl) {
  throw new Error("DATABASE_URL tanimli degil. Canli Postgres snapshot alinamadi.");
}

delete process.env.DATABASE_URL;
process.env.PGSSL = "disable";
process.env.SQLITE_PATH = LIVE_SNAPSHOT_SQLITE_PATH;

const { initDatabase } = require("../server/db");

async function main() {
  ensureDir(require("path").dirname(LIVE_SNAPSHOT_SQLITE_PATH));
  await initDatabase();

  const postgres = createPostgresAdapter({
    connectionString: liveDatabaseUrl,
    sslMode: livePgssl,
  });

  const sqlite = new DatabaseSync(LIVE_SNAPSHOT_SQLITE_PATH);
  const copiedCounts = {};

  try {
    sqlite.exec("PRAGMA journal_mode = WAL;");
    sqlite.exec("BEGIN");

    for (const table of TABLE_CLEAR_ORDER) {
      sqlite.exec(`DELETE FROM ${table}`);
    }

    sqlite.exec("DELETE FROM sqlite_sequence");

    for (const table of TABLE_ORDER) {
      const rows = await postgres.query(`SELECT * FROM ${table} ORDER BY id ASC`);
      copiedCounts[table] = rows.length;

      if (!rows.length) {
        continue;
      }

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => "?").join(", ");
      const insertStatement = sqlite.prepare(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`
      );

      for (const row of rows) {
        insertStatement.run(...columns.map((column) => toSqliteValue(row[column])));
      }

      const maxIdRow = sqlite.prepare(`SELECT COALESCE(MAX(id), 0) AS max_id FROM ${table}`).get();
      sqlite
        .prepare("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)")
        .run(table, Number(maxIdRow?.max_id || 0));
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch (_rollbackError) {
      // ignore rollback failures after the primary error
    }
    throw error;
  } finally {
    if (typeof sqlite.close === "function") {
      sqlite.close();
    }
  }

  const snapshotAdapter = createSqliteAdapter(LIVE_SNAPSHOT_SQLITE_PATH, "live-postgres-snapshot");

  try {
    const snapshotSummary = await getDatabaseSummary(snapshotAdapter);
    const report = {
      generatedAt: new Date().toISOString(),
      sourceOfTruth: "live-postgres",
      sourceTarget: redactDatabaseUrl(liveDatabaseUrl),
      snapshotPath: LIVE_SNAPSHOT_SQLITE_PATH,
      copiedCounts,
      snapshotSummary,
    };

    const reportPath = buildJsonReportPath("live-postgres-snapshot");
    writeJson(reportPath, report);

    console.log(JSON.stringify({
      ok: true,
      sourceOfTruth: report.sourceOfTruth,
      sourceTarget: report.sourceTarget,
      snapshotPath: report.snapshotPath,
      reportPath,
      copiedCounts: report.copiedCounts,
      users: report.snapshotSummary.users.length,
      cashbookRows: report.snapshotSummary.cashbook.rowCount,
      activeItems: report.snapshotSummary.itemSummary.totalItems,
    }, null, 2));
  } finally {
    await closeAdapter(snapshotAdapter);
    await closeAdapter(postgres);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
