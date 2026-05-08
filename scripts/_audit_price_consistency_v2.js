const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).reduce((a,l)=>{const [k,...v]=l.split('=');a[k]=v.join('=').replace(/^"|"$/g,'');return a;},{});
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const norm = s => String(s || '').toLowerCase().replace(/[^\w]+/g, '').slice(0, 80);

(async () => {
  // 1) DB
  const dbRes = await pool.query(`
    SELECT id, name, COALESCE(brand,'') AS brand, COALESCE(product_code,'') AS pcode, COALESCE(barcode,'') AS barcode,
           COALESCE(default_price,0)::numeric AS def, COALESCE(sale_price,0)::numeric AS sale, COALESCE(list_price,0)::numeric AS list
    FROM items WHERE is_active=true
  `);
  // Eşleşme indeksi: productCode → row, barcode → row, normalized name+brand → row
  const byCode = new Map();
  const byBarcode = new Map();
  const byNameBrand = new Map();
  for (const r of dbRes.rows) {
    if (r.pcode) byCode.set(norm(r.pcode), r);
    if (r.barcode) byBarcode.set(norm(r.barcode), r);
    byNameBrand.set(norm(r.name) + '|' + norm(r.brand), r);
  }
  console.log(`DB aktif: ${dbRes.rows.length} | byCode: ${byCode.size}, byBarcode: ${byBarcode.size}, byNameBrand: ${byNameBrand.size}`);

  // 2) Catalog
  const cat = JSON.parse(fs.readFileSync('admin-tools/coldroompro/shared-admin-catalog.json', 'utf8'));
  console.log(`Catalog: ${cat.items.length} kalem, generated: ${cat.generatedAt}`);

  // 3) Match
  let matched = 0, sameSale = 0, diffSale = [], unmatched = 0;
  for (const cit of cat.items) {
    const catSale = Number(cit.visiblePrice ?? cit.salePrice ?? cit.price ?? 0);
    let db = null, matchType = '';
    if (cit.productCode && byCode.has(norm(cit.productCode))) { db = byCode.get(norm(cit.productCode)); matchType = 'pcode'; }
    if (!db && cit.barcode && byBarcode.has(norm(cit.barcode))) { db = byBarcode.get(norm(cit.barcode)); matchType = 'barcode'; }
    if (!db) {
      const key = norm(cit.name) + '|' + norm(cit.brand);
      if (byNameBrand.has(key)) { db = byNameBrand.get(key); matchType = 'name+brand'; }
    }
    if (!db) { unmatched++; continue; }
    matched++;
    const dbSale = Number(db.sale);
    if (Math.abs(dbSale - catSale) < 0.01) {
      sameSale++;
    } else {
      diffSale.push({
        db_id: Number(db.id), name: db.name?.slice(0,55), brand: db.brand,
        db_sale: dbSale, catalog_sale: catSale, diff: dbSale - catSale, matchType,
      });
    }
  }

  console.log(`\n=== ÖZET (Catalog 2026-04-19 vs DB 2026-05-08) ===`);
  console.log(`  ✓ Eşleşmiş + aynı fiyat: ${sameSale}`);
  console.log(`  ⚠ Eşleşmiş ama fiyat farklı: ${diffSale.length}`);
  console.log(`  ❌ Catalog'da var DB'de bulunmadı: ${unmatched}`);
  console.log(`  Toplam catalog kalem: ${cat.items.length}`);
  console.log(`  Match oranı: %${(matched/cat.items.length*100).toFixed(1)}`);

  // En büyük 25 fark
  diffSale.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  console.log(`\n=== EN BÜYÜK 25 SALE FİYAT FARKI ===`);
  console.log(`DB#     | Marka         | İsim                                  | DB sale  | Cat sale | Fark`);
  console.log('-'.repeat(110));
  diffSale.slice(0, 25).forEach(d => {
    const sign = d.diff > 0 ? '+' : '';
    console.log(`#${d.db_id.toString().padStart(6)} | ${(d.brand||'').slice(0,13).padEnd(13)} | ${(d.name||'').slice(0,35).padEnd(35)} | €${d.db_sale.toFixed(2).padStart(8)} | €${d.catalog_sale.toFixed(2).padStart(8)} | ${sign}€${d.diff.toFixed(2)}`);
  });

  // Plan A/B özel kontrol
  console.log(`\n=== Plan A / Plan B / R-404 KAYITLARIM ===`);
  const recentDbIds = [21,22,24,25,29,37,40,41,45,46,47,48,49,50,54,55,56,59,146, 23892,23893,23894,23895,23896,23897,23898,23899,23900,23901,23902,23903,23904,23905, 22496,23797];
  for (const id of recentDbIds) {
    const db = dbRes.rows.find(r => Number(r.id) === id);
    if (!db) continue;
    const dbName = norm(db.name);
    const dbBrand = norm(db.brand);
    const matchByName = cat.items.find(c => norm(c.name) === dbName && norm(c.brand) === dbBrand);
    const matchByCode = db.pcode ? cat.items.find(c => norm(c.productCode) === norm(db.pcode)) : null;
    const m = matchByName || matchByCode;
    if (!m) {
      console.log(`  ❌ #${id} ${db.name?.slice(0,40)} → CATALOG'DA YOK (DB €${Number(db.sale).toFixed(2)})`);
    } else {
      const cs = Number(m.visiblePrice ?? m.salePrice ?? m.price ?? 0);
      const ok = Math.abs(Number(db.sale) - cs) < 0.01;
      console.log(`  ${ok ? '✓' : '⚠'} #${id} ${db.name?.slice(0,40)} → DB €${Number(db.sale).toFixed(2)} | Cat €${cs.toFixed(2)} ${ok ? '' : '(STALE)'}`);
    }
  }

  fs.writeFileSync('/tmp/price_audit_v2.json', JSON.stringify({
    summary: { sameSale, diffCount: diffSale.length, unmatched, matched, total: cat.items.length },
    diffs: diffSale,
  }, null, 2));
  console.log(`\nDetay: /tmp/price_audit_v2.json`);

  await pool.end();
})();
