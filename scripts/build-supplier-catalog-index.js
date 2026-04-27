#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, query, dbClient, dbPath } = require("../server/db");

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "data", "supplier-catalogs", "raw");
const CURRENT_DIR = path.join(ROOT, "data", "supplier-catalogs", "current");
const REPORT_DIR = path.join(ROOT, "data", "reports");
const GENERATED_AT = new Date().toISOString();
const DATE_TAG = GENERATED_AT.slice(0, 10);

const SOURCE_DEFS = [
  { brand: "Tecumseh", slug: "tecumseh", match: /^tecumseh-.*\.txt$/i },
  { brand: "Embraco", slug: "embraco", match: /^embraco-.*\.txt$/i },
  { brand: "FrigoCraft", slug: "frigocraft", match: /^frigocraft-.*\.txt$/i },
  { brand: "Sanhua", slug: "sanhua", match: /^sanhua-.*\.txt$/i },
];

const NOISE_CODES = new Set([
  "HTTP",
  "HTTPS",
  "EMAIL",
  "TEL",
  "FAX",
  "SCANME",
  "CONTENT",
  "ABOUT",
  "PRODUCTS",
  "SUMMARY",
  "GENERAL",
  "CATALOGUE",
  "CATALOG",
  "VERSION",
  "DROP-IN",
  "UNI-FLOW",
  "BI-FLOW",
  "STRAIGHT-WAY",
  "L-SHAPE",
  "HIGH-YIELD",
  "RE-CORE",
  "PLUG-IN",
  "BUILT-IN",
  "SYSTEM-ACTIVELUB",
  "SYSTEM-PASSIVELUB",
  "SYSTEM-PASSIVE",
  "YSTEM-PASSIVELUB",
  "TUBES-ALUMINIUM",
  "BORU-ALUMINYUM",
  "MICRO-CHANNEL",
  "MCHE-SANHUA",
  "AC220V",
  "AC24V",
  "AC100V",
  "DC12V",
  "IP00",
]);

const PREFIX_BLOCKLIST = [
  /^DWG\d+$/i,
  /^DGW\d+$/i,
  /^SM\d+$/i,
  /^CF\d+$/i,
  /^CON\d+(?:-\d+)*$/i,
  /^SD\d+$/i,
];

