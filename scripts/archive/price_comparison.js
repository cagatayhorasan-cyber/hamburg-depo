'use strict';

/**
 * Price Comparison Script
 * Compares ~12,372 active DB items against multiple supplier price lists
 */

const { Client } = require('./node_modules/pg');
const XLSX = require('./node_modules/xlsx');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL env değişkeni tanımlı değil. .env dosyasından okumak için dotenv ile çalıştırın.');
  process.exit(1);
}
const BURAK2 = '/Users/anilakbas/Desktop/Burak2 /';
const PANEL_DIR = '/Users/anilakbas/Desktop/Panel/';

// ─────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────

/** Normalise a model-code string for fuzzy comparison */
function normalise(s) {
  if (!s) return '';
  return String(s)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');   // strip everything except alphanumerics
}

/** Parse a price value that may be a number, "76,43 EUR", "1.234,56 EUR", etc. */
function parsePrice(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) && v > 0 ? v : null;
  const s = String(v).replace(/EUR.*$/i, '').replace(/KDV.*$/i, '').trim();
  // Turkish decimal: comma as decimal separator, period as thousands separator
  // e.g. "1.234,56" or "76,43" or "6315.65" (already JS number as string)
  const cleaned = s.replace(/\./g, '').replace(/,/g, '.');
  const n = parseFloat(cleaned);
  return isFinite(n) && n > 0 ? n : null;
}

/** Build a lookup map: normalised_key → array of supplier records */
function addToMap(map, key, record) {
  const k = normalise(key);
  if (!k || k.length < 3) return;
  if (!map.has(k)) map.set(k, []);
  map.get(k).push(record);
}

// ─────────────────────────────────────────────
// Supplier price-list parsers
// ─────────────────────────────────────────────

/** Parse Cantas CSV */
function parseCantasCSV() {
  const results = [];
  try {
    const raw = fs.readFileSync(path.join(BURAK2, 'cantas_products.csv'), 'utf8');
    const lines = raw.split(/\r?\n/);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // Format: name,"price EUR"  —  name may contain commas inside quotes
      const m = line.match(/^"?(.+?)"?,\s*"?(.+?)"?\s*$/);
      if (!m) continue;
      const name  = m[1].trim();
      const price = parsePrice(m[2].trim());
      if (!price) continue;
      results.push({ name, price, source: 'Cantas CSV' });
    }
  } catch (e) {
    console.error('  [!] Cantas CSV parse error:', e.message);
  }
  console.log(`  Cantas CSV:        ${results.length} items`);
  return results;
}

/** Parse Cantas XLSX (sheet: Kompresörler) */
function parseCantasXLSX() {
  const results = [];
  try {
    const wb = XLSX.readFile(path.join(BURAK2, 'cantas_products.xlsx'));
    const ws = wb.Sheets['Kompresörler'] || wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const name  = String(row[0] || '').trim();
      const price = parsePrice(row[1]);
      const brand = String(row[2] || '').trim();
      const model = String(row[3] || '').trim();
      if (!name || !price) continue;
      results.push({ name, price, brand, model, source: 'Cantas XLSX' });
    }
  } catch (e) {
    console.error('  [!] Cantas XLSX parse error:', e.message);
  }
  console.log(`  Cantas XLSX:       ${results.length} items`);
  return results;
}

/**
 * Generic parser for Esen/FrigoCraft XLSX files that have:
 *   - Header at row 7 (0-indexed), data starts at row 8
 *   - col 0 = product code (outdoor), col 1 = model name, col N_out = outdoor price
 *   - col M = product code (indoor), col M+1 = indoor name, col N_in = indoor price
 */
