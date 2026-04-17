const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, query, get, execute, withTransaction } = require("../server/db");

const ENTRY_DATE = "2026-04-10";
const ENTRY_NOTE = "Acilis stok girisi - manuel liste";

const PRODUCTS = [
  {
    brand: "Embraco",
    name: "Kondenser Unitesi UNEU2168U",
    category: "Kondenserler",
    unit: "adet",
    quantity: 3,
    priceEur: 350,
    productCode: "UNEU2168U",
    aliases: ["UNEU2168U"],
    notes: ["R290 gazli", "LBP", "220V", "3.45A"],
  },
  {
    brand: "Systemair",
    name: "VRF Dis Unite SYSVRF2 260 AIR EVO",
    category: "VRF Sistemleri",
    unit: "adet",
    quantity: 1,
    productCode: "319125",
    aliases: ["SYSVRF2 260 AIR EVO"],
    notes: ["Art No: 319125", "160 kg", "380-415V"],
  },
  {
    brand: "Systemair",
    name: "VRF Ic Unite WALL 71 Q",
    category: "VRF Ic Uniteleri",
    unit: "adet",
    quantity: 1,
    priceEur: 275,
    productCode: "469544",
    aliases: ["WALL 71 Q"],
    notes: ["Art No: 469544", "18.2 kg"],
  },
  {
    brand: "Systemair",
    name: "VRF Ic Unite WALL 56 Q",
    category: "VRF Ic Uniteleri",
    unit: "adet",
    quantity: 2,
    priceEur: 265,
    productCode: "455461",
    aliases: ["WALL 56 Q"],
    notes: ["Art No: 455461", "14.2 kg"],
  },
  {
    brand: "Systemair",
    name: "VRF Ic Unite WALL 28 Q",
    category: "VRF Ic Uniteleri",
    unit: "adet",
    quantity: 1,
    productCode: "455458",
    aliases: ["WALL 28 Q"],
    notes: ["Art No: 455458", "12.7 kg"],
  },
  {
    brand: "Systemair",
    name: "VRF Kumanda WGC86S",
    category: "Kumandalar",
    unit: "adet",
    quantity: 10,
    priceEur: 32,
    productCode: "WGC86S",
    aliases: ["WGC86S"],
    notes: ["Kablolu veya kablosuz kontrolor"],
  },
  {
    brand: "Systemair",
    name: "Bransman Joint IN 01",
    category: "VRF Aksesuarlari",
    unit: "adet",
    quantity: 4,
    priceEur: 17,
    productCode: "IN 01",
    aliases: ["JOINT IN 01", "IN01"],
    notes: ["VRF bransman parcasi"],
  },
  {
    brand: "Systemair",
    name: "Bransman Joint IN 02",
    category: "VRF Aksesuarlari",
    unit: "adet",
    quantity: 1,
    priceEur: 19,
    productCode: "IN 02",
    aliases: ["JOINT IN 02", "IN02"],
    notes: ["VRF bransman parcasi"],
  },
  {
    brand: "Danfoss",
    name: "Genlesme Valfi T 2",
    category: "Genlesme Valfleri",
    unit: "adet",
    quantity: 130,
    productCode: "068Z3414",
    aliases: ["T 2", "T2"],
    notes: ["R404A/507A", "Flare/Solder"],
  },
  {
    brand: "Danfoss",
    name: "Genlesme Valfi TE 2",
    category: "Genlesme Valfleri",
    unit: "adet",
    quantity: 113,
    productCode: "068Z3415",
    aliases: ["TE 2", "TE2"],
    notes: ["R404A/507A", "Flare/Solder"],
  },
  {
    brand: "Danfoss",
    name: "Genlesme Valfi TEN2",
    category: "Genlesme Valfleri",
    unit: "adet",
    quantity: 2,
    productCode: "068Z3348",
    aliases: ["TEN2"],
    notes: ["R134a", "Flare"],
  },
  {
    brand: "Sanhua",
    name: "Genlesme Valfi RFKH022",
    category: "Genlesme Valfleri",
    unit: "adet",
    quantity: 2,
    productCode: "RFKH022",
    aliases: ["RFKH022"],
    notes: ["R22/R407C"],
  },
  {
    brand: "Danfoss",
    name: "Solenoid Bobin 018F6701",
    category: "Solenoid Bobin",
    unit: "adet",
    quantity: 1,
    productCode: "018F6701",
    aliases: ["018F6701"],
    notes: ["220V", "12W", "IP67"],
  },
  {
    brand: "DRC",
    name: "Defrost Kontrol DCB31",
    category: "Kontrol Panelleri",
    unit: "adet",
    quantity: 20,
    priceEur: 15,
    productCode: "DCB31",
    aliases: ["DCB31", "DCB 31", "DRC DCB31", "DRC DCB 31"],
    notes: ["220 VAC", "NTC sensorlu", "Statik defrost sogutma kontrol cihazi"],
  },
  {
    brand: "DRC",
    name: "Elektrik Panosu EX-100",
    category: "Kontrol Panelleri",
    unit: "adet",
    quantity: 10,
    productCode: "EX-100",
    aliases: ["EX100", "DRC EX-100"],
    notes: ["Split cihaz kontrol paneli"],
  },
  {
    brand: "DRC",
    name: "Kontrol Unitesi DCB 100/300/350",
    category: "Kontrol Panelleri",
    unit: "adet",
    quantity: 10,
    productCode: "DCB 100/300/350",
    aliases: ["DCB 100", "DCB 300", "DCB 350"],
    notes: ["Soguk oda elektronik unitesi"],
  },
  {
    brand: "Weiguang",
    name: "Fan Motoru YZF10-20",
    category: "Fan Motorlari",
    unit: "adet",
    quantity: 190,
    productCode: "YZF10-20",
    aliases: ["YZF10-20"],
    notes: ["10/36W"],
  },
  {
    brand: "Weiguang",
    name: "Fan Motoru YZF25-40",
    category: "Fan Motorlari",
    unit: "adet",
    quantity: 83,
    productCode: "YZF25-40",
    aliases: ["YZF25-40"],
    notes: ["25/90W"],
  },
  {
    brand: "Weiguang",
    name: "Fan Motoru YZF18-30",
    category: "Fan Motorlari",
    unit: "adet",
    quantity: 24,
    productCode: "YZF18-30",
    aliases: ["YZF18-30"],
    notes: ["18/70W"],
  },
  {
    brand: "Weiguang",
    name: "Fan Motoru YZF34-45",
    category: "Fan Motorlari",
    unit: "adet",
    quantity: 19,
    productCode: "YZF34-45",
    aliases: ["YZF34-45"],
    notes: ["34/110W"],
  },
  {
    brand: "Ottocool",
    name: "Drenaj Pompasi A1",
    category: "Drenaj Pompasi",
    unit: "adet",
    quantity: 37,
    productCode: "A1",
    aliases: ["OTTOCOOL A1"],
    notes: ["24L/h", "12m basma"],
  },
  {
    brand: "Value",
    name: "Drenaj Pompasi M1",
    category: "Drenaj Pompasi",
    unit: "adet",
    quantity: 3,
    productCode: "M1",
    aliases: ["VALUE M1"],
    notes: ["Ultra-quiet DC motor"],
  },
  {
    brand: "Siccom",
    name: "Drenaj Pompasi ECO LINE",
    category: "Drenaj Pompasi",
    unit: "adet",
    quantity: 5,
    productCode: "ECO LINE",
    aliases: ["SICCOM ECO LINE"],
    notes: ["13.2 l/h"],
  },
  {
    brand: "GVN",
    name: "Filtre Drier GMH 1/4",
    category: "Filtre Drier",
    unit: "adet",
    quantity: 128,
    productCode: "GMH-1/4",
    aliases: ["GMH SERISI 1/4", "GMH 1/4"],
    notes: ["GVN GMH serisi", "1/4"],
  },
  {
    brand: "GVN",
    name: "Filtre Drier GMH 3/8",
    category: "Filtre Drier",
    unit: "adet",
    quantity: 24,
    productCode: "GMH-3/8",
    aliases: ["GMH SERISI 3/8", "GMH 3/8"],
    notes: ["GVN GMH serisi", "3/8"],
  },
  {
    brand: "Refnox",
    name: "Filtre Drier RFD 052S",
    category: "Filtre Drier",
    unit: "adet",
    quantity: 16,
    productCode: "RFD 052S",
    aliases: ["RFD052S"],
    notes: ['1/4" ODF Solder'],
  },
  {
    brand: "Sanhua",
    name: "Servis Valfi Sanhua 1/4 ve 3/8 Karisik",
    category: "Servis Valfi",
    unit: "adet",
    quantity: 347,
    productCode: "SERVIS-VALFI-SANHUA",
    aliases: ["SERVIS VALFI SANHUA", "SANHUA SERVIS VALFI", "DUNAN SANHUA"],
    notes: ['1/4" ve 3/8" karisik', "DunAn markasi ayri kartta tutulur"],
  },
  {
    brand: "DunAn",
    name: "Servis Valfi DunAn 1/4 ve 3/8 Karisik",
    category: "Servis Valfi",
    unit: "adet",
    quantity: 0,
    priceEur: 3,
    productCode: "SERVIS-VALFI-DUNAN",
    aliases: ["SERVIS VALFI DUNAN", "DUNAN SERVIS VALFI"],
    notes: ['1/4" ve 3/8" karisik', "Sanhua markasi ayri kartta tutulur", "Stok miktari sayimdan sonra girilecek"],
  },
  {
    brand: "Ottocool",
    name: "Kaucuk Izolasyon Karisik",
    category: "Izolasyon",
    unit: "top",
    quantity: 27,
    productCode: "",
    aliases: ["KAUCUK IZOLASYON", "OTTOCOOL KAUCUK"],
    notes: ['1/4", 3/8" ve 5/8" olculer'],
  },
  {
    brand: "Sibax",
    name: "PU Kopuk NS88",
    category: "Montaj Sarf",
    unit: "adet",
    quantity: 128,
    productCode: "NS88",
    aliases: ["SIBAX NS88"],
    notes: ["16'li paketler", "8 koli"],
  },
  {
    brand: "Selsil",
    name: "Silikon Eco White",
    category: "Montaj Sarf",
    unit: "adet",
    quantity: 125,
    productCode: "ECO WHITE",
    aliases: ["SELSIL ECO WHITE"],
    notes: ["280g", "cok amacli"],
  },
  {
    brand: "GVN",
    name: "Likit Tanki VLR.A.30B",
    category: "Likit Tanki",
    unit: "adet",
    quantity: 4,
    productCode: "VLR.A.30B",
    aliases: ["VLR A 30B", "VLR.A.30B"],
    notes: ["Dikey tip", "2024 uretim"],
  },
];

