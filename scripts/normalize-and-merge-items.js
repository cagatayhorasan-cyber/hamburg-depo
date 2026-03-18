const { db } = require("../server/db");

const items = db.prepare("SELECT * FROM items ORDER BY id ASC").all();
const updateItemStmt = db.prepare(`
  UPDATE items
  SET name = ?, brand = ?, category = ?, notes = ?, default_price = ?, sale_price = ?
  WHERE id = ?
`);
const updateMovementsStmt = db.prepare("UPDATE movements SET item_id = ? WHERE item_id = ?");
const deleteItemStmt = db.prepare("DELETE FROM items WHERE id = ?");

let renamed = 0;
let merged = 0;

db.exec("BEGIN");
try {
  const canonicalMap = new Map();

  for (const row of items) {
    const normalized = normalizeRow(row);
    const key = canonicalKey(normalized);

    updateItemStmt.run(
      normalized.name,
      normalized.brand,
      normalized.category,
      normalized.notes,
      normalized.defaultPrice,
      normalized.salePrice,
      row.id
    );

    if (
      normalized.name !== row.name ||
      normalized.brand !== (row.brand || "") ||
      normalized.category !== row.category ||
      normalized.notes !== (row.notes || "") ||
      normalized.defaultPrice !== Number(row.default_price || 0) ||
      normalized.salePrice !== Number(row.sale_price || 0)
    ) {
      renamed += 1;
    }

    const existing = canonicalMap.get(key);
    if (!existing) {
      canonicalMap.set(key, { id: row.id, normalized });
      continue;
    }

    const keeper = chooseKeeper(existing.id, row.id);
    const loser = keeper === existing.id ? row.id : existing.id;
    const keeperRow = keeper === existing.id ? existing.normalized : normalized;
    const loserRow = keeper === existing.id ? normalized : existing.normalized;
    const mergedRow = mergeRows(keeperRow, loserRow);

    updateItemStmt.run(
      mergedRow.name,
      mergedRow.brand,
      mergedRow.category,
      mergedRow.notes,
      mergedRow.defaultPrice,
      mergedRow.salePrice,
      keeper
    );

    updateMovementsStmt.run(keeper, loser);
    deleteItemStmt.run(loser);
    canonicalMap.set(key, { id: keeper, normalized: mergedRow });
    merged += 1;
  }

  db.exec("COMMIT");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

console.log(JSON.stringify({ renamed, merged }, null, 2));

function normalizeRow(row) {
  const name = cleanName(row.name);
  const brand = cleanBrand(row.brand || "", name, row.notes || "");
  const category = cleanCategory(row.category || "");
  const notes = cleanNotes(row.notes || "");
  const defaultPrice = Number(row.default_price || 0);
  const salePrice = Number(row.sale_price || 0) || deriveSalePrice(defaultPrice);
  return { name, brand, category, notes, defaultPrice, salePrice };
}

function cleanName(value) {
  let name = String(value || "")
    .replace(/"{2,}/g, '"')
    .replace(/^"+|"+$/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  name = name.replace(/^HVAC\s+\(([^)]+)\)$/i, "L SUPPORTS $1");
  name = name.replace(/^"L"\s+/i, "L ");
  name = name.replace(/L"{1,}\s*SUPPORTS/gi, "L SUPPORTS");
  name = name.replace(/"\s*SUPPORTS/gi, " SUPPORTS");
  name = name.replace(/^L SUPPORTS\s+/i, "L SUPPORTS ");
  if (/SUPPORTS/i.test(name)) {
    name = name.replace(/"/g, "");
  }
  name = name.replace(/\s+-\s+/g, " - ");
  return name;
}

function cleanBrand(brand, name, notes) {
  let value = String(brand || "").trim();
  if (!value) {
    const supplierMatch = String(notes).match(/Gelen fatura tedarikcisi:\s*([^|]+)/i);
    if (supplierMatch) {
      value = supplierMatch[1].trim();
    } else {
      const firstWord = String(name).split(" ")[0];
      if (/^(Embraco|FrigoCraft|Frigocraft|Danfoss|Bitzer|Bock|Hisense|Tecumseh|ZINGFA|Gunay|Günay)$/i.test(firstWord)) {
        value = firstWord;
      }
    }
  }
  return value.replace(/Frigocraft/i, "FrigoCraft").replace(/Gunay/i, "Gunay");
}

function cleanCategory(category) {
  const value = String(category || "").trim();
  if (!value) {
    return "Genel";
  }
  return value
    .replace("Kompresörler", "Kompresor")
    .replace("Soğutma Aletleri", "Sogutma Ekipmani")
    .replace("Klima Sistemleri (HVAC)", "Klima Sistemleri")
    .replace("Soğutucu", "Sogutucu");
}

function cleanNotes(notes) {
  return String(notes || "").replace(/\s+/g, " ").trim();
}

function deriveSalePrice(defaultPrice) {
  if (!defaultPrice) {
    return 0;
  }
  return Number((defaultPrice * 1.22).toFixed(2));
}

function canonicalKey(row) {
  return `${row.brand}|${row.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function chooseKeeper(a, b) {
  const aHasMovement = db.prepare("SELECT COUNT(*) AS count FROM movements WHERE item_id = ?").get(a).count > 0;
  const bHasMovement = db.prepare("SELECT COUNT(*) AS count FROM movements WHERE item_id = ?").get(b).count > 0;
  if (aHasMovement && !bHasMovement) {
    return a;
  }
  if (bHasMovement && !aHasMovement) {
    return b;
  }
  return Math.min(a, b);
}

function mergeRows(base, extra) {
  return {
    name: base.name.length >= extra.name.length ? base.name : extra.name,
    brand: base.brand || extra.brand,
    category: base.category !== "Genel" ? base.category : extra.category,
    notes: [base.notes, extra.notes].filter(Boolean).join(" | ").slice(0, 1000),
    defaultPrice: Math.max(Number(base.defaultPrice || 0), Number(extra.defaultPrice || 0)),
    salePrice: Math.max(Number(base.salePrice || 0), Number(extra.salePrice || 0)),
  };
}
