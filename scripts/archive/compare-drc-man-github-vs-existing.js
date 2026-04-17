const fs = require("fs");
const path = require("path");

const OPEN_SOURCE_PREFIX = "DRC MAN acik kaynak HVAC bilgisi";
const ROLEPLAY_PREFIX = "DRC MAN role-play";
const EXPORT_DIR = path.join(process.cwd(), ".codex_tmp", "drc_man_compare");
const EXPORT_JSON = path.join(EXPORT_DIR, "github_vs_existing.json");
const EXPORT_MD = path.join(EXPORT_DIR, "github_vs_existing.md");

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

function normalize(value) {
  return String(value || "")
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

function tokenize(value) {
  return normalize(value).split(/\s+/).filter((token) => token.length >= 3);
}

function jaccard(leftTokens, rightTokens) {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function scoreEntryPair(source, target) {
  const sourceQuestion = `${source.trQuestion || ""} ${source.deQuestion || ""} ${source.keywords || ""}`;
  const targetQuestion = `${target.trQuestion || ""} ${target.deQuestion || ""} ${target.keywords || ""}`;
  const sourceAnswer = `${source.trAnswer || ""} ${source.deAnswer || ""}`;
  const targetAnswer = `${target.trAnswer || ""} ${target.deAnswer || ""}`;

  const questionScore = jaccard(tokenize(sourceQuestion), tokenize(targetQuestion));
  const answerScore = jaccard(tokenize(sourceAnswer), tokenize(targetAnswer));
  const topicScore = jaccard(tokenize(source.topic), tokenize(target.topic));

  return Number((questionScore * 0.55 + answerScore * 0.3 + topicScore * 0.15).toFixed(4));
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env"));
  const { initDatabase, query } = require("../server/db");
  await initDatabase();

  const rows = await query(`
    SELECT
      id,
      topic,
      audience,
      keywords,
      tr_question AS "trQuestion",
      tr_answer AS "trAnswer",
      de_question AS "deQuestion",
      de_answer AS "deAnswer"
    FROM agent_training
    WHERE is_active = ?
    ORDER BY id ASC
  `, [true]);

  const githubRows = rows.filter((row) => String(row.topic || "").startsWith(OPEN_SOURCE_PREFIX));
  const roleplayRows = rows.filter((row) => String(row.topic || "").startsWith(ROLEPLAY_PREFIX));
  const existingRows = rows.filter((row) => !String(row.topic || "").startsWith(OPEN_SOURCE_PREFIX) && !String(row.topic || "").startsWith(ROLEPLAY_PREFIX));

  const comparison = githubRows.map((source) => {
    const ranked = existingRows
      .map((target) => ({
        id: target.id,
        topic: target.topic,
        trQuestion: target.trQuestion,
        deQuestion: target.deQuestion,
        score: scoreEntryPair(source, target),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);

    return {
      sourceId: source.id,
      sourceTopic: source.topic,
      sourceQuestion: source.trQuestion,
      topMatches: ranked,
    };
  });

  const overlaps = comparison.filter((entry) => Number(entry.topMatches[0]?.score || 0) >= 0.26);
  const distinct = comparison.filter((entry) => Number(entry.topMatches[0]?.score || 0) < 0.26);

  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.writeFileSync(
    EXPORT_JSON,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        githubRows: githubRows.length,
        roleplayRows: roleplayRows.length,
        existingRows: existingRows.length,
        possibleOverlapCount: overlaps.length,
        distinctCount: distinct.length,
        comparison,
      },
      null,
      2
    ),
    "utf8"
  );

  const lines = [
    "# DRC MAN GitHub Pack Compare",
    "",
    `GitHub HVAC satiri: ${githubRows.length}`,
    `Role-play satiri: ${roleplayRows.length}`,
    `Eski aktif egitim satiri: ${existingRows.length}`,
    `Olasi cakisma: ${overlaps.length}`,
    `Ayrik/benzersiz: ${distinct.length}`,
    "",
    "## Olasi Cakismalar",
    "",
  ];

  if (!overlaps.length) {
    lines.push("- Yuksek benzerlikte cakisma bulunmadi.");
  } else {
    overlaps.forEach((entry) => {
      const best = entry.topMatches[0];
      lines.push(`- ${entry.sourceTopic}`);
      lines.push(`  - Soru: ${entry.sourceQuestion}`);
      lines.push(`  - En yakin kayit: ${best.topic}`);
      lines.push(`  - Skor: ${best.score}`);
    });
  }

  lines.push("", "## Ayrik Kayitlar", "");
  distinct.forEach((entry) => {
    const best = entry.topMatches[0];
    lines.push(`- ${entry.sourceTopic}`);
    lines.push(`  - Soru: ${entry.sourceQuestion}`);
    lines.push(`  - En yakin skor: ${best ? best.score : 0}`);
  });

  fs.writeFileSync(EXPORT_MD, `${lines.join("\n")}\n`, "utf8");

  console.log(JSON.stringify({
    ok: true,
    githubRows: githubRows.length,
    roleplayRows: roleplayRows.length,
    existingRows: existingRows.length,
    possibleOverlapCount: overlaps.length,
    distinctCount: distinct.length,
    exportJson: EXPORT_JSON,
    exportMarkdown: EXPORT_MD,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