async function main() {
  await initDatabase();

  const adminUser = await get("SELECT id FROM users WHERE username = ? LIMIT 1", ["admin"]);
  const existingItems = await query(`
    SELECT id, name, brand, category, unit, product_code AS "productCode", barcode, notes, default_price AS "defaultPrice", sale_price AS "salePrice"
    FROM items
  `);

  let nextBarcodeNumber = await getNextBarcodeNumber();
  let inserted = 0;
  let patched = 0;
  let skipped = 0;
  const insertedItems = [];
  const patchedItems = [];

  await withTransaction(async (tx) => {
    for (const product of PRODUCTS) {
      const existing = findExistingItem(existingItems, product);
      if (existing) {
        const patch = buildPatch(existing, product);
        if (!patch) {
          skipped += 1;
          continue;
        }

        await tx.execute(
          `
            UPDATE items
            SET brand = ?, category = ?, unit = ?, product_code = ?, notes = ?, default_price = ?, sale_price = ?
            WHERE id = ?
          `,
          [patch.brand, patch.category, patch.unit, patch.productCode, patch.notes, patch.defaultPrice, patch.salePrice, Number(existing.id)]
        );

        existing.brand = patch.brand;
        existing.category = patch.category;
        existing.unit = patch.unit;
        existing.productCode = patch.productCode;
        existing.notes = patch.notes;
        existing.defaultPrice = patch.defaultPrice;
        existing.salePrice = patch.salePrice;
        patched += 1;
        patchedItems.push({ id: Number(existing.id), name: existing.name, productCode: patch.productCode || "", priceEur: patch.salePrice });
        continue;
      }

      const barcode = formatDrcCode(nextBarcodeNumber);
      nextBarcodeNumber += 1;
      const notes = buildNotes(product);
      const inheritedPrice = resolveReferencePrice(existingItems, product.productCode, product.brand);
      const priceValue = inheritedPrice > 0 ? inheritedPrice : Number(product.priceEur || 0);
      const result = await tx.execute(
        `
          INSERT INTO items (
            name,
            brand,
            category,
            unit,
            min_stock,
            product_code,
            barcode,
            notes,
            default_price,
            sale_price,
            is_active
          )
          VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `,
        [
          product.name,
          product.brand,
          product.category,
          product.unit,
          product.productCode || "",
          barcode,
          notes,
          priceValue,
          priceValue,
          trueValue(),
        ]
      );

      const itemId = Number(result.rows?.[0]?.id || result.lastInsertId || 0);
      await tx.execute(
        `
          INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id)
          VALUES (?, 'entry', ?, 0, ?, ?, ?)
        `,
        [itemId, Number(product.quantity), ENTRY_DATE, ENTRY_NOTE, adminUser?.id ? Number(adminUser.id) : null]
      );

      const insertedItem = {
        id: itemId,
        name: product.name,
        brand: product.brand,
        category: product.category,
        unit: product.unit,
        productCode: product.productCode || "",
        barcode,
        notes,
        defaultPrice: priceValue,
        salePrice: priceValue,
      };
      existingItems.push(insertedItem);
      inserted += 1;
      insertedItems.push({ id: itemId, name: product.name, barcode, quantity: product.quantity, productCode: product.productCode || "" });
    }
  });

  console.log(
    JSON.stringify(
      {
        totalListed: PRODUCTS.length,
        inserted,
        patched,
        skipped,
        insertedItems,
        patchedItems,
      },
      null,
      2
    )
  );
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

async function getNextBarcodeNumber() {
  const rows = await query(
    `
      SELECT barcode
      FROM items
      WHERE barcode LIKE 'DRC-%'
      ORDER BY barcode DESC
      LIMIT 1
    `
  );
  return Number(String(rows[0]?.barcode || "DRC-00000").replace("DRC-", "")) + 1;
}

function findExistingItem(existingItems, product) {
  const wantedCodes = [product.productCode, ...(product.aliases || [])]
    .map(normalizeCode)
    .filter(Boolean);
  const wantedBrand = normalizeText(product.brand);
  const wantedName = normalizeText(product.name);

  let bestMatch = null;
  let bestScore = 0;
  for (const item of existingItems) {
    const score = scoreExistingItem(item, { wantedCodes, wantedBrand, wantedName, aliases: product.aliases || [] });
    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestScore >= 70 ? bestMatch : null;
}

function scoreExistingItem(item, { wantedCodes, wantedBrand, wantedName, aliases }) {
  let score = 0;
  const itemBrand = normalizeText(item.brand);
  const itemName = normalizeText(item.name);
  const haystack = normalizeText([item.name, item.brand, item.category, item.productCode, item.notes, item.barcode].filter(Boolean).join(" | "));
  const itemProductCode = normalizeCode(item.productCode);

  if (wantedBrand && itemBrand === wantedBrand) {
    score += 25;
  }

  if (itemName === wantedName) {
    score += 45;
  } else if (itemName.includes(wantedName) || wantedName.includes(itemName)) {
    score += 28;
  }

  for (const code of wantedCodes) {
    if (!code) {
      continue;
    }
    if (itemProductCode && itemProductCode === code) {
      score += 100;
      continue;
    }
    if (haystack.includes(normalizeText(code))) {
      score += 36;
    }
  }

  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);
    if (normalizedAlias && haystack.includes(normalizedAlias)) {
      score += 16;
    }
  }

  return score;
}

