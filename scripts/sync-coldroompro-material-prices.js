const fs = require("fs");
const path = require("path");
const vm = require("vm");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, query } = require("../server/db");

const DEFAULT_SOURCE_DIR = "/Users/anilakbas/Desktop/DRX_PRO_v11/coldroompro/src";
const SOURCE_DIR = process.env.COLDROOMPRO_SRC_DIR || DEFAULT_SOURCE_DIR;
const MATERIAL_PATH = path.join(SOURCE_DIR, "materialCatalog.js");
const REPORT_PATH = path.join(process.cwd(), "data", "coldroompro-price-sync-report.json");
const DEFAULT_BUNDLE_DIRS = [
  path.join(process.cwd(), "admin-tools", "coldroompro"),
  path.join(path.dirname(SOURCE_DIR), "dist"),
];

async function main() {
  if (!fs.existsSync(MATERIAL_PATH)) {
    throw new Error(`ColdRoomPro material catalog bulunamadi: ${MATERIAL_PATH}`);
  }

  await initDatabase();

  const catalog = loadCatalogModule(MATERIAL_PATH);
  const items = await loadDbItems();
  const lookup = buildLookup(items);
  const report = syncCatalogPrices(catalog.MATERIALS || [], lookup);
  report.bundleResults = syncBundlePrices(report.bundleUpdates || []);
  const outputReport = createOutputReport(report);

  writeCatalog(MATERIAL_PATH, catalog);
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(outputReport, null, 2));
  console.log(JSON.stringify(outputReport, null, 2));
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
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
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

function loadCatalogModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const transformed = source.replace(/\bexport\s+const\s+([A-Za-z0-9_]+)\s*=/g, "exports.$1 =");
  const sandbox = { exports: {} };
  vm.runInNewContext(transformed, sandbox, { filename: filePath, timeout: 5000 });
  return sandbox.exports;
}

async function loadDbItems() {
  return query(
    `
      SELECT
        id,
        name,
        brand,
        category,
        barcode,
        product_code AS "productCode",
        default_price AS "defaultPrice",
        list_price AS "listPrice",
        sale_price AS "salePrice",
        is_active AS "isActive",
        notes
      FROM items
    `,
    []
  );
}

function buildLookup(items) {
  const byCode = new Map();
  const byName = new Map();

  for (const item of items) {
    const codes = new Set();
    [item.productCode, item.barcode].forEach((value) => {
      const normalized = normalizeToken(value);
      if (normalized) {
        codes.add(normalized);
      }
    });

    const noteCodes = extractNoteCodes(item.notes);
    noteCodes.forEach((value) => codes.add(value));

    for (const code of codes) {
      if (!byCode.has(code)) {
        byCode.set(code, []);
      }
      byCode.get(code).push(item);
    }

    const normalizedName = normalizeName(item.name);
    if (!byName.has(normalizedName)) {
      byName.set(normalizedName, []);
    }
    byName.get(normalizedName).push(item);
  }

  return { byCode, byName };
}

function extractNoteCodes(notes) {
  const values = new Set();
  const text = String(notes || "");
  const patterns = [
    /Tedarik kodu:\s*([^|]+)/gi,
    /BOM\.?:\s*([^|]+)/gi,
    /Kod:\s*([^|]+)/gi,
    /model:\s*([^|\n]+)/gi,
    /Model:\s*([^|\n]+)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const normalized = normalizeToken(match[1]);
      if (normalized) {
        values.add(normalized);
      }
    }
  }

  return values;
}

function syncCatalogPrices(materials, lookup) {
  let updated = 0;
  let unchanged = 0;
  let matched = 0;
  let unmatched = 0;
  let matchedByNameOnly = 0;
  let matchedUsingInactive = 0;
  const samples = [];
  const unmatchedSamples = [];
  const bundleUpdates = [];

  for (const material of materials) {
    const matchResult = findDbMatch(material, lookup);
    if (!matchResult) {
      unmatched += 1;
      if (unmatchedSamples.length < 20) {
        unmatchedSamples.push({
          name: material.name,
          price: roundMoney(material.price),
          code: material.code || material.specs?.bom || material.specs?.repa_de_code || material.specs?.repa_it_code || "",
        });
      }
      continue;
    }

    matched += 1;
    if (matchResult.matchedByNameOnly) {
      matchedByNameOnly += 1;
    }
    if (!isActiveItem(matchResult.item)) {
      matchedUsingInactive += 1;
    }

    const dbItem = matchResult.item;
    const targetPrice = visibleDbPrice(dbItem);
    if (!(targetPrice > 0)) {
      unchanged += 1;
      continue;
    }

    bundleUpdates.push({
      name: material.name,
      price: targetPrice,
    });

    const currentPrice = roundMoney(material.price);
    if (Math.abs(currentPrice - targetPrice) < 0.001) {
      unchanged += 1;
    } else {
      material.price = targetPrice;
      updated += 1;
      if (samples.length < 25) {
        samples.push({
          name: material.name,
          oldPrice: currentPrice,
          newPrice: targetPrice,
          dbName: dbItem.name,
          barcode: dbItem.barcode || "",
          productCode: dbItem.productCode || "",
        });
      }
    }
  }

  return {
    sourceDir: SOURCE_DIR,
    materialPath: MATERIAL_PATH,
    totalCatalogItems: materials.length,
    matched,
    matchedByNameOnly,
    matchedUsingInactive,
    unmatched,
    updated,
    unchanged,
    updatedSamples: samples,
    unmatchedSamples,
    bundleUpdates,
    syncedAt: new Date().toISOString(),
  };
}

