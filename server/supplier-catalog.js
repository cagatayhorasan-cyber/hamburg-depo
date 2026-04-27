"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_INDEX_PATH = path.join(__dirname, "..", "data", "supplier-catalogs", "current", "supplier-catalog-index.json");

let cache = {
  filePath: DEFAULT_INDEX_PATH,
  mtimeMs: -1,
  payload: emptyPayload(),
  refsByItemId: new Map(),
};

function emptyPayload() {
  return {
    generatedAt: "",
    dbClient: "",
    dbPath: "",
    sourceCount: 0,
    itemCount: 0,
    totals: {
      extractedCodes: 0,
      matchedCodes: 0,
      unmatchedCodes: 0,
    },
    sources: [],
  };
}

function loadSupplierCatalogIndex(filePath = DEFAULT_INDEX_PATH) {
  try {
    const stat = fs.statSync(filePath);
    if (cache.filePath === filePath && cache.mtimeMs === stat.mtimeMs && cache.payload) {
      return cache.payload;
    }

    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const refsByItemId = buildRefsByItemId(payload);
    cache = {
      filePath,
      mtimeMs: stat.mtimeMs,
      payload,
      refsByItemId,
    };
    return payload;
  } catch (_error) {
    cache = {
      filePath,
      mtimeMs: -1,
      payload: emptyPayload(),
      refsByItemId: new Map(),
    };
    return cache.payload;
  }
}

function getSupplierCatalogRefsByItemId(filePath = DEFAULT_INDEX_PATH) {
  loadSupplierCatalogIndex(filePath);
  return cache.refsByItemId;
}

function getSupplierCatalogRefsForItem(itemId, filePath = DEFAULT_INDEX_PATH) {
  const refsByItemId = getSupplierCatalogRefsByItemId(filePath);
  return refsByItemId.get(Number(itemId)) || [];
}

function buildRefsByItemId(payload) {
  const refsByItemId = new Map();
  const sources = Array.isArray(payload?.sources) ? payload.sources : [];

  sources.forEach((source) => {
    const metadata = source?.metadata || source || {};
    const entries = Array.isArray(source?.entries) ? source.entries : [];

    entries.forEach((entry) => {
      const matches = Array.isArray(entry?.matches) ? entry.matches : [];
      matches.forEach((match) => {
        const itemId = Number(match?.id || 0);
        if (!itemId) return;

        const publicRef = toPublicRef(metadata, entry, match);
        const current = refsByItemId.get(itemId) || [];
        current.push(publicRef);
        refsByItemId.set(itemId, current);
      });
    });
  });

  for (const [itemId, refs] of refsByItemId.entries()) {
    refsByItemId.set(itemId, dedupeAndSortRefs(refs));
  }

  return refsByItemId;
}

function toPublicRef(metadata, entry, match) {
  const sourceDocument = String(metadata?.sourceDocument || "").trim();
  return {
    supplierBrand: String(metadata?.brand || match?.brand || "").trim(),
    code: String(entry?.code || "").trim(),
    normalizedCode: normalizeCompactToken(entry?.normalizedCode || entry?.code || ""),
    occurrences: Number(entry?.occurrences || 0),
    matchType: String(match?.matchType || "").trim(),
    sourceDocument,
    sourceDocumentLabel: sourceDocument ? path.basename(sourceDocument) : "",
    sourceFile: String(metadata?.fileName || "").trim(),
    pageCount: Number(metadata?.pageCount || 0),
    matchedItemId: Number(match?.id || 0),
    matchedItemName: String(match?.name || "").trim(),
    snippets: Array.isArray(entry?.snippets)
      ? entry.snippets.map((snippet) => String(snippet || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 2)
      : [],
  };
}

function dedupeAndSortRefs(refs) {
  const map = new Map();
  refs.forEach((ref) => {
    const key = `${Number(ref.matchedItemId || 0)}::${ref.normalizedCode}`;
    if (!map.has(key)) {
      map.set(key, ref);
    }
  });

  return Array.from(map.values()).sort((left, right) => {
    const leftExact = left.matchType === "exact" ? 1 : 0;
    const rightExact = right.matchType === "exact" ? 1 : 0;
    if (leftExact !== rightExact) {
      return rightExact - leftExact;
    }
    if (Number(left.occurrences || 0) !== Number(right.occurrences || 0)) {
      return Number(right.occurrences || 0) - Number(left.occurrences || 0);
    }
    return String(left.code || "").localeCompare(String(right.code || ""), "en");
  });
}

function normalizeCompactToken(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
}

module.exports = {
  DEFAULT_INDEX_PATH,
  loadSupplierCatalogIndex,
  getSupplierCatalogRefsByItemId,
  getSupplierCatalogRefsForItem,
  normalizeCompactToken,
};
