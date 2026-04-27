#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const OUTPUT_ROOT = path.join(process.cwd(), ".codex_tmp", "drc_man_troubleshooting_test_run");

const DEFAULT_BASE_URL = "https://hamburg-depo-3bgu.vercel.app";
const DEFAULT_USER = "cagatayhorasan";
const DEFAULT_LIMIT = 10000;
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_PROGRESS_EVERY = 100;
const DEFAULT_MIN_ANSWER_LENGTH = 80;
const DEFAULT_MIN_SIMILARITY = 0.16;
const DEFAULT_REQUEST_TIMEOUT_MS = 20000;
const DEFAULT_REQUEST_ATTEMPTS = 5;
const DEFAULT_RELOGIN_EVERY = 250;

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

function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token && (token.length >= 4 || /\d/.test(token)));
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) {
      return parsed.map((item) => cleanText(item)).filter(Boolean);
    }
  } catch (_error) {
    return [];
  }
  return [];
}

function ensureDir(filePath) {
  fs.mkdirSync(filePath, { recursive: true });
}

function stableShuffle(list, seed = 42) {
  const items = list.slice();
  let state = seed >>> 0;
  function nextRandom() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  }

  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function buildCases(rows, language, limit) {
  const cases = [];

  rows.forEach((row) => {
    const questions = language === "de" ? parseJsonArray(row.deQuestions) : parseJsonArray(row.trQuestions);
    const expectedAnswer = language === "de" ? cleanText(row.deAnswer || row.trAnswer) : cleanText(row.trAnswer || row.deAnswer);
    questions.forEach((question, questionIndex) => {
      if (!question || !expectedAnswer) {
        return;
      }
      cases.push({
        bankKey: cleanText(row.bankKey),
        sourceSummary: cleanText(row.sourceSummary),
        contextId: cleanText(row.contextId),
        familyId: cleanText(row.familyId),
        language,
        question,
        expectedAnswer,
        expectedTokens: tokenize(expectedAnswer),
        questionIndex,
      });
    });
  });

  const shuffled = stableShuffle(cases, language === "de" ? 290 : 145);
  return shuffled.slice(0, limit);
}

function buildRowMap(rows) {
  const rowMap = new Map();
  rows.forEach((row) => {
    rowMap.set(cleanText(row.bankKey), row);
  });
  return rowMap;
}

function buildQuestionMap(rows) {
  const questionMap = new Map();
  rows.forEach((row) => {
    parseJsonArray(row.trQuestions).forEach((question) => {
      questionMap.set(`tr::${cleanText(question)}`, row);
    });
    parseJsonArray(row.deQuestions).forEach((question) => {
      questionMap.set(`de::${cleanText(question)}`, row);
    });
  });
  return questionMap;
}

function buildCaseFromFailure(failure, rowMap, questionMap) {
  const language = cleanText(failure.language) === "de" ? "de" : "tr";
  const question = cleanText(failure.question);
  const bankKey = cleanText(failure.bankKey || failure.bank_key || "");
  const row = bankKey
    ? rowMap.get(bankKey)
    : questionMap.get(`${language}::${question}`);
  if (!row) {
    return null;
  }

  const questions = language === "de" ? parseJsonArray(row.deQuestions) : parseJsonArray(row.trQuestions);
  if (!questions.includes(question)) {
    return null;
  }

  const expectedAnswer = language === "de"
    ? cleanText(row.deAnswer || row.trAnswer)
    : cleanText(row.trAnswer || row.deAnswer);
  if (!expectedAnswer) {
    return null;
  }

  return {
    bankKey: cleanText(row.bankKey),
    sourceSummary: cleanText(row.sourceSummary),
    contextId: cleanText(row.contextId),
    familyId: cleanText(row.familyId),
    language,
    question,
    expectedAnswer,
    expectedTokens: tokenize(expectedAnswer),
    retryOf: {
      reason: cleanText(failure.reason),
      previousProvider: cleanText(failure.provider),
      previousStatus: Number(failure.status || 0),
    },
  };
}

function buildCasesFromFailures(failures, rowMap, filterReason = "", limit = 0) {
  const questionMap = buildQuestionMap([...rowMap.values()]);
  const normalizedReason = cleanText(filterReason);
  const cases = failures
    .filter((failure) => !normalizedReason || cleanText(failure.reason) === normalizedReason)
    .map((failure) => buildCaseFromFailure(failure, rowMap, questionMap))
    .filter(Boolean);

  return limit > 0 ? cases.slice(0, limit) : cases;
}

