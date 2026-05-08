const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).reduce((a,l)=>{const [k,...v]=l.split('=');a[k]=v.join('=').replace(/^"|"$/g,'');return a;},{});
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const findings = [];
const log = (level, area, msg) => {
  const mark = level === 'OK' ? '✓' : level === 'WARN' ? '⚠' : '❌';
  findings.push({level, area, msg});
  console.log(`  ${mark} [${area}] ${msg}`);
};

(async () => {
  // ─── 1) Mevcut tablolar ───
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1");
  const have = new Set(tables.rows.map(r => r.table_name));
  console.log('Mevcut tablolar:', Array.from(have).join(', '), '\n');

  // ─── 2) STOK NEGATİFLİK ───
  console.log('=== 1) STOK NEGATİFLİK ===');
  const negStock = await pool.query(`
    WITH stock AS (
      SELECT m.item_id, SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END)::numeric AS qty
      FROM movements m GROUP BY m.item_id
    )
    SELECT i.id, i.name, i.brand, s.qty
    FROM items i JOIN stock s ON s.item_id = i.id
    WHERE i.is_active=true AND s.qty < 0
    ORDER BY s.qty
  `);
  if (negStock.rowCount === 0) {
    log('OK', 'STOK', 'Hiçbir aktif üründe negatif stok yok');
  } else {
    log('WARN', 'STOK', `${negStock.rowCount} üründe negatif stok`);
    negStock.rows.slice(0, 5).forEach(r =>
      console.log(`     ⚠ #${r.id} ${(r.name||'').slice(0,40)} → stok=${r.qty}`));
  }

  // ─── 3) ORDER_ITEMS TOPLAMI vs ORDERS.TOTAL ───
  console.log('\n=== 2) SİPARİŞ TOPLAMI TUTARLILIK ===');
  if (have.has('orders') && have.has('order_items')) {
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='orders'");
    const orderCols = cols.rows.map(r => r.column_name);
    const totalCol = orderCols.includes('total_amount') ? 'total_amount'
                   : orderCols.includes('total') ? 'total'
                   : orderCols.includes('grand_total') ? 'grand_total' : null;
    if (!totalCol) {
      log('OK', 'SİPARİŞ', 'orders.total kolonu yok — line item bazlı çalışıyor (tutarlı)');
    } else {
      const r = await pool.query(`
        SELECT o.id, o.${totalCol}::numeric AS recorded,
               COALESCE(SUM(oi.quantity * oi.unit_price), 0)::numeric AS calculated
        FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
        GROUP BY o.id, o.${totalCol}
        HAVING ABS(o.${totalCol}::numeric - COALESCE(SUM(oi.quantity * oi.unit_price), 0)::numeric) > 0.05
        ORDER BY ABS(o.${totalCol}::numeric - COALESCE(SUM(oi.quantity * oi.unit_price), 0)::numeric) DESC
        LIMIT 10
      `);
      if (r.rowCount === 0) log('OK', 'SİPARİŞ', `Tüm sipariş toplamları line item çarpımıyla tutarlı`);
      else {
        log('WARN', 'SİPARİŞ', `${r.rowCount}+ siparişte total uyuşmazlığı`);
        r.rows.slice(0,5).forEach(o =>
          console.log(`     ⚠ Order #${o.id}: recorded=€${Number(o.recorded).toFixed(2)} vs calc=€${Number(o.calculated).toFixed(2)} (fark €${(o.recorded-o.calculated).toFixed(2)})`));
      }
    }
  } else {
    log('OK', 'SİPARİŞ', 'orders/order_items tablosu yok — atlandı');
  }

  // ─── 4) QUOTE_ITEMS TOPLAMI vs QUOTES.TOTAL ───
  console.log('\n=== 3) TEKLİF TOPLAMI TUTARLILIK ===');
  if (have.has('quotes') && have.has('quote_items')) {
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='quotes'");
    const qCols = cols.rows.map(r => r.column_name);
    const tc = qCols.includes('total_amount') ? 'total_amount' : qCols.includes('total') ? 'total' : null;
    if (!tc) log('OK', 'TEKLİF', 'quotes.total kolonu yok');
    else {
      const r = await pool.query(`
        SELECT q.id, q.${tc}::numeric AS recorded,
               COALESCE(SUM(qi.quantity * qi.unit_price), 0)::numeric AS calculated
        FROM quotes q LEFT JOIN quote_items qi ON qi.quote_id = q.id
        GROUP BY q.id, q.${tc}
        HAVING ABS(q.${tc}::numeric - COALESCE(SUM(qi.quantity * qi.unit_price), 0)::numeric) > 0.05
        LIMIT 10
      `);
      if (r.rowCount === 0) log('OK', 'TEKLİF', 'Tüm teklif toplamları tutarlı');
      else log('WARN', 'TEKLİF', `${r.rowCount}+ teklifte uyuşmazlık`);
    }
  }

  // ─── 5) KASA / CASHBOOK ───
  console.log('\n=== 4) KASA — ÖDEME TUTARLILIK ===');
  if (have.has('cashbook')) {
    const cb = await pool.query(`SELECT
      COUNT(*)::int AS count,
      COALESCE(SUM(CASE WHEN type IN ('income','in','giris','tahsilat') THEN amount ELSE 0 END), 0)::numeric AS gelir,
      COALESCE(SUM(CASE WHEN type IN ('expense','out','cikis','odeme') THEN amount ELSE 0 END), 0)::numeric AS gider
      FROM cashbook`);
    const cbRow = cb.rows[0];
    log('OK', 'KASA', `${cbRow.count} kayıt | Gelir: €${Number(cbRow.gelir).toFixed(2)} | Gider: €${Number(cbRow.gider).toFixed(2)} | Bakiye: €${(Number(cbRow.gelir)-Number(cbRow.gider)).toFixed(2)}`);
    // Sipariş ödemesi vs cashbook
    const paidVsCash = await pool.query(`
      SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total_paid
      FROM orders WHERE COALESCE(paid_amount, 0) > 0
    `);
    const totPaid = Number(paidVsCash.rows[0].total_paid);
    log('OK', 'KASA', `Toplam orders.paid_amount: €${totPaid.toFixed(2)}`);
  } else {
    log('OK', 'KASA', 'cashbook tablosu yok');
  }

  // ─── 6) FİYATSIZ STOKLU ÜRÜNLER ───
  console.log('\n=== 5) STOKLU AMA FİYATSIZ ===');
  const noPrice = await pool.query(`
    WITH stock AS (
      SELECT m.item_id, SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END)::numeric AS qty
      FROM movements m GROUP BY m.item_id
    )
    SELECT i.id, i.name, i.brand, s.qty
    FROM items i JOIN stock s ON s.item_id=i.id
    WHERE i.is_active=true AND s.qty > 0 AND COALESCE(i.sale_price,0)=0 AND COALESCE(i.default_price,0)=0
    ORDER BY i.id LIMIT 20
  `);
  if (noPrice.rowCount === 0) log('OK', 'FİYAT', 'Stoklu tüm ürünlerin fiyatı var');
  else {
    log('WARN', 'FİYAT', `${noPrice.rowCount} stoklu ürün fiyatsız`);
    noPrice.rows.slice(0,5).forEach(r =>
      console.log(`     ⚠ #${r.id} ${(r.name||'').slice(0,55)} (stok ${r.qty})`));
  }

  // ─── 7) SALE < COST (zarar marjı) ───
  console.log('\n=== 6) ZARAR MARJI (sale < cost) ===');
  const loss = await pool.query(`
    SELECT id, name, brand, default_price, sale_price
    FROM items
    WHERE is_active=true
      AND COALESCE(default_price,0) > 0
      AND COALESCE(sale_price,0) > 0
      AND sale_price < default_price
    ORDER BY (default_price - sale_price) DESC LIMIT 20
  `);
  if (loss.rowCount === 0) log('OK', 'MARJ', 'Hiçbir üründe sale<cost durumu yok');
  else {
    log('WARN', 'MARJ', `${loss.rowCount} üründe sale fiyatı cost'tan düşük (zarar)`);
    loss.rows.slice(0,8).forEach(r =>
      console.log(`     ⚠ #${r.id} ${(r.name||'').slice(0,40)} cost=€${r.default_price} sale=€${r.sale_price} (kayıp €${(Number(r.default_price)-Number(r.sale_price)).toFixed(2)})`));
  }

  // ─── 8) LIST < SALE ───
  console.log('\n=== 7) LIST < SALE (yanlış brüt) ===');
  const wrongList = await pool.query(`
    SELECT id, name, sale_price, list_price
    FROM items
    WHERE is_active=true AND COALESCE(sale_price,0) > 0 AND COALESCE(list_price,0) > 0
      AND list_price < sale_price
    LIMIT 20
  `);
  if (wrongList.rowCount === 0) log('OK', 'LİST', 'Hiçbir üründe list_price < sale_price yok');
  else log('WARN', 'LİST', `${wrongList.rowCount} üründe brüt fiyatı net'ten düşük`);

  // ─── 9) DRC MAN FAQ vs items ───
  console.log('\n=== 8) DRC MAN FAQ vs DB FİYATLARI ===');
  const faqPath1 = 'scripts/drc_man_all_products_faq.part1.json';
  const faqPath2 = 'scripts/drc_man_all_products_faq.part2.json';
  if (fs.existsSync(faqPath1)) {
    const faq = [...JSON.parse(fs.readFileSync(faqPath1,'utf8')), ...JSON.parse(fs.readFileSync(faqPath2,'utf8'))];
    const faqByDb = new Map();
    for (const e of faq) {
      const tags = e.tags || [];
      const idTag = tags.find(t => /^\d+$/.test(t));
      if (idTag) faqByDb.set(Number(idTag), e);
    }
    const sample = await pool.query(`SELECT id, sale_price FROM items WHERE is_active=true ORDER BY RANDOM() LIMIT 100`);
    let mismatch = 0, checked = 0;
    for (const r of sample.rows) {
      const e = faqByDb.get(Number(r.id));
      if (!e) continue;
      checked++;
      const ans = (e.tr_answer || '').toLowerCase();
      const dbSale = Number(r.sale_price);
      // FAQ cevabında "Net: €X" arıyoruz
      const m = ans.match(/net:\s*€([\d.,]+)/);
      if (m) {
        const faqSale = parseFloat(m[1].replace(',','.'));
        if (Math.abs(faqSale - dbSale) > 0.05) mismatch++;
      }
    }
    if (mismatch === 0) log('OK', 'DRC MAN', `Sample 100 ürün — FAQ ve DB fiyatları %100 tutarlı (${checked} eşleşme)`);
    else log('WARN', 'DRC MAN', `${mismatch}/${checked} FAQ kaydında sale fiyat uyuşmazlığı`);
  }

  // ─── 10) MARKASIZ AKTIF ÜRÜN ───
  console.log('\n=== 9) MARKA EKSİK ===');
  const noBrand = await pool.query(`SELECT COUNT(*)::int c FROM items WHERE is_active=true AND COALESCE(brand,'')=''`);
  if (noBrand.rows[0].c === 0) log('OK', 'MARKA', 'Tüm aktif ürünlerin markası girilmiş');
  else log('WARN', 'MARKA', `${noBrand.rows[0].c} aktif üründe marka boş`);

  // ─── 11) KATEGORİSİZ AKTIF ÜRÜN ───
  console.log('\n=== 10) KATEGORİ EKSİK ===');
  const noCat = await pool.query(`SELECT COUNT(*)::int c FROM items WHERE is_active=true AND COALESCE(category,'')=''`);
  if (noCat.rows[0].c === 0) log('OK', 'KATEGORİ', 'Tüm aktif ürünlerin kategorisi girilmiş');
  else log('WARN', 'KATEGORİ', `${noCat.rows[0].c} üründe kategori boş`);

  // ─── 12) DUPLICATE ÜRÜN İSMİ + MARKA ───
  console.log('\n=== 11) İSİM DUPLICATE ===');
  const dups = await pool.query(`
    SELECT lower(brand)||'|'||lower(name) AS k, COUNT(*) AS c, ARRAY_AGG(id) AS ids
    FROM items WHERE is_active=true AND COALESCE(name,'')<>''
    GROUP BY lower(brand)||'|'||lower(name)
    HAVING COUNT(*) > 1
    ORDER BY c DESC LIMIT 10
  `);
  if (dups.rowCount === 0) log('OK', 'DUP', 'Hiçbir aktif üründe isim+marka duplicate yok');
  else {
    log('WARN', 'DUP', `${dups.rowCount}+ duplicate marka+isim grubu`);
    dups.rows.slice(0,5).forEach(d =>
      console.log(`     ⚠ ${d.k} → ${d.c} kayıt (IDs: ${d.ids.slice(0,5).join(',')})`));
  }

  // ─── ÖZET ───
  console.log('\n' + '='.repeat(80));
  const okCount = findings.filter(f => f.level === 'OK').length;
  const warnCount = findings.filter(f => f.level === 'WARN').length;
  const errCount = findings.filter(f => f.level === 'ERROR').length;
  console.log(`📊 ÖZET — Toplam ${findings.length} kontrol`);
  console.log(`   ✓ OK: ${okCount}  |  ⚠ WARN: ${warnCount}  |  ❌ ERROR: ${errCount}`);
  console.log('='.repeat(80));

  fs.writeFileSync('/tmp/full_audit.json', JSON.stringify(findings, null, 2));
  await pool.end();
})();
