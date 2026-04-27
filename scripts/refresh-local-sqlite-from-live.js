#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { DatabaseSync } = require("node:sqlite");
const {
  DATA_DIR,
  ENV_PATH,
  LIVE_SNAPSHOT_SQLITE_PATH,
  LOCAL_SQLITE_PATH,
  buildJsonReportPath,
  ensureDir,
  loadEnvFile,
  todayStamp,
  writeJson,
} = require("./lib/database-tools");

loadEnvFile(ENV_PATH);

const BACKUP_DIR = path.join(DATA_DIR, "backups");

function timestampForFile(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function checkpointSqlite(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const db = new DatabaseSync(filePath);
  try {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    if (typeof db.close === "function") {
      db.close();
    }
  }
}

function cleanupSidecars(filePath) {
  for (const suffix of ["-wal", "-shm"]) {
    fs.rmSync(`${filePath}${suffix}`, { force: true });
  }
}

function refreshSnapshotFromLive() {
  const result = spawnSync(process.execPath, [path.join(__dirname, "sync-live-postgres-to-sqlite.js")], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error("Canli veriden snapshot olusturma basarisiz oldu.");
  }
}

async function main() {
  ensureDir(BACKUP_DIR);
  ensureDir(path.dirname(LOCAL_SQLITE_PATH));

  refreshSnapshotFromLive();

  if (!fs.existsSync(LIVE_SNAPSHOT_SQLITE_PATH)) {
    throw new Error("Canli snapshot dosyasi bulunamadi.");
  }

  checkpointSqlite(LIVE_SNAPSHOT_SQLITE_PATH);
  cleanupSidecars(LIVE_SNAPSHOT_SQLITE_PATH);

  let backupPath = "";
  if (fs.existsSync(LOCAL_SQLITE_PATH)) {
    checkpointSqlite(LOCAL_SQLITE_PATH);
    cleanupSidecars(LOCAL_SQLITE_PATH);

    backupPath = path.join(
      BACKUP_DIR,
      `hamburg-depo.local-before-live-refresh-${timestampForFile()}.sqlite`
    );
    fs.copyFileSync(LOCAL_SQLITE_PATH, backupPath);
  }

  cleanupSidecars(LOCAL_SQLITE_PATH);
  fs.copyFileSync(LIVE_SNAPSHOT_SQLITE_PATH, LOCAL_SQLITE_PATH);
  checkpointSqlite(LOCAL_SQLITE_PATH);
  cleanupSidecars(LOCAL_SQLITE_PATH);

  const report = {
    generatedAt: new Date().toISOString(),
    sourceOfTruth: "live-postgres",
    snapshotPath: LIVE_SNAPSHOT_SQLITE_PATH,
    localSqlitePath: LOCAL_SQLITE_PATH,
    backupPath,
  };

  const reportPath = buildJsonReportPath("local-refresh-from-live", todayStamp());
  writeJson(reportPath, report);

  console.log(JSON.stringify({
    ok: true,
    localSqlitePath: LOCAL_SQLITE_PATH,
    backupPath,
    snapshotPath: LIVE_SNAPSHOT_SQLITE_PATH,
    reportPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
