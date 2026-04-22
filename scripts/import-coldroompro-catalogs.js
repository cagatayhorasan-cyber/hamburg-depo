const fs = require("fs");
const path = require("path");
const vm = require("vm");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, query, withTransaction, dbClient } = require("../server/db");

const DEFAULT_SOURCE_DIR = path.join(process.cwd(), "admin-tools", "coldroompro-source", "src");
const SOURCE_DIR = process.env.COLDROOMPRO_SRC_DIR || DEFAULT_SOURCE_DIR;
const MATERIAL_PATH = path.join(SOURCE_DIR, "materialCatalog.js");
const PRODUCT_PATH = path.join(SOURCE_DIR, "productCatalog.js");
const SOURCE_LABEL = "ColdRoomPro";

const APPLY = process.argv.includes("--apply");
const OVERWRITE_LIST = process.argv.includes("--overwrite-list");
const MAX_NOTE_LENGTH = 1200;

const OPTION_GROUP_LABELS = {
  floor: "Soğuk Oda Zemin Opsiyonları",
  thermostat: "Kontrol ve Termostat Opsiyonları",
  monitoring: "Uzaktan İzleme Opsiyonları",
  lighting: "Aydınlatma Opsiyonları",
  safety: "Güvenlik Opsiyonları",
  extras: "Soğuk Oda Ekstraları",
};

const UNIT_MAP = {
  stk: "adet",
  rolle: "rulo",
  flasche: "tüp",
  set: "set",
  m: "m",
  m2: "m2",
};

