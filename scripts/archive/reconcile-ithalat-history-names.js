const { Client } = require("pg");

const DRY_RUN = process.env.DRY_RUN === "1";
const HISTORY_NOTE_MARKER = "Ithalat klasoru gecmis kaydi";
const MATCH_NOTE_MARKER = "eslesen_aktif_kart";

const MAPPINGS = [
  { historyId: 23617, activeId: 565 },
  { historyId: 23619, activeId: 5057 },
  { historyId: 23620, activeId: 5053 },
  { historyId: 23621, activeId: 5061 },
  { historyId: 23622, activeId: 10845 },
  { historyId: 23623, activeId: 5122 },
  { historyId: 23626, activeId: 5057 },
  { historyId: 23627, activeId: 5053 },
  { historyId: 23628, activeId: 5061 },
  { historyId: 23629, activeId: 5122 },
  { historyId: 23655, activeId: 22394 },
  { historyId: 23656, activeId: 22484 },
  { historyId: 23671, activeId: 9527 },
  { historyId: 23672, activeId: 9525 },
  { historyId: 23674, activeId: 8211 },
  { historyId: 23677, activeId: 114 },
  { historyId: 23685, activeId: 5114 },
  { historyId: 23686, activeId: 5122 },
  { historyId: 23687, activeId: 23141 },
  { historyId: 23703, activeId: 22484 },
  { historyId: 23708, activeId: 23147 },
  { historyId: 23709, activeId: 23146 },
  { historyId: 23710, activeId: 23145 },
  { historyId: 23711, activeId: 23144 },
  { historyId: 23657, activeId: 881 },
  { historyId: 23658, activeId: 97 },
  { historyId: 23699, activeId: 881 },
  { historyId: 23700, activeId: 97 },
  { historyId: 23701, activeId: 23139 },
  { historyId: 23680, activeId: 23159 },
  { historyId: 23681, activeId: 23158 },
  { historyId: 23682, activeId: 23157 },
  { historyId: 23683, activeId: 11387 },
  { historyId: 23684, activeId: 23156 },
  { historyId: 23608, activeId: 22485 },
  { historyId: 23609, activeId: 22487 },
  { historyId: 23610, activeId: 22486 },
];

function formatMoney(value) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

async function getStockSummary(client) {
  const result = await client.query(`
    WITH movement_summary AS (
      SELECT
        item_id,
        SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END) AS current_stock,
        AVG(NULLIF(unit_price, 0)) FILTER (WHERE type = 'entry' AND unit_price > 0) AS average_purchase_price
      FROM movements
      GROUP BY item_id
    ),
    last_entry AS (
      SELECT DISTINCT ON (item_id)
        item_id,
        unit_price
      FROM movements
      WHERE type = 'entry'
      ORDER BY item_id, movement_date DESC, id DESC
    )
    SELECT
      COALESCE(SUM(COALESCE(movement_summary.current_stock, 0) * COALESCE(NULLIF(last_entry.unit_price, 0), items.default_price, 0)), 0) AS stock_cost_value,
      COALESCE(SUM(
        COALESCE(movement_summary.current_stock, 0) * COALESCE(
          NULLIF(items.sale_price, 0),
          NULLIF(items.list_price, 0),
          ROUND(COALESCE(NULLIF(last_entry.unit_price, 0), movement_summary.average_purchase_price, items.default_price, 0) * 1.2, 2),
          0
        )
      ), 0) AS stock_sale_value,
      COALESCE(SUM(CASE WHEN COALESCE(movement_summary.current_stock, 0) > 0 THEN 1 ELSE 0 END), 0) AS stocked_item_count
    FROM items
    LEFT JOIN movement_summary ON movement_summary.item_id = items.id
    LEFT JOIN last_entry ON last_entry.item_id = items.id
    WHERE COALESCE(items.is_active, TRUE) = TRUE
  `);
  const row = result.rows[0] || {};
  return {
    stockCostValue: Number(row.stock_cost_value || 0),
    stockSaleValue: Number(row.stock_sale_value || 0),
    stockedItemCount: Number(row.stocked_item_count || 0),
  };
}

