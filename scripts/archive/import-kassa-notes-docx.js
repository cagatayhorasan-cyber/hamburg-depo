const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, get, query, execute, withTransaction } = require("../server/db");

const REFERENCE = "Notes_260407_154236.docx";

const ENTRIES = [
  ["2025-12-09", "10x Gaz", "in", 2500, ""],
  ["2025-12-10", "3x Gaz", "in", 750, ""],
  ["2025-12-11", "Rolltor", "out", 106, ""],
  ["2025-12-12", "2 Dolap + 1 Diskose + 1 Gaz 29", "in", 1766, ""],
  ["2025-12-18", "Bauhaus", "out", 40, ""],
  ["2025-12-19", "2 Dolap", "in", 3046, ""],
  ["2025-12-22", "Havale", "out", 6500, ""],
  ["2025-12-22", "Komisyon", "out", 325, ""],
  ["2026-01-02", "Maas 12/25", "out", 1100, ""],
  ["2026-01-22", "Sertac", "in", 218, ""],
  ["2026-01-23", "Maas 12/25", "out", 220, ""],
  ["2026-01-26", "Cagatay elden", "out", 90, "Maas 12/25 satiri altinda"],
  ["2026-01-29", "Senol", "in", 225, ""],
  ["2026-01-29", "Sadi G404/134", "in", 500, ""],
  ["2026-01-30", "Ahmet Ok G134", "in", 500, ""],
  ["2026-02-05", "Maas 01/26", "out", 1200, ""],
  ["2026-02-12", "Senol", "in", 45, ""],
  ["2026-02-16", "Senol G404", "in", 600, ""],
  ["2026-02-17", "Yilmaz", "in", 24, ""],
  ["2026-02-18", "Maas 01/26", "out", 210, ""],
  ["2026-02-23", "Maas 02/26", "out", 200, ""],
  ["2026-02-23", "Benzin", "out", 50, "2x Havalimani"],
  ["2026-02-23", "Yilmaz", "in", 135, ""],
  ["2026-02-24", "Yilmaz", "in", 110, ""],
  ["2026-02-25", "Nakliye Otelproje", "out", 80, ""],
  ["2026-02-26", "Maas 02/26", "out", 210, ""],
  ["2026-02-26", "Yilmaz G404", "in", 250, "DCB31"],
  ["2026-02-27", "Cihan HH", "in", 470, "Pasta sogutucu"],
  ["2026-03-02", "Cagatay elden", "out", 400, "Otel Luneburg"],
  ["2026-03-04", "Maas 02/26", "out", 200, ""],
  ["2026-03-05", "Sertac", "in", 800, ""],
  ["2026-03-05", "Tunc Market", "in", 500, "Kapora"],
  ["2026-03-05", "Cagatay elden", "out", 1000, ""],
  ["2026-03-06", "Benzin", "out", 50, "2x tur otele"],
  ["2026-03-07", "Maas 02/26", "out", 200, ""],
  ["2026-03-09", "Maas 02/26", "out", 100, ""],
  ["2026-03-09", "Malzeme / Internet", "out", 45, ""],
  ["2026-03-10", "Valentino", "in", 350, ""],
  ["2026-03-13", "Maas 02/26", "out", 200, ""],
  ["2026-03-17", "Senol", "in", 80, ""],
  ["2026-03-17", "Maas 02/26", "out", 100, ""],
  ["2026-03-19", "Maas 02/26", "out", 200, ""],
  ["2026-04-01", "Maas 03/26", "out", 150, ""],
  ["2026-04-07", "Cagatay elden", "in", 150, ""],
  ["2026-04-07", "Nakliye Luneburg", "out", 100, ""],
  ["2026-04-07", "Internet depo", "out", 20, ""],
];

async function main() {
  await initDatabase();
  const admin = await get("SELECT id FROM users WHERE username = ? LIMIT 1", ["admin"]);
  const userId = admin?.id ? Number(admin.id) : null;

  let inserted = 0;
  let skipped = 0;
  const rows = [];

  await withTransaction(async (tx) => {
    for (const [date, title, type, amount, note] of ENTRIES) {
      const existing = await tx.get(
        "SELECT id, amount, note FROM cashbook WHERE reference = ? AND cash_date = ? AND title = ? AND type = ? LIMIT 1",
        [REFERENCE, date, title, type]
      );
      if (existing) {
        const nextNote = buildNote(note);
        if (Number(existing.amount) !== Number(amount) || existing.note !== nextNote) {
          await tx.execute("UPDATE cashbook SET amount = ?, note = ? WHERE id = ?", [Number(amount), nextNote, existing.id]);
          rows.push({ date, title, type, amount, status: "updated" });
          continue;
        }
        skipped += 1;
        rows.push({ date, title, type, amount, status: "skipped" });
        continue;
      }

      await tx.execute(
        `
          INSERT INTO cashbook (type, title, amount, cash_date, reference, note, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [type, title, Number(amount), date, REFERENCE, buildNote(note), userId]
      );
      inserted += 1;
      rows.push({ date, title, type, amount, status: "inserted" });
    }
  });

  const totals = await query(
    `
      SELECT
        SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END) AS "cashIn",
        SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END) AS "cashOut",
        SUM(CASE WHEN type = 'in' THEN amount ELSE -amount END) AS "balance"
      FROM cashbook
      WHERE reference = ?
    `,
    [REFERENCE]
  );

  console.log(JSON.stringify({ reference: REFERENCE, totalEntries: ENTRIES.length, inserted, skipped, importedTotals: totals[0], rows }, null, 2));
}

function buildNote(extraNote) {
  return ["Kassa docx import", extraNote].filter(Boolean).join(" | ");
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
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
