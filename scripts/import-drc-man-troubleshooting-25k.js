const fs = require("fs");
const path = require("path");

const INPUT_PATHS = [
  path.join(
    process.cwd(),
    ".codex_tmp",
    "drc_man_troubleshooting_25k",
    "drc_man_troubleshooting_25k_faq.json"
  ),
  path.join(
    process.cwd(),
    ".codex_tmp",
    "drc_man_troubleshooting_deep_packs",
    "drc_man_troubleshooting_deep_packs.json"
  ),
];
const EXPORT_DIR = path.join(process.cwd(), ".codex_tmp", "drc_man_troubleshooting_25k");
const SUMMARY_PATH = path.join(EXPORT_DIR, "drc_man_troubleshooting_25k_import_summary.json");
const INSERT_BATCH_SIZE = 100;

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

function cleanText(value) {
  return String(value || "").trim();
}

function parseArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => cleanText(item)).filter(Boolean);
}

function mapEntriesFromFile(parsed) {
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error("Troubleshooting input file is empty.");
  }
  return parsed.map((entry) => ({
    bankKey: cleanText(entry.id),
    contextId: cleanText(entry.context_id),
    familyId: cleanText(entry.family_id),
    sourceSummary: cleanText(entry.source_summary),
    keywords: JSON.stringify(parseArray(entry.keywords)),
    trSubject: cleanText(entry.tr_subject),
    deSubject: cleanText(entry.de_subject),
    trQuestions: JSON.stringify(parseArray(entry.tr_questions)),
    deQuestions: JSON.stringify(parseArray(entry.de_questions)),
    trAnswer: cleanText(entry.tr_answer),
    deAnswer: cleanText(entry.de_answer),
    suggestions: JSON.stringify(parseArray(entry.suggestions).slice(0, 6)),
  }));
}

function loadEntries() {
  const existingPaths = INPUT_PATHS.filter((filePath) => fs.existsSync(filePath));
  if (!existingPaths.length) {
    throw new Error(`No troubleshooting bank files found: ${INPUT_PATHS.join(", ")}`);
  }

  const entries = [];
  const files = [];
  existingPaths.forEach((filePath) => {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const mapped = mapEntriesFromFile(parsed);
    mapped.forEach((entry) => entries.push(entry));
    files.push({ filePath, count: mapped.length });
  });

  const keys = new Set();
  entries.forEach((entry) => {
    if (keys.has(entry.bankKey)) {
      throw new Error(`Duplicate troubleshooting bank key: ${entry.bankKey}`);
    }
    keys.add(entry.bankKey);
  });

  return { entries, files };
}

function buildBatchInsert(entries, isActiveValue) {
  const params = [];
  const values = entries.map((entry) => {
    params.push(
      entry.bankKey,
      entry.contextId,
      entry.familyId,
      entry.sourceSummary,
      entry.keywords,
      entry.trSubject,
      entry.deSubject,
      entry.trQuestions,
      entry.deQuestions,
      entry.trAnswer,
      entry.deAnswer,
      entry.suggestions,
      isActiveValue
    );
    return "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)";
  });

  return {
    sql: `
      INSERT INTO assistant_troubleshooting_bank (
        bank_key,
        context_id,
        family_id,
        source_summary,
        keywords,
        tr_subject,
        de_subject,
        tr_questions,
        de_questions,
        tr_answer,
        de_answer,
        suggestions,
        is_active,
        updated_at
      )
      VALUES ${values.join(",\n")}
    `,
    params,
  };
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env"));
  const { dbClient, initDatabase, withTransaction } = require("../server/db");

  const { entries, files } = loadEntries();
  await initDatabase();
  const isActiveValue = dbClient === "postgres" ? true : 1;

  await withTransaction(async (tx) => {
    await tx.execute("DELETE FROM assistant_troubleshooting_bank");

    for (let index = 0; index < entries.length; index += INSERT_BATCH_SIZE) {
      const batch = entries.slice(index, index + INSERT_BATCH_SIZE);
      const statement = buildBatchInsert(batch, isActiveValue);
      await tx.execute(statement.sql, statement.params);
    }
  });

  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.writeFileSync(
    SUMMARY_PATH,
    JSON.stringify(
      {
        inputFile: INPUT_PATHS[0],
        sourceFiles: files,
        dbClient,
        totalEntries: entries.length,
        batchSize: INSERT_BATCH_SIZE,
        importedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        inputFile: INPUT_PATHS[0],
        sourceFiles: files,
        importSummary: SUMMARY_PATH,
        totalEntries: entries.length,
        batchSize: INSERT_BATCH_SIZE,
        dbClient,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
