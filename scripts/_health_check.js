const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).reduce((a,l)=>{const [k,...v]=l.split('=');a[k]=v.join('=').replace(/^"|"$/g,'');return a;},{});
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = (n) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🏥 HAMBURG DEPO — GENEL SAĞLIK RAPORU');
  console.log(`📅 ${new Date().toLocaleString('tr-TR')}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  // ───────── 1) ITEMS ─────────
  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 1️⃣  ÜRÜN VERİTABANI                                                          │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  const items = await pool.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_active = true)::int AS aktif,
      COUNT(*) FILTER (WHERE is_active = false)::int AS pasif,
      COUNT(*) FILTER (WHERE COALESCE(default_price,0) = 0 AND COALESCE(sale_price,0) = 0 AND is_active = true)::int AS fiyatsiz_aktif,
      COUNT(*) FILTER (WHERE COALESCE(brand,'') = '' AND is_active = true)::int AS markasiz_aktif,
      COUNT(*) FILTER (WHERE COALESCE(category,'') = '' AND is_active = true)::int AS kategorisiz_aktif,
      COUNT(*) FILTER (WHERE sale_price < default_price AND default_price > 0)::int AS sale_dusuk,
      COUNT(*) FILTER (WHERE list_price < sale_price AND sale_price > 0)::int AS list_dusuk
    FROM items
  `);
  const it = items.rows[0];
  console.log(`  Toplam: ${it.total}  |  Aktif: ${it.aktif}  |  Pasif: ${it.pasif}`);
  console.log(`  ⚠ Fiyatsız aktif: ${it.fiyatsiz_aktif}`);
  console.log(`  ⚠ Markasız aktif: ${it.markasiz_aktif}`);
  console.log(`  ⚠ Kategorisiz aktif: ${it.kategorisiz_aktif}`);
  console.log(`  ⚠ Sale < Cost (zarar): ${it.sale_dusuk}`);
  console.log(`  ⚠ List < Sale (anomali): ${it.list_dusuk}`);

  // ───────── 2) STOK ─────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 2️⃣  STOK DURUMU                                                              │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  const stock = await pool.query(`
    WITH s AS (
      SELECT m.item_id,
             SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END)::numeric AS qty
      FROM movements m GROUP BY m.item_id
    )
    SELECT
      COUNT(*) FILTER (WHERE s.qty > 0)::int AS stoklu,
      COUNT(*) FILTER (WHERE s.qty < 0)::int AS negatif,
      COUNT(*) FILTER (WHERE s.qty = 0)::int AS sifirlanmis,
      COALESCE(SUM(CASE WHEN s.qty > 0 THEN s.qty * COALESCE(i.default_price,0) ELSE 0 END), 0)::numeric AS toplam_cost,
      COALESCE(SUM(CASE WHEN s.qty > 0 THEN s.qty * COALESCE(i.sale_price,0) ELSE 0 END), 0)::numeric AS toplam_sale,
      COALESCE(SUM(CASE WHEN s.qty > 0 THEN s.qty ELSE 0 END), 0)::numeric AS toplam_adet
    FROM items i LEFT JOIN s ON s.item_id = i.id
    WHERE i.is_active = true
  `);
  const st = stock.rows[0];
  console.log(`  Stoklu ürün: ${st.stoklu} kalem`);
  console.log(`  Sıfırlanmış (eski stok): ${st.sifirlanmis} kalem`);
  console.log(`  ⚠ Negatif stok: ${st.negatif} kalem`);
  console.log(`  Toplam stok adedi: ${fmt(st.toplam_adet)}`);
  console.log(`  Toplam stok değeri (cost): € ${fmt(st.toplam_cost)}`);
  console.log(`  Toplam stok değeri (sale): € ${fmt(st.toplam_sale)}`);
  console.log(`  Net markup: € ${fmt(Number(st.toplam_sale) - Number(st.toplam_cost))}`);

  // Negatif stok ürünleri
  if (st.negatif > 0) {
    const neg = await pool.query(`
      WITH s AS (
        SELECT m.item_id, SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END)::numeric AS qty
        FROM movements m GROUP BY m.item_id
      )
      SELECT i.id, i.name, s.qty FROM items i JOIN s ON s.item_id=i.id
      WHERE s.qty < 0 AND i.is_active = true ORDER BY s.qty LIMIT 10
    `);
    console.log('\n  Negatif stoktaki ürünler (ilk 10):');
    neg.rows.forEach(r => console.log(`    #${r.id} stok=${r.qty} | ${(r.name||'').slice(0,55)}`));
  }

  // Stoklu ama fiyatsız ürünler
  const stockNoPrice = await pool.query(`
    WITH s AS (
      SELECT m.item_id, SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END)::numeric AS qty
      FROM movements m GROUP BY m.item_id
    )
    SELECT COUNT(*)::int c FROM items i JOIN s ON s.item_id=i.id
    WHERE i.is_active=true AND s.qty > 0 AND COALESCE(i.default_price,0)=0 AND COALESCE(i.sale_price,0)=0
  `);
  console.log(`  ⚠ Stoklu ama fiyatsız: ${stockNoPrice.rows[0].c} kalem`);

  // ───────── 3) KASA ─────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 3️⃣  KASA (CASHBOOK)                                                          │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  const cash = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS aktif,
      COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS silinmis,
      COALESCE(SUM(CASE WHEN type='in' AND deleted_at IS NULL THEN amount ELSE 0 END), 0)::numeric AS toplam_giris,
      COALESCE(SUM(CASE WHEN type='out' AND deleted_at IS NULL THEN amount ELSE 0 END), 0)::numeric AS toplam_cikis
    FROM cashbook
  `);
  const cb = cash.rows[0];
  const balance = Number(cb.toplam_giris) - Number(cb.toplam_cikis);
  console.log(`  Aktif kayıt: ${cb.aktif}  |  Silinmiş: ${cb.silinmis}`);
  console.log(`  Toplam giriş (in): € ${fmt(cb.toplam_giris)}`);
  console.log(`  Toplam çıkış (out): € ${fmt(cb.toplam_cikis)}`);
  console.log(`  Bakiye: € ${fmt(balance)} ${balance > 0 ? '✓' : balance < 0 ? '⚠ NEGATİF' : ''}`);

  // Şüpheli duplicate kayıtlar
  const dups = await pool.query(`
    SELECT cash_date, type, title, amount, COUNT(*)::int AS adet
    FROM cashbook WHERE deleted_at IS NULL
    GROUP BY cash_date, type, title, amount
    HAVING COUNT(*) > 1
    ORDER BY cash_date DESC LIMIT 10
  `);
  console.log(`  ⚠ Şüpheli duplicate kayıtlar: ${dups.rowCount} grup`);
  if (dups.rowCount > 0) {
    dups.rows.slice(0, 5).forEach(d => console.log(`    ${d.cash_date.toISOString().slice(0,10)} | ${d.type} | ${d.title} | €${d.amount} × ${d.adet}`));
  }

  // ───────── 4) MOVEMENTS / SİPARİŞ / TEKLİF ─────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 4️⃣  HAREKETLER VE TİCARİ KAYITLAR                                            │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM movements) AS movements,
      (SELECT COUNT(*)::int FROM movements WHERE movement_date >= CURRENT_DATE - INTERVAL '30 days') AS movements_30d,
      (SELECT COUNT(*)::int FROM quotes) AS quotes,
      (SELECT COUNT(*)::int FROM quote_items) AS quote_items,
      (SELECT COUNT(*)::int FROM orders) AS orders,
      (SELECT COUNT(*)::int FROM order_items) AS order_items,
      (SELECT COUNT(*)::int FROM projects) AS projects,
      (SELECT COUNT(*)::int FROM users WHERE role='customer') AS musteri,
      (SELECT COUNT(*)::int FROM users WHERE role='staff') AS personel,
      (SELECT COUNT(*)::int FROM users WHERE role='admin') AS admin
  `);
  const s = stats.rows[0];
  console.log(`  Stok hareketi: ${s.movements} (son 30 gün: ${s.movements_30d})`);
  console.log(`  Teklifler: ${s.quotes} (kalem: ${s.quote_items})`);
  console.log(`  Siparişler: ${s.orders} (kalem: ${s.order_items})`);
  console.log(`  Projeler: ${s.projects}`);
  console.log(`  Kullanıcılar: ${s.admin} admin · ${s.personel} personel · ${s.musteri} müşteri`);

  // ───────── 5) ORPHAN / BÜTÜNLÜK ─────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 5️⃣  REFERANS BÜTÜNLÜĞÜ (ORPHAN KONTROLÜ)                                     │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  const orphans = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM movements m WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = m.item_id)) AS mov_orphan,
      (SELECT COUNT(*)::int FROM quote_items q WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = q.item_id) AND q.item_id IS NOT NULL) AS qi_orphan,
      (SELECT COUNT(*)::int FROM order_items o WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.id = o.item_id) AND o.item_id IS NOT NULL) AS oi_orphan
  `);
  const orph = orphans.rows[0];
  console.log(`  Orphan movements (item_id geçersiz): ${orph.mov_orphan} ${orph.mov_orphan === 0 ? '✓' : '❌'}`);
  console.log(`  Orphan quote_items: ${orph.qi_orphan} ${orph.qi_orphan === 0 ? '✓' : '❌'}`);
  console.log(`  Orphan order_items: ${orph.oi_orphan} ${orph.oi_orphan === 0 ? '✓' : '❌'}`);

  // ───────── 6) FİYAT ANOMALİLERİ ─────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 6️⃣  FİYAT ANOMALİLERİ (TOP 10)                                               │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  const priceAnom = await pool.query(`
    SELECT id, name, default_price, sale_price, list_price
    FROM items
    WHERE is_active = true AND (
      (sale_price < default_price AND default_price > 0)
      OR (list_price < sale_price AND sale_price > 0)
      OR (default_price = 0 AND sale_price > 0)
    )
    ORDER BY id LIMIT 10
  `);
  if (priceAnom.rowCount === 0) {
    console.log('  ✓ Anomali yok');
  } else {
    priceAnom.rows.forEach(r => {
      let issue = '';
      if (Number(r.default_price) === 0 && Number(r.sale_price) > 0) issue = 'cost=0';
      else if (Number(r.sale_price) < Number(r.default_price)) issue = 'sale<cost';
      else if (Number(r.list_price) < Number(r.sale_price)) issue = 'list<sale';
      console.log(`  ⚠ #${r.id} [${issue}] def=€${r.default_price} sale=€${r.sale_price} list=€${r.list_price} | ${(r.name||'').slice(0,45)}`);
    });
  }

  // ───────── 7) BUGÜNKÜ DEĞİŞİKLİKLER ─────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 7️⃣  BUGÜNKÜ AKTİVİTE (08.05.2026)                                            │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  const today = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM items WHERE created_at::date = CURRENT_DATE) AS yeni_items,
      (SELECT COUNT(*)::int FROM movements WHERE movement_date = CURRENT_DATE OR movement_date = CURRENT_DATE - INTERVAL '1 day') AS hareket_son2gun,
      (SELECT COUNT(*)::int FROM cashbook WHERE created_at::date = CURRENT_DATE) AS yeni_kasa
  `);
  const td = today.rows[0];
  console.log(`  Yeni eklenen ürün: ${td.yeni_items}`);
  console.log(`  Son 2 gün hareket: ${td.hareket_son2gun}`);
  console.log(`  Yeni kasa kaydı: ${td.yeni_kasa}`);

  // ───────── 8) MARKA & KATEGORİ COVERAGE ─────────
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ 8️⃣  MARKA & KATEGORİ DAĞILIMI (TOP 5)                                        │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  const brands = await pool.query(`
    SELECT brand, COUNT(*)::int c FROM items
    WHERE is_active=true AND brand IS NOT NULL AND brand != ''
    GROUP BY brand ORDER BY c DESC LIMIT 5
  `);
  console.log('  En çok ürünü olan markalar:');
  brands.rows.forEach(r => console.log(`    ${r.c.toString().padStart(5)} × ${r.brand}`));

  const cats = await pool.query(`
    SELECT category, COUNT(*)::int c FROM items
    WHERE is_active=true AND category IS NOT NULL AND category != ''
    GROUP BY category ORDER BY c DESC LIMIT 5
  `);
  console.log('  En çok ürünü olan kategoriler:');
  cats.rows.forEach(r => console.log(`    ${r.c.toString().padStart(5)} × ${r.category}`));

  // ───────── 9) ÖZET SAĞLIK SKORU ─────────
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('🏆 SAĞLIK SKORU');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  const issues = [];
  if (it.fiyatsiz_aktif > 50) issues.push(`Çok fiyatsız ürün (${it.fiyatsiz_aktif})`);
  if (st.negatif > 0) issues.push(`Negatif stok (${st.negatif})`);
  if (orph.mov_orphan > 0) issues.push(`Orphan movements (${orph.mov_orphan})`);
  if (priceAnom.rowCount > 5) issues.push(`Fiyat anomalisi (${priceAnom.rowCount})`);
  if (it.markasiz_aktif > 100) issues.push(`Markasız aktif ürün fazla (${it.markasiz_aktif})`);
  if (balance < 0) issues.push(`Kasa bakiyesi negatif (€${fmt(balance)})`);
  if (dups.rowCount > 5) issues.push(`Çok duplicate kasa kaydı (${dups.rowCount})`);

  if (issues.length === 0) {
    console.log('  ✅ Sistem temiz — kritik sorun yok!');
  } else {
    console.log(`  ⚠ ${issues.length} bulgu:`);
    issues.forEach((i, idx) => console.log(`    ${idx+1}. ${i}`));
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  await pool.end();
})();
