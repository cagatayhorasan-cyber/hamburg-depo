/**
 * update_prices_from_suppliers.js
 *
 * Updates item prices in Postgres using two supplier sources:
 *  1. Cantas (XLSX + CSV)  → updates default_price (purchase/dealer price)
 *  2. Esen / FrigoCraft XLSX files → updates list_price only (by product_code)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { Pool } = require('pg');

// ─── Config ──────────────────────────────────────────────────────────────────

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL env değişkeni tanımlı değil. .env dosyasından okumak için dotenv ile çalıştırın.');
  process.exit(1);
}
const BURAK2   = '/Users/anilakbas/Desktop/Burak2 ';

const ESEN_FILES = [
  { file: 'DANFOSS HERMETİK SERİ-2025.xlsx',           sheets: ['FRİGOCRAFT ', 'FRİGOCRAFT -SESSİZ SERİ', 'C BOX', 'Sayfa1', 'Sayfa2'] },
  { file: 'DANFOSS SCROLL FRİGOCRAFT SERİ-2025.xlsx',  sheets: null /* all */ },
  { file: 'DANFOSS SCROLL FRİGOCRAFT  SESSİZ SERİ-2025.xlsx', sheets: null },
  { file: 'DANFOSS SCROLL MERKEZİ FİYAT LİSTESİ-2025.xlsx',   sheets: null },
  { file: 'ENDÜSTRİYEL SPLİT FİYAT LİSTESİ-2025-REV1.xlsx',   sheets: null },
  { file: 'STANDART EVAP. FİYAT LİSTESİ-2025.xlsx',    sheets: null },
  { file: 'YARI HERMETİK ŞOK CİHAZ SERİSİ -2025.xlsx', sheets: null },
  { file: 'yeni_liste.xlsx',                            sheets: null },
];

// Brands that must match for Cantas (normalised → canonical)
const BRAND_ALIASES = {
  'ebm':        'ebm-papst',
  'ebmpapst':   'ebm-papst',
  'ziehl':      'ziehl-abegg',
  'ziehlabbeg': 'ziehl-abegg',
};

// Terms that indicate a spare-part DB item — skip matching
const SPARE_TERMS = ['RÖLE', 'TERMİK', 'CAPACITOR', 'RELAY', 'TERMAL', 'KAPASITE'];

// Generic refrigerant / oil codes — skip if model is one of these
const GENERIC_CODES = new Set(['R134A','R404A','R407C','R22','R290','R410A','POE32','POE46','PAG46','POE68']);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normBrand(b) {
  if (!b) return '';
  let s = b.trim().toUpperCase().replace(/[-_\s]+/g, '');
  return BRAND_ALIASES[s.toLowerCase()] || b.trim().toLowerCase();
}

function sameBrand(a, b) {
  const na = normBrand(a);
  const nb = normBrand(b);
  return na === nb;
}

/** Extract potential model tokens from a product name string */
function extractModels(name) {
  if (!name) return [];
  // Remove known noise words first
  const clean = name
    .replace(/ecoline/gi, '')
    .replace(/halbhermetisch(er)?/gi, '')
    .replace(/kompressor(en)?/gi, '')
    .replace(/hermetik(er)?/gi, '')
    .replace(/yarim\s+hermetik/gi, '')
    .replace(/yarı\s+hermetik/gi, '')
    .replace(/\b(HP|LBP|MBP|HBP|CLP|HLP|HEP|HJP|HHR|HAX|HLR|HLC|HSP|HBK|AOB)\b/gi, '')
    .replace(/\([^)]*\)/g, ' ')        // remove parenthetical
    .replace(/[^\w\s\-\.]/g, ' ');

  // Split on spaces, keep tokens that are "model-like": contain both letters & digits
  const tokens = clean.split(/[\s,]+/)
    .map(t => t.replace(/[.\-]/g, '').toUpperCase())
    .filter(t => t.length >= 5)
    .filter(t => /[A-Z]/.test(t) && /[0-9]/.test(t))
    .filter(t => !GENERIC_CODES.has(t));

  return [...new Set(tokens)];
}

