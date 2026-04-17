const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, query, get, execute, withTransaction } = require("../server/db");

const SOURCE_HTML = "/Users/anilakbas/Downloads/stok_listesi_v4.html";
const COUNT_DATE = "2026-04-15";
const NOTE_PREFIX = "2026-04-15 fiziksel sayim mutabakati";
const APPLY = process.argv.includes("--apply");

const IGNORE_ROWS = new Set([
  "Soğuk Oda Kapısı|Derece||Soğuk oda kapısı|40 adet|90×190 cm, rezistanslı",
  "Soğuk Oda Kapısı|DRC||Soğuk oda kapısı|27 adet|80×180 cm, rezistanslı",
  "Soğutkan Gaz||R290|Soğutucu gaz|24 adet|6 kg'lık tüp",
  "Yağ|Erecom|POE 68|Kompresör yağı|20 L|",
]);

const MANUAL_TARGETS = [
  {
    name: "Menteseli Soguk Hava Depo Kapisi (100mm Poly-Poly)",
    brand: "Kontak",
    category: "Soguk Oda Kapilari",
    unit: "adet",
    quantity: 51,
    productCode: "KAPI-MENTESELI-100MM-POLY",
    notes: "Kaynak: 2026-04-15 fiziksel sayim | Kullanici duzeltmesi: ana kapi sayimi 51",
    matchAny: ["menteseli soguk hava depo kapisi", "100mm poly poly", "soguk hava depo kapisi"],
    preferredTokens: ["menteseli soguk hava depo kapisi (100mm poly poly)"],
  },
  {
    name: "Soguk Hava Depo Kapisi",
    brand: "Kontak",
    category: "Soguk Oda Kapilari",
    unit: "adet",
    quantity: 31,
    productCode: "KAPI-GENEL-SOGUK-HAVA-DEPO",
    notes: "Kaynak: 2026-04-15 fiziksel sayim | Kullanici duzeltmesi: genel kapi sayimi 31",
    matchAny: ["soguk hava depo kapisi"],
    preferredTokens: ["soguk hava depo kapisi"],
  },
  {
    name: "R290 Propan Gazi 6 KG",
    brand: "Genel",
    category: "Sogutucu Gaz",
    unit: "adet",
    quantity: 24,
    productCode: "R290-6KG",
    compactModel: compact("R2906KG"),
    notes: "Kaynak: 2026-04-15 fiziksel sayim | Kullanici duzeltmesi: sadece 6kg tup var",
    matchAny: ["r290", "6 kg", "propan"],
    preferredTokens: ["r290 propan gazi 6 kg"],
  },
  {
    name: "Errecom Endustriyel POE 68 Yag Bidonu 20L",
    brand: "Errecom",
    category: "Sogutma Yaglari",
    unit: "adet",
    quantity: 54,
    productCode: "ERRECOM-POE68-20L",
    compactModel: compact("POE6820L"),
    notes: "Kaynak: 2026-04-15 fiziksel sayim | Kullanici duzeltmesi: 54 adet 20L bidon",
    matchAny: ["errecom", "endustriyel", "poe", "bidon"],
    preferredTokens: ["endustriyel poe yag bidonu", "poe 68 yag bidonu"],
  },
];

