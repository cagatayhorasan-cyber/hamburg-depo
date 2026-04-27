#!/usr/bin/env node

const fs = require("fs");
const {
  ENV_PATH,
  LIVE_SNAPSHOT_SQLITE_PATH,
  LOCAL_SQLITE_PATH,
  TABLE_ORDER,
  buildJsonReportPath,
  closeAdapter,
  createPostgresAdapter,
  createSqliteAdapter,
  getDatabaseSummary,
  loadEnvFile,
  redactDatabaseUrl,
  writeJson,
} = require("./lib/database-tools");

loadEnvFile(ENV_PATH);

function compareUserSets(primaryUsers = [], secondaryUsers = []) {
  const primaryMap = new Map(primaryUsers.map((user) => [user.username, user.role]));
  const secondaryMap = new Map(secondaryUsers.map((user) => [user.username, user.role]));

  const missingFromSecondary = primaryUsers
    .filter((user) => !secondaryMap.has(user.username))
    .map((user) => `${user.username}:${user.role}`);

  const extraInSecondary = secondaryUsers
    .filter((user) => !primaryMap.has(user.username))
    .map((user) => `${user.username}:${user.role}`);

  const roleMismatches = primaryUsers
    .filter((user) => secondaryMap.has(user.username) && secondaryMap.get(user.username) !== user.role)
    .map((user) => ({
      username: user.username,
      primaryRole: user.role,
      secondaryRole: secondaryMap.get(user.username),
    }));

  return {
    missingFromSecondary,
    extraInSecondary,
    roleMismatches,
  };
}

function compareSummaries(primary, secondary) {
  if (!primary?.ok || !secondary?.ok) {
    return null;
  }

  const tableDiffs = {};
  for (const table of TABLE_ORDER) {
    const primaryCount = Number(primary.summary.tableCounts[table] || 0);
    const secondaryCount = Number(secondary.summary.tableCounts[table] || 0);
    if (primaryCount !== secondaryCount) {
      tableDiffs[table] = {
        primary: primaryCount,
        secondary: secondaryCount,
        delta: secondaryCount - primaryCount,
      };
    }
  }

  const userDiff = compareUserSets(primary.summary.users, secondary.summary.users);
  const itemDiff = {
    totalItems: Number(secondary.summary.itemSummary.totalItems || 0) - Number(primary.summary.itemSummary.totalItems || 0),
    inStockItems: Number(secondary.summary.itemSummary.inStockItems || 0) - Number(primary.summary.itemSummary.inStockItems || 0),
    zeroStockItems: Number(secondary.summary.itemSummary.zeroStockItems || 0) - Number(primary.summary.itemSummary.zeroStockItems || 0),
    negativeStockItems: Number(secondary.summary.itemSummary.negativeStockItems || 0) - Number(primary.summary.itemSummary.negativeStockItems || 0),
    stockCostValue: Number((Number(secondary.summary.itemSummary.stockCostValue || 0) - Number(primary.summary.itemSummary.stockCostValue || 0)).toFixed(2)),
    stockSaleValue: Number((Number(secondary.summary.itemSummary.stockSaleValue || 0) - Number(primary.summary.itemSummary.stockSaleValue || 0)).toFixed(2)),
  };
  const cashbookNetDelta = Number(
    (
      Number(secondary.summary.cashbook.netBalance || 0) -
      Number(primary.summary.cashbook.netBalance || 0)
    ).toFixed(2)
  );

  const matches =
    Object.keys(tableDiffs).length === 0 &&
    userDiff.missingFromSecondary.length === 0 &&
    userDiff.extraInSecondary.length === 0 &&
    userDiff.roleMismatches.length === 0 &&
    itemDiff.totalItems === 0 &&
    itemDiff.inStockItems === 0 &&
    itemDiff.zeroStockItems === 0 &&
    itemDiff.negativeStockItems === 0 &&
    itemDiff.stockCostValue === 0 &&
    itemDiff.stockSaleValue === 0 &&
    cashbookNetDelta === 0;

  return {
    matches,
    tableDiffs,
    userDiff,
    itemDiff,
    cashbookNetDelta,
  };
}

async function captureSource(label, adapterFactory) {
  const adapter = await adapterFactory();
  if (!adapter) {
    return {
      ok: false,
      label,
      error: "source_not_available",
    };
  }

  try {
    const summary = await getDatabaseSummary(adapter);
    return {
      ok: true,
      label,
      summary,
    };
  } catch (error) {
    return {
      ok: false,
      label,
      error: String(error.message || error),
    };
  } finally {
    await closeAdapter(adapter);
  }
}

async function main() {
  const liveDatabaseUrl = process.env.DATABASE_URL || "";
  const livePgssl = process.env.PGSSL || "";

  const sources = {
    livePostgres: await captureSource("live-postgres", async () =>
      createPostgresAdapter({
        connectionString: liveDatabaseUrl,
        sslMode: livePgssl,
      })
    ),
    localSqlite: await captureSource("local-sqlite", async () =>
      fs.existsSync(LOCAL_SQLITE_PATH)
        ? createSqliteAdapter(LOCAL_SQLITE_PATH, "local-sqlite")
        : null
    ),
    liveSnapshotSqlite: await captureSource("live-postgres-snapshot", async () =>
      fs.existsSync(LIVE_SNAPSHOT_SQLITE_PATH)
        ? createSqliteAdapter(LIVE_SNAPSHOT_SQLITE_PATH, "live-postgres-snapshot")
        : null
    ),
  };

  const comparisons = {
    liveVsSnapshot: compareSummaries(sources.livePostgres, sources.liveSnapshotSqlite),
    liveVsLocal: compareSummaries(sources.livePostgres, sources.localSqlite),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    sourceOfTruth: liveDatabaseUrl ? "live-postgres" : "local-sqlite",
    liveTarget: redactDatabaseUrl(liveDatabaseUrl),
    paths: {
      localSqlite: LOCAL_SQLITE_PATH,
      liveSnapshotSqlite: LIVE_SNAPSHOT_SQLITE_PATH,
    },
    sources,
    comparisons,
  };

  const reportPath = buildJsonReportPath("database-integrity");
  writeJson(reportPath, report);

  const summary = {
    ok: true,
    sourceOfTruth: report.sourceOfTruth,
    liveTarget: report.liveTarget,
    reportPath,
    liveUsers: sources.livePostgres?.summary?.users?.length || 0,
    liveCashbookRows: sources.livePostgres?.summary?.cashbook?.rowCount || 0,
    liveItems: sources.livePostgres?.summary?.itemSummary?.totalItems || 0,
    liveVsSnapshotMatch: Boolean(comparisons.liveVsSnapshot?.matches),
    liveVsLocalMatch: Boolean(comparisons.liveVsLocal?.matches),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
