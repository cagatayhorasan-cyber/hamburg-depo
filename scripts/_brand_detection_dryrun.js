const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).reduce((a,l)=>{const [k,...v]=l.split('=');a[k]=v.join('=').replace(/^"|"$/g,'');return a;},{});
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ────────────────────────────────────────────────────────
// MARKA TESPİT KURALLARI
// Sıralama önemli: Önce daha spesifik, sonra geneller.
// ────────────────────────────────────────────────────────
const BRAND_RULES = [
  // Açık metin marka adı (en güvenilir)
  { brand: 'Danfoss',         keywords: [/\bdanfoss\b/i] },
  { brand: 'Embraco',         keywords: [/\bembraco\b/i] },
  { brand: 'Tecumseh',        keywords: [/\btecumseh\b/i] },
  { brand: 'Bitzer',          keywords: [/\bbitzer\b/i] },
  { brand: 'Copeland',        keywords: [/\bcopeland\b/i, /\bemerson\b/i] },
  { brand: 'Carel',           keywords: [/\bcarel\b/i] },
  { brand: 'Sanhua',          keywords: [/\bsanhua\b/i] },
  { brand: 'Honeywell',       keywords: [/\bhoneywell\b/i] },
  { brand: 'Frigocraft',      keywords: [/\bfrigocraft\b/i] },
  { brand: 'Frigomeccanica',  keywords: [/\bfrigomeccanica\b/i] },
  { brand: 'Dorin',           keywords: [/\bdorin\b/i] },
  { brand: 'Frascold',        keywords: [/\bfrascold\b/i] },
  { brand: 'Refcomp',         keywords: [/\brefcomp\b/i] },
  { brand: 'Refricomp',       keywords: [/\brefricomp\b/i] },
  { brand: 'Cubigel',         keywords: [/\bcubigel\b/i] },
  { brand: 'Castel',          keywords: [/\bcastel\b/i] },
  { brand: 'Alco',            keywords: [/\balco\b/i, /\balco controls\b/i] },
  { brand: 'Sporlan',         keywords: [/\bsporlan\b/i] },
  { brand: 'Refco',           keywords: [/\brefco\b/i] },
  { brand: 'Schneider',       keywords: [/\bschneider\b/i] },
  { brand: 'Siemens',         keywords: [/\bsiemens\b/i] },
  { brand: 'Mitsubishi',      keywords: [/\bmitsubishi\b/i] },
  { brand: 'Panasonic',       keywords: [/\bpanasonic\b/i] },
  { brand: 'Samsung',         keywords: [/\bsamsung\b/i] },
  { brand: 'Daikin',          keywords: [/\bdaikin\b/i] },
  { brand: 'LG',              keywords: [/\blg electronics\b/i, /\blg\b\s+inverter/i] },
  { brand: 'Hisense',         keywords: [/\bhisense\b/i] },
  { brand: 'Gree',            keywords: [/\bgree\b/i] },
  { brand: 'Olefini',         keywords: [/\bolefini\b/i] },
  { brand: 'Olab',            keywords: [/\bolab\b/i] },
  { brand: 'Typhoon',         keywords: [/\btyphoon\b/i] },
  { brand: 'Lionball',        keywords: [/\blionball\b/i] },
  { brand: 'Highly',          keywords: [/\bhighly\b/i] },
  { brand: 'Bristol',         keywords: [/\bbristol\b/i] },
  { brand: 'Secop',           keywords: [/\bsecop\b/i] },
  { brand: 'Dixell',          keywords: [/\bdixell\b/i] },
  { brand: 'Evco',            keywords: [/\bevco\b/i] },
  { brand: 'Fstb',            keywords: [/\bfstb\b/i] },
  { brand: 'Ranco',           keywords: [/\branco\b/i] },
  { brand: 'Systemair',       keywords: [/\bsystemair\b/i] },
  { brand: 'Ebm-Papst',       keywords: [/\bebm[-\s]?papst\b/i] },
  { brand: 'Ziehl-Abegg',     keywords: [/\bziehl[\s\-]?abegg\b/i] },
  { brand: 'Weiguang',        keywords: [/\bweiguang\b/i] },
  { brand: 'Ottocool',        keywords: [/\bottocool\b/i] },
  { brand: 'Coldflex',        keywords: [/\bcoldflex\b/i] },
  { brand: 'Talos',           keywords: [/\btalos\b/i, /\becutherm\b/i] },
  { brand: 'Halcor',          keywords: [/\bhalcor\b/i] },
  { brand: 'Rothenberger',    keywords: [/\brothenberger\b/i] },
  { brand: 'Errecom',         keywords: [/\berrecom\b/i] },
  { brand: 'Lubreeze',        keywords: [/\blubreeze\b/i] },
  { brand: 'Selsil',          keywords: [/\bselsil\b/i] },
  { brand: 'Sibax',           keywords: [/\bsibax\b/i] },
  { brand: 'Siccom',          keywords: [/\bsiccom\b/i] },
  { brand: 'Wipcool',         keywords: [/\bwipcool\b/i] },
  { brand: 'Value',           keywords: [/\bvalue\b/i] },
  { brand: 'Gomax',           keywords: [/\bgomax\b/i] },
  { brand: 'Buzyapsan',       keywords: [/\bbuzyapsan\b/i, /\bbys[\s\-]/i] },
  { brand: 'Mespan',          keywords: [/\bmespan\b/i] },
  { brand: 'GVN (Güven)',     keywords: [/\bgvn\b/i, /\bgüven\b/i] },
  { brand: 'Günay',           keywords: [/\bgünay\b/i, /\bgunay\b/i] },
  { brand: 'IBS',             keywords: [/\bibs\b/i] },
  { brand: 'Kontak',          keywords: [/\bkontak\b/i] },
  { brand: 'Elektrosan',      keywords: [/\belektrosan\b/i] },
  { brand: 'ETS',             keywords: [/\bthermets\b/i] },  // ETS daralt: kategori adında "ETS" geçenleri yakalama
  { brand: 'Honeywell',       keywords: [/\bresideo\b/i] },  // Resideo = Honeywell
  // DRC kuralı çıkarıldı: notes'a default eklenmiş, false-positive üretiyor
  { brand: 'Esen',            keywords: [/\besen\b/i] },
  { brand: 'Damla',           keywords: [/\bdamla\b/i] },
  { brand: 'Alkatherm',       keywords: [/\balkatherm\b/i] },
  { brand: 'Thermotrick',     keywords: [/\bthermotrick\b/i] },
  { brand: 'Thermotherm',     keywords: [/\bthermotherm\b/i] },
  { brand: 'M2M',             keywords: [/\bm2m\b/i] },
  { brand: 'ACT',             keywords: [/\bact\b\s+(tav|evap|kondens)/i] },

  // Code prefix tabanlı (daha kesin):
  { brand: 'Danfoss',  codeRegex: /^(068[A-Z]|080[A-Z]|040[A-Z]|023[A-Z]|027[A-Z]|042[A-Z]|084[A-Z]|086[A-Z]|016[A-Z]|018[A-Z]|037[A-Z]|060[A-Z]|120[A-Z]|142[A-Z])/i },
  { brand: 'Embraco',  codeRegex: /^(NEU|NEK|NJX|NJU|EMB|FFI|EM\d|LF[35]\d{6}|LF[35]\d{5}|AV\d{4}[GK]?|AC\d{4}[GK]?|AVT\d{4}|AE[ZNQS]\d|FF\s*\d|NT[68])/i },
  { brand: 'Johnson Controls', codeRegex: /^(P100CP|MKV\d|A99|F300|JOHN)/i },
  { brand: 'ASCO/Emerson', codeRegex: /^(EF\d{4}|8316|8210|8314|EFG|EFC)/i },
  { brand: 'Carel',    keywords: [/\bMKV11D\b/i] },
  { brand: 'Weiguang', codeRegex: /^(YZF|YWF\d|601\d{3})/i, nameTokenAllowed: true },
  { brand: 'DRC',      codeRegex: /^CP-INS-/i }, // CP-INS- = DRC private label SKU
  { brand: 'Generic',  codeRegex: /^(750\d{3}|703\d{3}|7\d{5})/i }, // CAP VALVES, kapilersiz
  { brand: 'Copeland', codeRegex: /^(Z[BHPFR][A-Z0-9]|VR\d|DC[H]\d|D[GR][LR]\d)/i },
  { brand: 'Bitzer',   codeRegex: /^(\d?[FCV][CDFEN]S\d|\d[F][CDE][SE]\d|HSN|HSK|CSH)/i },
  { brand: 'Tecumseh', codeRegex: /^(AE\d|AJ\d|AG\d|CAJ|FH\d|TFH|TAJ|RGT)/i },
  { brand: 'Carel',    codeRegex: /^(PCO|IR3[3]|EVD|MPX|EWC|EVOL|HCC)/i },
  { brand: 'Sanhua',   codeRegex: /^(SY[A-Z]|SHF|DHF|FDF|DPF|RFKH)/i },
  { brand: 'Castel',   codeRegex: /^(2010|2070|4140|4180|3140|6140|6440)/i },
  { brand: 'Sporlan',  codeRegex: /^(SD|SI|BD|EBF|EBS|HCK)/i },
  { brand: 'Frascold', codeRegex: /^(A[\d\-]|B[\d\-]|D[\d\-]|F[\d\-]|S[\d\-]|Q[\d\-])/i },
  { brand: 'Schneider', codeRegex: /^(GV2|LR2|A9F|XB[KEL]|ZB[L]|RM35|RE17)/i },
];