async function main() {
  ensureDirectory(RAW_DIR);
  ensureDirectory(CURRENT_DIR);
  ensureDirectory(REPORT_DIR);

  const sources = discoverSources();
  if (!sources.length) {
    throw new Error(`Ham tedarikci katalogu bulunamadi: ${RAW_DIR}`);
  }

  const dbInfo = await loadItemsSafe();
  const items = dbInfo.items;
  const itemIndex = buildItemIndex(items);

  const catalogs = sources.map((source) => buildCatalogIndex(source));
  const matchedCatalogs = catalogs.map((catalog) => matchCatalogEntries(catalog, itemIndex));
  const currentIndex = buildCurrentIndex(matchedCatalogs, items, dbInfo);
  const summary = buildSummary(currentIndex);
  const currentPath = path.join(CURRENT_DIR, "supplier-catalog-index.json");
  const reportJsonPath = path.join(REPORT_DIR, `supplier-catalog-match-report-${DATE_TAG}.json`);
  const reportMdPath = path.join(REPORT_DIR, `supplier-catalog-match-report-${DATE_TAG}.md`);

  fs.writeFileSync(currentPath, JSON.stringify(currentIndex, null, 2));
  fs.writeFileSync(reportJsonPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(reportMdPath, renderMarkdown(summary));

  console.log(JSON.stringify({
    ok: true,
    generatedAt: summary.generatedAt,
    dbClient: summary.dbClient,
    dbPath: summary.dbPath,
    sourceCount: summary.sources.length,
    matchedCodeCount: summary.totals.matchedCodes,
    unmatchedCodeCount: summary.totals.unmatchedCodes,
    currentPath,
    reportJsonPath,
    reportMdPath,
  }, null, 2));
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function discoverSources() {
  const files = fs.readdirSync(RAW_DIR).filter((file) => file.toLowerCase().endsWith(".txt"));
  return SOURCE_DEFS.map((def) => {
    const fileName = files.find((file) => def.match.test(file));
    if (!fileName) return null;
    return {
      ...def,
      fileName,
      filePath: path.join(RAW_DIR, fileName),
    };
  }).filter(Boolean);
}

async function loadItems() {
  return query(
    `
      SELECT
        id,
        name,
        brand,
        category,
        unit,
        product_code AS "productCode",
        barcode,
        notes,
        COALESCE(is_active, TRUE) AS "isActive"
      FROM items
      WHERE COALESCE(is_active, TRUE) = TRUE
    `,
    []
  );
}

async function loadItemsSafe() {
  try {
    await initDatabase();
    const items = await loadItems();
    return { items, dbClient, dbPath };
  } catch (error) {
    const fallbackPath = pickFallbackSqlitePath();
    const items = loadItemsFromSqlite(fallbackPath);
    return {
      items,
      dbClient: "sqlite-fallback",
      dbPath: fallbackPath,
      fallbackReason: String(error && error.message ? error.message : error),
    };
  }
}

function pickFallbackSqlitePath() {
  const candidates = [
    path.join(ROOT, "data", "hamburg-depo.live-postgres.sqlite"),
    path.join(ROOT, "data", "hamburg-depo.sqlite"),
  ];

  const filePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!filePath) {
    throw new Error("Ne Postgres ne de yerel SQLite kaynagi bulunamadi.");
  }
  return filePath;
}

function loadItemsFromSqlite(filePath) {
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(filePath, { readonly: true });
  try {
    return db.prepare(
      `
        SELECT
          id,
          name,
          brand,
          category,
          unit,
          product_code AS productCode,
          barcode,
          notes,
          COALESCE(is_active, 1) AS isActive
        FROM items
        WHERE COALESCE(is_active, 1) = 1
      `
    ).all();
  } finally {
    db.close();
  }
}

function buildCatalogIndex(source) {
  const raw = fs.readFileSync(source.filePath, "utf8");
  const content = extractCatalogContent(raw);
  const metadata = {
    brand: source.brand,
    slug: source.slug,
    fileName: source.fileName,
    importedFile: source.filePath,
    sourceDocument: extractField(raw, "Belge"),
    profile: extractField(raw, "Profil"),
    pageCount: extractPageCount(raw),
    rawByteSize: Buffer.byteLength(raw, "utf8"),
  };

  const occurrences = collectCodeOccurrences(content, source.brand);
  const entries = Array.from(occurrences.values())
    .map((entry) => ({
      code: entry.code,
      normalizedCode: entry.normalizedCode,
      occurrences: entry.occurrences,
      snippets: entry.snippets.slice(0, 3),
    }))
    .sort((a, b) => b.occurrences - a.occurrences || a.code.localeCompare(b.code, "en"));

  return {
    metadata,
    entries,
  };
}

function extractCatalogContent(raw) {
  const marker = "### Belge Metni";
  const idx = raw.indexOf(marker);
  const text = idx >= 0 ? raw.slice(idx + marker.length) : raw;
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractField(raw, label) {
  const pattern = new RegExp("\\|\\s*" + escapeRegex(label) + "\\s*\\|\\s*`([^`]*)`\\s*\\|", "i");
  const match = raw.match(pattern);
  return match ? match[1].trim() : "";
}

function extractPageCount(raw) {
  const match = raw.match(/PDF toplam\s+(\d+)\s+sayfa/i);
  return match ? Number(match[1]) : null;
}

function collectCodeOccurrences(content, brand) {
  const upper = String(content || "").toUpperCase();
  const pattern = /\b[A-Z0-9][A-Z0-9./-]{3,39}\b/g;
  const occurrences = new Map();
  let match;

  while ((match = pattern.exec(upper))) {
    const candidate = sanitizeCandidate(match[0], brand);
    if (!candidate) continue;
    const normalizedCode = normalizeCode(candidate);
    const existing = occurrences.get(normalizedCode) || {
      code: candidate,
      normalizedCode,
      occurrences: 0,
      snippets: [],
    };
    existing.occurrences += 1;
    if (existing.snippets.length < 3) {
      existing.snippets.push(extractSnippet(content, match.index, match[0].length));
    }
    occurrences.set(normalizedCode, existing);
  }

  return occurrences;
}

function sanitizeCandidate(value, brand) {
  const candidate = String(value || "").trim().replace(/^[./-]+|[./-]+$/g, "");
  if (!candidate) return "";
  if (candidate.length < 4 || candidate.length > 40) return "";
  if (!/[A-Z]/.test(candidate) || !/\d/.test(candidate)) return "";
  if (/^\d+(?:[./-]\d+)*$/.test(candidate)) return "";
  if (NOISE_CODES.has(candidate)) return "";
  if (PREFIX_BLOCKLIST.some((pattern) => pattern.test(candidate))) return "";
  if (/^(?:R-?\d{2,4}[A-Z]?|220-240V|208-230V|200-230V|200-240V|380-400V\/3\/50-60|440-480V|115-127V)$/.test(candidate)) return "";
  if (/^\d+(?:-\d+)?UN[CF]-?\d*[A-Z]?$/i.test(candidate)) return "";
  if (/^[A-Z]{1,2}\d{1,2}$/.test(candidate)) return "";

  if (brand === "Tecumseh") {
    if (!/[A-Z]{2,}\d{3,}/.test(candidate) && !/[A-Z]{2,}\d+\.[0-9]/.test(candidate)) return "";
  } else if (brand === "Embraco") {
    if (!/(?:[A-Z]{2,}\d{3,}[A-Z0-9-]*|V[A-Z]+\d+[A-Z0-9-]*)/.test(candidate)) return "";
  } else if (brand === "FrigoCraft") {
    if (!/[.-]/.test(candidate) && !/[A-Z]{2,}\d{4,}/.test(candidate)) return "";
  } else if (brand === "Sanhua") {
    if (!/(?:[A-Z]{2,}(?:-[A-Z0-9]+)+|[A-Z]{3,}\d{2,}[A-Z0-9-]*)/.test(candidate)) return "";
  }

  return candidate;
}

function extractSnippet(content, start, length) {
  const left = Math.max(0, start - 60);
  const right = Math.min(content.length, start + length + 60);
  return content.slice(left, right).replace(/\s+/g, " ").trim();
}

function buildItemIndex(items) {
  return items.map((item) => {
    const brand = String(item.brand || "").trim();
    const notes = String(item.notes || "");
    const normalizedText = normalizeLoose([
      item.name,
      item.brand,
      item.category,
      item.productCode,
      item.barcode,
      notes,
    ].filter(Boolean).join(" | "));
    const codes = new Set();

    [item.productCode, item.barcode].forEach((value) => {
      const normalized = normalizeCode(value);
      if (normalized) codes.add(normalized);
    });

    extractEmbeddedCodes(item.name).forEach((code) => codes.add(code));
    extractEmbeddedCodes(notes).forEach((code) => codes.add(code));

    return {
      id: Number(item.id),
      name: String(item.name || "").trim(),
      brand,
      category: String(item.category || "").trim(),
      productCode: String(item.productCode || "").trim(),
      barcode: String(item.barcode || "").trim(),
      normalizedBrand: normalizeLoose(brand),
      normalizedText,
      codes: Array.from(codes),
    };
  });
}

function extractEmbeddedCodes(text) {
  const pattern = /\b[A-Z0-9][A-Z0-9./-]{3,39}\b/g;
  const values = new Set();
  const upper = String(text || "").toUpperCase();
  let match;
  while ((match = pattern.exec(upper))) {
    const normalized = normalizeCode(match[0]);
    if (!normalized) continue;
    if (!/[A-Z]/.test(normalized) || !/\d/.test(normalized)) continue;
    if (normalized.length < 4) continue;
    values.add(normalized);
  }
  return values;
}

function matchCatalogEntries(catalog, itemIndex) {
  const normalizedBrand = normalizeLoose(catalog.metadata.brand);
  const entries = catalog.entries.map((entry) => {
    const brandScopedItems = itemIndex.filter((item) => item.normalizedBrand === normalizedBrand);
    const exact = brandScopedItems.filter((item) => item.codes.includes(entry.normalizedCode));
    const fuzzy = exact.length
      ? []
      : brandScopedItems.filter((item) => {
          if (entry.normalizedCode.length < 5) return false;
          return item.normalizedText.includes(entry.normalizedCode);
        });

    const matches = [...exact, ...fuzzy].slice(0, 6).map((item) => ({
      id: item.id,
      name: item.name,
      brand: item.brand,
      category: item.category,
      productCode: item.productCode,
      barcode: item.barcode,
      matchType: exact.find((candidate) => candidate.id === item.id) ? "exact" : "fuzzy",
    }));

    return {
      ...entry,
      matched: matches.length > 0,
      matches,
    };
  });

  return {
    metadata: catalog.metadata,
    entries,
  };
}

function buildCurrentIndex(catalogs, items, dbInfo) {
  return {
    generatedAt: GENERATED_AT,
    dbClient: dbInfo.dbClient,
    dbPath: dbInfo.dbPath,
    fallbackReason: dbInfo.fallbackReason || "",
    itemCount: items.length,
    sourceCount: catalogs.length,
    totals: {
      extractedCodes: catalogs.reduce((sum, catalog) => sum + catalog.entries.length, 0),
      matchedCodes: catalogs.reduce((sum, catalog) => sum + catalog.entries.filter((entry) => entry.matched).length, 0),
      unmatchedCodes: catalogs.reduce((sum, catalog) => sum + catalog.entries.filter((entry) => !entry.matched).length, 0),
    },
    sources: catalogs,
  };
}

function buildSummary(currentIndex) {
  const sources = currentIndex.sources.map((catalog) => {
    const matchedEntries = catalog.entries.filter((entry) => entry.matched);
    const unmatchedEntries = catalog.entries.filter((entry) => !entry.matched);
    return {
      ...catalog.metadata,
      extractedCodeCount: catalog.entries.length,
      matchedCodeCount: matchedEntries.length,
      unmatchedCodeCount: unmatchedEntries.length,
      topMatchedCodes: matchedEntries.slice(0, 20),
      topUnmatchedCodes: unmatchedEntries.slice(0, 30),
    };
  });

  return {
    generatedAt: currentIndex.generatedAt,
    dbClient: currentIndex.dbClient,
    dbPath: currentIndex.dbPath,
    fallbackReason: currentIndex.fallbackReason || "",
    itemCount: currentIndex.itemCount,
    sourceCount: sources.length,
    totals: {
      extractedCodes: sources.reduce((sum, source) => sum + source.extractedCodeCount, 0),
      matchedCodes: sources.reduce((sum, source) => sum + source.matchedCodeCount, 0),
      unmatchedCodes: sources.reduce((sum, source) => sum + source.unmatchedCodeCount, 0),
    },
    sources,
  };
}

function renderMarkdown(summary) {
  const lines = [];
  lines.push("# Supplier Catalog Match Report");
  lines.push("");
  lines.push(`- Generated at: ${summary.generatedAt}`);
  lines.push(`- Database client: ${summary.dbClient}`);
  lines.push(`- Active item count: ${summary.itemCount}`);
  lines.push(`- Source count: ${summary.sourceCount}`);
  lines.push(`- Extracted codes: ${summary.totals.extractedCodes}`);
  lines.push(`- Matched codes: ${summary.totals.matchedCodes}`);
  lines.push(`- Unmatched codes: ${summary.totals.unmatchedCodes}`);
  lines.push("");

  summary.sources.forEach((source) => {
    lines.push(`## ${source.brand}`);
    lines.push("");
    lines.push(`- File: ${source.fileName}`);
    lines.push(`- Source document: ${source.sourceDocument || "-"}`);
    lines.push(`- Page count: ${source.pageCount || "-"}`);
    lines.push(`- Extracted codes: ${source.extractedCodeCount}`);
    lines.push(`- Matched codes: ${source.matchedCodeCount}`);
    lines.push(`- Unmatched codes: ${source.unmatchedCodeCount}`);
    lines.push("");

    if (source.topMatchedCodes.length) {
      lines.push("### Top matched codes");
      lines.push("");
      source.topMatchedCodes.slice(0, 10).forEach((entry) => {
        const matchList = entry.matches.map((match) => `${match.name} [${match.matchType}]`).join(" | ");
        lines.push(`- ${entry.code}: ${matchList}`);
      });
      lines.push("");
    }

    if (source.topUnmatchedCodes.length) {
      lines.push("### Top unmatched codes");
      lines.push("");
      source.topUnmatchedCodes.slice(0, 12).forEach((entry) => {
        lines.push(`- ${entry.code} (${entry.occurrences}x)`);
      });
      lines.push("");
    }
  });

  return lines.join("\n");
}

function normalizeCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[“”‘’]/g, "")
    .replace(/[^A-Z0-9./-]+/g, "")
    .replace(/^[./-]+|[./-]+$/g, "")
    .trim();
}

function normalizeLoose(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