function similarity(actual, expectedTokens) {
  const actualTokens = new Set(tokenize(actual));
  const expectedTokenSet = new Set(expectedTokens);
  if (!expectedTokenSet.size) {
    return 0;
  }

  let overlap = 0;
  expectedTokenSet.forEach((token) => {
    if (actualTokens.has(token)) {
      overlap += 1;
    }
  });

  return overlap / expectedTokenSet.size;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SessionClient {
  constructor(baseUrl, options = {}) {
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.cookies = new Map();
    this.identifier = "";
    this.password = "";
    this.requestTimeoutMs = Math.max(1000, Number(options.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS));
    this.maxRequestAttempts = Math.max(1, Number(options.maxRequestAttempts || DEFAULT_REQUEST_ATTEMPTS));
  }

  cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  storeCookiesFromResponse(response) {
    let cookieLines = [];
    if (response?.headers && typeof response.headers.getSetCookie === "function") {
      cookieLines = response.headers.getSetCookie();
    } else {
      const singleCookie = response?.headers?.get("set-cookie");
      if (singleCookie) {
        cookieLines = [singleCookie];
      }
    }

    cookieLines.forEach((line) => {
      const firstPart = String(line || "").split(";")[0];
      const separatorIndex = firstPart.indexOf("=");
      if (separatorIndex <= 0) {
        return;
      }
      const key = firstPart.slice(0, separatorIndex).trim();
      const value = firstPart.slice(separatorIndex + 1).trim();
      if (key) {
        this.cookies.set(key, value);
      }
    });
  }

  async request(route, method = "GET", body = undefined, attempt = 1) {
    try {
      const response = await fetch(`${this.baseUrl}${route}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(this.cookieHeader() ? { cookie: this.cookieHeader() } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      this.storeCookiesFromResponse(response);

      if ((response.status === 429 || response.status >= 500) && attempt < this.maxRequestAttempts) {
        await sleep(250 * attempt);
        return this.request(route, method, body, attempt + 1);
      }

      return response;
    } catch (error) {
      if (attempt < this.maxRequestAttempts) {
        await sleep(300 * attempt);
        return this.request(route, method, body, attempt + 1);
      }
      throw error;
    }
  }

  async login(identifier, password) {
    this.identifier = identifier;
    this.password = password;
    const response = await this.request("/api/login", "POST", { identifier, password });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`login_failed:${response.status}:${text}`);
    }
  }

  async ask(message, language, attempt = 1) {
    try {
      const response = await this.request("/api/assistant/query", "POST", { message, language });
      if (response.status === 401 && attempt < this.maxRequestAttempts && this.identifier && this.password) {
        await this.login(this.identifier, this.password);
        return this.ask(message, language, attempt + 1);
      }
      const text = await response.text();
      let parsed = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch (_error) {
        parsed = { raw: text };
      }
      return {
        status: response.status,
        body: parsed,
      };
    } catch (error) {
      if (attempt < this.maxRequestAttempts && this.identifier && this.password) {
        this.cookies.clear();
        await sleep(400 * attempt);
        await this.login(this.identifier, this.password);
        return this.ask(message, language, attempt + 1);
      }
      throw error;
    }
  }
}

function progressSnapshot(state) {
  const passRate = state.processed ? Number(((state.passed / state.processed) * 100).toFixed(2)) : 0;
  return {
    baseUrl: state.baseUrl,
    total: state.total,
    processed: state.processed,
    passed: state.passed,
    failed: state.failed,
    passRate,
    startedAt: state.startedAt,
    updatedAt: new Date().toISOString(),
    languageBreakdown: state.languageBreakdown,
    failureBreakdown: state.failureBreakdown,
  };
}

function writeProgress(state) {
  ensureDir(state.outputDir);
  fs.writeFileSync(state.progressPath, JSON.stringify(progressSnapshot(state), null, 2), "utf8");
}

function writeFinalFiles(state) {
  ensureDir(state.outputDir);
  const summary = {
    ...progressSnapshot(state),
    durationSeconds: Number(((Date.now() - state.startedAtMs) / 1000).toFixed(2)),
    minAnswerLength: state.minAnswerLength,
    minSimilarity: state.minSimilarity,
    concurrency: state.concurrency,
    user: state.user,
    sampleFailures: state.failures.slice(0, 50),
  };

  fs.writeFileSync(state.summaryPath, JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(state.failuresPath, JSON.stringify(state.failures, null, 2), "utf8");

  const lines = [
    "# DRC MAN Troubleshooting Test",
    "",
    `- Base URL: ${state.baseUrl}`,
    `- User: ${state.user}`,
    `- Total: ${state.total}`,
    `- Passed: ${state.passed}`,
    `- Failed: ${state.failed}`,
    `- Pass rate: ${summary.passRate}%`,
    `- Duration (s): ${summary.durationSeconds}`,
    `- TR tested: ${state.languageBreakdown.tr.total}`,
    `- TR passed: ${state.languageBreakdown.tr.passed}`,
    `- DE tested: ${state.languageBreakdown.de.total}`,
    `- DE passed: ${state.languageBreakdown.de.passed}`,
    "",
    "## Failure Breakdown",
    "",
  ];

  Object.entries(state.failureBreakdown)
    .sort((a, b) => b[1] - a[1])
    .forEach(([reason, count]) => {
      lines.push(`- ${reason}: ${count}`);
    });

  lines.push("", "## Sample Failures", "");

  state.failures.slice(0, 20).forEach((failure, index) => {
    lines.push(`### ${index + 1}. ${failure.reason}`);
    lines.push(`- Language: ${failure.language}`);
    lines.push(`- Question: ${failure.question}`);
    lines.push(`- Provider: ${failure.provider}`);
    lines.push(`- Status: ${failure.status}`);
    lines.push(`- Similarity: ${failure.similarity}`);
    lines.push(`- Source: ${failure.sourceSummary}`);
    lines.push("");
  });

  fs.writeFileSync(state.reportPath, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env"));
  const { initDatabase, query } = require("../server/db");

  const baseUrl = cleanText(process.env.DRC_TEST_BASE_URL || process.env.LIVE_CHECK_URL || DEFAULT_BASE_URL);
  const user = cleanText(process.env.DRC_TEST_USER || process.env.LIVE_CHECK_ADMIN_USER || DEFAULT_USER);
  const password = cleanText(process.env.DRC_TEST_PASSWORD || process.env.LIVE_CHECK_ADMIN_PASSWORD || user);
  const totalLimit = Math.max(Number(process.env.DRC_TEST_LIMIT || DEFAULT_LIMIT), 2);
  const perLanguageLimit = Math.floor(totalLimit / 2);
  const concurrency = Math.max(1, Number(process.env.DRC_TEST_CONCURRENCY || DEFAULT_CONCURRENCY));
  const progressEvery = Math.max(1, Number(process.env.DRC_TEST_PROGRESS_EVERY || DEFAULT_PROGRESS_EVERY));
  const minAnswerLength = Math.max(20, Number(process.env.DRC_TEST_MIN_ANSWER_LENGTH || DEFAULT_MIN_ANSWER_LENGTH));
  const minSimilarity = Number(process.env.DRC_TEST_MIN_SIMILARITY || DEFAULT_MIN_SIMILARITY);
  const requestTimeoutMs = Math.max(1000, Number(process.env.DRC_TEST_REQUEST_TIMEOUT_MS || DEFAULT_REQUEST_TIMEOUT_MS));
  const maxRequestAttempts = Math.max(1, Number(process.env.DRC_TEST_REQUEST_ATTEMPTS || DEFAULT_REQUEST_ATTEMPTS));
  const reloginEvery = Math.max(1, Number(process.env.DRC_TEST_RELOGIN_EVERY || DEFAULT_RELOGIN_EVERY));
  const failurePath = cleanText(process.env.DRC_TEST_FAILURES_PATH);
  const failureReason = cleanText(process.env.DRC_TEST_FAILURE_REASON);
  const runName = cleanText(process.env.DRC_TEST_RUN_NAME) || (failureReason ? `rerun_${failureReason}_${totalLimit}` : `run_${totalLimit}`);

  const outputDir = path.join(OUTPUT_ROOT, runName);
  const summaryPath = path.join(outputDir, "summary.json");
  const progressPath = path.join(outputDir, "progress.json");
  const failuresPath = path.join(outputDir, "failures.json");
  const reportPath = path.join(outputDir, "report.md");

  await initDatabase();
  const rows = await query(
    `
      SELECT
        bank_key AS "bankKey",
        context_id AS "contextId",
        family_id AS "familyId",
        source_summary AS "sourceSummary",
        tr_questions AS "trQuestions",
        de_questions AS "deQuestions",
        tr_answer AS "trAnswer",
        de_answer AS "deAnswer"
      FROM assistant_troubleshooting_bank
      WHERE is_active = ?
      ORDER BY id ASC
    `,
    [true]
  );

  const rowMap = buildRowMap(rows);
  let trCases = [];
  let deCases = [];
  let cases = [];

  if (failurePath) {
    const failureRows = JSON.parse(fs.readFileSync(path.resolve(failurePath), "utf8"));
    cases = buildCasesFromFailures(failureRows, rowMap, failureReason, totalLimit);
    trCases = cases.filter((item) => item.language === "tr");
    deCases = cases.filter((item) => item.language === "de");
    if (!cases.length) {
      throw new Error(`No retry cases found for failurePath=${failurePath} reason=${failureReason || "any"}`);
    }
  } else {
    trCases = buildCases(rows, "tr", perLanguageLimit);
    deCases = buildCases(rows, "de", totalLimit - perLanguageLimit);
    cases = stableShuffle([...trCases, ...deCases], 10000);
    if (trCases.length < perLanguageLimit || deCases.length < totalLimit - perLanguageLimit) {
      throw new Error(`Not enough troubleshooting questions for requested test. tr=${trCases.length}, de=${deCases.length}`);
    }
  }

  const state = {
    baseUrl,
    user,
    total: cases.length,
    outputDir,
    summaryPath,
    progressPath,
    failuresPath,
    reportPath,
    processed: 0,
    passed: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    startedAtMs: Date.now(),
    concurrency,
    minAnswerLength,
    minSimilarity,
    requestTimeoutMs,
    maxRequestAttempts,
    reloginEvery,
    failurePath,
    failureReason,
    failures: [],
    failureBreakdown: {},
    languageBreakdown: {
      tr: { total: trCases.length, passed: 0, failed: 0 },
      de: { total: deCases.length, passed: 0, failed: 0 },
    },
  };

  writeProgress(state);
  console.log(`START DRC MAN troubleshooting test :: total=${state.total} tr=${trCases.length} de=${deCases.length} concurrency=${concurrency}`);

  let currentIndex = 0;

  async function worker(workerId) {
    const client = new SessionClient(baseUrl, { requestTimeoutMs, maxRequestAttempts });
    await client.login(user, password);
    let handledCount = 0;

    while (true) {
      const testIndex = currentIndex;
      currentIndex += 1;
      if (testIndex >= cases.length) {
        return;
      }

      const testCase = cases[testIndex];
      handledCount += 1;
      if (handledCount % reloginEvery === 0) {
        await client.login(user, password);
      }
      let reason = "";
      let provider = "";
      let sourceSummary = "";
      let status = 0;
      let answer = "";
      let similarityScore = 0;

      try {
        const result = await client.ask(testCase.question, testCase.language);
        status = result.status;
        provider = cleanText(result.body?.provider);
        sourceSummary = cleanText(result.body?.sourceSummary);
        answer = cleanText(result.body?.answer);
        similarityScore = Number(similarity(answer, testCase.expectedTokens).toFixed(4));

        if (status !== 200) {
          reason = `status_${status}`;
        } else if (provider !== "drc_man") {
          reason = `provider_${provider || "unknown"}`;
        } else if (answer.length < minAnswerLength) {
          reason = "short_answer";
        } else if (similarityScore < minSimilarity) {
          reason = "low_similarity";
        }
      } catch (error) {
        reason = "request_error";
        answer = cleanText(error.message || error);
      }

      state.processed += 1;
      if (reason) {
        state.failed += 1;
        state.languageBreakdown[testCase.language].failed += 1;
        state.failureBreakdown[reason] = (state.failureBreakdown[reason] || 0) + 1;
        state.failures.push({
          index: testIndex,
          workerId,
          reason,
          language: testCase.language,
          question: testCase.question,
          expectedSourceSummary: testCase.sourceSummary,
          sourceSummary,
          provider,
          status,
          similarity: similarityScore,
          answer: answer.slice(0, 500),
        });
      } else {
        state.passed += 1;
        state.languageBreakdown[testCase.language].passed += 1;
      }

      if (state.processed % progressEvery === 0 || state.processed === state.total) {
        writeProgress(state);
        const passRate = ((state.passed / state.processed) * 100).toFixed(2);
        console.log(`PROGRESS ${state.processed}/${state.total} pass=${state.passed} fail=${state.failed} rate=${passRate}%`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index + 1)));
  writeFinalFiles(state);

  const finalSummary = progressSnapshot(state);
  console.log(JSON.stringify({
    ...finalSummary,
    durationSeconds: Number(((Date.now() - state.startedAtMs) / 1000).toFixed(2)),
    summaryFile: state.summaryPath,
    progressFile: state.progressPath,
    failuresFile: state.failuresPath,
    reportFile: state.reportPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
