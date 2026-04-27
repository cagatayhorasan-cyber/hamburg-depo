const fs = require("fs");
const path = require("path");

const TRAINING_TOPIC = "DRC MAN isletme ve ticari egitim";
const FAQ_PATH = path.join(__dirname, "drc_man_training_faq.json");
const EXPORT_DIR = path.join(process.cwd(), ".codex_tmp", "drc_man_training_bank");

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
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ıİ]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureFaqFile() {
  if (!fs.existsSync(FAQ_PATH)) {
    throw new Error(`FAQ file not found: ${FAQ_PATH}`);
  }

  const loaded = JSON.parse(fs.readFileSync(FAQ_PATH, "utf8"));
  if (!Array.isArray(loaded)) {
    throw new Error("Training FAQ must be an array.");
  }
  return loaded;
}

function expandKeywords(entry, trQuestion, deQuestion) {
  const parts = [
    ...(Array.isArray(entry.keywords) ? entry.keywords : []),
    trQuestion,
    deQuestion,
    entry.id,
    entry.source_summary,
    ...(Array.isArray(entry.suggestions) ? entry.suggestions : []),
  ];

  return parts
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .filter((part, index, items) => items.indexOf(part) === index)
    .join(" ");
}

function buildRows(entries) {
  const rows = [];

  for (const entry of entries) {
    const trQuestions = Array.isArray(entry.tr_questions) ? entry.tr_questions : [];
    const deQuestions = Array.isArray(entry.de_questions) ? entry.de_questions : [];
    const variantCount = Math.max(trQuestions.length, deQuestions.length);

    for (let index = 0; index < variantCount; index += 1) {
      const trQuestion = cleanText(trQuestions[index] || trQuestions[0]);
      const deQuestion = cleanText(deQuestions[index] || deQuestions[0]);
      if (!trQuestion && !deQuestion) {
        continue;
      }

      rows.push({
        topic: cleanText(entry.source_summary || TRAINING_TOPIC) || TRAINING_TOPIC,
        audience: "all",
        keywords: expandKeywords(entry, trQuestion, deQuestion),
        trQuestion,
        trAnswer: cleanText(entry.tr_answer),
        deQuestion,
        deAnswer: cleanText(entry.de_answer),
        suggestions: Array.isArray(entry.suggestions) ? entry.suggestions.slice(0, 4) : [],
      });
    }
  }

  return rows;
}

function writeExports(rows, entries) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const summaryPath = path.join(EXPORT_DIR, "drc_man_training_bank_summary.json");
  const markdownPath = path.join(EXPORT_DIR, "drc_man_training_bank.md");

  const grouped = rows.reduce((accumulator, row) => {
    accumulator[row.topic] = (accumulator[row.topic] || 0) + 1;
    return accumulator;
  }, {});

  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        sourceFile: FAQ_PATH,
        sourceEntries: entries.length,
        dbRows: rows.length,
        topics: grouped,
      },
      null,
      2
    ),
    "utf8"
  );

  const markdownLines = [
    "# DRC MAN Isletme ve Ticari Egitim",
    "",
    `Kaynak satir sayisi: ${entries.length}`,
    `Veritabanina yazilan satir: ${rows.length}`,
    "",
  ];

  Object.entries(grouped)
    .sort((left, right) => left[0].localeCompare(right[0], "tr"))
    .forEach(([topic, count]) => {
      markdownLines.push(`- ${topic}: ${count} varyasyon`);
    });

  markdownLines.push("");
  rows.slice(0, 20).forEach((row, index) => {
    markdownLines.push(`## Ornek ${index + 1}`);
    markdownLines.push("");
    markdownLines.push(`Konu: ${row.topic}`);
    markdownLines.push(`TR: ${row.trQuestion}`);
    markdownLines.push(`DE: ${row.deQuestion}`);
    markdownLines.push("");
  });

  fs.writeFileSync(markdownPath, `${markdownLines.join("\n")}\n`, "utf8");

  return { summaryPath, markdownPath };
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env"));
  const { initDatabase, get, withTransaction } = require("../server/db");

  const entries = ensureFaqFile();
  const rows = buildRows(entries);
  if (!rows.length) {
    throw new Error("No rows were generated from drc_man_training_faq.json.");
  }

  await initDatabase();

  const admin = await get("SELECT id FROM users WHERE role = ? ORDER BY id ASC LIMIT 1", ["admin"]);
  const createdByUserId = admin?.id ? Number(admin.id) : null;
  const topicSet = Array.from(new Set(rows.map((row) => row.topic)));

  await withTransaction(async (tx) => {
    for (const topic of topicSet) {
      await tx.execute("DELETE FROM agent_training WHERE topic = ?", [topic]);
    }

    for (const row of rows) {
      await tx.execute(
        `
          INSERT INTO agent_training (
            topic,
            audience,
            keywords,
            tr_question,
            tr_answer,
            de_question,
            de_answer,
            suggestions,
            is_active,
            created_by_user_id,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [
          row.topic,
          row.audience,
          row.keywords,
          row.trQuestion,
          row.trAnswer,
          row.deQuestion,
          row.deAnswer,
          JSON.stringify(row.suggestions),
          1,
          createdByUserId,
        ]
      );
    }
  });

  const { summaryPath, markdownPath } = writeExports(rows, entries);
  console.log(
    JSON.stringify(
      {
        topic: TRAINING_TOPIC,
        sourceEntries: entries.length,
        dbRows: rows.length,
        exportSummary: summaryPath,
        exportMarkdown: markdownPath,
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