function buildPatch(existing, product) {
  const nextBrand = existing.brand || product.brand;
  const nextCategory = shouldReplaceCategory(existing.category) ? product.category : existing.category;
  const nextUnit = existing.unit || product.unit;
  const nextProductCode = existing.productCode || product.productCode || "";
  const nextNotes = mergeNotes(existing.notes, buildNotes(product));
  const nextDefaultPrice = resolveNextPrice(existing.defaultPrice, product.priceEur);
  const nextSalePrice = resolveNextPrice(existing.salePrice, product.priceEur);

  const unchanged =
    String(existing.brand || "") === String(nextBrand || "") &&
    String(existing.category || "") === String(nextCategory || "") &&
    String(existing.unit || "") === String(nextUnit || "") &&
    String(existing.productCode || "") === String(nextProductCode || "") &&
    String(existing.notes || "") === String(nextNotes || "") &&
    Number(existing.defaultPrice || 0) === nextDefaultPrice &&
    Number(existing.salePrice || 0) === nextSalePrice;

  if (unchanged) {
    return null;
  }

  return {
    brand: nextBrand,
    category: nextCategory,
    unit: nextUnit,
    productCode: nextProductCode,
    notes: nextNotes,
    defaultPrice: nextDefaultPrice,
    salePrice: nextSalePrice,
  };
}

