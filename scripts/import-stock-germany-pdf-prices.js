const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, query, execute } = require("../server/db");

const DEFAULT_PDF = "/Users/anilakbas/Downloads/stokalmanya_260209_012429.pdf";
const SOURCE_NAME = "stokalmanya_260209_012429.pdf";
const DRY_RUN = process.argv.includes("--dry-run");
const pdfPath = process.argv.find((arg) => arg.toLowerCase().endsWith(".pdf")) || DEFAULT_PDF;

async function main() {
  await initDatabase();
  const pdfRows = parsePdfRows(extractPdfText(pdfPath)).filter((row) => row.listPrice > 0 && row.netPrice > 0);
  const items = (await query(`
    SELECT
      id,
      name,
      brand,
      category,
      product_code,
      barcode,
      notes,
      default_price,
      list_price,
      sale_price,
      COALESCE((
        SELECT SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END)
        FROM movements
        WHERE item_id = items.id
      ), 0) AS current_stock
    FROM items
    WHERE COALESCE(is_active, TRUE) = ?
  `, [process.env.DATABASE_URL ? true : 1])).map(normalizeItemRow);

  const updatedItemIds = new Set();
  const updates = [];
  const skipped = [];

  for (const row of pdfRows) {
    const ruleMatches = findRuleMatches(row, items).filter((item) => !updatedItemIds.has(item.id));
    if (ruleMatches.length) {
      for (const item of ruleMatches) {
        updatedItemIds.add(item.id);
        updates.push(buildUpdate(row, item, "model-kural"));
      }
      continue;
    }

    const match = findBestMatch(row, items, updatedItemIds);
    if (!match || match.score < 90 || (match.runnerUpScore && match.score - match.runnerUpScore < 15)) {
      skipped.push({
        no: row.no,
        description: row.description,
        listPrice: row.listPrice,
        netPrice: row.netPrice,
        reason: match ? `belirsiz eslesme: ${match.item.name} (${match.score}/${match.runnerUpScore || 0})` : "eslesme yok",
      });
      continue;
    }

    updatedItemIds.add(match.item.id);
    updates.push(buildUpdate(row, match.item, match.score));
  }

  if (!DRY_RUN) {
    for (const update of updates) {
      await execute(
        "UPDATE items SET list_price = ?, sale_price = ?, notes = ? WHERE id = ?",
        [update.listPrice, update.netPrice, update.nextNotes, update.itemId]
      );
    }
  }

  console.log(JSON.stringify({
    source: pdfPath,
    dryRun: DRY_RUN,
    parsedRows: pdfRows.length,
    updated: updates.length,
    skipped: skipped.length,
    updates: updates.map(({ nextNotes, ...entry }) => entry),
    skipped,
  }, null, 2));
}

function buildUpdate(row, item, score) {
  return {
    no: row.no,
    description: row.description,
    itemId: item.id,
    itemName: item.name,
    itemStock: item.currentStock,
    score,
    previousListPrice: item.listPrice,
    previousNetPrice: item.salePrice,
    listPrice: row.listPrice,
    netPrice: row.netPrice,
    nextNotes: mergePriceSourceNote(item.notes, row),
  };
}