/** Parse a Cantas price string like "76,43 EUR" / "112.55 €" / "112.55€" / "16130 €" */
function parseCantasPrice(raw) {
  if (!raw) return null;
  // Remove currency symbols and words, trim
  let s = String(raw)
    .replace(/EUR|€|euro/gi, '')
    .replace(/\+\s*KD/gi, '')
    .trim();

  // Quoted comma-decimal: "76,43" → 76.43
  if (/^\d{1,3},\d{2}$/.test(s)) {
    return parseFloat(s.replace(',', '.'));
  }
  // Thousands separator with comma decimal: "1.049,42"
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  // Dot decimal: "112.55"
  if (/^\d+\.\d{2}$/.test(s)) {
    return parseFloat(s);
  }
  // Integer (could be ambiguous like 16130)
  if (/^\d+$/.test(s)) {
    return parseFloat(s);
  }
  // Comma decimal without thousands: "302,53"
  if (/^\d+,\d{2}$/.test(s)) {
    return parseFloat(s.replace(',', '.'));
  }
  // "1.132,60" style already covered above; try generic strip
  const clean = s.replace(/[^\d.,]/g, '');
  const p = parseFloat(clean.replace(',', '.'));
  return isNaN(p) ? null : p;
}

/** Determine if a Cantas price looks like a CSV formatting bug.
 *  Rule: if price > 50x DB price AND DB price > €50, skip. */
function isSuspiciousPrice(cantasPrice, dbPrice) {
  if (!dbPrice || dbPrice <= 0) return false;
  return cantasPrice > 50 * dbPrice && dbPrice > 50;
}

// ─── Load Cantas data ─────────────────────────────────────────────────────────

function loadCantasXLSX() {
  const wb   = XLSX.readFile(path.join(BURAK2, 'cantas_products.xlsx'));
  const ws   = wb.Sheets['Kompresörler'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] || !r[1]) continue;
    const name  = String(r[0]).trim();
    const raw   = String(r[1]).trim();
    const brand = r[2] ? String(r[2]).trim() : '';
    const model = r[3] ? String(r[3]).trim() : '';
    const price = parseCantasPrice(raw);
    if (price === null || price <= 0) continue;
    items.push({ name, brand, model: model.replace(/[\s.\-]/g, '').toUpperCase(), price });
  }
  console.log(`  Cantas XLSX: loaded ${items.length} rows`);
  return items;
}

// ─── Load Esen list prices ────────────────────────────────────────────────────

/**
 * Extract (product_code, list_price) pairs from all Esen XLSX files.
 * Product codes look like: 80.10.070, 86.10.041, FN.30.270, etc.
 * We look for columns whose header contains "KOD" and "FİYAT" / "PRICE" / "LISTE".
 * Fallback: scan every row for cells matching code pattern and numeric neighbor.
 */