function parseEsenSplitSheet(wb, sheetName, file, colOutdoorCode, colModel, colOutdoorPrice, colIndoorCode, colIndoorName, colIndoorPrice) {
  const results = [];
  const ws = wb.Sheets[sheetName];
  if (!ws) return results;
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 8; i < data.length; i++) {
    const row = data[i];
    // Outdoor unit
    const outCode  = String(row[colOutdoorCode] || '').trim();
    const outModel = String(row[colModel] || '').trim();
    const outPrice = parsePrice(row[colOutdoorPrice]);
    if (outCode && outModel && outPrice) {
      results.push({ productCode: outCode, name: outModel, price: outPrice, source: `${file}/${sheetName}[OUT]` });
    }
    // Indoor unit (if columns given)
    if (colIndoorCode !== null && colIndoorName !== null && colIndoorPrice !== null) {
      const inCode  = String(row[colIndoorCode] || '').trim();
      const inName  = String(row[colIndoorName] || '').trim();
      const inPrice = parsePrice(row[colIndoorPrice]);
      if (inCode && inName && inPrice) {
        results.push({ productCode: inCode, name: inName, price: inPrice, source: `${file}/${sheetName}[IN]` });
      }
    }
  }
  return results;
}

/**
 * Parse "Sayfa1" / "Sayfa2" style simple-list sheets:
 *   col 0 = product code, col 1 = description, col 2 = price
 *   OR col 5 = product code, col 6 = desc, col 7 = price  (right side of Sayfa1 in ENDÜSTRİYEL SPLİT)
 */
function parseSayfaSheet(wb, sheetName, file) {
  const results = [];
  const ws = wb.Sheets[sheetName];
  if (!ws) return results;
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Left block
    const c0 = String(row[0] || '').trim();
    const c1 = String(row[1] || '').trim();
    const c2 = parsePrice(row[2]);
    if (c0 && c1 && c2) {
      results.push({ productCode: c0, name: c1, price: c2, source: `${file}/${sheetName}` });
    }
    // Right block (cols 5-7, present in ENDÜSTRİYEL SPLIT Sayfa1)
    if (row.length > 7) {
      const c5 = String(row[5] || '').trim();
      const c6 = String(row[6] || '').trim();
      const c7 = parsePrice(row[7]);
      if (c5 && c6 && c7) {
        results.push({ productCode: c5, name: c6, price: c7, source: `${file}/${sheetName}` });
      }
      // Cols 10-12 (also in ENDÜSTRİYEL SPLIT Sayfa1)
      if (row.length > 12) {
        const c10 = String(row[10] || '').trim();
        const c11 = String(row[11] || '').trim();
        const c12 = parsePrice(row[12]);
        if (c10 && c11 && c12) {
          results.push({ productCode: c10, name: c11, price: c12, source: `${file}/${sheetName}` });
        }
      }
    }
  }
  return results;
}

