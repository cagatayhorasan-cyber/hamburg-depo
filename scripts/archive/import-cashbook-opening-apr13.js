const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, get, withTransaction, query } = require("../server/db");

const REFERENCE = "manual-opening-cash-2026-04-13";
const NOTE = "Acilis kasa listesi - 2026-04-13";

const ENTRIES = [
  ["2025-12-09", "10x Gaz", "in", 2500],
  ["2025-12-10", "3x Gaz", "in", 750],
  ["2025-12-11", "Rolltor", "out", 106],
  ["2025-12-12", "2Dolap, 1Diskose, 1Gaz 29", "in", 1766],
  ["2025-12-18", "Bauhaus", "out", 40],
  ["2025-12-19", "2Dolap", "in", 3046],
  ["2025-12-22", "Havale", "out", 6500],
  ["2025-12-22", "Komisyon", "out", 325],
  ["2026-01-02", "Maas 12/25", "out", 1100],
  ["2026-01-22", "Sertac", "in", 218],
  ["2026-01-23", "Maas 12/25", "out", 220],
  ["2026-01-26", "Maas 12/25, Cagatay elden", "out", 90],
  ["2026-01-29", "Senol", "in", 225],
  ["2026-01-29", "Sadi G404/134", "in", 500],
  ["2026-01-30", "Ahmet Ok G134", "in", 500],
  ["2026-02-05", "Maas 01/26", "out", 1200],
  ["2026-02-12", "Senol", "in", 45],
  ["2026-02-16", "Senol G 404", "in", 600],
  ["2026-02-17", "Yilmaz", "in", 24],
  ["2026-02-18", "Maas 01/26", "out", 210],
  ["2026-02-23", "Maas 02/26", "out", 200],
  ["2026-02-23", "Benzin, 2x Havalimani", "out", 50],
  ["2026-02-23", "Yilmaz", "in", 135],
  ["2026-02-24", "Yilmaz", "in", 110],
  ["2026-02-25", "Nakliye Otelproje", "out", 80],
  ["2026-02-26", "Maas 02/26", "out", 210],
  ["2026-02-26", "Yilmaz G404, DCB31", "in", 280],
  ["2026-02-27", "Cihan HH, Pasta sogutucu", "in", 470],
  ["2026-03-02", "Cagatay elden, Otel Luneburg", "out", 400],
  ["2026-03-04", "Maas 02/26", "out", 200],
  ["2026-03-05", "Sertac", "in", 800],
  ["2026-03-05", "Tunc Market, Kapora", "in", 500],
  ["2026-03-05", "Cagatay elden", "out", 1000],
  ["2026-03-06", "Benzin, 2x tur otele", "out", 50],
  ["2026-03-07", "Maas 02/26", "out", 200],
  ["2026-03-09", "Maas 02/26", "out", 100],
  ["2026-03-09", "Malzeme/ Internet", "out", 45],
  ["2026-03-10", "Valentino", "in", 350],
  ["2026-03-13", "Maas 02/26", "out", 200],
  ["2026-03-17", "Senol", "in", 80],
  ["2026-03-17", "Maas 02/26", "out", 100],
  ["2026-03-19", "Maas 02/26", "out", 200],
  ["2026-04-01", "Maas 03/26", "out", 150],
  ["2026-04-07", "Cagatay elden", "in", 150],
  ["2026-04-07", "Nakliye Luneburg", "out", 100],
  ["2026-04-07", "Internet depo", "out", 20],
];

async function main() {
  await initDatabase();
  const user = await get("SELECT id FROM users WHERE username = ? LIMIT 1", ["cagatayhorasan"]);
  const userId = user?.id ? Number(user.id) : null;

  await withTransaction(async (tx) => {
    await tx.execute("DELETE FROM cashbook", []);

    for (const [cashDate, title, type, amount] of ENTRIES) {
      await tx.execute(
        `
          INSERT INTO cashbook (type, title, amount, cash_date, reference, note, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [type, title, Number(amount), cashDate, REFERENCE, NOTE, userId]
      );
    }
  });

  const totals = await query(
    `
      SELECT
        COUNT(*) AS "entryCount",
        COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0) AS "cashIn",
        COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0) AS "cashOut",
        COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE -amount END), 0) AS "balance"
      FROM cashbook
    `
  );

  console.log(
    JSON.stringify(
      {
        reference: REFERENCE,
        note: NOTE,
        totals: totals[0],
      },
      null,
      2
    )
  );
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