function shouldReplaceCategory(category) {
  const normalized = normalizeText(category);
  return !normalized || normalized === "genel";
}

function buildNotes(product) {
  return [
    "Kaynak: Nisan 2026 acilis stok listesi",
    product.productCode ? `urun kodu: ${product.productCode}` : "",
    ...(product.notes || []),
  ]
    .filter(Boolean)
    .join(" | ");
}

function mergeNotes(existing, next) {
  const segments = [];
  for (const value of [existing, next]) {
    for (const part of String(value || "").split("|")) {
      const cleaned = part.trim();
      if (cleaned && !segments.some((segment) => normalizeText(segment) === normalizeText(cleaned))) {
        segments.push(cleaned);
      }
    }
  }
  return segments.join(" | ");
}

function resolveNextPrice(existingPrice, productPrice) {
  const existing = Number(existingPrice || 0);
  const incoming = Number(productPrice || 0);
  if (incoming > 0) {
    return incoming;
  }
  return existing;
}

function resolveReferencePrice(existingItems, productCode, brand) {
  const normalizedCode = normalizeCode(productCode);
  if (!normalizedCode) {
    return 0;
  }

  const brandText = normalizeText(brand);
  const exactBrandMatch = existingItems.find((item) =>
    normalizeCode(item.productCode) === normalizedCode &&
    Number(item.salePrice || item.defaultPrice || 0) > 0 &&
    normalizeText(item.brand) === brandText
  );
  if (exactBrandMatch) {
    return Number(exactBrandMatch.salePrice || exactBrandMatch.defaultPrice || 0);
  }

  const genericMatch = existingItems.find((item) =>
    normalizeCode(item.productCode) === normalizedCode &&
    Number(item.salePrice || item.defaultPrice || 0) > 0
  );
  return Number(genericMatch?.salePrice || genericMatch?.defaultPrice || 0);
}

function formatDrcCode(number) {
  return `DRC-${String(number).padStart(5, "0")}`;
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeText(value) {
  return String(value || "")
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9/.+-]+/g, " ")
    .trim();
}

function trueValue() {
  return process.env.DATABASE_URL ? true : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
