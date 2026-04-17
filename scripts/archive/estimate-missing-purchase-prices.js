const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, query, execute } = require("../server/db");

async function main() {
  await initDatabase();

  const stockSql = `
    COALESCE((
      SELECT SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END)
      FROM movements
      WHERE item_id = items.id
    ), 0)
  `;

  const rows = await query(`
    SELECT
      id,
      name,
      brand,
      category,
      sale_price AS "salePrice",
      default_price AS "defaultPrice",
      notes,
      ${stockSql} AS stock
    FROM items
    WHERE COALESCE(is_active, TRUE) = TRUE
      AND ${stockSql} > 0
      AND COALESCE(default_price, 0) <= 0
      AND COALESCE(sale_price, 0) > 0
    ORDER BY id
  `);

  const updates = [];
  for (const row of rows) {
    const salePrice = Number(row.salePrice || 0);
    const ratio = estimateCostRatio(row);
    const estimatedCost = roundMoney(salePrice * ratio);
    const noteLine = `Tahmini alis maliyeti: satis fiyatinin %${Math.round(ratio * 100)} katsayisi ile ${estimatedCost.toFixed(2)} EUR hesaplandi.`;
    const nextNotes = upsertNoteLine(row.notes, "Tahmini alis maliyeti:", noteLine);

    await execute(
      "UPDATE items SET default_price = ?, notes = ? WHERE id = ?",
      [estimatedCost, nextNotes, Number(row.id)]
    );
    await execute(
      "UPDATE movements SET unit_price = ? WHERE item_id = ? AND type = 'entry' AND COALESCE(unit_price, 0) <= 0",
      [estimatedCost, Number(row.id)]
    );

    updates.push({
      id: Number(row.id),
      name: row.name,
      brand: row.brand,
      category: row.category,
      stock: Number(row.stock || 0),
      salePrice,
      estimatedCost,
      ratio,
      estimatedStockCost: roundMoney(Number(row.stock || 0) * estimatedCost),
    });
  }

  const summary = await query(`
    SELECT
      ROUND(SUM(GREATEST(${stockSql}, 0) * COALESCE(default_price, 0))::numeric, 2) AS "stockCostValue",
      ROUND(SUM(GREATEST(${stockSql}, 0) * COALESCE(sale_price, 0))::numeric, 2) AS "stockSaleValue",
      SUM(CASE WHEN ${stockSql} > 0 AND COALESCE(default_price, 0) <= 0 THEN 1 ELSE 0 END)::int AS "stockedMissingCost"
    FROM items
    WHERE COALESCE(is_active, TRUE) = TRUE
  `);

  console.log(JSON.stringify({ updated: updates.length, updates, summary: summary[0] }, null, 2));
}

function estimateCostRatio(row) {
  const text = normalize([row.name, row.brand, row.category].filter(Boolean).join(" "));

  if (text.includes("vrf") || text.includes("systemair") || text.includes("dis unite") || text.includes("ic unite")) {
    return 0.8;
  }
  if (text.includes("kondenser") || text.includes("embraco")) {
    return 0.78;
  }
  if (text.includes("fan motor")) {
    return 0.65;
  }
  if (text.includes("kontrol") || text.includes("pano") || text.includes("dcb")) {
    return 0.65;
  }
  if (text.includes("drenaj pompa")) {
    return 0.68;
  }
  if (text.includes("izolasyon")) {
    return 0.7;
  }
  if (text.includes("genlesme") || text.includes("valfi")) {
    return 0.7;
  }
  if (text.includes("filtre") || text.includes("silikon") || text.includes("kopuk") || text.includes("sarf")) {
    return 0.6;
  }

  return 0.7;
}

function upsertNoteLine(notes, prefix, line) {
  const current = String(notes || "").trim();
  if (!current) {
    return line;
  }
  if (current.includes(prefix)) {
    return current.replace(new RegExp(`${escapeRegExp(prefix)}.*`, "m"), line);
  }
  return `${current}\n${line}`;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalize(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
