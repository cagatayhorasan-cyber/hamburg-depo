const { initDatabase, query, execute, withTransaction } = require("../server/db");

const PRODUCTS = [
  ["GNA 1.500-1", 331, "Evaporatörler", "GNA Serisi Ticari Tip Evaporatörler"],
  ["GNA 4.000-1", 580, "Evaporatörler", "GNA Serisi Ticari Tip Evaporatörler"],
  ["GNA 2.000-2", 389, "Evaporatörler", "GNA Serisi Ticari Tip Evaporatörler"],
  ["GNA 15.000-2", 1668, "Evaporatörler", "GNA Serisi Ticari Tip Evaporatörler"],
  ["GNA 8.000-3", 1036, "Evaporatörler", "GNA Serisi Ticari Tip Evaporatörler"],
  ["GNA 22.500-3", 2376, "Evaporatörler", "GNA Serisi Ticari Tip Evaporatörler"],
  ["GNA 17.500-4", 1958, "Evaporatörler", "GNA Serisi Ticari Tip Evaporatörler"],
  ["GNA 45.000-4", 4962, "Evaporatörler", "GNA Serisi Ticari Tip Evaporatörler"],
  ["GND 1.000-1", 396, "Evaporatörler", "GND Serisi Ticari Tip Evaporatörler"],
  ["GND 2.500-1", 614, "Evaporatörler", "GND Serisi Ticari Tip Evaporatörler"],
  ["GND 1.000-2", 375, "Evaporatörler", "GND Serisi Ticari Tip Evaporatörler"],
  ["GND 10.000-4", 1273, "Evaporatörler", "GND Serisi Ticari Tip Evaporatörler"],
  ["GND 25.000-4", 2438, "Evaporatörler", "GND Serisi Ticari Tip Evaporatörler"],
  ["GNE 130.4A", 386, "Evaporatörler", "GNE Serisi Standart Evaporatörler"],
  ["GNE 245.4C", 1340, "Evaporatörler", "GNE Serisi Standart Evaporatörler"],
  ["GNE 130.6A", 372, "Evaporatörler", "GNE Serisi Standart Evaporatörler"],
  ["GNE 245.6C", 1260, "Evaporatörler", "GNE Serisi Standart Evaporatörler"],
  ["GNE 130.8A", 369, "Evaporatörler", "GNE Serisi Standart Evaporatörler"],
  ["GNE 245.8C", 1244, "Evaporatörler", "GNE Serisi Standart Evaporatörler"],
  ["GNE 130.10A", 366, "Evaporatörler", "GNE Serisi Standart Evaporatörler"],
  ["GNE 245.10C", 1242, "Evaporatörler", "GNE Serisi Standart Evaporatörler"],
  ["GNI 150.4B", 1288, "Evaporatörler", "GNI Serisi Endüstriyel Evaporatörler"],
  ["GNI 380.4F", 11676, "Evaporatörler", "GNI Serisi Endüstriyel Evaporatörler"],
  ["GNI 150.6B", 1226, "Evaporatörler", "GNI Serisi Endüstriyel Evaporatörler"],
  ["GNI 380.6F", 10718, "Evaporatörler", "GNI Serisi Endüstriyel Evaporatörler"],
  ["GNI 150.8B", 1214, "Evaporatörler", "GNI Serisi Endüstriyel Evaporatörler"],
  ["GNI 380.8F", 10700, "Evaporatörler", "GNI Serisi Endüstriyel Evaporatörler"],
  ["GNI 150.10B", 1202, "Evaporatörler", "GNI Serisi Endüstriyel Evaporatörler"],
  ["GNI 380.10F", 10538, "Evaporatörler", "GNI Serisi Endüstriyel Evaporatörler"],
  ["GNS 2163-10B", 4069, "Evaporatörler", "GNS Serisi Şok Evaporatörler"],
  ["GNS 2163-10F", 6248, "Evaporatörler", "GNS Serisi Şok Evaporatörler"],
  ["GNS 2263-10B", 6698, "Evaporatörler", "GNS Serisi Şok Evaporatörler"],
  ["GNS 2363-10F", 17500, "Evaporatörler", "GNS Serisi Şok Evaporatörler"],
  ["GNP 130.6A", 1015, "Evaporatörler", "GNP Serisi Paslanmaz Evaporatörler"],
  ["GNP 145.6D", 2261, "Evaporatörler", "GNP Serisi Paslanmaz Evaporatörler"],
  ["GNP 225.6A", 863, "Evaporatörler", "GNP Serisi Paslanmaz Evaporatörler"],
  ["GNP 450.6F3", 11435, "Evaporatörler", "GNP Serisi Paslanmaz Evaporatörler"],
  ["GK 1/4", 45, "Kondenserler", "Kabinsiz Ticari Kondenser"],
  ["GK 1-125", 122, "Kondenserler", "Kabinsiz Ticari Kondenser"],
  ["GBOX MİNİ", 321, "Kondenserler", "Standart Kondenser Ünitesi"],
  ["GBOX 50-C3-150", 934, "Kondenserler", "Standart Kondenser Ünitesi"],
  ["GZBOX 8-K1-130", 342, "Kondenserler", "Sessiz Kondenser Ünitesi"],
  ["GZBOX 76-K3-150", 1167, "Kondenserler", "Sessiz Kondenser Ünitesi"],
  ["GBBOX 38-B1-245", 1153, "Kondenserler", "Büyük Kapasiteli Kondenser"],
  ["GEBOX 20-E1-150", 950, "Kondenserler", "Dik Tip Kondenser Ünitesi"],
  ["GMBOX 256-M2-650", 4066, "Kondenserler", "Modüler Kondenser Ünitesi"],
  ["GYBOX 35-Y3-250", 887, "Kondenserler", "Yatık Tip V Kondenser"],
  ["GDBOX 50-D3-240", 3303, "Kondenserler", "D Serisi Kondenser"],
].map(([model, eurPrice, category, series]) => ({ model, eurPrice, category, series }));