async function main() {
  if (!fs.existsSync(SOURCE_HTML)) {
    throw new Error(`Sayim listesi bulunamadi: ${SOURCE_HTML}`);
  }

  await initDatabase();
  debug("db initialized");

  const parsedRows = parseHtmlList(fs.readFileSync(SOURCE_HTML, "utf8"));
  const desiredTargets = [...buildTargetsFromHtml(parsedRows), ...MANUAL_TARGETS].map((target, index) => ({
    ...target,
    desiredKey: `target-${index + 1}`,
  }));
  debug(`targets built: ${desiredTargets.length}`);

  const adminUser = await get(
    "SELECT id, username FROM users WHERE username = ? OR LOWER(role) = 'admin' ORDER BY CASE WHEN username = ? THEN 0 ELSE 1 END, id ASC LIMIT 1",
    ["cagatayhorasan", "cagatayhorasan"]
  );

  const summary = {
    mode: APPLY ? "apply" : "dry-run",
    sourceHtml: SOURCE_HTML,
    countDate: COUNT_DATE,
    desiredCount: desiredTargets.length,
    created: [],
    reused: [],
    patched: [],
    cleaned: [],
    adjusted: [],
    archived: [],
    unmatchedDesired: [],
  };

  await withTransaction(async (tx) => {
    debug("transaction start");
    await tx.execute("DELETE FROM movements WHERE note LIKE ?", [`${NOTE_PREFIX}%`]);
    debug("old reconcile notes deleted");

    let items = await queryItems();
    debug(`items loaded: ${items.length}`);
    let nextBarcodeNumber = getNextBarcodeNumber(items);
    const canonicalIds = new Set();
    const targetItemMap = new Map();
    const usedItemIds = new Set();

    for (const target of desiredTargets) {
      const match = target.forceCreate ? { item: null, score: 0 } : findBestItemMatch(items, target, usedItemIds);
      let item = match && match.score >= 70 ? match.item : null;

      if (!item) {
        const barcode = formatDrcCode(nextBarcodeNumber++);
        const reference = findBestPriceReference(items, target);
        const insertResult = APPLY
          ? await tx.execute(
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
                VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
              `,
              [
                target.name,
                target.brand,
                target.category,
                target.unit,
                target.productCode,
                barcode,
                target.notes,
                reference.defaultPrice,
                reference.listPrice,
                reference.salePrice,
                trueValue(),
              ]
            )
          : { rows: [{ id: -1 * nextBarcodeNumber }] };

        item = {
          id: Number(insertResult.rows?.[0]?.id || insertResult.lastInsertId || 0),
          name: target.name,
          brand: target.brand,
          category: target.category,
          unit: target.unit,
          productCode: target.productCode,
          barcode,
          notes: target.notes,
          defaultPrice: reference.defaultPrice,
          listPrice: reference.listPrice,
          salePrice: reference.salePrice,
          isActive: trueValue(),
        };

        items.push(item);
        summary.created.push({
          itemId: item.id,
          name: item.name,
          quantity: target.quantity,
          unit: target.unit,
        });
      } else {
        summary.reused.push({
          itemId: Number(item.id),
          previousName: item.name,
          targetName: target.name,
          quantity: target.quantity,
          unit: target.unit,
        });

        const patch = buildItemPatch(item, target);
        if (patch.changed) {
          summary.patched.push({
            itemId: Number(item.id),
            previousName: item.name,
            nextName: patch.name,
          });

          if (APPLY) {
            await tx.execute(
              `
                UPDATE items
                SET name = ?, brand = ?, category = ?, unit = ?, product_code = ?, notes = ?, is_active = ?, default_price = ?, list_price = ?, sale_price = ?
                WHERE id = ?
              `,
              [
                patch.name,
                patch.brand,
                patch.category,
                patch.unit,
                patch.productCode,
                patch.notes,
                trueValue(),
                patch.defaultPrice,
                patch.listPrice,
                patch.salePrice,
                Number(item.id),
              ]
            );
          }

          Object.assign(item, patch, { isActive: trueValue() });
        }
      }

      canonicalIds.add(Number(item.id));
      targetItemMap.set(target.desiredKey, Number(item.id));
      usedItemIds.add(Number(item.id));
    }
    debug(`canonical targets resolved: ${canonicalIds.size}`);

    const stockRows = await queryCurrentStock(tx);
    debug(`current stock rows loaded: ${stockRows.length}`);
    for (const row of stockRows) {
      const itemId = Number(row.id);
      const stock = Number(row.stock || 0);
      if (canonicalIds.has(itemId)) {
        continue;
      }
      if (stock <= 0) {
        continue;
      }

      summary.cleaned.push({
        itemId,
        name: row.name,
        removedQuantity: stock,
      });

      if (APPLY) {
        await tx.execute(
          `
            INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id)
            VALUES (?, 'exit', ?, 0, ?, ?, ?)
          `,
          [
            itemId,
            stock,
            COUNT_DATE,
            `${NOTE_PREFIX} | eski stok temizligi`,
            adminUser?.id ? Number(adminUser.id) : null,
          ]
        );
        await tx.execute(
          `
            UPDATE items
            SET is_active = ?, notes = ?
            WHERE id = ?
          `,
          [
            falseValue(),
            appendNote(row.notes, "Arsiv: 2026-04-15 fiziksel sayim disi stok temizligi"),
            itemId,
          ]
        );
      }

      summary.archived.push({
        itemId,
        name: row.name,
      });
    }
    debug(`old stock cleaned candidates: ${summary.cleaned.length}`);

    const canonicalStocks = await queryCurrentStock(tx, Array.from(canonicalIds));
    debug(`canonical stock rows loaded: ${canonicalStocks.length}`);
    const stockMap = new Map(canonicalStocks.map((row) => [Number(row.id), Number(row.stock || 0)]));

    for (const target of desiredTargets) {
      const targetItemId = Number(targetItemMap.get(target.desiredKey) || 0);
      const item = items.find((entry) => Number(entry.id) === targetItemId);
      if (!item) {
        summary.unmatchedDesired.push(target.name);
        continue;
      }

      const currentStock = Number(stockMap.get(Number(item.id)) || 0);
      const desiredStock = Number(target.quantity || 0);
      const delta = round2(desiredStock - currentStock);
      if (Math.abs(delta) < 0.0001) {
        continue;
      }

      summary.adjusted.push({
        itemId: Number(item.id),
        name: item.name,
        from: currentStock,
        to: desiredStock,
        delta,
      });

      if (!APPLY) {
        continue;
      }

      await tx.execute(
        `
          INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          Number(item.id),
          delta > 0 ? "entry" : "exit",
          Math.abs(delta),
          resolveUnitPrice(item),
          COUNT_DATE,
          `${NOTE_PREFIX} | fiziksel sayim esitlemesi`,
          adminUser?.id ? Number(adminUser.id) : null,
        ]
      );
    }

    if (!APPLY) {
      debug("dry run complete throw");
      throw new DryRunComplete(summary);
    }
  });
  debug("transaction committed");

  const reportPath = path.join(process.cwd(), "data", "reports", "stock-hard-clean-report-2026-04-15.json");
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ reportPath, ...summary }, null, 2));
}