const norm = s => String(s || '').trim();
const findBrand = (item) => {
  const name = norm(item.name);
  // İsim içinde marka adı (notes'a değil — false-positive azaltır)
  const nameOnly = name;
  const codeOrBar = `${norm(item.product_code)} ${norm(item.barcode)}`;

  for (const rule of BRAND_RULES) {
    if (rule.keywords) {
      for (const kw of rule.keywords) {
        if (kw.test(nameOnly)) return { brand: rule.brand, matched: kw.source, type: 'name-keyword' };
      }
    }
    if (rule.codeRegex) {
      // Code/barcode'da prefix
      if (rule.codeRegex.test(norm(item.product_code))) return { brand: rule.brand, matched: rule.codeRegex.source, type: 'code-prefix' };
      if (rule.codeRegex.test(norm(item.barcode))) return { brand: rule.brand, matched: rule.codeRegex.source, type: 'barcode' };
      // İsim içinde herhangi bir tokende eşleşen pattern (NEU6220GK gibi)
      const nameTokens = name.split(/[\s\(\)\,\-\/]+/);
      for (const tok of nameTokens) {
        if (tok.length >= 4 && rule.codeRegex.test(tok)) return { brand: rule.brand, matched: rule.codeRegex.source, type: 'name-token' };
      }
    }
  }
  return null;
};