async function main() {
  await initDatabase();

  let nextCode = await getNextDrcCode();
  let updated = 0;
  let inserted = 0;

  await withTransaction(async (tx) => {
    for (const product of PRODUCTS) {
      const existing = await findBestMatch(tx, product);
      const note = `Kaynak: Kullanici fiyat listesi | Seri: ${product.series}`;

      if (existing) {
        await tx.execute(
          `
            UPDATE items
            SET category = ?, default_price = ?, sale_price = ?, notes = ?, is_active = ?
            WHERE id = ?
          `,
          [product.category, product.eurPrice, product.eurPrice, note, 1, Number(existing.id)]
        );
        updated += 1;
      } else {
        await tx.execute(
          `
            INSERT INTO items (name, brand, category, unit, min_stock, barcode, notes, default_price, sale_price, is_active)
            VALUES (?, ?, ?, 'adet', 0, ?, ?, ?, ?, ?)
          `,
          [`Günay ${product.model}`, "Günay", product.category, formatDrcCode(nextCode), note, product.eurPrice, product.eurPrice, 1]
        );
        nextCode += 1;
        inserted += 1;
      }
    }
  });

  console.log(JSON.stringify({ total: PRODUCTS.length, updated, inserted }, null, 2));
}

async function findBestMatch(tx, product) {
  const keyword = `%${product.model}%`;
  const rows = await tx.query(
    `
      SELECT id, name, brand, category, barcode
      FROM items
      WHERE COALESCE(is_active, TRUE)
        AND LOWER(name) LIKE LOWER(?)
      ORDER BY id ASC
    `,
    [keyword]
  );

  if (!rows.length) {
    return null;
  }

  const normalizedModel = normalize(product.model);
  return rows
    .map((row) => ({ row, score: scoreMatch(row, normalizedModel, product.category) }))
    .sort((a, b) => b.score - a.score || Number(a.row.id) - Number(b.row.id))[0]?.row || null;
}

function scoreMatch(row, normalizedModel, category) {
  const name = normalize(row.name);
  const rowCategory = normalize(row.category);
  let score = 0;
  if (name.includes(normalizedModel)) score += 10;
  if (name.startsWith(normalizedModel) || name.includes(` ${normalizedModel} `)) score += 8;
  if (rowCategory.includes(normalize(category))) score += 6;
  if (normalize(row.brand) === "günay") score += 4;
  if (normalize(row.brand) === "gunay") score += 4;
  if (normalize(row.brand) === "günay" && rowCategory.includes(normalize(category))) score += 4;
  return score;
}

async function getNextDrcCode() {
  const rows = await query(
    `
      SELECT barcode
      FROM items
      WHERE barcode LIKE 'DRC-%'
      ORDER BY barcode DESC
      LIMIT 1
    `
  );
  const last = rows[0]?.barcode || "DRC-00000";
  return Number(last.split("-")[1] || 0) + 1;
}

function formatDrcCode(number) {
  return `DRC-${String(number).padStart(5, "0")}`;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/.-]+/g, " ")
    .trim();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