function buildMatchNote(activeItem) {
  const codePart = activeItem.product_code ? `| kod:${activeItem.product_code}` : "";
  return `${MATCH_NOTE_MARKER}| id:${activeItem.id}${codePart}| ad:${activeItem.name}`;
}

function mergeNotes(existingNotes, activeItem) {
  const chunks = String(existingNotes || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith(MATCH_NOTE_MARKER) && !part.startsWith("id:") && !part.startsWith("kod:") && !part.startsWith("ad:"));
  chunks.push(buildMatchNote(activeItem));
  return chunks.join(" | ");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL tanimli degil.");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  const before = await getStockSummary(client);
  const report = [];

  try {
    await client.query("BEGIN");

    for (const mapping of MAPPINGS) {
      const historyRes = await client.query(
        `SELECT id, name, brand, category, unit, product_code, notes
         FROM items
         WHERE id = $1
           AND COALESCE(is_active, TRUE) = FALSE
           AND notes LIKE $2`,
        [mapping.historyId, `%${HISTORY_NOTE_MARKER}%`]
      );
      const activeRes = await client.query(
        `SELECT id, name, brand, category, unit, product_code
         FROM items
         WHERE id = $1
           AND COALESCE(is_active, TRUE) = TRUE`,
        [mapping.activeId]
      );

      const historyItem = historyRes.rows[0];
      const activeItem = activeRes.rows[0];
      if (!historyItem || !activeItem) {
        report.push({
          historyId: mapping.historyId,
          activeId: mapping.activeId,
          status: "skipped_missing",
        });
        continue;
      }

      const nextNotes = mergeNotes(historyItem.notes, activeItem);
      const changed = (
        historyItem.name !== activeItem.name
        || (historyItem.brand || "") !== (activeItem.brand || "")
        || (historyItem.category || "") !== (activeItem.category || "")
        || (historyItem.unit || "") !== (activeItem.unit || "")
        || (historyItem.product_code || "") !== (activeItem.product_code || "")
        || (historyItem.notes || "") !== nextNotes
      );

      if (changed) {
        await client.query(
          `UPDATE items
           SET name = $1,
               brand = $2,
               category = $3,
               unit = $4,
               product_code = $5,
               notes = $6
           WHERE id = $7`,
          [
            activeItem.name,
            activeItem.brand || "",
            activeItem.category || "",
            activeItem.unit || historyItem.unit || "adet",
            activeItem.product_code || "",
            nextNotes,
            historyItem.id,
          ]
        );
      }

      report.push({
        historyId: historyItem.id,
        beforeName: historyItem.name,
        afterName: activeItem.name,
        beforeCode: historyItem.product_code || "",
        afterCode: activeItem.product_code || "",
        status: changed ? "updated" : "already_ok",
      });
    }

    const after = await getStockSummary(client);
    if (DRY_RUN) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }

    const updated = report.filter((entry) => entry.status === "updated");
    const alreadyOk = report.filter((entry) => entry.status === "already_ok");
    const skipped = report.filter((entry) => entry.status === "skipped_missing");

    console.log(JSON.stringify({
      dryRun: DRY_RUN,
      before: {
        stockCostValue: formatMoney(before.stockCostValue),
        stockSaleValue: formatMoney(before.stockSaleValue),
        stockedItemCount: before.stockedItemCount,
      },
      after: {
        stockCostValue: formatMoney(after.stockCostValue),
        stockSaleValue: formatMoney(after.stockSaleValue),
        stockedItemCount: after.stockedItemCount,
      },
      delta: {
        stockCostValue: formatMoney(after.stockCostValue - before.stockCostValue),
        stockSaleValue: formatMoney(after.stockSaleValue - before.stockSaleValue),
        stockedItemCount: after.stockedItemCount - before.stockedItemCount,
      },
      summary: {
        totalMappings: MAPPINGS.length,
        updated: updated.length,
        alreadyOk: alreadyOk.length,
        skipped: skipped.length,
      },
      updated,
      alreadyOk,
      skipped,
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
