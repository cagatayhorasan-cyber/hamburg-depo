const fs = require("fs");
const path = require("path");

const TRAINING_TOPIC_PREFIX = "DRC MAN Ariza Bankasi";
const FAQ_PATH = path.join(__dirname, "drc_man_troubleshooting_faq.json");
const EXPORT_DIR = path.join(process.cwd(), ".codex_tmp", "drc_man_troubleshooting_bank");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
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
  return JSON.parse(fs.readFileSync(FAQ_PATH, "utf8"));
}

function expandKeywords(entry, trQuestion, deQuestion) {
  const keywordParts = [];
  const rawKeywords = Array.isArray(entry.keywords) ? entry.keywords : [];
  keywordParts.push(...rawKeywords);
  keywordParts.push(entry.tr_subject, entry.de_subject, trQuestion, deQuestion);
  keywordParts.push(...(Array.isArray(entry.suggestions) ? entry.suggestions : []));
  return keywordParts
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .filter((part, index, parts) => parts.indexOf(part) === index)
    .join(" ");
}

function buildRows(faqEntries) {
  const rows = [];

  faqEntries.forEach((entry) => {
    const trQuestions = Array.isArray(entry.tr_questions) ? entry.tr_questions : [];
    const deQuestions = Array.isArray(entry.de_questions) ? entry.de_questions : [];
    const variantCount = Math.max(trQuestions.length, deQuestions.length);
    const topic = `${TRAINING_TOPIC_PREFIX} - ${cleanText(entry.tr_subject || entry.id || "Genel Ariza")}`;

    for (let index = 0; index < variantCount; index += 1) {
      const trQuestion = cleanText(trQuestions[index] || trQuestions[0]);
      const deQuestion = cleanText(deQuestions[index] || deQuestions[0]);
      if (!trQuestion && !deQuestion) {
        continue;
      }

      rows.push({
        topic,
        audience: "all",
        keywords: expandKeywords(entry, trQuestion, deQuestion),
        trQuestion,
        trAnswer: cleanText(entry.tr_answer),
        deQuestion,
        deAnswer: cleanText(entry.de_answer),
        suggestions: Array.isArray(entry.suggestions) ? entry.suggestions.slice(0, 3) : [],
      });
    }
  });

  return rows;
}

function ensureExportDir() {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function writeExports(rows, faqEntries) {
  ensureExportDir();
  const summaryPath = path.join(EXPORT_DIR, "drc_man_troubleshooting_bank_summary.json");
  const markdownPath = path.join(EXPORT_DIR, "drc_man_troubleshooting_bank.md");

  const byTopic = rows.reduce((accumulator, row) => {
    accumulator[row.topic] = (accumulator[row.topic] || 0) + 1;
    return accumulator;
  }, {});

  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        sourceFile: FAQ_PATH,
        topicPrefix: TRAINING_TOPIC_PREFIX,
        faqTopics: faqEntries.length,
        dbRows: rows.length,
        topicBreakdown: byTopic,
      },
      null,
      2
    ),
    "utf8"
  );

  const markdownLines = [
    "# DRC MAN Ariza Bankasi",
    "",
    `Toplam konu: ${faqEntries.length}`,
    `Toplam egitim satiri: ${rows.length}`,
    "",
  ];

  Object.entries(byTopic)
    .sort((a, b) => a[0].localeCompare(b[0], "tr"))
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

  const faqEntries = ensureFaqFile();
  const rows = buildRows(faqEntries);
  if (!rows.length) {
    throw new Error("No troubleshooting rows were generated.");
  }

  await initDatabase();

  const admin = await get(
    "SELECT id FROM users WHERE role = ? ORDER BY id ASC LIMIT 1",
    ["admin"]
  );
  const createdByUserId = admin?.id ? Number(admin.id) : null;

  await withTransaction(async (tx) => {
    await tx.execute("DELETE FROM agent_training WHERE topic LIKE ?", [`${TRAINING_TOPIC_PREFIX}%`]);

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

  const { summaryPath, markdownPath } = writeExports(rows, faqEntries);

  console.log(
    JSON.stringify(
      {
        topicPrefix: TRAINING_TOPIC_PREFIX,
        faqTopics: faqEntries.length,
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
