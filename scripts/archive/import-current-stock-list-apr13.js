const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, query, get, withTransaction } = require("../server/db");

const ENTRY_DATE = "2026-04-13";
const ENTRY_NOTE_BASE = "2026-04-13 canli stok girisi - guncel stok giris listesi";
const APPLY_CHANGES = process.argv.includes("--apply");

const PRODUCTS = [
  {
    brand: "Elektrosan",
    name: "Elektrosan Dikey Buzdolabi Tek Kapi Pozitif (+2/+8C) TFT Ekran R290 Monoblok",
    category: "Dikey Tip Buzdolaplari",
    unit: "adet",
    quantity: 1,
    priceEur: 1200,
    productCode: "ELEKTROSAN-TEK-TFT-R290",
    aliases: ["ELEKTROSAN", "TFT", "MONOBLOK", "R290"],
    forceNew: true,
    notes: ["Tek kapi", "Pozitif", "+2/+8C", "TFT ekran", "R290 gazli", "Monoblok"],
  },
  {
    brand: "Elektrosan",
    name: "Elektrosan Dikey Buzdolabi Tek Kapi Pozitif (+2/+8C) Dijital Ekran",
    category: "Dikey Tip Buzdolaplari",
    unit: "adet",
    quantity: 2,
    priceEur: 1000,
    productCode: "ELEKTROSAN-TEK-DIJITAL",
    aliases: ["ELEKTROSAN", "TEK KAPI", "DIJITAL EKRAN"],
    forceNew: true,
    notes: ["Tek kapi", "Pozitif", "+2/+8C", "Normal dijital ekran"],
  },
  {
    brand: "Elektrosan",
    name: "Elektrosan Dikey Buzdolabi Cift Kapi Pozitif (+2/+8C) Dijital Ekran",
    category: "Dikey Tip Buzdolaplari",
    unit: "adet",
    quantity: 3,
    priceEur: 1600,
    productCode: "ELEKTROSAN-CIFT-DIJITAL",
    aliases: ["ELEKTROSAN", "CIFT KAPI", "DIJITAL EKRAN"],
    forceNew: true,
    notes: ["Cift kapi", "Pozitif", "+2/+8C", "Normal dijital ekran"],
  },
  {
    brand: "Genel",
    name: "Sandvic Panel 100mm 1x4 Metre",
    category: "Panel Sistemleri",
    unit: "adet",
    quantity: 60,
    productCode: "PANEL-100MM-1X4",
    aliases: ["SANDVIC PANEL", "100MM", "1X4"],
    forceNew: true,
    notes: ["100mm kalinlik", "1x4 metre"],
  },
  {
    brand: "Genel",
    name: "Rezistansli Kapi 100x190 cm",
    category: "Soguk Oda Kapilari",
    unit: "adet",
    quantity: 34,
    productCode: "KAPI-100X190-REZ",
    aliases: ["REZISTANSLI KAPI", "100X190"],
    forceNew: true,
    notes: ["Rezistansli kapi", "100x190 cm"],
  },
  {
    brand: "Genel",
    name: "Rezistansli Kapi 80x180 cm",
    category: "Soguk Oda Kapilari",
    unit: "adet",
    quantity: 33,
    productCode: "KAPI-80X180-REZ",
    aliases: ["REZISTANSLI KAPI", "80X180"],
    forceNew: true,
    notes: ["Rezistansli kapi", "80x180 cm"],
  },
  {
    brand: "Genel",
    name: "Scroll Kompresor 6 HP",
    category: "Kompresorler",
    unit: "adet",
    quantity: 14,
    productCode: "SCROLL-6HP",
    aliases: ["SCROLL", "6 HP"],
    forceNew: true,
    notes: ["Genel scroll kompresor", "6 HP"],
  },
  {
    brand: "Zingfa",
    name: "Zingfa Scroll Kompresor 3.5 HP 380V R404A",
    category: "Kompresorler",
    unit: "adet",
    quantity: 13,
    productCode: "ZINGFA-SCROLL-3.5HP-R404A",
    aliases: ["ZINGFA", "SCROLL", "3.5 HP", "380V", "R404A"],
    forceNew: true,
    notes: ["3.5 HP", "380V", "R404A"],
  },
  {
    brand: "Embraco",
    name: "Embraco NEU6220GK (R404A)",
    category: "Kompresorler",
    unit: "adet",
    quantity: 51,
    productCode: "NEU6220GK",
    aliases: ["NEU6220GK", "KOMPRESSOR", "KOMPRESOR"],
    replaceNameOnMatch: true,
    replaceBrandOnMatch: true,
    replaceCategoryOnMatch: true,
    notes: ["R404A"],
  },
  {
    brand: "Embraco",
    name: "Embraco NEU6215GK (R404A)",
    category: "Kompresorler",
    unit: "adet",
    quantity: 52,
    productCode: "LF3070330",
    aliases: ["NEU6215GK", "R404A"],
    replaceNameOnMatch: true,
    replaceBrandOnMatch: true,
    replaceCategoryOnMatch: true,
    notes: ["R404A"],
  },
  {
    brand: "Embraco",
    name: "Embraco FF 8.5HBK (R134a)",
    category: "Kompresorler",
    unit: "adet",
    quantity: 42,
    productCode: "FF-8.5HBK",
    aliases: ["FF 8.5HBK", "R134A"],
    forceNew: true,
    notes: ["R134a"],
  },
  {
    brand: "Embraco",
    name: "Embraco NJX2219GS (R404A, 3 Faz)",
    category: "Kompresorler",
    unit: "adet",
    quantity: 5,
    productCode: "NJX2219GS",
    aliases: ["NJX2219GS", "R404A", "3 FAZ"],
    forceNew: true,
    notes: ["R404A", "3 faz"],
  },
  {
    brand: "Embraco",
    name: "Embraco EME6210K-C",
    category: "Kompresorler",
    unit: "adet",
    quantity: 1,
    productCode: "EME6210K-C",
    aliases: ["EME6210K-C", "EME6210K"],
    forceNew: true,
    notes: [],
  },
  {
    brand: "Copeland",
    name: "Scroll ZMT-453 (R407C)",
    category: "Kompresorler",
    unit: "adet",
    quantity: 1,
    productCode: "ZMT-453",
    aliases: ["ZMT-453", "R407C"],
    forceNew: true,
    notes: ["R407C"],
  },
  {
    brand: "ETS",
    name: "ETS Kondanser HSC.MP10050 / LP10050",
    category: "Kondanserler",
    unit: "adet",
    quantity: 2,
    productCode: "HSC.MP10050-LP10050",
    aliases: ["ETS", "HSC.MP10050", "LP10050"],
    forceNew: true,
    notes: ["Motorlu"],
  },
  {
    brand: "Alkatherm",
    name: "Alkatherm Kondanser Bataryasi 30 m2",
    category: "Kondanser Bataryalari",
    unit: "adet",
    quantity: 15,
    productCode: "ALKATHERM-30M2",
    aliases: ["ALKATHERM", "30 M2"],
    forceNew: true,
    notes: ["Motorsuz"],
  },
  {
    brand: "BYS",
    name: "BYS-SH60 BOX 23.780 Watt",
    category: "Kondanser Bataryalari",
    unit: "adet",
    quantity: 10,
    productCode: "BYS-SH60-BOX",
    aliases: ["BYS-SH60", "23780"],
    forceNew: true,
    notes: ["Motorsuz"],
  },
  {
    brand: "BYS",
    name: "BYS-SH35 BOX 12.337 Watt",
    category: "Kondanser Bataryalari",
    unit: "adet",
    quantity: 5,
    productCode: "BYS-SH35-BOX",
    aliases: ["BYS-SH35", "12337"],
    forceNew: true,
    notes: ["Motorsuz"],
  },
  {
    brand: "BYS",
    name: "BYS-SH30 BOX 11.600 Watt",
    category: "Kondanser Bataryalari",
    unit: "adet",
    quantity: 4,
    productCode: "BYS-SH30-BOX",
    aliases: ["BYS-SH30", "11600"],
    forceNew: true,
    notes: ["Motorsuz"],
  },
  {
    brand: "BYS",
    name: "BYS-SH20 BOX 8.343 Watt",
    category: "Kondanser Bataryalari",
    unit: "adet",
    quantity: 4,
    productCode: "BYS-SH20-BOX",
    aliases: ["BYS-SH20", "8343"],
    forceNew: true,
    notes: ["Motorsuz"],
  },
  {
    brand: "Damla",
    name: "Damla GMC-SD14 21.695 Watt",
    category: "Bataryalar",
    unit: "adet",
    quantity: 3,
    productCode: "GMC-SD14",
    aliases: ["GMC-SD14", "21695"],
    forceNew: true,
    notes: ["Motorsuz"],
  },
  {
    brand: "Gunay",
    name: "Gunay GNKF 1200 Yan 1.400 Watt",
    category: "Evaporatorler",
    unit: "adet",
    quantity: 4,
    productCode: "GNKF1200YAN",
    aliases: ["GNKF 1200", "GNY GNKF 1200"],
    replaceNameOnMatch: true,
    replaceBrandOnMatch: true,
    replaceCategoryOnMatch: true,
    notes: ["Motorsuz", "1.400 Watt", "Yan tip"],
  },
  {
    brand: "Thermet",
    name: "Thermet WTE.40.6.214 6.905 Watt",
    category: "Evaporatorler",
    unit: "adet",
    quantity: 1,
    productCode: "WTE.40.6.214",
    aliases: ["WTE.40.6.214", "6905"],
    forceNew: true,
    notes: ["Motorsuz"],
  },
  {
    brand: "Systemair",
    name: "Systemair VRF Ic Unite SYSVRF3 WALL 36 Q",
    category: "VRF Ic Uniteleri",
    unit: "adet",
    quantity: 1,
    productCode: "SYSVRF3-WALL-36-Q",
    aliases: ["SYSVRF3 WALL 36 Q", "WALL 36 Q"],
    forceNew: true,
    notes: [],
  },
  {
    brand: "GVN",
    name: "GVN Dikey Likit Tanki VLR.A.30B.01",
    category: "Likit Tanklari",
    unit: "adet",
    quantity: 108,
    productCode: "VLR.A.30B.01",
    aliases: ["VLR.A.30B.01"],
    forceNew: true,
    notes: ["Dikey tip"],
  },
  {
    brand: "GVN",
    name: "GVN Dikey Likit Tanki VLR.A.33B.06",
    category: "Likit Tanklari",
    unit: "adet",
    quantity: 12,
    productCode: "VLR.A.33B.06",
    aliases: ["VLR.A.33B.06"],
    forceNew: true,
    notes: ["Dikey tip"],
  },
  {
    brand: "GVN",
    name: "GVN Yatay Likit Tanki HLR.GR.33B.05",
    category: "Likit Tanklari",
    unit: "adet",
    quantity: 2,
    productCode: "HLR.GR.33B.05",
    aliases: ["HLR.GR.33B.05"],
    forceNew: true,
    notes: ["Yatay tip"],
  },
  {
    brand: "Talos",
    name: "Talos Izoleli Bakir Boru 1/4 - 1/2",
    category: "Bakir Borular",
    unit: "top",
    quantity: 2,
    productCode: "TALOS-1/4-1/2",
    aliases: ["TALOS", "1/4", "1/2", "IZOLELI BAKIR BORU"],
    forceNew: true,
    notes: ["Izoleli bakir boru"],
  },
  {
    brand: "ACT",
    name: "ACT ZL940-DF210 Isitici Unite",
    category: "Isitici Uniteleri",
    unit: "adet",
    quantity: 1,
    productCode: "ZL940-DF210",
    aliases: ["ZL940-DF210"],
    forceNew: true,
    notes: [],
  },
  {
    brand: "Lubreeze",
    name: "Lubreeze POE 32 Yag 5L",
    category: "Sogutma Yaglari",
    unit: "adet",
    quantity: 196,
    productCode: "LUBREEZE-POE32-5L",
    aliases: ["LUBREEZE", "POE 32", "5 LT"],
    notes: ["5L"],
  },
  {
    brand: "Lubreeze",
    name: "Lubreeze POE 68 Yag 5L",
    category: "Sogutma Yaglari",
    unit: "adet",
    quantity: 6,
    productCode: "LUBREEZE-POE68-5L",
    aliases: ["LUBREEZE", "POE 68", "5 LT"],
    forceNew: true,
    notes: ["5L"],
  },
  {
    brand: "Errecom",
    name: "Errecom POE 68 4x4L",
    category: "Sogutma Yaglari",
    unit: "koli",
    quantity: 42,
    productCode: "ERRECOM-POE68-4X4L",
    aliases: ["ERRECOM", "POE 68", "4X4L"],
    forceNew: true,
    notes: ["4x4L"],
  },
  {
    brand: "Errecom",
    name: "Errecom POE 170 4x4L",
    category: "Sogutma Yaglari",
    unit: "koli",
    quantity: 100,
    productCode: "ERRECOM-POE170-4X4L",
    aliases: ["ERRECOM", "POE 170", "4X4L"],
    forceNew: true,
    notes: ["4x4L"],
  },
  {
    brand: "Errecom",
    name: "Errecom POE 170 12x1L",
    category: "Sogutma Yaglari",
    unit: "koli",
    quantity: 55,
    productCode: "ERRECOM-POE170-12X1L",
    aliases: ["ERRECOM", "POE 170", "12X1L"],
    forceNew: true,
    notes: ["12x1L"],
  },
  {
    brand: "Errecom",
    name: "Errecom Endustriyel POE Yag Bidonu",
    category: "Sogutma Yaglari",
    unit: "adet",
    quantity: 54,
    productCode: "ERRECOM-ENDUSTRIYEL-POE",
    aliases: ["ERRECOM", "ENDUSTRIYEL", "POE", "BIDON"],
    forceNew: true,
    notes: ["Endustriyel yag bidonu"],
  },
  {
    brand: "Genel",
    name: "R290 Propan Gazi 6 KG",
    category: "Sogutucu Akiskanlar",
    unit: "adet",
    quantity: 24,
    priceEur: 140,
    productCode: "R290-6KG",
    aliases: ["R290", "6 KG", "PROPAN"],
    forceNew: true,
    notes: ["6 KG", "Propan", "Daha once belirlenen fiyat: 140 EUR"],
  },
  {
    brand: "Schneider / Eaton / CHINT",
    name: "Hazir Kumanda Panosu",
    category: "Kumanda Panolari",
    unit: "adet",
    quantity: 28,
    productCode: "HAZIR-KUMANDA-PANOSU",
    aliases: ["KUMANDA PANOSU", "SCHNEIDER", "EATON", "CHINT"],
    forceNew: true,
    notes: ["Hazir kumanda panosu"],
  },
  {
    brand: "DRC",
    name: "DRC Dijital Kontrolor DCB31",
    category: "Termostat",
    unit: "adet",
    quantity: 80,
    productCode: "DCB31",
    aliases: ["DCB31", "DCB 31"],
    replaceBrandOnMatch: true,
    replaceCategoryOnMatch: true,
    notes: ["Kullanici listesindeki 80+ ifadesi nedeniyle minimum 80 adet girildi"],
  },
];

