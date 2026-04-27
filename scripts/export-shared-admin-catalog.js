const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, query } = require("../server/db");
const { getSupplierCatalogRefsForItem } = require("../server/supplier-catalog");

const TARGET_PATHS = [
  path.join(process.cwd(), "public", "shared-admin-catalog.json"),
  path.join(process.cwd(), "admin-tools", "coldroompro-source", "public", "shared-admin-catalog.json"),
  path.join(process.cwd(), "admin-tools", "coldroompro", "shared-admin-catalog.json"),
  path.join(process.cwd(), "admin-tools", "soguk-oda-cizim", "shared-admin-catalog.json"),
];

async function main() {
  await initDatabase();
  const items = await query(
    `
      SELECT
        id,
        name,
        brand,
        category,
        unit,
        product_code AS "productCode",
        barcode,
        sale_price AS "salePrice",
        list_price AS "listPrice",
        default_price AS "defaultPrice",
        notes,
        is_active AS "isActive"
      FROM items
      WHERE is_active = TRUE
    `,
    []
  );

  const output = {
    generatedAt: new Date().toISOString(),
    items: items.map((item) => ({
      id: Number(item.id || 0),
      name: String(item.name || ""),
      brand: String(item.brand || ""),
      category: String(item.category || ""),
      unit: String(item.unit || ""),
      productCode: String(item.productCode || ""),
      barcode: String(item.barcode || ""),
      visiblePrice: visiblePrice(item),
      codes: Array.from(collectCodes(item)),
      supplierCodes: Array.from(collectSupplierCodes(item)),
      supplierCatalogRefs: getSupplierCatalogRefsForItem(item.id).slice(0, 8),
    })),
    pricingProfiles: {
      sogukOdaV3: buildSogukOdaV3Pricing(items),
    },
  };

  for (const targetPath of TARGET_PATHS) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(output, null, 2));
  }

  console.log(JSON.stringify({
    generatedAt: output.generatedAt,
    itemCount: output.items.length,
    targetPaths: TARGET_PATHS,
    pricingProfiles: output.pricingProfiles,
  }, null, 2));
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

function visiblePrice(item) {
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

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
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

function collectCodes(item) {
  const values = new Set();
  [item.productCode, item.barcode].forEach((value) => {
    const token = normalizeToken(value);
    if (token) {
      values.add(token);
    }
  });
  extractNoteCodes(item.notes).forEach((value) => values.add(value));
  return values;
}

function collectSupplierCodes(item) {
  const values = new Set();
  getSupplierCatalogRefsForItem(item.id).forEach((ref) => {
    const token = normalizeToken(ref.code);
    if (token) {
      values.add(token);
    }
  });
  return values;
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

function findPriceByName(items, patterns, fallback) {
  for (const pattern of patterns) {
    const normalizedPattern = normalizeName(pattern);
    const match = items.find((item) => normalizeName(item.name).includes(normalizedPattern));
    if (match) {
      const price = visiblePrice(match);
      if (price > 0) {
        return price;
      }
    }
  }
  return fallback;
}

function buildSogukOdaV3Pricing(items) {
  const panelM2 = {
    60: 6.5,
    80: findPriceByName(items, ["ppwp-80", "80mm poly poly kilitli"], 28.12),
    100: findPriceByName(items, ["ppwp-100", "100mm poly poly kilitli"], 34.44),
    120: findPriceByName(items, ["ppwp-120", "120mm"], 37.95),
    150: findPriceByName(items, ["ppwp-150", "150mm poly poly kilitli"], 43.54),
    200: 52,
  };

  const doorUnit = {
    60: 320,
    80: 335,
    100: findPriceByName(items, ["menteseli soguk hava depo kapisi (100mm poly poly)", "soguk hava depo kapisi"], 335.5),
    120: 410.74,
    150: 420,
    200: 480,
  };

  return { panelM2, doorUnit };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