async function main() {
  const catalog = loadCatalogs();
  const candidates = buildCandidates(catalog);

  await initDatabase();

  const report = await withTransaction(async (tx) => {
    const nextCodeState = { value: await getNextDrcCode(tx) };
    const existingIndex = buildExistingIndex(await loadExistingItems(tx));
    const result = emptyReport(candidates.length);

    for (const candidate of candidates) {
      const existing = findExisting(existingIndex, candidate);
      if (existing) {
        const update = buildUpdate(existing, candidate);
        recordUpdate(result, existing, candidate, update);
        if (APPLY && update.hasChanges) {
          await updateExisting(tx, existing, candidate, update);
        }
      } else {
        const insertCandidate = {
          ...candidate,
          barcode: candidate.barcode || formatDrcCode(nextCodeState.value),
        };
        nextCodeState.value += 1;
        recordInsert(result, insertCandidate);
        if (APPLY) {
          await insertItem(tx, insertCandidate);
        }
      }
    }

    if (!APPLY) {
      throw Object.assign(new Error("dry-run rollback"), { dryRunRollback: true, report: result });
    }

    return result;
  }).catch((error) => {
    if (error.dryRunRollback) {
      return error.report;
    }
    throw error;
  });

  report.mode = APPLY ? "applied" : "dry-run";
  report.dbClient = dbClient;
  report.sourceDir = SOURCE_DIR;
  printReport(report);
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
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadCatalogs() {
  if (!fs.existsSync(MATERIAL_PATH)) {
    throw new Error(`Material catalog bulunamadi: ${MATERIAL_PATH}`);
  }
  if (!fs.existsSync(PRODUCT_PATH)) {
    throw new Error(`Product catalog bulunamadi: ${PRODUCT_PATH}`);
  }

  return {
    material: loadModuleExports(MATERIAL_PATH),
    product: loadModuleExports(PRODUCT_PATH),
  };
}

function loadModuleExports(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const transformed = source.replace(/\bexport\s+const\s+([A-Za-z0-9_]+)\s*=/g, "exports.$1 =");
  const sandbox = { exports: {} };
  vm.runInNewContext(transformed, sandbox, { filename: filePath, timeout: 5000 });
  return sandbox.exports;
}

function buildCandidates(catalog) {
  const candidates = [];
  candidates.push(...materialCandidates(catalog.material));
  candidates.push(...pipeCandidates(catalog.material.PIPE_CATALOG || []));
  candidates.push(...insulationCandidates(catalog.material, catalog.material.INSULATION_CATALOG || []));
  candidates.push(...systemCandidates(catalog.product.CATALOG || []));
  candidates.push(...optionCandidates(catalog.product.OPTIONS_CATALOG || {}));
  return dedupeCandidates(candidates);
}

function materialCandidates(material) {
  const categories = material.MATERIAL_CATEGORIES || {};
  return (material.MATERIALS || [])
    .map((item) => {
      const specs = item.specs || {};
      const sourceCode = cleanCode(item.code || specs.repa_de_code || specs.repa_it_code || specs.bom || "");
      const category = categories[item.category]?.tr || item.category || "Malzemeler";
      const name = improveMaterialName(item.name, item.brand, specs);
      return {
        name,
        brand: cleanText(item.brand || specs.brand || ""),
        category,
        unit: "adet",
        sourceCode,
        sourcePriority: 1,
        activateExisting: false,
        price: money(item.price),
        note: buildNote("materialCatalog", sourceCode, [
          specs.subcategory,
          specs.compressor_model ? `Model: ${specs.compressor_model}` : "",
          specs.hpower ? `HP: ${specs.hpower}` : "",
          specs.refrigerant ? `Gaz: ${specs.refrigerant}` : "",
          specs.power_supply ? `Besleme: ${specs.power_supply}` : "",
          specs.cooling_capacity_watt ? `Kapasite: ${specs.cooling_capacity_watt} W` : "",
          specs.technical_description,
          specs.raw_data,
        ]),
      };
    })
    .filter(isValidCandidate);
}

function pipeCandidates(pipes) {
  return pipes
    .map((pipe) => {
      const safeSize = String(pipe.size || "").replace(/"/g, "in");
      return {
        name: `Bakır Boru ${pipe.size} (${pipe.usage?.tr || "Soğutma hattı"})`,
        brand: "",
        category: "Bakır Borular & Hatlar",
        unit: "m",
        sourceCode: `CP-PIPE-${normalizeCode(safeSize)}`,
        sourcePriority: 2,
        activateExisting: true,
        price: money(pipe.pricePerMeter),
        note: buildNote("PIPE_CATALOG", `CP-PIPE-${normalizeCode(safeSize)}`, [
          `Dış çap: ${pipe.outerDiameter} mm`,
          `Et kalınlığı: ${pipe.wallThickness} mm`,
          pipe.usage?.de ? `DE: ${pipe.usage.de}` : "",
        ]),
      };
    })
    .filter(isValidCandidate);
}

function insulationCandidates(material, rows) {
  const categories = material.MATERIAL_CATEGORIES || {};
  return rows
    .map((item) => ({
      name: cleanText(item.tr || item.de || item.id),
      brand: inferBrand(item.tr || item.de || ""),
      category: categories[item.category]?.tr || item.category || "Aksesuarlar & Montaj",
      unit: UNIT_MAP[item.unit] || item.unit || "adet",
      sourceCode: `CP-INS-${normalizeCode(item.id)}`,
      sourcePriority: 2,
      activateExisting: true,
      price: money(item.price),
      note: buildNote("INSULATION_CATALOG", `CP-INS-${normalizeCode(item.id)}`, [item.de ? `DE: ${item.de}` : ""]),
    }))
    .filter(isValidCandidate);
}

function systemCandidates(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const typeText = row.type === "L" ? "Düşük sıcaklık" : "Normal sıcaklık";
    addCandidate(byKey, {
      name: cleanText(row.outdoor),
      brand: "FrigoCraft",
      category: "Endüstriyel Split Dış Ünite",
      unit: "adet",
      sourceCode: cleanCode(row.code),
      sourcePriority: 5,
      activateExisting: true,
      price: money(row.outdoorPrice),
      note: buildNote("productCatalog", row.code, [
        `Kompresör: ${row.brand} ${row.compressor}`,
        `Tip: ${typeText}`,
        row.hp ? `HP: ${row.hp}` : "",
        row.capacity ? `Kapasite: ${row.capacity} W` : "",
      ]),
    });
    addCandidate(byKey, {
      name: cleanText(row.indoor),
      brand: "FrigoCraft",
      category: "Endüstriyel Split İç Ünite",
      unit: "adet",
      sourceCode: cleanCode(row.evapCode),
      sourcePriority: 5,
      activateExisting: true,
      price: money(row.indoorPrice),
      note: buildNote("productCatalog", row.evapCode, [
        `Eşleşen dış ünite: ${row.outdoor}`,
        row.evapQty ? `Set adedi: ${row.evapQty}` : "",
        row.evapCapacity ? `Evaporatör kapasite: ${row.evapCapacity} W` : "",
      ]),
    });
  }
  return Array.from(byKey.values()).filter(isValidCandidate);
}

function optionCandidates(options) {
  const candidates = [];
  for (const [group, rows] of Object.entries(options)) {
    for (const item of rows || []) {
      const price = money(item.pricePerM2 || item.price);
      if (!price) continue;
      candidates.push({
        name: cleanText(item.tr || item.de || item.id),
        brand: "",
        category: OPTION_GROUP_LABELS[group] || "Soğuk Oda Opsiyonları",
        unit: item.pricePerM2 ? "m2" : "adet",
        sourceCode: `CP-OPT-${normalizeCode(item.id)}`,
        sourcePriority: 5,
        activateExisting: true,
        price,
        note: buildNote("OPTIONS_CATALOG", `CP-OPT-${normalizeCode(item.id)}`, [
          item.de ? `DE: ${item.de}` : "",
          item.pricePerM2 ? "Fiyat m2 bazlıdır." : "",
        ]),
      });
    }
  }
  return candidates.filter(isValidCandidate);
}

function addCandidate(map, candidate) {
  if (!isValidCandidate(candidate)) return;
  const key = candidate.sourceCode ? `code:${normalizeCode(candidate.sourceCode)}` : `name:${normalize(candidate.name)}|${normalize(candidate.brand)}`;
  const existing = map.get(key);
  if (!existing || shouldReplaceCandidate(existing, candidate)) {
    map.set(key, candidate);
  }
}

function shouldReplaceCandidate(existing, candidate) {
  const oldPriority = Number(existing.sourcePriority || 0);
  const newPriority = Number(candidate.sourcePriority || 0);
  if (newPriority !== oldPriority) return newPriority > oldPriority;
  return candidate.price > existing.price;
}

function dedupeCandidates(candidates) {
  const map = new Map();
  for (const candidate of candidates) {
    addCandidate(map, candidate);
  }
  return Array.from(map.values()).sort((a, b) => {
    const categoryCompare = a.category.localeCompare(b.category, "tr");
    if (categoryCompare) return categoryCompare;
    return a.name.localeCompare(b.name, "tr");
  });
}

function isValidCandidate(candidate) {
  return Boolean(candidate?.name && candidate.name.length >= 2 && candidate.price > 0);
}

async function loadExistingItems(tx) {
  return tx.query(
    `
      SELECT id, name, brand, category, unit, product_code, barcode, notes, default_price, list_price, sale_price, is_active
      FROM items
      ORDER BY COALESCE(is_active, TRUE) DESC, id ASC
    `
  );
}

function buildExistingIndex(rows) {
  const byCode = new Map();
  const byName = new Map();

  for (const row of rows) {
    for (const code of [row.product_code, row.barcode]) {
      const normalizedCode = normalizeCode(code);
      if (normalizedCode && !byCode.has(normalizedCode)) {
        byCode.set(normalizedCode, row);
      }
    }

    const normalizedName = normalize(row.name);
    if (!normalizedName) continue;
    if (!byName.has(normalizedName)) byName.set(normalizedName, []);
    byName.get(normalizedName).push(row);
  }

  return { byCode, byName };
}

function findExisting(indexes, candidate) {
  const sourceCode = normalizeCode(candidate.sourceCode);
  if (sourceCode && indexes.byCode.has(sourceCode)) {
    return indexes.byCode.get(sourceCode);
  }

  const rows = indexes.byName.get(normalize(candidate.name)) || [];
  if (!rows.length) return null;

  const normalizedBrand = normalize(candidate.brand);
  const exactBrand = rows.find((row) => normalize(row.brand) === normalizedBrand);
  return exactBrand || rows[0];
}

function buildUpdate(existing, candidate) {
  const salePrice = money(existing.sale_price);
  const listPrice = money(existing.list_price);
  const fields = {
    name: candidate.name,
    brand: candidate.brand || cleanText(existing.brand || ""),
    category: candidate.category,
    unit: candidate.unit,
    product_code: chooseProductCode(existing.product_code, candidate.sourceCode),
    notes: mergeNote(existing.notes, candidate.note),
    sale_price: candidate.price,
    list_price: OVERWRITE_LIST || !listPrice ? candidate.price : listPrice,
    is_active: candidate.activateExisting ? true : normalizeBoolean(existing.is_active),
  };

  const changes = {};
  for (const [key, value] of Object.entries(fields)) {
    const oldValue = key.includes("price") ? money(existing[key]) : cleanText(existing[key] || "");
    const newValue = key.includes("price") ? money(value) : cleanText(value || "");
    if (oldValue !== newValue) changes[key] = { from: oldValue, to: newValue };
  }

  if (salePrice === candidate.price && listPrice > 0 && !OVERWRITE_LIST) {
    delete changes.list_price;
  }

  return { fields, changes, hasChanges: Object.keys(changes).length > 0 };
}

async function updateExisting(tx, existing, candidate, update) {
  await tx.execute(
    `
      UPDATE items
      SET name = ?, brand = ?, category = ?, unit = ?, product_code = ?, notes = ?,
          sale_price = ?, list_price = ?, is_active = ?
      WHERE id = ?
    `,
    [
      update.fields.name,
      update.fields.brand,
      update.fields.category,
      update.fields.unit,
      update.fields.product_code,
      update.fields.notes,
      update.fields.sale_price,
      update.fields.list_price,
      dbClient === "postgres" ? update.fields.is_active : (update.fields.is_active ? 1 : 0),
      Number(existing.id),
    ]
  );
}

async function insertItem(tx, candidate) {
  await tx.execute(
    `
      INSERT INTO items (
        name, brand, category, unit, min_stock, product_code, barcode, notes,
        default_price, list_price, sale_price, is_active
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)
    `,
    [
      candidate.name,
      candidate.brand,
      candidate.category,
      candidate.unit,
      candidate.sourceCode,
      candidate.barcode,
      candidate.note,
      candidate.price,
      candidate.price,
      dbClient === "postgres" ? true : 1,
    ]
  );
}

async function getNextDrcCode(tx) {
  const rows = await tx.query(
    `
      SELECT barcode
      FROM items
      WHERE barcode LIKE 'DRC-%'
      ORDER BY barcode DESC
      LIMIT 1
    `
  );
  const last = rows[0]?.barcode || "DRC-00000";
  return Number(String(last).split("-")[1] || 0) + 1;
}

function formatDrcCode(number) {
  return `DRC-${String(number).padStart(5, "0")}`;
}

function chooseProductCode(existingCode, sourceCode) {
  const current = cleanCode(existingCode);
  const next = cleanCode(sourceCode);
  return current || next;
}

function mergeNote(existingNote, newNote) {
  const existing = cleanText(existingNote || "");
  const next = cleanText(newNote || "");
  if (!existing) return next.slice(0, MAX_NOTE_LENGTH);
  if (!next || existing.includes(next)) return existing.slice(0, MAX_NOTE_LENGTH);
  const withoutOldColdRoom = existing
    .split(/\s*\|\s*/)
    .filter((part) => !part.includes(`${SOURCE_LABEL} kaynak`))
    .join(" | ");
  return `${withoutOldColdRoom} | ${next}`.slice(0, MAX_NOTE_LENGTH);
}

function buildNote(source, code, parts) {
  return [`${SOURCE_LABEL} kaynak: ${source}`, code ? `Tedarik kodu: ${cleanCode(code)}` : "", ...parts]
    .map(cleanText)
    .filter(Boolean)
    .join(" | ")
    .slice(0, MAX_NOTE_LENGTH);
}

function improveMaterialName(name, brand, specs) {
  const base = cleanText(name);
  const subcategory = cleanText(specs.subcategory || "");
  if (!subcategory) return base;
  const normalizedBase = normalize(base);
  const normalizedSub = normalize(subcategory);
  const brandOnly = normalize(brand) && normalizedBase === normalize(brand);
  const tooGeneric = normalizedBase.split(" ").length <= 2 && !normalizedBase.includes(normalizedSub);
  if (brandOnly || tooGeneric) {
    return cleanText(`${base} ${subcategory}`);
  }
  return base;
}

function inferBrand(name) {
  const normalized = normalize(name);
  if (normalized.startsWith("armaflex")) return "Armaflex";
  if (normalized.startsWith("danfoss")) return "Danfoss";
  if (normalized.startsWith("dixell")) return "Dixell";
  if (normalized.startsWith("carel")) return "Carel";
  return "";
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanCode(value) {
  return cleanText(value).replace(/^\[|\]$/g, "");
}

function normalizeCode(value) {
  return cleanCode(value)
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalize(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function emptyReport(totalCandidates) {
  return {
    totalCandidates,
    updates: 0,
    unchanged: 0,
    inserts: 0,
    priceChanges: 0,
    samples: { updates: [], inserts: [] },
    byCategory: {},
  };
}

function recordUpdate(report, existing, candidate, update) {
  if (update.hasChanges) {
    report.updates += 1;
    if (update.changes.sale_price || update.changes.list_price) report.priceChanges += 1;
    pushSample(report.samples.updates, {
      id: existing.id,
      name: candidate.name,
      barcode: existing.barcode,
      productCode: update.fields.product_code,
      oldSale: money(existing.sale_price),
      newSale: candidate.price,
      changes: Object.keys(update.changes),
    });
  } else {
    report.unchanged += 1;
  }
  addCategory(report, candidate.category, update.hasChanges ? "updated" : "unchanged");
}

function recordInsert(report, candidate) {
  report.inserts += 1;
  addCategory(report, candidate.category, "inserted");
  pushSample(report.samples.inserts, {
    name: candidate.name,
    brand: candidate.brand,
    category: candidate.category,
    barcode: candidate.barcode,
    productCode: candidate.sourceCode,
    sale: candidate.price,
  });
}

function addCategory(report, category, key) {
  if (!report.byCategory[category]) {
    report.byCategory[category] = { updated: 0, inserted: 0, unchanged: 0 };
  }
  report.byCategory[category][key] += 1;
}

function pushSample(list, value) {
  if (list.length < 12) list.push(value);
}

function printReport(report) {
  const sortedCategories = Object.entries(report.byCategory)
    .sort((a, b) => b[1].inserted + b[1].updated - (a[1].inserted + a[1].updated))
    .slice(0, 20)
    .map(([category, counts]) => ({ category, ...counts }));

  console.log(JSON.stringify({ ...report, byCategory: sortedCategories }, null, 2));
  if (!APPLY) {
    console.log("Dry-run tamam. Gercek guncelleme icin: node scripts/import-coldroompro-catalogs.js --apply");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