function extractPdfText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF bulunamadi: ${filePath}`);
  }
  return execFileSync("pdftotext", ["-layout", filePath, "-"], { encoding: "utf8" });
}

function parsePdfRows(text) {
  const rows = [];
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\f/g, "").trimEnd();
    if (!line.trim() || /^SIRA\s+/i.test(line) || /^FİYAT$/i.test(line.trim())) {
      continue;
    }

    const parsed = parsePriceLine(line);
    if (parsed) {
      if (current) {
        rows.push(finalizeRow(current));
      }
      current = parsed;
      continue;
    }

    if (current) {
      const continuation = line.trim();
      if (continuation && !/^TOPLAM NET$/i.test(continuation)) {
        current.description = `${current.description} ${continuation}`;
      }
    }
  }

  if (current) {
    rows.push(finalizeRow(current));
  }

  return rows;
}

function parsePriceLine(line) {
  const rowMatch = line.match(/^\s*(\d+)\s+(.+)$/);
  if (!rowMatch || !line.includes("€")) {
    return null;
  }

  const no = Number(rowMatch[1]);
  const withPrices = rowMatch[2].match(/^(.*?)\s+€\s*([0-9.,-]+)\s+€\s*([0-9.,-]+)\s*$/);
  if (!withPrices) {
    return null;
  }

  const beforePrices = withPrices[1].trim();
  const netPrice = parseEuro(withPrices[2]);
  const totalNet = parseEuro(withPrices[3]);
  const stockAndList = beforePrices.match(/^(.*?)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)\s*$/);
  const stockOnly = beforePrices.match(/^(.*?)\s+([0-9]+(?:[.,][0-9]+)?)\s*$/);

  if (stockAndList) {
    return {
      no,
      description: stockAndList[1].trim(),
      stock: parseEuro(stockAndList[2]),
      listPrice: parseEuro(stockAndList[3]),
      netPrice,
      totalNet,
    };
  }

  if (stockOnly) {
    return {
      no,
      description: stockOnly[1].trim(),
      stock: parseEuro(stockOnly[2]),
      listPrice: 0,
      netPrice,
      totalNet,
    };
  }

  return null;
}

function finalizeRow(row) {
  return {
    ...row,
    description: row.description.replace(/\s+/g, " ").trim(),
  };
}

function findBestMatch(row, items, usedItemIds) {
  const scored = items
    .filter((item) => !usedItemIds.has(item.id))
    .map((item) => ({ item, score: scoreMatch(row, item) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "tr"));

  if (!scored.length) {
    return null;
  }

  return {
    ...scored[0],
    runnerUpScore: scored[1]?.score || 0,
  };
}

function findRuleMatches(row, items) {
  const rowText = normalizeText(row.description);
  const rowCompact = compactText(rowText);
  const candidates = items.filter((item) => {
    const itemText = normalizeText([item.name, item.brand, item.productCode, item.notes].join(" "));
    const itemName = normalizeText(item.name);
    const itemCompact = compactText(itemText);

    if (rowText.includes("dcb100plus")) {
      return itemCompact.includes("dcb100") && !itemCompact.includes("dcb100300350");
    }
    if (rowText === "dcb31") {
      return itemCompact === "dcb31";
    }

    if (rowText.includes("m003.a01sf4125.ff85hbk")) {
      return false;
    }
    if (rowText.includes("m004.a01sf4125.ff12h.ep5")) {
      return itemCompact.includes("frigocraftm004a01sf4125ff12hep5");
    }

    if (rowText.includes("embraco ff 8.5 hbk") && (itemText.includes("role") || itemText.includes("termik"))) {
      return false;
    }
    if (/embraco (nj|nt|nek|njx|neu)/.test(rowText) && /230v|60 hz|60hz/.test(itemText) && !/230v|60 hz|60hz/.test(rowText)) {
      return false;
    }

    if (rowText.includes("yzf 18-30") || rowCompact.includes("yzf1830")) {
      return itemCompact.includes("yzf1830") && !itemText.includes("110v") && !itemText.includes("75 watt");
    }

    if (rowText.includes("ol6016") && rowText.includes("25lt")) {
      return itemCompact.includes("ol6016t") && itemCompact.includes("25lt");
    }
    if (rowText.includes("ol6020") && rowText.includes("25lt")) {
      return itemCompact.includes("ol6020t") && itemCompact.includes("25lt");
    }

    if (rowText.includes("gmh-052f") || rowText.includes("gmh 052f")) {
      return itemName.includes("filtre drier gmh 1/4");
    }
    if (rowText.includes("gmh-053f") || rowText.includes("gmh 053f")) {
      return itemName.includes("filtre drier gmh 3/8");
    }

    const exactFragments = [
      "embraco ff 8.5 hbk",
      "embraco nj 9238 gk",
      "embraco nj 9238 gs",
      "embraco neu 6220 gk",
      "embraco neu 6215 gk",
      "embraco nt 6226 gk",
      "embraco nek 6217 gk",
      "embraco njx 6250 gs",
      "068z3348",
      "068z3414",
      "ps15aal-s51",
      "vlr.a.30b.01.b1.c1",
      "rfd 052s",
      "tc-084",
    ];

    return exactFragments.some((fragment) => {
      const normalizedFragment = normalizeText(fragment);
      const compactFragment = compactText(normalizedFragment);
      return rowText.includes(normalizedFragment) && itemCompact.includes(compactFragment);
    });
  });

  return candidates.sort((a, b) => {
    const stockDiff = Number(b.currentStock > 0) - Number(a.currentStock > 0);
    if (stockDiff) {
      return stockDiff;
    }
    return a.name.localeCompare(b.name, "tr");
  });
}

function scoreMatch(row, item) {
  const rowText = normalizeText(row.description);
  const itemText = normalizeText([item.name, item.brand, item.category, item.productCode, item.barcode, item.notes].join(" "));
  const itemName = normalizeText(item.name);
  const rowTokens = importantTokens(rowText);
  const itemTokens = new Set(importantTokens(itemText));
  const modelTokens = extractModelTokens(rowText);
  const itemModelTokens = new Set(extractModelTokens(itemText));

  let score = 0;
  if (rowText && itemName && rowText === itemName) {
    score += 120;
  }
  if (rowText && itemName && (rowText.includes(itemName) || itemName.includes(rowText))) {
    score += 65;
  }

  for (const token of rowTokens) {
    if (itemTokens.has(token)) {
      score += token.length >= 5 ? 9 : 5;
    }
  }

  for (const token of modelTokens) {
    if (itemModelTokens.has(token)) {
      score += 20;
    }
  }

  const rowBrand = detectBrand(rowText);
  if (rowBrand && normalizeText(item.brand).includes(rowBrand)) {
    score += 22;
  } else if (rowBrand && itemText.includes(rowBrand)) {
    score += 12;
  }

  const sharedStrongTokens = rowTokens.filter((token) => token.length >= 4 && itemTokens.has(token)).length;
  if (sharedStrongTokens >= Math.min(3, rowTokens.filter((token) => token.length >= 4).length)) {
    score += 28;
  }

  if (rowText.includes("pano") && !itemText.includes("pano")) {
    score -= 38;
  }
  if (rowText.includes("dcb31") && itemName === "dcb31") {
    score += 40;
  }
  if (rowText.includes("dcb31 pano") && itemName === "dcb31") {
    score -= 45;
  }

  return score;
}

function normalizeItemRow(row) {
  return {
    id: Number(row.id),
    name: row.name || "",
    brand: row.brand || "",
    category: row.category || "",
    productCode: row.product_code || "",
    barcode: row.barcode || "",
    notes: row.notes || "",
    defaultPrice: Number(row.default_price || 0),
    listPrice: Number(row.list_price || 0),
    salePrice: Number(row.sale_price || 0),
    currentStock: Number(row.current_stock || 0),
  };
}

function importantTokens(text) {
  const stopWords = new Set([
    "adet", "birim", "fiyat", "net", "toplam", "unit", "control", "room", "cold", "motoru",
    "fan", "valf", "valve", "therm", "exp", "liquid", "line", "filter", "drier", "rakorlu",
    "kay", "cikisli", "dikey", "deposu", "tek", "cift", "kondenser", "kabin", "dolu", "bos",
  ]);
  return text
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

function extractModelTokens(text) {
  return importantTokens(text)
    .filter((token) => /\d/.test(token) && /[a-z]/.test(token) || token.length >= 4 && /\d/.test(token))
    .map((token) => token.replace(/^0+/, "") || token);
}

function detectBrand(text) {
  const brands = [
    "dcb", "embraco", "frigocraft", "weiguang", "moowex", "danfoss", "sanhua", "sarbuz",
    "damla", "yelken", "alkatherm", "bekatech", "intercool", "briscool", "gvn", "dunan",
    "refnox", "tcold", "full", "gauge",
  ];
  return brands.find((brand) => text.includes(brand)) || "";
}

function mergePriceSourceNote(existingNote, row) {
  const base = String(existingNote || "")
    .split(/\r?\n/)
    .filter((line) => !line.includes(`Fiyat kaynagi: ${SOURCE_NAME}`))
    .join("\n")
    .trim();
  const source = `Fiyat kaynagi: ${SOURCE_NAME} SIRA ${row.no}; liste ${formatEuro(row.listPrice)}, net ${formatEuro(row.netPrice)}.`;
  return [base, source].filter(Boolean).join("\n");
}

function parseEuro(value) {
  const text = String(value || "").trim();
  if (!text || text === "-") {
    return 0;
  }
  return Number(text.replace(/\./g, "").replace(",", "."));
}

function formatEuro(value) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/″|”|“/g, '"')
    .replace(/İ/g, "i")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
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
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
