const {
  initDatabase,
  query,
  withTransaction,
  dbClient,
} = require("../server/db");

const SALE_PRICE_MULTIPLIER = 1.22;
const APPLY = process.argv.includes("--apply");

async function main() {
  await initDatabase();

  const rows = await query(
    `
      WITH movement_summary AS (
        SELECT
          item_id,
          SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END) AS current_stock,
          SUM(CASE WHEN type = 'entry' THEN quantity * unit_price ELSE 0 END) / NULLIF(SUM(CASE WHEN type = 'entry' THEN quantity ELSE 0 END), 0) AS average_purchase_price
        FROM movements
        GROUP BY item_id
      ),
      last_entry AS (
        SELECT item_id, unit_price
        FROM (
          SELECT
            item_id,
            unit_price,
            ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY movement_date DESC, id DESC) AS row_number
          FROM movements
          WHERE type = 'entry'
        ) ranked_entries
        WHERE row_number = 1
      )
      SELECT
        items.id,
        items.name,
        items.default_price AS "defaultPrice",
        items.list_price AS "listPrice",
        items.sale_price AS "salePrice",
        COALESCE(movement_summary.current_stock, 0) AS "currentStock",
        COALESCE(last_entry.unit_price, 0) AS "lastPurchasePrice",
        COALESCE(movement_summary.average_purchase_price, 0) AS "averagePurchasePrice"
      FROM items
      LEFT JOIN movement_summary ON movement_summary.item_id = items.id
      LEFT JOIN last_entry ON last_entry.item_id = items.id
      WHERE COALESCE(items.is_active, TRUE) = ?
        AND COALESCE(movement_summary.current_stock, 0) > 0
        AND COALESCE(items.sale_price, 0) <= 0
        AND COALESCE(items.list_price, 0) <= 0
    `,
    [dbClient === "postgres" ? true : 1]
  );

  const candidates = rows
    .map((row) => {
      const basePurchasePrice = pickPositive(
        Number(row.defaultPrice || 0),
        Number(row.lastPurchasePrice || 0),
        Number(row.averagePurchasePrice || 0)
      );
      if (!(basePurchasePrice > 0)) {
        return null;
      }

      return {
        id: Number(row.id),
        name: row.name,
        defaultPrice: Number(row.defaultPrice || 0),
        nextDefaultPrice: Number((row.defaultPrice > 0 ? row.defaultPrice : basePurchasePrice).toFixed(2)),
        nextSalePrice: Number((basePurchasePrice * SALE_PRICE_MULTIPLIER).toFixed(2)),
        currentStock: Number(row.currentStock || 0),
        lastPurchasePrice: Number(row.lastPurchasePrice || 0),
        averagePurchasePrice: Number(row.averagePurchasePrice || 0),
      };
    })
    .filter(Boolean);

  if (APPLY && candidates.length) {
    await withTransaction(async (tx) => {
      for (const item of candidates) {
        await tx.execute(
          `
            UPDATE items
            SET default_price = ?, sale_price = ?
            WHERE id = ?
          `,
          [item.nextDefaultPrice, item.nextSalePrice, item.id]
        );
      }
    });
  }

  console.log(JSON.stringify({
    mode: APPLY ? "applied" : "dry-run",
    dbClient,
    multiplier: SALE_PRICE_MULTIPLIER,
    totalCandidates: candidates.length,
    samples: candidates.slice(0, 20),
  }, null, 2));
}

function pickPositive(...values) {
  for (const value of values) {
    if (Number(value) > 0) {
      return Number(value);
    }
  }
  return 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