function loadEsenListPrices() {
  const codeRegex = /^[A-Z0-9]{2,4}\.\d{2}\.\d{2,3}$|^\d{2}\.\d{2}\.\d{3}$/;
  const priceMap  = new Map(); // product_code → list_price (keep first encounter)

  for (const { file, sheets: sheetFilter } of ESEN_FILES) {
    const filePath = path.join(BURAK2, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  Esen: file not found: ${file}`);
      continue;
    }
    let wb;
    try { wb = XLSX.readFile(filePath); }
    catch (e) { console.warn(`  Esen: failed to read ${file}: ${e.message}`); continue; }

    const sheetsToScan = sheetFilter
      ? sheetFilter.filter(s => wb.SheetNames.includes(s))
      : wb.SheetNames;

    for (const shName of sheetsToScan) {
      const ws   = wb.Sheets[shName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      // Find header row: look for "KOD" in first column and any "LİSTE FİYAT" / "LIST PRICE" in a column
      let codeCol  = -1;
      let priceCol = -1;
      let headerRow = -1;

      for (let ri = 0; ri < Math.min(rows.length, 20); ri++) {
        const row = rows[ri];
        if (!row) continue;
        for (let ci = 0; ci < row.length; ci++) {
          const cell = row[ci] ? String(row[ci]).toUpperCase() : '';
          if (cell.includes('KOD') && codeCol === -1) codeCol = ci;
          if ((cell.includes('LİSTE') || cell.includes('LISTE')) && cell.includes('FİYAT') || cell.includes('LIST PRICE')) {
            if (priceCol === -1) priceCol = ci;
          }
        }
        if (codeCol !== -1 && priceCol !== -1) { headerRow = ri; break; }
      }

      // If we found a proper header, use column-based extraction
      if (codeCol !== -1 && priceCol !== -1 && headerRow !== -1) {
        for (let ri = headerRow + 1; ri < rows.length; ri++) {
          const row = rows[ri];
          if (!row) continue;
          const code  = row[codeCol]  != null ? String(row[codeCol]).trim()  : '';
          const price = row[priceCol] != null ? parseFloat(row[priceCol])     : NaN;
          if (!codeRegex.test(code)) continue;
          if (isNaN(price) || price <= 0) continue;
          if (!priceMap.has(code)) priceMap.set(code, price);
        }
        continue; // next sheet
      }

      // Fallback: scan all rows for code pattern followed by numeric value
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        if (!row) continue;
        for (let ci = 0; ci < row.length; ci++) {
          const cell = row[ci] != null ? String(row[ci]).trim() : '';
          if (!codeRegex.test(cell)) continue;
          // Look in nearby columns for a price (list price tends to be col 5 or 6 away)
          for (let di = 1; di <= 8; di++) {
            const nb = row[ci + di];
            if (nb == null) continue;
            const p = parseFloat(nb);
            if (!isNaN(p) && p > 0) {
              if (!priceMap.has(cell)) priceMap.set(cell, p);
              break;
            }
          }
        }
      }
    }
  }

  console.log(`  Esen: collected ${priceMap.size} product_code → list_price entries`);
  return priceMap;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Price Update from Suppliers ===\n');

  // ── 1. Load Cantas data ───────────────────────────────────────────────────
  console.log('[1] Loading Cantas XLSX...');
  const cantasItems = loadCantasXLSX();

  // Build a lookup: brand_normalised → [ {model, price, name} ]
  const cantasByBrand = new Map();
  for (const ci of cantasItems) {
    const nb = normBrand(ci.brand);
    if (!cantasByBrand.has(nb)) cantasByBrand.set(nb, []);
    cantasByBrand.get(nb).push(ci);
  }

  // ── 2. Load Esen list prices ──────────────────────────────────────────────
  console.log('[2] Loading Esen / FrigoCraft XLSX files...');
  const esenMap = loadEsenListPrices();

  // ── 3. Load DB items ──────────────────────────────────────────────────────
  console.log('[3] Loading DB items...');
  const pool = new Pool({ connectionString: DB_URL });

  let dbItems;
  try {
    const res = await pool.query(
      `SELECT id, name, brand, product_code, default_price, sale_price, list_price
       FROM items WHERE is_active = true ORDER BY id`
    );
    dbItems = res.rows;
  } catch (e) {
    console.error('DB query failed:', e.message);
    await pool.end();
    return;
  }
  console.log(`  Loaded ${dbItems.length} active DB items`);

  // ── 4. Match and compute updates ──────────────────────────────────────────
  console.log('[4] Computing price updates...');

  const cantasUpdates = []; // { id, name, oldDefault, oldSale, oldList, newDefault, newSale, newList, matchedModel }
  const esenUpdates   = []; // { id, name, productCode, oldList, newList }

  // Track which DB IDs we've already scheduled for Cantas update
  const cantasUpdatedIds = new Set();

  for (const item of dbItems) {
    const dbName    = String(item.name || '');
    const dbBrand   = String(item.brand || '');
    const dbCode    = String(item.product_code || '').trim();
    const oldDefault = parseFloat(item.default_price) || 0;
    const oldSale    = parseFloat(item.sale_price)    || 0;
    const oldList    = parseFloat(item.list_price)    || 0;

    // ── Esen match: by product_code ──────────────────────────────────────────
    if (dbCode && esenMap.has(dbCode)) {
      const newList = esenMap.get(dbCode);
      if (newList > 0 && Math.abs(newList - oldList) > 0.005) {
        esenUpdates.push({ id: item.id, name: dbName, productCode: dbCode, oldList, newList });
      }
    }

    // ── Cantas match: by brand + model token ─────────────────────────────────
    // Skip spare parts
    const nameUpper = dbName.toUpperCase();
    if (SPARE_TERMS.some(t => nameUpper.includes(t))) continue;

    const nb = normBrand(dbBrand);
    if (!nb) continue;

    // Find all Cantas entries whose brand matches
    let candidates = [];
    for (const [cb, cItems] of cantasByBrand) {
      if (sameBrand(cb, nb) || sameBrand(nb, cb)) {
        candidates = candidates.concat(cItems);
      }
    }
    if (candidates.length === 0) continue;

    // Extract model tokens from DB item name
    const dbModels = extractModels(dbName);
    if (dbModels.length === 0) continue;

    let bestMatch = null;
    let bestModelLen = 0;

    for (const ci of candidates) {
      // Cantas model from XLSX row[3] already normalised
      const cantasModel = ci.model; // already .replace(/[\s.\-]/g,'').toUpperCase()
      if (!cantasModel || cantasModel.length < 6) continue;
      if (GENERIC_CODES.has(cantasModel)) continue;

      for (const dm of dbModels) {
        if (dm.length < 6) continue;
        if (GENERIC_CODES.has(dm)) continue;

        // Either exact match, or one contains the other (min 6 chars overlap)
        const matches =
          dm === cantasModel ||
          (dm.length >= 6 && cantasModel.includes(dm)) ||
          (cantasModel.length >= 6 && dm.includes(cantasModel));

        if (matches) {
          const matchLen = Math.min(dm.length, cantasModel.length);
          if (matchLen > bestModelLen) {
            bestModelLen = matchLen;
            bestMatch = { ci, dm };
          }
        }
      }
    }

    if (!bestMatch) continue;

    const cantasPrice = bestMatch.ci.price;
    if (cantasPrice <= 0) continue;

    // Sanity check: skip suspicious prices
    if (isSuspiciousPrice(cantasPrice, oldDefault)) {
      console.warn(`  SKIP suspicious price: "${dbName}" → Cantas €${cantasPrice} vs DB €${oldDefault}`);
      continue;
    }

    // Calculate new sale_price and list_price preserving existing ratios
    let saleRatio = oldDefault > 0 ? (oldSale / oldDefault) : 1.22;
    if (saleRatio < 1.0 || saleRatio > 1.5) saleRatio = 1.22;

    let listRatio = oldDefault > 0 ? (oldList / oldDefault) : 1.44;
    if (listRatio < 1.0 || listRatio > 2.0) listRatio = 1.44;

    const newDefault = Math.round(cantasPrice * 100) / 100;
    const newSale    = Math.round(newDefault * saleRatio * 100) / 100;
    const newList    = Math.round(newDefault * listRatio * 100) / 100;

    // Only include if something actually changed
    if (
      Math.abs(newDefault - oldDefault) < 0.005 &&
      Math.abs(newSale    - oldSale)    < 0.005 &&
      Math.abs(newList    - oldList)    < 0.005
    ) continue;

    cantasUpdates.push({
      id: item.id,
      name: dbName,
      matchedModel: bestMatch.dm,
      cantasName: bestMatch.ci.name,
      oldDefault, oldSale, oldList,
      newDefault, newSale, newList,
    });
    cantasUpdatedIds.add(item.id);
  }

  // ── 5. Print planned changes ───────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('CANTAS PRICE UPDATES (default_price + sale_price + list_price)');
  console.log('══════════════════════════════════════════════════════════');

  if (cantasUpdates.length === 0) {
    console.log('  (none)');
  } else {
    for (const u of cantasUpdates) {
      console.log(`\n  ID ${u.id} | ${u.name}`);
      console.log(`    Matched model : ${u.matchedModel} (Cantas: "${u.cantasName}")`);
      console.log(`    default_price : €${u.oldDefault.toFixed(2)} → €${u.newDefault.toFixed(2)}`);
      console.log(`    sale_price    : €${u.oldSale.toFixed(2)}    → €${u.newSale.toFixed(2)}`);
      console.log(`    list_price    : €${u.oldList.toFixed(2)}    → €${u.newList.toFixed(2)}`);
    }
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('ESEN LIST PRICE UPDATES (list_price only)');
  console.log('══════════════════════════════════════════════════════════');

  if (esenUpdates.length === 0) {
    console.log('  (none)');
  } else {
    for (const u of esenUpdates) {
      console.log(`  ID ${u.id} | ${u.productCode} | ${u.name}`);
      console.log(`    list_price : €${u.oldList.toFixed(2)} → €${u.newList.toFixed(2)}`);
    }
  }

  // ── 6. Execute DB updates in a transaction ────────────────────────────────
  const totalUpdates = cantasUpdates.length + esenUpdates.length;
  if (totalUpdates === 0) {
    console.log('\nNo price changes needed. Exiting.');
    await pool.end();
    return;
  }

  console.log(`\n[5] Executing ${cantasUpdates.length} Cantas + ${esenUpdates.length} Esen updates in a transaction...`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Cantas updates
    for (const u of cantasUpdates) {
      await client.query(
        `UPDATE items SET default_price = $1, sale_price = $2, list_price = $3 WHERE id = $4`,
        [u.newDefault, u.newSale, u.newList, u.id]
      );
    }

    // Esen updates (list_price only — do NOT touch items already updated by Cantas)
    for (const u of esenUpdates) {
      if (cantasUpdatedIds.has(u.id)) continue; // Cantas takes priority
      await client.query(
        `UPDATE items SET list_price = $1 WHERE id = $2`,
        [u.newList, u.id]
      );
    }

    await client.query('COMMIT');
    console.log('  Transaction committed successfully.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('  Transaction ROLLED BACK:', e.message);
    client.release();
    await pool.end();
    return;
  }
  client.release();

  // ── 7. Stock cost/sale totals ─────────────────────────────────────────────
  console.log('\n[6] Recalculating stock totals...');
  try {
    const res = await pool.query(`
      SELECT
        ROUND(SUM(COALESCE(i.default_price, 0) * COALESCE(stock.qty, 0))::numeric, 2) AS total_cost,
        ROUND(SUM(COALESCE(i.sale_price,    0) * COALESCE(stock.qty, 0))::numeric, 2) AS total_sale,
        ROUND(SUM(COALESCE(i.list_price,    0) * COALESCE(stock.qty, 0))::numeric, 2) AS total_list
      FROM items i
      LEFT JOIN (
        SELECT item_id,
               SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END) AS qty
        FROM   movements
        GROUP BY item_id
        HAVING SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END) > 0
      ) stock ON stock.item_id = i.id
      WHERE i.is_active = true
    `);
    const t = res.rows[0];
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('UPDATED STOCK TOTALS');
    console.log('══════════════════════════════════════════════════════════');
    console.log(`  Total cost (default_price × stock qty) : €${Number(t.total_cost).toFixed(2)}`);
    console.log(`  Total sale (sale_price    × stock qty) : €${Number(t.total_sale).toFixed(2)}`);
    console.log(`  Total list (list_price    × stock qty) : €${Number(t.total_list).toFixed(2)}`);
  } catch (e) {
    console.error('  Failed to get stock totals:', e.message);
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`SUMMARY: ${cantasUpdates.length} items updated from Cantas | ${esenUpdates.filter(u => !cantasUpdatedIds.has(u.id)).length} list_prices updated from Esen`);
  console.log('══════════════════════════════════════════════════════════\n');

  await pool.end();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
