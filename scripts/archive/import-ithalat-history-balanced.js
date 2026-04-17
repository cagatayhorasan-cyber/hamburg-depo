const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const SOURCE_DIR = process.argv[2] || "/Users/anilakbas/Desktop/İthalat Faturaları";
const IMPORT_USER_ID = Number(process.env.IMPORT_USER_ID || 44);
const HISTORY_NOTE_MARKER = "Ithalat klasoru gecmis kaydi";
const DRY_RUN = process.env.DRY_RUN === "1";
const SKIP_FILE_NAMES = new Set([
  "258010.S.DRC SOĞUTMA-12.12.2025.pdf",
  "Bys-Kontak Fatura 13.05.2025.pdf",
  "HamburgStokFiyatListesi.pdf",
  "KONTAK OTOMASYON -  14082025 - Günay soğutucu Li_260209_000815.pdf",
  "stokalmanya_260209_012429.pdf",
]);

function parseMoneyEu(value) {
  return Number(String(value || "0").replace(/\./g, "").replace(",", "."));
}

function formatMoney(value) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferCategory(name) {
  const normalized = normalizeText(name);
  if (/(r[0-9]{3,4}[a-z]?|gaz|kältemittel|kaeltemittel|propan|chladivo)/.test(normalized)) return "Sogutucu Gaz";
  if (/(poe|yag|oel)/.test(normalized)) return "Sogutma Yagi";
  if (/(kompresor|compressor|embraco|tecumseh|zmt|zingfa|dorin|secop)/.test(normalized)) return "Kompresor";
  if (/(evap|sogutucu|evaporator|ic unite)/.test(normalized)) return "Evaporator";
  if (/(grubu|dis unite|condensing|kondenser)/.test(normalized)) return "Sogutma Grubu";
  if (/(kapi|depo kapisi)/.test(normalized)) return "Kapi";
  if (/(panel|sandvic|poly)/.test(normalized)) return "Panel";
  if (/(fan|weiguang|ziehl)/.test(normalized)) return "Fan";
  if (/(pano|kontrol|dcb|full gauge)/.test(normalized)) return "Kontrol";
  if (/(bakir|boru|kablo|aksesuar|gami|cami|musir|vana|hortum)/.test(normalized)) return "Aksesuar";
  if (/(klima|vrf|hisense|systemair)/.test(normalized)) return "Klima";
  if (/(dolabi|reyon|boreklik|bankosu|standi|tezgahi)/.test(normalized)) return "Dolap";
  return "Ithalat Arsiv";
}

