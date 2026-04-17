const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, get, execute, withTransaction } = require("../server/db");

async function main() {
  await initDatabase();

  const correctItem = await get(
    `
      SELECT id, name, brand, category, product_code AS "productCode", barcode, default_price AS "defaultPrice", sale_price AS "salePrice", notes
      FROM items
      WHERE LOWER(name) = LOWER(?)
         OR UPPER(COALESCE(product_code, '')) = UPPER(?)
      ORDER BY id DESC
      LIMIT 1
    `,
    ["DCB31", "DCB31"]
  );

  const wrongItem = await get(
    `
      SELECT id, name, brand, category, product_code AS "productCode", barcode, default_price AS "defaultPrice", sale_price AS "salePrice", notes
      FROM items
      WHERE UPPER(COALESCE(product_code, '')) IN ('DCB 311', 'DCB311')
         OR LOWER(name) LIKE LOWER(?)
      ORDER BY id DESC
      LIMIT 1
    `,
    ["%dcb 311%"]
  );

  if (!correctItem && !wrongItem) {
    console.log(JSON.stringify({ ok: true, action: "nothing_found" }, null, 2));
    return;
  }

  await withTransaction(async (tx) => {
    if (correctItem && wrongItem && Number(correctItem.id) !== Number(wrongItem.id)) {
      await tx.execute("UPDATE movements SET item_id = ? WHERE item_id = ?", [Number(correctItem.id), Number(wrongItem.id)]);
      await tx.execute("UPDATE quote_items SET item_id = ? WHERE item_id = ?", [Number(correctItem.id), Number(wrongItem.id)]);
      await tx.execute("UPDATE order_items SET item_id = ? WHERE item_id = ?", [Number(correctItem.id), Number(wrongItem.id)]);

      const mergedNotes = mergeNotes(correctItem.notes, wrongItem.notes, "Kod duzeltildi: DCB31");
      await tx.execute(
        `
          UPDATE items
          SET brand = ?, category = ?, product_code = ?, notes = ?, default_price = ?, sale_price = ?
          WHERE id = ?
        `,
        [
          correctItem.brand || wrongItem.brand || "DRC",
          correctItem.category || wrongItem.category || "Termostat",
          "DCB31",
          mergedNotes,
          Number(correctItem.defaultPrice || wrongItem.defaultPrice || 9.8),
          Number(correctItem.salePrice || wrongItem.salePrice || 15),
          Number(correctItem.id),
        ]
      );

      await tx.execute("DELETE FROM items WHERE id = ?", [Number(wrongItem.id)]);

      console.log(
        JSON.stringify(
          {
            ok: true,
            action: "merged_into_existing",
            targetId: Number(correctItem.id),
            removedId: Number(wrongItem.id),
            productCode: "DCB31",
            defaultPrice: Number(correctItem.defaultPrice || wrongItem.defaultPrice || 9.8),
            salePrice: Number(correctItem.salePrice || wrongItem.salePrice || 15),
          },
          null,
          2
        )
      );
      return;
    }

    const target = correctItem || wrongItem;
    const mergedNotes = mergeNotes(target.notes, "Kod duzeltildi: DCB31");
    await tx.execute(
      `
        UPDATE items
        SET name = ?, brand = ?, category = ?, product_code = ?, notes = ?, default_price = ?, sale_price = ?
        WHERE id = ?
      `,
      [
        "Defrost Kontrol DCB31",
        target.brand || "DRC",
        target.category || "Termostat",
        "DCB31",
        mergedNotes,
        Number(target.defaultPrice || 9.8),
        Number(target.salePrice || 15),
        Number(target.id),
      ]
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "updated_single_item",
          targetId: Number(target.id),
          productCode: "DCB31",
          defaultPrice: Number(target.defaultPrice || 9.8),
          salePrice: Number(target.salePrice || 15),
        },
        null,
        2
      )
    );
  });
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
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function mergeNotes(...parts) {
  const values = [];
  for (const part of parts) {
    for (const piece of String(part || "").split("|")) {
      const cleaned = piece.trim();
      if (cleaned && !values.some((value) => normalize(value) === normalize(cleaned))) {
        values.push(cleaned);
      }
    }
  }
  return values.join(" | ");
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