/** Parse all Esen/FrigoCraft XLSX files */
function parseEsenFiles() {
  const all = [];

  const addAll = (arr) => { for (const x of arr) all.push(x); };

  // ── DANFOSS HERMETİK SERİ-2025.xlsx ──
  try {
    const fname = 'DANFOSS HERMETİK SERİ-2025.xlsx';
    const wb = XLSX.readFile(path.join(BURAK2, fname));
    for (const s of ['FRİGOCRAFT ', 'FRİGOCRAFT -SESSİZ SERİ', 'C BOX']) {
      // col5=outdoor price, col10=indoor price, col6=indoorCode, col7=indoorName
      addAll(parseEsenSplitSheet(wb, s, fname, 0, 1, 5, 6, 7, 10));
    }
    // Sayfa1 & Sayfa2 – simple product lists
    addAll(parseSayfaSheet(wb, 'Sayfa1', fname));
    addAll(parseSayfaSheet(wb, 'Sayfa2', fname));
  } catch (e) { console.error('  [!] DANFOSS HERMETİK:', e.message); }

  // ── DANFOSS SCROLL FRİGOCRAFT SERİ-2025.xlsx ──
  try {
    const fname = 'DANFOSS SCROLL FRİGOCRAFT SERİ-2025.xlsx';
    const wb = XLSX.readFile(path.join(BURAK2, fname));
    for (const s of ['VERSİYON-1 ', 'VERSİYON-2 ', 'VERSİYON-3']) {
      addAll(parseEsenSplitSheet(wb, s, fname, 0, 1, 5, 6, 7, 10));
    }
    addAll(parseSayfaSheet(wb, 'Sayfa1', fname));
    addAll(parseSayfaSheet(wb, 'Sayfa2', fname));
  } catch (e) { console.error('  [!] SCROLL FRIGOCRAFT:', e.message); }

  // ── DANFOSS SCROLL FRİGOCRAFT SESSİZ SERİ-2025.xlsx ──
  try {
    const fname = 'DANFOSS SCROLL FRİGOCRAFT  SESSİZ SERİ-2025.xlsx';
    const wb = XLSX.readFile(path.join(BURAK2, fname));
    addAll(parseEsenSplitSheet(wb, 'VERSİYON-1 ', fname, 0, 1, 5, 6, 7, 10));
    addAll(parseSayfaSheet(wb, 'Sayfa1', fname));
    addAll(parseSayfaSheet(wb, 'Sayfa2', fname));
  } catch (e) { console.error('  [!] SCROLL SESSIZ:', e.message); }

  // ── DANFOSS SCROLL MERKEZİ FİYAT LİSTESİ-2025.xlsx ──
  // col9 = outdoor price, no indoor units
  try {
    const fname = 'DANFOSS SCROLL MERKEZİ FİYAT LİSTESİ-2025.xlsx';
    const wb = XLSX.readFile(path.join(BURAK2, fname));
    for (const s of ['POZİTİF PASİF YAĞLAMA ', 'POZİTİF AKTİF YAĞLAMA ']) {
      addAll(parseEsenSplitSheet(wb, s, fname, 0, 1, 9, null, null, null));
    }
    addAll(parseSayfaSheet(wb, 'Sayfa1', fname));
  } catch (e) { console.error('  [!] SCROLL MERKEZI:', e.message); }

  // ── ENDÜSTRİYEL SPLİT FİYAT LİSTESİ-2025-REV1.xlsx ──
  // col8=outdoor price, col13=indoor price, col9=indoorCode, col10=indoorName
  try {
    const fname = 'ENDÜSTRİYEL SPLİT FİYAT LİSTESİ-2025-REV1.xlsx';
    const wb = XLSX.readFile(path.join(BURAK2, fname));
    for (const s of ['BİTZER', 'DORİN', 'FRASCOLD', 'GEA BOCK']) {
      addAll(parseEsenSplitSheet(wb, s, fname, 0, 1, 8, 9, 10, 13));
    }
    addAll(parseSayfaSheet(wb, 'Sayfa1', fname));
  } catch (e) { console.error('  [!] ENDÜSTRİYEL SPLIT REV1:', e.message); }

  // ── STANDART EVAP. FİYAT LİSTESİ-2025.xlsx ──
  // Evaporators: col0=evap code, col2=model, col6=list price (SC2 sheet col6, SC3 col7, etc.)
  try {
    const fname = 'STANDART EVAP. FİYAT LİSTESİ-2025.xlsx';
    const wb = XLSX.readFile(path.join(BURAK2, fname));

    // SC2 sheet: col6 = list price
    const parseEvapSheet = (sheetName, priceCol) => {
      const ws = wb.Sheets[sheetName];
      if (!ws) return [];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const res = [];
      for (let i = 2; i < data.length; i++) {
        const row = data[i];
        const code  = String(row[0] || '').trim();
        const model = String(row[2] || '').trim();
        const price = parsePrice(row[priceCol]);
        if (code && model && price) {
          res.push({ productCode: code, name: model, price, source: `${fname}/${sheetName}` });
        }
      }
      return res;
    };

    addAll(parseEvapSheet('SC2', 6));
    addAll(parseEvapSheet('SC3', 7));
    addAll(parseEvapSheet('TAVAN', 6));
    addAll(parseEvapSheet('KÖŞE TAVAN', 6));
    // A03 sheet: col4 = price
    const ws_a03 = wb.Sheets['A03 Evap Liste Fiyat'];
    if (ws_a03) {
      const d = XLSX.utils.sheet_to_json(ws_a03, { header: 1, defval: '' });
      for (let i = 2; i < d.length; i++) {
        const r = d[i];
        const code = String(r[0]||'').trim();
        const model= String(r[2]||'').trim();
        const price= parsePrice(r[4]);
        if (code && model && price) all.push({ productCode: code, name: model, price, source: `${fname}/A03` });
      }
    }
    // LIST sheet (master list): col0=code, col1=desc, col2=price
    addAll(parseSayfaSheet(wb, 'LIST', fname));
    // Genel Tablo: col0=code, col2=model, col7=price
    const ws_gt = wb.Sheets['Genel Tablo'];
    if (ws_gt) {
      const d = XLSX.utils.sheet_to_json(ws_gt, { header: 1, defval: '' });
      for (let i = 2; i < d.length; i++) {
        const r = d[i];
        const code = String(r[0]||'').trim();
        const model= String(r[2]||'').trim();
        const price= parsePrice(r[7]);
        if (code && model && price) all.push({ productCode: code, name: model, price, source: `${fname}/GelenTablo` });
      }
    }
  } catch (e) { console.error('  [!] STANDART EVAP:', e.message); }

  // ── YARI HERMETİK ŞOK CİHAZ SERİSİ -2025.xlsx ──
  // Header at row 6 (0-indexed), col1=code, col2=model, col5=outdoor price, col6=indoorCode, col7=indoorName, col9=indoor price
  try {
    const fname = 'YARI HERMETİK ŞOK CİHAZ SERİSİ -2025.xlsx';
    const wb = XLSX.readFile(path.join(BURAK2, fname));
    for (const s of ['LIST', 'LIST 2025']) {
      const ws = wb.Sheets[s];
      if (!ws) continue;
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      for (let i = 7; i < data.length; i++) {
        const row = data[i];
        const outCode  = String(row[1] || '').trim();
        const outModel = String(row[2] || '').trim();
        const outPrice = parsePrice(row[5]);
        if (outCode && outModel && outPrice) {
          all.push({ productCode: outCode, name: outModel, price: outPrice, source: `${fname}/${s}[OUT]` });
        }
        const inCode  = String(row[6] || '').trim();
        const inName  = String(row[7] || '').trim();
        const inPrice = parsePrice(row[9]);
        if (inCode && inName && inPrice) {
          all.push({ productCode: inCode, name: inName, price: inPrice, source: `${fname}/${s}[IN]` });
        }
      }
    }
    addAll(parseSayfaSheet(wb, 'Sayfa1', fname));
  } catch (e) { console.error('  [!] YARI HERMETİK:', e.message); }

  // ── yeni_liste.xlsx ──
  // col1=outdoorCode, col2=outdoorModel, col6=outdoorPrice, col7=indoorCode, col8=indoorName, col11=indoorPrice
  try {
    const fname = 'yeni_liste.xlsx';
    const wb = XLSX.readFile(path.join(BURAK2, fname));
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const outCode  = String(row[1] || '').trim();
      const outModel = String(row[2] || '').trim();
      const outPrice = parsePrice(row[6]);
      if (outCode && outModel && outPrice) {
        all.push({ productCode: outCode, name: outModel, price: outPrice, source: `${fname}[OUT]` });
      }
      const inCode  = String(row[7] || '').trim();
      const inName  = String(row[8] || '').trim();
      const inPrice = parsePrice(row[11]);
      if (inCode && inName && inPrice) {
        all.push({ productCode: inCode, name: inName, price: inPrice, source: `${fname}[IN]` });
      }
    }
  } catch (e) { console.error('  [!] yeni_liste:', e.message); }

  // ── fiyat_listesi.xlsx ──  (same structure as ENDÜSTRİYEL SPLIT)
  try {
    const fname = 'fiyat_listesi.xlsx';
    const wb = XLSX.readFile(path.join(BURAK2, fname));
    for (const s of ['BİTZER', 'DORİN', 'FRASCOLD', 'GEA BOCK']) {
      addAll(parseEsenSplitSheet(wb, s, fname, 0, 1, 8, 9, 10, 13));
    }
    addAll(parseSayfaSheet(wb, 'Sayfa1', fname));
  } catch (e) { console.error('  [!] fiyat_listesi:', e.message); }

  console.log(`  Esen/FrigoCraft files: ${all.length} items (combined)`);
  return all;
}