function cleanNameLine(line) {
  return String(line || "")
    .replace(/\d{1,3}(?:\.\d{3})*,\d{2}\s*EUR/gi, " ")
    .replace(/\d{1,3}(?:\.\d{3})*,\d{2}/g, " ")
    .replace(/\b(EUR|Karayolu|Denizyolu|FCA|FOB|No|Toplam)\b/gi, " ")
    .replace(/%0,00/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,.;:/*-]+|[,.;:/*-]+$/g, "")
    .trim();
}

function extractSupplier(text, fileName) {
  if (/KONTAK ELEKTR[Iİ]K OTOMASYON/i.test(text)) return "Kontak";
  if (/YILDIZTEPE/i.test(text)) return "Yildiztepe Enerji";
  if (/ELEKTROSAN/i.test(text)) return "Elektrosan";
  return path.basename(fileName, path.extname(fileName));
}

function extractInvoiceDate(text) {
  const match = text.match(/(\d{2}\.\d{2}\.\d{4})\s+[–-]\s+\d{2}:\d{2}:\d{2}/);
  if (!match) return null;
  const [day, month, year] = match[1].split(".");
  return `${year}-${month}-${day}`;
}

function isRowLine(line) {
  return /^\s*\d+\s+.*\b\d{12}\b/.test(line);
}

function parseInvoiceItems(text) {
  const lines = text.replace(/\f/g, "\n").split(/\r?\n/);
  const items = [];
  let started = false;
  let current = null;
  let pendingPrefix = [];
  let blankAfterCurrent = false;

  function finalizeCurrent() {
    if (!current) return;

    const rowLine = current.rowLine;
    const rowNamePart = cleanNameLine(rowLine.split(/\b\d{12}\b/)[0].replace(/^\s*\d+\s+/, ""));
    const prefixParts = current.prefixLines.map(cleanNameLine).filter(Boolean);
    const suffixParts = current.suffixLines.map(cleanNameLine).filter(Boolean);
    const name = [...prefixParts, rowNamePart, ...suffixParts]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const qtyMatch = rowLine.match(/\b(?:FCA|FOB)\s+(\d+(?:[.,]\d+)?)(?=\s+(?:\d{1,3}(?:\.\d{3})*,\d{2}\s+EUR|%0,00))/i);
    const quantity = qtyMatch ? parseMoneyEu(qtyMatch[1]) : null;

    const rowMoneyMatches = [...rowLine.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})\s+EUR/gi)].map((match) => match[1]);
    const sideMoneyMatches = [...current.prefixLines, ...current.suffixLines]
      .map((line) => {
        const match = String(line || "").match(/^\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:EUR)?\s*$/i);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    let unitPrice = null;
    if (rowMoneyMatches.length >= 2) {
      unitPrice = parseMoneyEu(rowMoneyMatches[0]);
    } else if (sideMoneyMatches.length >= 1) {
      unitPrice = parseMoneyEu(sideMoneyMatches[0]);
    } else if (rowMoneyMatches.length === 1 && quantity) {
      unitPrice = Number((parseMoneyEu(rowMoneyMatches[0]) / quantity).toFixed(2));
    }

    if (name && quantity && unitPrice) {
      items.push({
        rowNo: current.rowNo,
        name,
        quantity,
        unitPrice,
      });
    }

    current = null;
    blankAfterCurrent = false;
  }

  for (const rawLine of lines) {
    const line = rawLine || "";
    const trimmed = line.trim();

    if (!started) {
      if (/^No\s+Hizmet\s*\/\s*Ürün Adı/i.test(trimmed)) {
        started = true;
        pendingPrefix = [];
      }
      continue;
    }

    if (/^(Senaryo|Fatura Notu|Mal Hizmet Toplam Tutarı|IHRACAT|ISTISNA|Özelleştirme No|ETTN|Yazıyla Toplam Tutar)/i.test(trimmed)) {
      finalizeCurrent();
      started = false;
      pendingPrefix = [];
      continue;
    }

    if (/^No\s+Hizmet\s*\/\s*Ürün Adı/i.test(trimmed)) {
      continue;
    }

    if (!trimmed) {
      if (current) {
        blankAfterCurrent = true;
      }
      continue;
    }

    if (isRowLine(line)) {
      finalizeCurrent();
      const rowNo = Number((line.match(/^\s*(\d+)/) || [])[1] || 0);
      current = {
        rowNo,
        rowLine: line,
        prefixLines: pendingPrefix,
        suffixLines: [],
      };
      pendingPrefix = [];
      blankAfterCurrent = false;
      continue;
    }

    if (current) {
      if (blankAfterCurrent) {
        finalizeCurrent();
        pendingPrefix = [line];
        continue;
      }
      current.suffixLines.push(line);
      continue;
    }

    pendingPrefix.push(line);
  }

  finalizeCurrent();
  return items;
}

function isInvoicePdf(text) {
  return /Fatura Numarası/i.test(text) && /Hizmet\s*\/\s*Ürün Adı/i.test(text);
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

async function findOrCreateHistoryItem(client, cache, itemName, category, unitPrice, supplier, fileName) {
  const normalized = normalizeText(itemName);
  if (cache.has(normalized)) {
    return { id: cache.get(normalized), created: false };
  }

  const existing = await client.query(
    `SELECT id
       FROM items
      WHERE COALESCE(is_active, TRUE) = FALSE
        AND LOWER(name) = LOWER($1)
        AND notes LIKE $2
      LIMIT 1`,
    [itemName, `%${HISTORY_NOTE_MARKER}%`]
  );
  if (existing.rows[0]?.id) {
    const id = Number(existing.rows[0].id);
    cache.set(normalized, id);
    return { id, created: false };
  }

  const derivedSale = Number((unitPrice * 1.2).toFixed(2));
  const inserted = await client.query(
    `INSERT INTO items (
        name, brand, category, unit, min_stock, product_code, barcode, notes, is_active, default_price, list_price, sale_price
      )
      VALUES ($1, '', $2, 'adet', 0, '', NULL, $3, FALSE, $4, $5, $5)
      RETURNING id`,
    [
      itemName,
      category,
      `${HISTORY_NOTE_MARKER} | tedarikci: ${supplier} | kaynak dosya: ${fileName}`,
      unitPrice,
      derivedSale,
    ]
  );
  const id = Number(inserted.rows[0].id);
  cache.set(normalized, id);
  return { id, created: true };
}

function buildMovementKey(itemId, type, quantity, unitPrice, movementDate, note) {
  return [
    Number(itemId),
    type,
    Number(quantity),
    Number(unitPrice),
    movementDate,
    note,
  ].join("|");
}

async function insertMovement(client, itemId, type, quantity, unitPrice, movementDate, note) {
  await client.query(
    `INSERT INTO movements (item_id, type, quantity, unit_price, movement_date, note, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [itemId, type, quantity, unitPrice, movementDate, note, IMPORT_USER_ID]
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL tanimli degil.");
  }
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`Kaynak klasor bulunamadi: ${SOURCE_DIR}`);
  }

  const files = fs.readdirSync(SOURCE_DIR)
    .filter((fileName) => fileName.toLowerCase().endsWith(".pdf"))
    .sort();

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
  });

  await client.connect();

  const before = await getStockSummary(client);
  const itemCache = new Map();
  const existingHistoryItems = await client.query(
    `SELECT id, name
       FROM items
      WHERE COALESCE(is_active, TRUE) = FALSE
        AND notes LIKE $1`,
    [`%${HISTORY_NOTE_MARKER}%`]
  );
  existingHistoryItems.rows.forEach((row) => {
    itemCache.set(normalizeText(row.name), Number(row.id));
  });
  const existingMovements = await client.query(
    `SELECT item_id, type, quantity, unit_price, movement_date, note
       FROM movements
      WHERE note LIKE 'Ithalat denge %'`
  );
  const movementKeys = new Set(existingMovements.rows.map((row) => buildMovementKey(
    row.item_id,
    row.type,
    row.quantity,
    row.unit_price,
    String(row.movement_date).slice(0, 10),
    row.note
  )));
  const results = {
    importedFiles: [],
    skippedFiles: [],
    createdHistoryItems: 0,
    createdEntryMovements: 0,
    createdExitMovements: 0,
    skippedMovementPairs: 0,
    parsedLines: 0,
  };

  try {
    await client.query("BEGIN");
    console.error(`[ithalat] basladi | dryRun=${DRY_RUN} | klasor=${SOURCE_DIR}`);

    for (const fileName of files) {
      console.error(`[ithalat] dosya kontrolu: ${fileName}`);
      if (SKIP_FILE_NAMES.has(fileName)) {
        results.skippedFiles.push({ fileName, reason: "islem disi belge" });
        continue;
      }

      const fullPath = path.join(SOURCE_DIR, fileName);
      const text = execFileSync("pdftotext", ["-layout", fullPath, "-"], { encoding: "utf8" });
      if (!isInvoicePdf(text)) {
        results.skippedFiles.push({ fileName, reason: "urun satiri olan fatura degil veya metin okunamadi" });
        continue;
      }

      const invoiceNo = (text.match(/Fatura Numarası\s+([A-Z0-9-]+)/i) || [])[1] || path.basename(fileName, ".pdf");
      const movementDate = extractInvoiceDate(text) || "2025-01-01";
      const supplier = extractSupplier(text, fileName);
      const items = parseInvoiceItems(text);
      console.error(`[ithalat] parse edildi: ${fileName} | fatura=${invoiceNo} | satir=${items.length}`);
      const importedRows = [];

      for (const item of items) {
        const category = inferCategory(item.name);
        const historyItem = await findOrCreateHistoryItem(client, itemCache, item.name, category, item.unitPrice, supplier, fileName);
        const historyItemId = historyItem.id;
        if (historyItem.created) {
          results.createdHistoryItems += 1;
        }

        const entryNote = `Ithalat denge giris | ${invoiceNo} | satir ${item.rowNo} | ${fileName}`;
        const exitNote = `Ithalat denge cikis | ${invoiceNo} | satir ${item.rowNo} | ${fileName}`;
        const entryKey = buildMovementKey(historyItemId, "entry", item.quantity, item.unitPrice, movementDate, entryNote);
        const exitKey = buildMovementKey(historyItemId, "exit", item.quantity, item.unitPrice, movementDate, exitNote);
        const hasEntry = movementKeys.has(entryKey);
        const hasExit = movementKeys.has(exitKey);

        if (hasEntry && hasExit) {
          results.skippedMovementPairs += 1;
        } else {
          if (!hasEntry) {
            await insertMovement(client, historyItemId, "entry", item.quantity, item.unitPrice, movementDate, entryNote);
            movementKeys.add(entryKey);
            results.createdEntryMovements += 1;
          }
          if (!hasExit) {
            await insertMovement(client, historyItemId, "exit", item.quantity, item.unitPrice, movementDate, exitNote);
            movementKeys.add(exitKey);
            results.createdExitMovements += 1;
          }
        }

        results.parsedLines += 1;
        importedRows.push({
          rowNo: item.rowNo,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          historyItemId,
        });
      }

      results.importedFiles.push({
        fileName,
        invoiceNo,
        supplier,
        movementDate,
        lineCount: importedRows.length,
      });
    }

    const after = await getStockSummary(client);
    console.error(`[ithalat] tamamlandi | dryRun=${DRY_RUN}`);
    if (DRY_RUN) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }

    console.log(JSON.stringify({
      sourceDir: SOURCE_DIR,
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
      results,
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