function parseHtmlList(html) {
  const pattern = /\{cat:"(.*?)",cc:"(.*?)",marka:"(.*?)",model:"(.*?)",acik:"(.*?)",adet:"(.*?)",detay:"(.*?)"\}/g;
  const rows = [];
  let match = null;
  while ((match = pattern.exec(html)) !== null) {
    rows.push({
      cat: match[1],
      cc: match[2],
      marka: match[3],
      model: match[4],
      acik: match[5],
      adet: match[6],
      detay: match[7],
    });
  }
  return rows;
}

function buildTargetsFromHtml(rows) {
  const targets = [];
  for (const row of rows) {
    const signature = `${row.cat}|${row.marka}|${row.model}|${row.acik}|${row.adet}|${row.detay}`;
    if (IGNORE_ROWS.has(signature)) {
      continue;
    }
    const parsed = parseCount(row.adet);
    if (!parsed) {
      continue;
    }
    targets.push(normalizeRowToTarget(row, parsed));
  }
  return targets;
}

function normalizeRowToTarget(row, parsed) {
  const brand = row.marka && row.marka !== "—" ? ascii(row.marka) : deriveBrandFromRow(row);
  const model = row.model && row.model !== "—" ? ascii(row.model) : "";
  const category = ascii(row.cat);
  const detail = ascii(row.detay);
  const description = ascii(row.acik);
  const explicit = buildSpecialTarget(row, parsed);
  if (explicit) {
    return explicit;
  }

  const notes = [
    "Kaynak: 2026-04-15 fiziksel sayim",
    detail ? `Detay: ${detail}` : "",
    model ? `Model: ${model}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    name: buildDisplayName(brand, model, description, detail),
    brand,
    category,
    unit: parsed.unit,
    quantity: parsed.quantity,
    productCode: deriveProductCode(model, brand, description),
    compactModel: compact(model),
    notes,
    forceCreate: shouldForceCreateRow(row),
    matchAny: buildSearchTokens([brand, model, description, detail, category]),
    preferredTokens: buildPreferredTokens(brand, model),
  };
}

function buildSpecialTarget(row, parsed) {
  const brand = ascii(row.marka);
  const model = ascii(row.model);
  const category = ascii(row.cat);
  const detail = ascii(row.detay);

  if (brand === "LUPREZE" && model === "POE 32") {
    return {
      name: "Lubreeze POE 32 Yag 5L Teneke",
      brand: "Lubreeze",
      category: "Sogutma Yaglari",
      unit: "adet",
      quantity: 196,
      productCode: "LUBREEZE-POE32-5L",
      notes: "Kaynak: 2026-04-15 fiziksel sayim | 5L teneke",
      compactModel: compact("POE 32"),
      matchAny: ["poe 32", "5 lt", "lubreeze"],
      preferredTokens: ["poe 32 5 lt", "lubreeze poe 32"],
    };
  }

  if (brand === "LUPREZE" && model === "POE 68") {
    return {
      name: "Lubreeze POE 68 Yag 5L Teneke",
      brand: "Lubreeze",
      category: "Sogutma Yaglari",
      unit: "adet",
      quantity: 6,
      productCode: "LUBREEZE-POE68-5L",
      notes: "Kaynak: 2026-04-15 fiziksel sayim | 5L teneke",
      compactModel: compact("POE 68"),
      matchAny: ["poe 68", "5 lt", "lubreeze"],
      preferredTokens: ["poe 68 5 lt", "lubreeze poe 68"],
    };
  }

  if (brand === "ERECOM" && model === "POE 170" && detail.includes("4 L")) {
    return {
      name: "Errecom POE 170 Yag 4L Plastik Bidon",
      brand: "Errecom",
      category: "Sogutma Yaglari",
      unit: "adet",
      quantity: 400,
      productCode: "ERRECOM-POE170-4L",
      notes: "Kaynak: 2026-04-15 fiziksel sayim | 4L plastik bidon",
      compactModel: compact("POE1704L"),
      matchAny: ["errecom", "poe 170", "4lt", "4 l"],
      preferredTokens: ["poe 170 4lt"],
    };
  }

  if (brand === "ERECOM" && model === "POE 170" && detail === "1 L") {
    return {
      name: "Errecom POE 170 Yag 1L",
      brand: "Errecom",
      category: "Sogutma Yaglari",
      unit: "adet",
      quantity: 660,
      productCode: "ERRECOM-POE170-1L",
      notes: "Kaynak: 2026-04-15 fiziksel sayim | 1L kutu",
      compactModel: compact("POE1701L"),
      matchAny: ["errecom", "poe 170", "1lt", "1 l"],
      preferredTokens: ["poe 170 1lt"],
    };
  }

  if (brand === "ERECOM" && model === "POE 68" && detail.includes("4 L")) {
    return {
      name: "Errecom POE 68 Yag 4L Plastik Bidon",
      brand: "Errecom",
      category: "Sogutma Yaglari",
      unit: "adet",
      quantity: 168,
      productCode: "ERRECOM-POE68-4L",
      notes: "Kaynak: 2026-04-15 fiziksel sayim | 4L plastik bidon",
      compactModel: compact("POE684L"),
      matchAny: ["errecom", "poe 68", "4lt", "4 l"],
      preferredTokens: ["poe 68 4lt"],
    };
  }

  if (brand === "EMBRACO" && model === "NEU6215GK") {
    return {
      name: "Embraco NEU6215GK (R404A)",
      brand: "Embraco",
      category: "Kompresorler",
      unit: "adet",
      quantity: parsed.quantity,
      productCode: "NEU6215GK",
      notes: "Kaynak: 2026-04-15 fiziksel sayim | 6215 ailesi tek karta indirildi",
      compactModel: compact("NEU6215GK"),
      forceCreate: false,
      matchAny: ["6215", "neu6215gk", "6215 gk r 404", "grup 6215gk"],
      preferredTokens: ["neu6215gk kompressor", "neu6215gk"],
    };
  }

  if (brand === "EMBRACO" && model === "NEU6220GK") {
    return {
      name: "Embraco NEU6220GK (R404A)",
      brand: "Embraco",
      category: "Kompresorler",
      unit: "adet",
      quantity: parsed.quantity,
      productCode: "NEU6220GK",
      notes: "Kaynak: 2026-04-15 fiziksel sayim | 6220 ailesi tek karta indirildi",
      compactModel: compact("NEU6220GK"),
      forceCreate: false,
      matchAny: ["6220", "neu6220gk", "neu 6220gk csr"],
      preferredTokens: ["neu6220gk kompressor", "neu6220gk"],
    };
  }

  if (brand === "EMBRACO" && model === "FF 8.5 HBK") {
    return {
      name: "Embraco FF 8.5 HBK (R134a)",
      brand: "Embraco",
      category: "Kompresorler",
      unit: "adet",
      quantity: parsed.quantity,
      productCode: "FF-8.5HBK",
      notes: "Kaynak: 2026-04-15 fiziksel sayim",
      compactModel: compact("FF8.5HBK"),
      forceCreate: false,
      matchAny: ["ff 8.5 hbk", "ff 8.5hbk"],
      preferredTokens: ["ff 8.5 hbk"],
    };
  }

  if (category === "KONTROL / ELEKTRIK" && model === "DCB 31") {
    return {
      name: "DRC Dijital Kontrolor DCB31",
      brand: "DRC",
      category: "Kontrol Cihazlari",
      unit: "adet",
      quantity: parsed.quantity,
      productCode: "DCB31",
      notes: "Kaynak: 2026-04-15 fiziksel sayim | 30 amper tek sensor",
      compactModel: compact("DCB31"),
      matchAny: ["dcb31", "dcb 31"],
      preferredTokens: ["dcb31"],
    };
  }

  if (category === "KONTROL / ELEKTRIK" && model === "DCB 100 Plus") {
    return {
      name: "DRC DCB100 Plus Kontrol Paneli",
      brand: "DRC",
      category: "Kontrol Cihazlari",
      unit: "adet",
      quantity: parsed.quantity,
      productCode: "DCB100-PLUS",
      notes: "Kaynak: 2026-04-15 fiziksel sayim",
      compactModel: compact("DCB100PLUS"),
      matchAny: ["dcb100", "dcb 100 plus"],
      preferredTokens: ["dcb100"],
    };
  }

  if (category === "SOGUK ODA PANELI") {
    return {
      name: "Sandvic Panel 100mm 1x4 Metre",
      brand: brand || "Mespan",
      category: "Panel Sistemleri",
      unit: "adet",
      quantity: 60,
      productCode: "PANEL-100MM-1X4",
      notes: "Kaynak: 2026-04-15 fiziksel sayim | 1x4 metre panel",
      compactModel: compact("PANEL100MM1X4"),
      matchAny: ["ppwp 100", "100mm", "panel"],
      preferredTokens: ["ppwp 100", "100mm poly poly"],
    };
  }

  return null;
}

function parseCount(raw) {
  const value = ascii(raw).trim();
  const numberMatch = value.match(/([0-9]+(?:[.,][0-9]+)?)/);
  if (!numberMatch) {
    return null;
  }
  const quantity = Number(numberMatch[1].replace(",", "."));
  if (Number.isNaN(quantity)) {
    return null;
  }
  if (value.includes("RULO")) {
    return { quantity, unit: "rulo" };
  }
  if (value.includes("KUTU")) {
    return { quantity, unit: "kutu" };
  }
  if (value.includes("M")) {
    return { quantity, unit: "m" };
  }
  if (value.includes("L")) {
    return { quantity, unit: "adet" };
  }
  return { quantity, unit: "adet" };
}

function deriveBrandFromRow(row) {
  if (row.cat.toLowerCase().includes("kontrol")) {
    return "DRC";
  }
  return "Genel";
}

function buildDisplayName(brand, model, description, detail) {
  const parts = [];
  if (brand) {
    parts.push(toTitleCase(brand));
  }
  if (model) {
    parts.push(model);
  }
  const genericDescriptions = new Set([
    "HERMETIK KOMPRESOR",
    "KOMPRESOR",
    "KOMPRESOR YAGI",
    "EVAPORATOR",
    "VRF DIS UNITE",
    "VRF IC UNITE",
    "Q FAN",
    "SOGUK ODA KAPISI",
    "SOGUTUCU GAZ",
  ]);
  if (description && !genericDescriptions.has(description)) {
    parts.push(toTitleCase(description));
  }
  if (!parts.length && detail) {
    parts.push(toTitleCase(detail));
  }
  return dedupeWords(parts.join(" ").trim());
}

function shouldForceCreateRow(row) {
  const category = ascii(row.cat);
  const brand = ascii(row.marka);
  const model = ascii(row.model);
  const description = ascii(row.acik);

  if (category.startsWith("KLIMA")) {
    return true;
  }
  if (category === "PROFIL / PANEL AKSESUAR" || category === "KOPUK BORU") {
    return true;
  }
  if (brand === "DUNAN" || brand === "TECOLD") {
    return true;
  }
  if (model.includes("GMH 052")) {
    return true;
  }
  if (brand === "OTTOCOOL" && description.includes("VRF")) {
    return true;
  }
  if ((brand === "EMBRACO" || brand === "COPELAND") && !model) {
    return true;
  }
  if (brand === "ECOLINE") {
    return true;
  }
  return false;
}

function deriveProductCode(model, brand, description) {
  const source = model || `${brand}-${description}`;
  return ascii(source)
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function buildSearchTokens(values) {
  const stop = new Set(["ADET", "IC", "DIS", "TIPI", "KOMPRESOR", "KOMPRESORU", "EVAPORATOR", "URUN", "VE", "ILE", "GENEL", "SOGUK", "ODA", "KAPISI", "KAPISI", "KOMPRESOR", "YAGI"]);
  const tokens = [];
  for (const value of values) {
    for (const token of ascii(value).split(/[^A-Z0-9]+/)) {
      if (!token || stop.has(token) || token.length < 2) {
        continue;
      }
      if (!tokens.includes(token.toLowerCase())) {
        tokens.push(token.toLowerCase());
      }
    }
  }
  return tokens;
}

function buildPreferredTokens(brand, model) {
  return buildSearchTokens([brand, model]).slice(0, 4);
}

async function queryItems() {
  return query(`
    SELECT
      id,
      name,
      COALESCE(brand, '') AS brand,
      COALESCE(category, '') AS category,
      COALESCE(unit, '') AS unit,
      COALESCE(product_code, '') AS "productCode",
      COALESCE(barcode, '') AS barcode,
      COALESCE(notes, '') AS notes,
      COALESCE(default_price, 0) AS "defaultPrice",
      COALESCE(list_price, 0) AS "listPrice",
      COALESCE(sale_price, 0) AS "salePrice",
      is_active AS "isActive"
    FROM items
  `);
}

async function queryCurrentStock(tx, ids = null) {
  const params = [];
  let where = "WHERE COALESCE(stock, 0) <> 0";
  if (ids && ids.length) {
    where += ` AND id IN (${ids.map(() => "?").join(", ")})`;
    params.push(...ids);
  }
  return tx.query(
    `
      SELECT *
      FROM (
        SELECT
          items.id,
          items.name,
          COALESCE(items.brand, '') AS brand,
          COALESCE(items.notes, '') AS notes,
          COALESCE(SUM(CASE WHEN movements.type = 'entry' THEN movements.quantity ELSE -movements.quantity END), 0) AS stock
        FROM items
        LEFT JOIN movements ON movements.item_id = items.id
        GROUP BY items.id
      ) inventory
      ${where}
      ORDER BY LOWER(name)
    `,
    params
  );
}

function findBestItemMatch(items, target, usedItemIds = new Set()) {
  let best = null;
  let bestScore = 0;
  for (const item of items) {
    if (usedItemIds.has(Number(item.id))) {
      continue;
    }
    const score = scoreItemMatch(item, target);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return { item: best, score: bestScore };
}

function scoreItemMatch(item, target) {
  const haystack = normalizeText([item.name, item.brand, item.category, item.productCode, item.notes].join(" | "));
  const haystackCompact = compact([item.name, item.brand, item.category, item.productCode, item.notes].join(" "));
  const itemName = normalizeText(item.name);
  const targetName = normalizeText(target.name);
  let score = 0;

  if (target.compactModel && target.compactModel.length >= 4) {
    if (haystackCompact.includes(target.compactModel)) {
      score += 80;
    } else if (normalizeCode(item.productCode) !== normalizeCode(target.productCode)) {
      return 0;
    }
  }

  if (itemName === targetName) {
    score += 120;
  } else if (itemName.includes(targetName) || targetName.includes(itemName)) {
    score += 60;
  }

  if (normalizeText(item.brand) === normalizeText(target.brand)) {
    score += 20;
  }

  if (normalizeCode(item.productCode) && normalizeCode(item.productCode) === normalizeCode(target.productCode)) {
    score += 80;
  }

  for (const token of target.matchAny || []) {
    if (haystack.includes(normalizeText(token))) {
      score += 10;
    }
  }

  for (const token of target.preferredTokens || []) {
    if (haystack.includes(normalizeText(token))) {
      score += 20;
    }
  }

  if (normalizeText(item.unit) === normalizeText(target.unit)) {
    score += 5;
  }

  return score;
}

function findBestPriceReference(items, target) {
  const match = findBestItemMatch(items, target);
  const item = match.item;
  if (!item || match.score < 40) {
    return { defaultPrice: 0, listPrice: 0, salePrice: 0 };
  }
  return {
    defaultPrice: Number(item.defaultPrice || 0),
    listPrice: Number(item.listPrice || 0),
    salePrice: Number(item.salePrice || 0),
  };
}

function buildItemPatch(item, target) {
  const reference = findBestPriceReference([item], target);
  const patch = {
    name: target.name,
    brand: target.brand,
    category: target.category,
    unit: target.unit,
    productCode: target.productCode,
    notes: mergeNotes(item.notes, target.notes),
    defaultPrice: Number(item.defaultPrice || reference.defaultPrice || 0),
    listPrice: Number(item.listPrice || reference.listPrice || item.defaultPrice || 0),
    salePrice: Number(item.salePrice || reference.salePrice || item.defaultPrice || 0),
  };
  patch.changed =
    String(item.name || "") !== patch.name ||
    String(item.brand || "") !== patch.brand ||
    String(item.category || "") !== patch.category ||
    String(item.unit || "") !== patch.unit ||
    String(item.productCode || "") !== patch.productCode ||
    String(item.notes || "") !== patch.notes ||
    Number(item.defaultPrice || 0) !== Number(patch.defaultPrice || 0) ||
    Number(item.listPrice || 0) !== Number(patch.listPrice || 0) ||
    Number(item.salePrice || 0) !== Number(patch.salePrice || 0) ||
    !toBoolean(item.isActive);
  return patch;
}

function getNextBarcodeNumber(items) {
  let max = 0;
  for (const item of items) {
    const match = String(item.barcode || "").match(/^DRC-(\d+)$/i);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return max + 1;
}

function formatDrcCode(number) {
  return `DRC-${String(number).padStart(5, "0")}`;
}

function resolveUnitPrice(item) {
  return Number(item.defaultPrice || item.listPrice || item.salePrice || 0);
}

function appendNote(existing, extra) {
  return mergeNotes(existing, extra);
}

function mergeNotes(existing, extra) {
  const parts = [];
  for (const value of [existing, extra]) {
    for (const part of String(value || "").split("|")) {
      const cleaned = part.trim();
      if (!cleaned) {
        continue;
      }
      if (!parts.some((entry) => normalizeText(entry) === normalizeText(cleaned))) {
        parts.push(cleaned);
      }
    }
  }
  return parts.join(" | ");
}

function dedupeWords(value) {
  const result = [];
  for (const part of value.split(/\s+/)) {
    if (!part) {
      continue;
    }
    if (!result.some((entry) => normalizeText(entry) === normalizeText(part))) {
      result.push(part);
    }
  }
  return result.join(" ");
}

function normalizeText(value) {
  return ascii(value)
    .replace(/[^A-Z0-9/.+-]+/g, " ")
    .trim();
}

function normalizeCode(value) {
  return ascii(value).replace(/\s+/g, "");
}

function ascii(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "G")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "U")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "S")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "O")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .replace(/×/g, "x")
    .trim()
    .toUpperCase();
}

function compact(value) {
  return ascii(value).replace(/[^A-Z0-9]+/g, "");
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function toBoolean(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function trueValue() {
  return process.env.DATABASE_URL ? true : 1;
}

function falseValue() {
  return process.env.DATABASE_URL ? false : 0;
}

function debug(message) {
  if (!process.env.DEBUG_RECONCILE) {
    return;
  }
  console.error(`[reconcile-debug] ${message}`);
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
    if (!(key in process.env)) {
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
    const reportPath = path.join(process.cwd(), "data", "reports", "stock-hard-clean-report-2026-04-15.dry-run.json");
    fs.writeFileSync(reportPath, JSON.stringify(error.summary, null, 2));
    console.log(JSON.stringify({ reportPath, ...error.summary }, null, 2));
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