/** Parse Panel price list */
function parsePanelPrices() {
  const results = [];
  try {
    const wb = XLSX.readFile(path.join(PANEL_DIR, 'turkiye-fiyat-listesi.xlsx'));
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const name  = String(row[0] || '').trim();
      const price = parsePrice(row[3]);
      if (!name || !price) continue;
      results.push({ name, price, source: 'Panel (Baticompos)' });
    }
  } catch (e) {
    console.error('  [!] Panel price list:', e.message);
  }
  console.log(`  Panel prices:      ${results.length} items`);
  return results;
}

// ─────────────────────────────────────────────
// Build supplier lookup maps
// ─────────────────────────────────────────────

function buildSupplierMaps(cantasCSV, cantasXLSX, esenItems, panelItems) {
  // Map: normalised key → best supplier record
  // We use two maps: by product code, and by model name keywords
  const byCode = new Map();   // exact product code match
  const byName = new Map();   // model name tokenised

  const register = (item) => {
    // By product code
    if (item.productCode) {
      addToMap(byCode, item.productCode, item);
    }
    // By name tokens – we extract the "model number" portion (runs of alphanumeric)
    const tokens = extractModelTokens(item.name || item.model || '');
    for (const t of tokens) {
      addToMap(byName, t, item);
    }
  };

  for (const x of cantasCSV)  register(x);
  for (const x of cantasXLSX) register(x);
  for (const x of esenItems)  register(x);
  for (const x of panelItems) register(x);

  return { byCode, byName };
}