async function main() {
  await initDatabase();

  const adminUser = await get(
    "SELECT id, username FROM users WHERE LOWER(COALESCE(role, '')) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["admin"]
  );

  const existingItems = await query(`
    SELECT
      id,
      name,
      brand,
      category,
      unit,
      min_stock AS "minStock",
      product_code AS "productCode",
      barcode,
      notes,
      default_price AS "defaultPrice",
      list_price AS "listPrice",
      sale_price AS "salePrice",
      is_active AS "isActive"
    FROM items
  `);

  let nextBarcodeNumber = await getNextBarcodeNumber();
  const summary = {
    mode: APPLY_CHANGES ? "apply" : "dry-run",
    entryDate: ENTRY_DATE,
    totalListed: PRODUCTS.length,
    inserted: [],
    matched: [],
    movementInserted: [],
    movementSkipped: [],
    patched: [],
  };

  await withTransaction(async (tx) => {
    for (const product of PRODUCTS) {
      const existing = product.forceNew
        ? findForcedItem(existingItems, product)
        : findExistingItem(existingItems, product);
      const movementNote = buildMovementNote(product);

      if (existing) {
        const patch = buildPatch(existing, product, existingItems);
        if (patch) {
          summary.patched.push({
            id: Number(existing.id),
            previousName: existing.name,
            nextName: patch.name,
            productCode: patch.productCode,
          });

          if (APPLY_CHANGES) {
            await tx.execute(
              `
                UPDATE items
                SET name = ?, brand = ?, category = ?, unit = ?, min_stock = ?, product_code = ?, notes = ?, default_price = ?, list_price = ?, sale_price = ?, is_active = ?
                WHERE id = ?
              `,
              [
                patch.name,
                patch.brand,
                patch.category,
                patch.unit,
                patch.minStock,
                patch.productCode,
                patch.notes,
                patch.defaultPrice,
                patch.listPrice,
                patch.salePrice,
                trueValue(),
                Number(existing.id),
              ]
            );
          }

          existing.name = patch.name;
          existing.brand = patch.brand;
          existing.category = patch.category;
          existing.unit = patch.unit;
          existing.minStock = patch.minStock;
          existing.productCode = patch.productCode;
          existing.notes = patch.notes;
          existing.defaultPrice = patch.defaultPrice;
          existing.listPrice = patch.listPrice;
          existing.salePrice = patch.salePrice;
          existing.isActive = trueValue();
        }

        summary.matched.push({
          id: Number(existing.id),
          name: existing.name,
          brand: existing.brand || "",
          productCode: existing.productCode || "",
          quantity: Number(product.quantity),
        });

        const movementExists = await tx.get(
          `
            SELECT id
            FROM movements
            WHERE item_id = ? AND type = 'entry' AND quantity = ? AND unit_price = ? AND movement_date = ? AND note = ?
            LIMIT 1
          `,
          [Number(existing.id), Number(product.quantity), resolveEntryUnitPrice(product, existing, existingItems), ENTRY_DATE, movementNote]
        );

        if (movementExists) {
          summary.movementSkipped.push({
            itemId: Number(existing.id),
            name: existing.name,
            quantity: Number(product.quantity),
          });
          continue;
        }

        summary.movementInserted.push({
          itemId: Number(existing.id),
          name: existing.name,
          quantity: Number(product.quantity),
        });

        if (APPLY_CHANGES) {
          await tx.execute(
            `
              INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id)
              VALUES (?, 'entry', ?, ?, ?, ?, ?)
            `,
            [
              Number(existing.id),
              Number(product.quantity),
              resolveEntryUnitPrice(product, existing, existingItems),
              ENTRY_DATE,
              movementNote,
              adminUser?.id ? Number(adminUser.id) : null,
            ]
          );
        }
        continue;
      }

      const priceFields = buildPriceFields(product, null, existingItems);
      const barcode = formatDrcCode(nextBarcodeNumber);
      nextBarcodeNumber += 1;
      const notes = buildNotes(product);

      summary.inserted.push({
        name: product.name,
        brand: product.brand || "",
        barcode,
        quantity: Number(product.quantity),
        productCode: product.productCode || "",
      });

      if (!APPLY_CHANGES) {
        existingItems.push({
          id: -1 * nextBarcodeNumber,
          name: product.name,
          brand: product.brand,
          category: product.category,
          unit: product.unit,
          minStock: 0,
          productCode: product.productCode || "",
          barcode,
          notes,
          defaultPrice: priceFields.defaultPrice,
          listPrice: priceFields.listPrice,
          salePrice: priceFields.salePrice,
          isActive: trueValue(),
        });
        summary.movementInserted.push({
          itemId: null,
          name: product.name,
          quantity: Number(product.quantity),
        });
        continue;
      }

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
            list_price,
            sale_price,
            is_active
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `,
        [
          product.name,
          product.brand || "",
          product.category,
          product.unit,
          0,
          product.productCode || "",
          barcode,
          notes,
          priceFields.defaultPrice,
          priceFields.listPrice,
          priceFields.salePrice,
          trueValue(),
        ]
      );

      const itemId = Number(result.rows?.[0]?.id || result.lastInsertId || 0);

      await tx.execute(
        `
          INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id)
          VALUES (?, 'entry', ?, ?, ?, ?, ?)
        `,
        [
          itemId,
          Number(product.quantity),
          resolveEntryUnitPrice(product, null, existingItems),
          ENTRY_DATE,
          movementNote,
          adminUser?.id ? Number(adminUser.id) : null,
        ]
      );

      existingItems.push({
        id: itemId,
        name: product.name,
        brand: product.brand,
        category: product.category,
        unit: product.unit,
        minStock: 0,
        productCode: product.productCode || "",
        barcode,
        notes,
        defaultPrice: priceFields.defaultPrice,
        listPrice: priceFields.listPrice,
        salePrice: priceFields.salePrice,
        isActive: trueValue(),
      });
      summary.movementInserted.push({
        itemId,
        name: product.name,
        quantity: Number(product.quantity),
      });
    }

    if (!APPLY_CHANGES) {
      throw new DryRunComplete(summary);
    }
  });

  console.log(JSON.stringify(summary, null, 2));
}

function buildPatch(existing, product, existingItems) {
  const priceFields = buildPriceFields(product, existing, existingItems);
  const nextName = product.replaceNameOnMatch ? product.name : existing.name;
  const nextBrand = product.replaceBrandOnMatch ? (product.brand || existing.brand || "") : (existing.brand || product.brand || "");
  const nextCategory = product.replaceCategoryOnMatch || shouldReplaceCategory(existing.category)
    ? product.category
    : existing.category;
  const nextUnit = shouldReplaceUnit(existing.unit) ? product.unit : (existing.unit || product.unit);
  const nextMinStock = Number(existing.minStock || 0);
  const nextProductCode = existing.productCode || product.productCode || "";
  const nextNotes = mergeNotes(existing.notes, buildNotes(product));
  const changed =
    String(existing.name || "") !== String(nextName || "") ||
    String(existing.brand || "") !== String(nextBrand || "") ||
    String(existing.category || "") !== String(nextCategory || "") ||
    String(existing.unit || "") !== String(nextUnit || "") ||
    Number(existing.minStock || 0) !== nextMinStock ||
    String(existing.productCode || "") !== String(nextProductCode || "") ||
    String(existing.notes || "") !== String(nextNotes || "") ||
    Number(existing.defaultPrice || 0) !== Number(priceFields.defaultPrice || 0) ||
    Number(existing.listPrice || 0) !== Number(priceFields.listPrice || 0) ||
    Number(existing.salePrice || 0) !== Number(priceFields.salePrice || 0) ||
    !toBoolean(existing.isActive);

  if (!changed) {
    return null;
  }

  return {
    name: nextName,
    brand: nextBrand,
    category: nextCategory,
    unit: nextUnit,
    minStock: nextMinStock,
    productCode: nextProductCode,
    notes: nextNotes,
    defaultPrice: priceFields.defaultPrice,
    listPrice: priceFields.listPrice,
    salePrice: priceFields.salePrice,
  };
}

function buildPriceFields(product, existing, existingItems) {
  const incomingPrice = Number(product.priceEur || 0);
  const referencePrice = resolveReferencePrice(existingItems, product);
  const fallbackPrice = incomingPrice > 0 ? incomingPrice : referencePrice;

  if (!existing) {
    return {
      defaultPrice: fallbackPrice,
      listPrice: fallbackPrice,
      salePrice: fallbackPrice,
    };
  }

  if (incomingPrice > 0 && product.overridePriceOnMatch) {
    return {
      defaultPrice: incomingPrice,
      listPrice: incomingPrice,
      salePrice: incomingPrice,
    };
  }

  return {
    defaultPrice: Number(existing.defaultPrice || 0) > 0 ? Number(existing.defaultPrice) : fallbackPrice,
    listPrice: Number(existing.listPrice || 0) > 0 ? Number(existing.listPrice) : fallbackPrice,
    salePrice: Number(existing.salePrice || 0) > 0 ? Number(existing.salePrice) : fallbackPrice,
  };
}

function resolveEntryUnitPrice(product, existing, existingItems) {
  if (Number(product.priceEur || 0) > 0) {
    return Number(product.priceEur || 0);
  }

  const explicitEntryPrice = Number(product.entryUnitPrice || 0);
  if (explicitEntryPrice > 0) {
    return explicitEntryPrice;
  }

  if (existing) {
    if (Number(existing.defaultPrice || 0) > 0) {
      return Number(existing.defaultPrice || 0);
    }
    if (Number(existing.listPrice || 0) > 0) {
      return Number(existing.listPrice || 0);
    }
  }

  return resolveReferencePrice(existingItems, product);
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
  const wantedCodes = [product.productCode, ...(product.aliases || [])].map(normalizeCode).filter(Boolean);
  const wantedName = normalizeText(product.name);
  const wantedBrand = normalizeText(product.brand);
  let bestMatch = null;
  let bestScore = 0;

  for (const item of existingItems) {
    const score = scoreExistingItem(item, wantedCodes, wantedName, wantedBrand, product.aliases || []);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestScore >= 70 ? bestMatch : null;
}

function findForcedItem(existingItems, product) {
  const wantedProductCode = normalizeCode(product.productCode);
  const wantedName = normalizeText(product.name);
  const wantedBrand = normalizeText(product.brand);

  return existingItems.find((item) => {
    const itemProductCode = normalizeCode(item.productCode);
    if (wantedProductCode && itemProductCode && itemProductCode === wantedProductCode) {
      return true;
    }

    return normalizeText(item.name) === wantedName && normalizeText(item.brand) === wantedBrand;
  }) || null;
}

function scoreExistingItem(item, wantedCodes, wantedName, wantedBrand, aliases) {
  const itemName = normalizeText(item.name);
  const itemBrand = normalizeText(item.brand);
  const itemCode = normalizeCode(item.productCode);
  const haystack = normalizeText([item.name, item.brand, item.category, item.productCode, item.notes, item.barcode].filter(Boolean).join(" | "));
  let score = 0;

  if (wantedBrand && itemBrand === wantedBrand) {
    score += 20;
  }

  if (itemName === wantedName) {
    score += 50;
  } else if (itemName.includes(wantedName) || wantedName.includes(itemName)) {
    score += 30;
  }

  for (const code of wantedCodes) {
    if (!code) {
      continue;
    }
    if (itemCode && itemCode === code) {
      score += 120;
      continue;
    }
    if (haystack.includes(normalizeText(code))) {
      score += 36;
    }
  }

  for (const alias of aliases) {
    const aliasText = normalizeText(alias);
    if (aliasText && haystack.includes(aliasText)) {
      score += 14;
    }
  }

  if (toBoolean(item.isActive)) {
    score += 4;
  }

  return score;
}

function resolveReferencePrice(existingItems, product) {
  const wantedCodes = [product.productCode, ...(product.aliases || [])].map(normalizeCode).filter(Boolean);
  const wantedBrand = normalizeText(product.brand);

  for (const item of existingItems) {
    const itemCode = normalizeCode(item.productCode);
    if (!itemCode || !wantedCodes.includes(itemCode)) {
      continue;
    }
    if (wantedBrand && normalizeText(item.brand) !== wantedBrand) {
      continue;
    }
    const price = firstPositiveNumber(item.defaultPrice, item.listPrice, item.salePrice);
    if (price > 0) {
      return price;
    }
  }

  for (const item of existingItems) {
    const haystack = normalizeText([item.name, item.brand, item.category, item.productCode, item.notes].filter(Boolean).join(" | "));
    if (!wantedCodes.some((code) => code && haystack.includes(normalizeText(code)))) {
      continue;
    }
    const price = firstPositiveNumber(item.defaultPrice, item.listPrice, item.salePrice);
    if (price > 0) {
      return price;
    }
  }

  return 0;
}

function buildNotes(product) {
  return [
    "Kaynak: 2026 Nisan guncel stok giris listesi",
    product.productCode ? `urun kodu: ${product.productCode}` : "",
    ...(product.notes || []),
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildMovementNote(product) {
  return [
    ENTRY_NOTE_BASE,
    product.productCode || product.name,
    ...(product.movementNotes || []),
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

function shouldReplaceCategory(category) {
  const normalized = normalizeText(category);
  return !normalized || normalized === "GENEL";
}

function shouldReplaceUnit(unit) {
  const normalized = normalizeText(unit);
  return !normalized || normalized === "PCS" || normalized === "PIECE" || normalized === "PIECES";
}

function formatDrcCode(number) {
  return `DRC-${String(number).padStart(5, "0")}`;
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const number = Number(value || 0);
    if (number > 0) {
      return number;
    }
  }
  return 0;
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

function toBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function trueValue() {
  return process.env.DATABASE_URL ? true : 1;
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

class DryRunComplete extends Error {
  constructor(summary) {
    super("DRY_RUN_COMPLETE");
    this.name = "DryRunComplete";
    this.summary = summary;
  }
}

main().catch((error) => {
  if (error instanceof DryRunComplete) {
    console.log(JSON.stringify(error.summary, null, 2));
    return;
  }

  console.error(error);
  process.exitCode = 1;
});