function syncBundlePrices(bundleUpdates) {
  const results = [];

  for (const dirPath of DEFAULT_BUNDLE_DIRS) {
    if (!fs.existsSync(dirPath)) {
      results.push({
        dirPath,
        exists: false,
        jsFiles: 0,
        updatedEntries: 0,
      });
      continue;
    }

    const jsFiles = findFiles(dirPath, (filePath) => filePath.endsWith(".js"));
    let updatedEntries = 0;
    const updatedFiles = [];

    for (const filePath of jsFiles) {
      const source = fs.readFileSync(filePath, "utf8");
      let output = source;
      let fileUpdates = 0;

      for (const entry of bundleUpdates) {
        const pattern = new RegExp(`(name:\\"${escapeRegExp(entry.name)}\\",price:)(-?\\d+(?:\\.\\d+)?)`, "g");
        output = output.replace(pattern, (match, prefix, priceText) => {
          const currentPrice = roundMoney(priceText);
          if (Math.abs(currentPrice - entry.price) < 0.001) {
            return match;
          }
          fileUpdates += 1;
          return `${prefix}${entry.price}`;
        });
      }

      if (fileUpdates > 0) {
        fs.writeFileSync(filePath, output);
        updatedEntries += fileUpdates;
        updatedFiles.push({
          filePath,
          updatedEntries: fileUpdates,
        });
      }
    }

    results.push({
      dirPath,
      exists: true,
      jsFiles: jsFiles.length,
      updatedEntries,
      updatedFiles,
    });
  }

  return results;
}

function createOutputReport(report) {
  const output = {
    ...report,
    bundleUpdatesCount: (report.bundleUpdates || []).length,
  };
  delete output.bundleUpdates;
  return output;
}

function findFiles(rootDir, predicate) {
  const results = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  return results.sort();
}

function findDbMatch(material, lookup) {
  const specs = material.specs || {};
  const codes = [
    material.code,
    specs.bom,
    specs.repa_de_code,
    specs.repa_it_code,
    specs.compressor_model,
  ].map(normalizeToken).filter(Boolean);

  for (const code of codes) {
    const candidates = lookup.byCode.get(code);
    if (candidates?.length) {
      return {
        item: pickBestCandidate(candidates, material),
        matchedByNameOnly: false,
      };
    }
  }

  const nameKey = normalizeName(material.name);
  const nameCandidates = lookup.byName.get(nameKey);
  if (nameCandidates?.length) {
    return {
      item: pickBestCandidate(nameCandidates, material),
      matchedByNameOnly: true,
    };
  }

  return null;
}

function pickBestCandidate(candidates, material) {
  const normalizedBrand = normalizeName(material.brand || "");
  const normalizedName = normalizeName(material.name || "");

  return [...candidates].sort((left, right) => {
    const leftScore = candidateScore(left, normalizedName, normalizedBrand);
    const rightScore = candidateScore(right, normalizedName, normalizedBrand);
    return rightScore - leftScore;
  })[0];
}

function candidateScore(candidate, normalizedName, normalizedBrand) {
  let score = 0;
  if (normalizeName(candidate.name) === normalizedName) {
    score += 1000;
  }
  if (normalizedBrand && normalizeName(candidate.brand) === normalizedBrand) {
    score += 200;
  }
  if (isActiveItem(candidate)) {
    score += 80;
  }
  if (Number(candidate.salePrice || 0) > 0) {
    score += 50;
  }
  if (Number(candidate.listPrice || 0) > 0) {
    score += 25;
  }
  if (Number(candidate.defaultPrice || 0) > 0) {
    score += 10;
  }
  return score;
}

function visibleDbPrice(item) {
  const salePrice = roundMoney(item.salePrice);
  if (salePrice > 0) {
    return salePrice;
  }
  const listPrice = roundMoney(item.listPrice);
  if (listPrice > 0) {
    return listPrice;
  }
  return roundMoney(item.defaultPrice);
}

function writeCatalog(filePath, catalog) {
  const header = [
    "// Auto-generated Material & Parts Catalog",
    "// Sources: cantas XML, Danfoss 2025, FrigoCraft 2025, Industrial Split 2025, REPA Refrigeration Catalogue 2025",
    "// D-R-C Kältetechnik GmbH - Malzeme Kataloğu / Materialkatalog",
    `// Total products: ${(catalog.MATERIALS || []).length} | Synced from Hamburg sale prices on ${new Date().toISOString()}`,
    "",
  ].join("\n");

  const sections = [
    ["MATERIAL_CATEGORIES", catalog.MATERIAL_CATEGORIES],
    ["MATERIAL_BRANDS", catalog.MATERIAL_BRANDS],
    ["MATERIALS", catalog.MATERIALS],
    ["PIPE_CATALOG", catalog.PIPE_CATALOG],
    ["INSULATION_CATALOG", catalog.INSULATION_CATALOG],
  ];

  const output = header + sections
    .map(([name, value]) => `export const ${name} = ${JSON.stringify(value, null, 2)};`)
    .join("\n\n") + "\n";

  fs.writeFileSync(filePath, output);
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isActiveItem(item) {
  return item?.isActive === true || item?.isActive === 1 || item?.isActive === "1";
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