(async () => {
  const r = await pool.query(`
    SELECT id, name, brand, category, COALESCE(product_code,'') AS product_code,
           COALESCE(barcode,'') AS barcode, COALESCE(notes,'') AS notes
    FROM items WHERE is_active=true AND COALESCE(brand,'')=''
    ORDER BY id
  `);
  console.log(`Markasız aktif ürün: ${r.rowCount}`);

  const detected = [];
  const undetected = [];
  const byBrand = new Map();

  for (const it of r.rows) {
    const m = findBrand(it);
    if (m) {
      detected.push({ ...it, suggested: m.brand, matchType: m.type });
      byBrand.set(m.brand, (byBrand.get(m.brand) || 0) + 1);
    } else {
      undetected.push(it);
    }
  }

  console.log(`\n=== TESPİT İSTATİSTİĞİ ===`);
  console.log(`✓ Marka tespit edildi: ${detected.length} (%${(detected.length/r.rowCount*100).toFixed(1)})`);
  console.log(`? Tespit edilemedi: ${undetected.length}`);

  console.log(`\n=== TESPİT EDİLEN MARKA DAĞILIMI ===`);
  Array.from(byBrand.entries()).sort((a,b) => b[1]-a[1]).forEach(([brand, n]) =>
    console.log(`  ${n.toString().padStart(4)} × ${brand}`));

  // Eşleşme tipine göre dağılım
  const byType = {};
  detected.forEach(d => byType[d.matchType] = (byType[d.matchType] || 0) + 1);
  console.log(`\n=== EŞLEŞME TİPİ ===`);
  Object.entries(byType).forEach(([t, n]) => console.log(`  ${n.toString().padStart(4)} × ${t}`));

  // İlk 30 detect örneği
  console.log(`\n=== İLK 30 ÖNERİ (örnek) ===`);
  console.log(`DB#    | Mevcut → Önerilen | Kategori | İsim`);
  console.log('-'.repeat(110));
  detected.slice(0, 30).forEach(d => {
    console.log(`#${d.id.toString().padStart(5)} | (boş) → ${d.suggested.padEnd(13)} | ${(d.category||'').slice(0,20).padEnd(20)} | ${(d.name||'').slice(0,55)}`);
  });

  // Tespit edilemeyenlerden 15 örnek
  console.log(`\n=== TESPİT EDİLEMEYEN — İLK 15 ÖRNEK ===`);
  undetected.slice(0, 15).forEach(u => {
    console.log(`#${u.id.toString().padStart(5)} | cat=${(u.category||'').slice(0,20).padEnd(20)} | code=${(u.product_code||'').slice(0,15).padEnd(15)} | bar=${(u.barcode||'').slice(0,15).padEnd(15)} | ${(u.name||'').slice(0,40)}`);
  });

  // JSON dump
  fs.writeFileSync('/tmp/brand_detection_dryrun.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: r.rowCount,
    detected_count: detected.length,
    undetected_count: undetected.length,
    by_brand: Object.fromEntries(byBrand),
    by_match_type: byType,
    detected, undetected,
  }, null, 2));
  console.log(`\n💾 Detay JSON: /tmp/brand_detection_dryrun.json`);

  await pool.end();
})();