/** Extract meaningful model tokens from a product name */
function extractModelTokens(name) {
  if (!name) return [];
  const tokens = new Set();
  // The whole normalised name (for short codes)
  const full = normalise(name);
  if (full.length >= 4 && full.length <= 20) tokens.add(full);

  // Split by whitespace and punctuation; keep tokens ≥ 4 chars that look like model codes
  const parts = name.split(/[\s\-_,./\\()]+/);
  for (const p of parts) {
    const n = normalise(p);
    if (n.length >= 4) tokens.add(n);
  }
  return [...tokens];
}

// ─────────────────────────────────────────────
// Match a DB item against supplier maps
// ─────────────────────────────────────────────

function findBestMatch(dbItem, byCode, byName) {
  const candidates = [];

  // 1. Exact product code match
  if (dbItem.product_code) {
    const k = normalise(dbItem.product_code);
    if (byCode.has(k)) candidates.push(...byCode.get(k));
    // Also try just the code without prefix (e.g. "86.10.090" → "86.10.090")
    if (byName.has(k)) candidates.push(...byName.get(k));
  }

  // 2. Name token match
  const nameTokens = extractModelTokens(dbItem.name || '');
  const brandTokens = dbItem.brand ? extractModelTokens(dbItem.brand) : [];
  const allTokens = [...new Set([...nameTokens, ...brandTokens])];

  const tokenHits = new Map(); // supplier item → hit count
  for (const t of allTokens) {
    if (byName.has(t)) {
      for (const sup of byName.get(t)) {
        tokenHits.set(sup, (tokenHits.get(sup) || 0) + 1);
      }
    }
    if (byCode.has(t)) {
      for (const sup of byCode.get(t)) {
        tokenHits.set(sup, (tokenHits.get(sup) || 0) + 3); // code match is stronger
      }
    }
  }

  // Add token-hit candidates (require ≥ 2 hits OR 1 hit if it's a code match)
  for (const [sup, hits] of tokenHits) {
    if (hits >= 2) candidates.push(sup);
  }

  if (candidates.length === 0) return null;

  // Deduplicate and pick the one with the highest name similarity
  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    const key = (c.productCode || '') + '|' + c.name + '|' + c.source;
    if (!seen.has(key)) { seen.add(key); unique.push(c); }
  }

  // Score: number of shared normalised tokens
  const dbFull = normalise(dbItem.name || '') + normalise(dbItem.product_code || '') + normalise(dbItem.brand || '');
  let best = null, bestScore = -1;
  for (const c of unique) {
    const supFull = normalise(c.name || c.model || '') + normalise(c.productCode || '');
    let score = 0;
    // Token overlap
    const dbToks = new Set(extractModelTokens(dbItem.name || ''));
    for (const t of extractModelTokens(c.name || c.model || '')) {
      if (dbToks.has(t)) score += 2;
    }
    // Product code exact match
    if (dbItem.product_code && c.productCode && normalise(dbItem.product_code) === normalise(c.productCode)) score += 20;
    if (score > bestScore) { bestScore = score; best = c; }
  }

  return best && bestScore >= 2 ? { match: best, score: bestScore } : null;
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  console.log('='.repeat(70));
  console.log('  PRICE COMPARISON REPORT');
  console.log('  Generated:', new Date().toLocaleString('tr-TR'));
  console.log('='.repeat(70));

  // ── Load supplier data ──
  console.log('\n[1] Loading supplier price lists...');
  const cantasCSV  = parseCantasCSV();
  const cantasXLSX = parseCantasXLSX();
  const esenItems  = parseEsenFiles();
  const panelItems = parsePanelPrices();

  const totalSupplier = cantasCSV.length + cantasXLSX.length + esenItems.length + panelItems.length;
  console.log(`\n  Total supplier records loaded: ${totalSupplier}`);

  // ── Build lookup maps ──
  console.log('\n[2] Building lookup indices...');
  const { byCode, byName } = buildSupplierMaps(cantasCSV, cantasXLSX, esenItems, panelItems);
  console.log(`  Code index entries: ${byCode.size}`);
  console.log(`  Name index entries: ${byName.size}`);

  // ── Load DB items ──
  console.log('\n[3] Connecting to database...');
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows: dbItems } = await client.query(
    `SELECT id, name, brand, category, product_code, default_price, sale_price, list_price, is_active
     FROM items
     WHERE is_active = true
     ORDER BY name`
  );
  console.log(`  Active DB items: ${dbItems.length}`);
  await client.end();

  // ── Match ──
  console.log('\n[4] Matching DB items to supplier prices...');

  const matched        = [];   // { dbItem, supplierItem, pctDiff }
  const zeroPriceMatch = [];   // DB price=0 but supplier has price
  let noMatch = 0;

  for (const dbItem of dbItems) {
    const result = findBestMatch(dbItem, byCode, byName);
    if (!result) { noMatch++; continue; }

    const { match: sup } = result;
    const dbPrice  = parseFloat(dbItem.default_price) || 0;
    const supPrice = sup.price;

    if (dbPrice === 0) {
      zeroPriceMatch.push({ dbItem, sup, supPrice });
    } else {
      const pctDiff = ((supPrice - dbPrice) / dbPrice) * 100;
      matched.push({ dbItem, sup, dbPrice, supPrice, pctDiff });
    }
  }

  const significant = matched.filter(x => Math.abs(x.pctDiff) > 20);
  const within20    = matched.filter(x => Math.abs(x.pctDiff) <= 20);

  // ─────────────────────────────────────────────
  // Report
  // ─────────────────────────────────────────────

  const W = 70;
  const sep = '-'.repeat(W);
  const fmt = (n, d=2) => n == null ? 'N/A' : Number(n).toFixed(d);
  const pctStr = (p) => {
    const s = (p >= 0 ? '+' : '') + fmt(p, 1) + '%';
    return s.padStart(8);
  };
  const trunc = (s, len) => s.length > len ? s.slice(0, len-1) + '…' : s;

  const printItem = (x) => {
    const name = trunc(x.dbItem.name || '(no name)', 48);
    const code = (x.dbItem.product_code || '').padEnd(12);
    console.log(`\n  Item:     ${name}`);
    console.log(`  Code:     ${code}  Brand: ${x.dbItem.brand || '-'}`);
    console.log(`  DB Price: ${fmt(x.dbPrice).padStart(10)} EUR   Supplier: ${fmt(x.supPrice).padStart(10)} EUR   Diff: ${pctStr(x.pctDiff)}`);
    console.log(`  Source:   ${x.sup.source}`);
    if (x.sup.name && x.sup.name !== x.dbItem.name) {
      console.log(`  Sup.Name: ${trunc(x.sup.name, 60)}`);
    }
    console.log(`  ${sep}`);
  };

  // ─────────────────────────────────────────────
  console.log('\n' + '='.repeat(W));
  console.log('  SECTION A — ⚠️  SIGNIFICANT PRICE DIFFERENCES  (>20%)');
  console.log(`  Count: ${significant.length}`);
  console.log('='.repeat(W));

  // Sort by absolute difference descending
  significant.sort((a,b) => Math.abs(b.pctDiff) - Math.abs(a.pctDiff));

  let secAHigher = 0, secALower = 0;
  for (const x of significant) {
    if (x.pctDiff > 0) secAHigher++; else secALower++;
    printItem(x);
  }

  // ─────────────────────────────────────────────
  console.log('\n' + '='.repeat(W));
  console.log('  SECTION B — ✅  WITHIN 20% RANGE');
  console.log(`  Count: ${within20.length}`);
  console.log('='.repeat(W));

  within20.sort((a,b) => Math.abs(b.pctDiff) - Math.abs(a.pctDiff));
  for (const x of within20) {
    printItem(x);
  }

  // ─────────────────────────────────────────────
  console.log('\n' + '='.repeat(W));
  console.log('  SECTION C — ❓  DB PRICE = 0, SUPPLIER HAS A PRICE');
  console.log(`  Count: ${zeroPriceMatch.length}`);
  console.log('='.repeat(W));

  zeroPriceMatch.sort((a,b) => b.supPrice - a.supPrice);
  for (const x of zeroPriceMatch) {
    const name = trunc(x.dbItem.name || '(no name)', 48);
    const code = (x.dbItem.product_code || '').padEnd(12);
    console.log(`\n  Item:     ${name}`);
    console.log(`  Code:     ${code}  Brand: ${x.dbItem.brand || '-'}`);
    console.log(`  Supplier: ${fmt(x.supPrice).padStart(10)} EUR   Source: ${x.sup.source}`);
    if (x.sup.name && x.sup.name !== x.dbItem.name) {
      console.log(`  Sup.Name: ${trunc(x.sup.name, 60)}`);
    }
    console.log(`  ${sep}`);
  }

  // ─────────────────────────────────────────────
  // Source breakdown
  const sourceCount = new Map();
  for (const x of [...matched, ...zeroPriceMatch]) {
    const src = x.sup ? x.sup.source : x.source;
    // Normalise to top-level source
    const top = src.split('/')[0].split('[')[0].trim();
    sourceCount.set(top, (sourceCount.get(top) || 0) + 1);
  }

  console.log('\n' + '='.repeat(W));
  console.log('  SUMMARY STATISTICS');
  console.log('='.repeat(W));
  console.log(`\n  Database active items:        ${dbItems.length}`);
  console.log(`  Supplier records loaded:      ${totalSupplier}`);
  console.log(`    Cantas CSV:                 ${cantasCSV.length}`);
  console.log(`    Cantas XLSX:                ${cantasXLSX.length}`);
  console.log(`    Esen/FrigoCraft:            ${esenItems.length}`);
  console.log(`    Panel (Baticompos):         ${panelItems.length}`);
  console.log('');
  console.log(`  Matched items total:          ${matched.length + zeroPriceMatch.length}`);
  console.log(`    With DB price > 0:          ${matched.length}`);
  console.log(`    DB price = 0 (needs price): ${zeroPriceMatch.length}`);
  console.log(`  No match found:               ${noMatch}`);
  console.log('');
  console.log(`  Price analysis (DB price > 0):`);
  console.log(`    ⚠️  >20% difference:         ${significant.length}  (supplier higher: ${secAHigher}, lower: ${secALower})`);
  console.log(`    ✅  Within 20%:              ${within20.length}`);
  if (matched.length > 0) {
    const avgDiff = matched.reduce((s,x) => s + x.pctDiff, 0) / matched.length;
    const maxDiff = matched.reduce((m,x) => Math.abs(x.pctDiff) > Math.abs(m.pctDiff) ? x : m, matched[0]);
    console.log(`    Avg price diff:             ${(avgDiff >= 0 ? '+' : '') + fmt(avgDiff, 1)}%`);
    console.log(`    Max diff item:              ${trunc(maxDiff.dbItem.name||'',40)} (${pctStr(maxDiff.pctDiff).trim()})`);
  }
  console.log('');
  console.log('  Matches by source:');
  for (const [src, cnt] of [...sourceCount.entries()].sort((a,b) => b[1]-a[1])) {
    console.log(`    ${src.padEnd(45)} ${String(cnt).padStart(4)} items`);
  }
  console.log('\n' + '='.repeat(W));
  console.log('  END OF REPORT');
  console.log('='.repeat(W));
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err);
  process.exit(1);
});
