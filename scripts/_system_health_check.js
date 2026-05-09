const { Pool } = require('pg');
const fs = require('fs');
const { execSync } = require('child_process');

const env = fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).reduce((a,l)=>{const [k,...v]=l.split('=');a[k]=v.join('=').replace(/^"|"$/g,'');return a;},{});
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const findings = [];
const log = (level, area, msg) => {
  const mark = level === 'OK' ? '✅' : level === 'INFO' ? 'ℹ' : level === 'WARN' ? '⚠' : '❌';
  findings.push({level, area, msg});
  console.log(`  ${mark} [${area.padEnd(14)}] ${msg}`);
};

const safe = (cmd) => { try { return execSync(cmd, {encoding:'utf8', stdio:['ignore','pipe','ignore']}).trim(); } catch(e) { return null; } };

(async () => {
  console.log('═'.repeat(80));
  console.log('🏥 DRC SİSTEM SAĞLIK KONTROLÜ — ' + new Date().toISOString());
  console.log('═'.repeat(80));

  // ════════ A) DATABASE ════════
  console.log('\n━━━ A) DATABASE ━━━');
  const dbSize = await pool.query("SELECT pg_size_pretty(pg_database_size(current_database())) AS size");
  log('INFO', 'DB', `Toplam veritabanı boyutu: ${dbSize.rows[0].size}`);

  const tables = await pool.query(`
    SELECT relname, n_live_tup::bigint AS rows, pg_size_pretty(pg_total_relation_size(relid)) AS size
    FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 12`);
  console.log('  En büyük tablolar:');
  tables.rows.forEach(r => console.log(`     ${r.rows.toString().padStart(8)} satır · ${r.size.padStart(10)} · ${r.relname}`));

  const conn = await pool.query("SELECT count(*)::int AS active FROM pg_stat_activity WHERE state='active'");
  log('OK', 'DB', `Aktif bağlantı: ${conn.rows[0].active}`);

  // ════════ B) ÜRÜN/STOK ════════
  console.log('\n━━━ B) ÜRÜN VE STOK ━━━');
  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM items WHERE is_active=true) AS aktif,
      (SELECT COUNT(*)::int FROM items WHERE is_active=false) AS arsiv,
      (SELECT COUNT(*)::int FROM items WHERE is_active=true AND COALESCE(default_price,0)=0 AND COALESCE(sale_price,0)=0) AS fiyatsiz,
      (SELECT COUNT(*)::int FROM items WHERE is_active=true AND COALESCE(brand,'')='') AS markasiz,
      (SELECT COUNT(*)::int FROM items WHERE is_active=true AND COALESCE(category,'')='') AS kategorisiz,
      (SELECT COUNT(*)::int FROM items WHERE is_active=true AND notes ILIKE '%TEKNİK ÖZELLİKLER%') AS teknikli
  `);
  const s = stats.rows[0];
  log('OK', 'ÜRÜN', `${s.aktif} aktif · ${s.arsiv} arşiv · ${s.fiyatsiz} fiyatsız · ${s.markasiz} markasız · ${s.teknikli} teknik veriyle`);

  const stockSummary = await pool.query(`
    WITH stock AS (
      SELECT m.item_id, SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END)::numeric AS qty
      FROM movements m GROUP BY m.item_id
    )
    SELECT
      COUNT(*) FILTER (WHERE s.qty > 0)::int AS stoklu,
      COUNT(*) FILTER (WHERE s.qty < 0)::int AS negatif,
      COUNT(*) FILTER (WHERE s.qty = 0)::int AS sifir,
      COALESCE(SUM(GREATEST(s.qty, 0) * COALESCE(i.default_price, 0)), 0)::numeric AS cost_total,
      COALESCE(SUM(GREATEST(s.qty, 0) * COALESCE(i.sale_price, 0)), 0)::numeric AS sale_total
    FROM items i LEFT JOIN stock s ON s.item_id=i.id
    WHERE i.is_active=true
  `);
  const st = stockSummary.rows[0];
  log(st.negatif === 0 ? 'OK' : 'WARN', 'STOK', `${st.stoklu} stoklu · ${st.sifir} sıfır · ${st.negatif} negatif · Cost €${Number(st.cost_total).toFixed(2)} · Sale €${Number(st.sale_total).toFixed(2)}`);

  // Critical low stock
  const critical = await pool.query(`
    WITH stock AS (
      SELECT m.item_id, SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END)::numeric AS qty
      FROM movements m GROUP BY m.item_id
    )
    SELECT COUNT(*)::int AS c FROM items i JOIN stock s ON s.item_id=i.id
    WHERE i.is_active=true AND COALESCE(i.min_stock,0) > 0 AND s.qty < i.min_stock
  `);
  if (critical.rows[0].c > 0) log('WARN', 'KRİTİK STOK', `${critical.rows[0].c} ürün min_stock altında`);
  else log('OK', 'KRİTİK STOK', 'Min stok altında ürün yok');

  // ════════ C) FİYAT TUTARLILIK ════════
  console.log('\n━━━ C) FİYAT TUTARLILIK ━━━');
  const wrongList = await pool.query(`SELECT COUNT(*)::int c FROM items WHERE is_active=true AND COALESCE(sale_price,0) > 0 AND COALESCE(list_price,0) > 0 AND list_price < sale_price`);
  log(wrongList.rows[0].c === 0 ? 'OK' : 'WARN', 'BRÜT<NET', `${wrongList.rows[0].c} üründe brüt fiyat net'ten düşük`);

  const wrongCost = await pool.query(`SELECT COUNT(*)::int c FROM items WHERE is_active=true AND COALESCE(default_price,0) > 0 AND COALESCE(sale_price,0) > 0 AND sale_price < default_price`);
  log(wrongCost.rows[0].c === 0 ? 'OK' : 'WARN', 'ZARAR MARJ', `${wrongCost.rows[0].c} üründe sale<cost (zarar)`);

  // Catalog vs DB tutarlılık
  try {
    const cat = JSON.parse(fs.readFileSync('admin-tools/coldroompro/shared-admin-catalog.json','utf8'));
    const ageDays = (Date.now() - new Date(cat.generatedAt).getTime()) / 86400000;
    log(ageDays < 1 ? 'OK' : 'WARN', 'CATALOG', `${cat.items.length} kalem · ${ageDays.toFixed(1)} gün önce üretildi (${cat.generatedAt.slice(0,16)})`);
  } catch(e) { log('ERROR', 'CATALOG', e.message); }

  // ════════ D) KASA / ÖDEME ════════
  console.log('\n━━━ D) KASA & ÖDEME ━━━');
  const cb = await pool.query(`SELECT
    COUNT(*)::int AS c,
    COALESCE(SUM(CASE WHEN type IN ('income','in','giris','tahsilat') THEN amount ELSE 0 END), 0)::numeric AS gelir,
    COALESCE(SUM(CASE WHEN type IN ('expense','out','cikis','odeme') THEN amount ELSE 0 END), 0)::numeric AS gider
    FROM cashbook`);
  const balance = Number(cb.rows[0].gelir) - Number(cb.rows[0].gider);
  log('OK', 'KASA', `${cb.rows[0].c} kayıt · Gelir €${Number(cb.rows[0].gelir).toFixed(2)} · Gider €${Number(cb.rows[0].gider).toFixed(2)} · Bakiye €${balance.toFixed(2)}`);

  // ════════ E) SİPARİŞ / TEKLİF ════════
  console.log('\n━━━ E) SİPARİŞ / TEKLİF ━━━');
  const orderStats = await pool.query(`
    SELECT
      COUNT(*)::int AS toplam,
      COUNT(*) FILTER (WHERE status='completed' OR status='delivered')::int AS tamamlandi,
      COUNT(*) FILTER (WHERE status='cancelled')::int AS iptal,
      COUNT(*) FILTER (WHERE COALESCE(status,'pending') IN ('pending','processing'))::int AS bekleyen,
      COALESCE(SUM(paid_amount), 0)::numeric AS toplam_odeme
    FROM orders`);
  const o = orderStats.rows[0];
  log('OK', 'SİPARİŞ', `${o.toplam} toplam · ${o.tamamlandi} tamamlandı · ${o.bekleyen} bekleyen · ${o.iptal} iptal · €${Number(o.toplam_odeme).toFixed(2)} toplam ödeme`);

  const quoteStats = await pool.query(`SELECT COUNT(*)::int c FROM quotes`);
  log('OK', 'TEKLİF', `${quoteStats.rows[0].c} teklif`);

  // ════════ F) KULLANICI ════════
  console.log('\n━━━ F) KULLANICI ━━━');
  const userStats = await pool.query(`
    SELECT
      COUNT(*)::int AS toplam,
      COUNT(*) FILTER (WHERE role='admin')::int AS admin,
      COUNT(*) FILTER (WHERE role='staff')::int AS staff,
      COUNT(*) FILTER (WHERE role='customer')::int AS customer,
      COUNT(*) FILTER (WHERE role='operator')::int AS operator,
      COUNT(*) FILTER (WHERE COALESCE(email_verified,false)=false)::int AS dogrulanmamis
    FROM users`);
  const u = userStats.rows[0];
  log('OK', 'KULLANICI', `${u.toplam} toplam · ${u.admin} admin · ${u.staff} staff · ${u.customer} customer · ${u.operator} operator · ${u.dogrulanmamis} doğrulanmamış`);

  // ════════ G) GÜVENLİK ════════
  console.log('\n━━━ G) GÜVENLİK ━━━');
  try {
    const sec = await pool.query(`SELECT COUNT(*)::int c FROM security_events WHERE created_at > NOW() - INTERVAL '7 days'`);
    log('OK', 'SEC EVENT', `Son 7 günde ${sec.rows[0].c} güvenlik olayı`);
    const blocks = await pool.query(`SELECT COUNT(*)::int c FROM security_blocks WHERE blocked_until > NOW()`);
    log(blocks.rows[0].c === 0 ? 'OK' : 'INFO', 'SEC BLOCK', `${blocks.rows[0].c} aktif blok`);
  } catch(e) { log('INFO', 'GÜVENLİK', 'security tablosu yok veya erişim sorunu'); }

  // ════════ H) PRODUCTION ════════
  console.log('\n━━━ H) PRODUCTION CANLI ━━━');
  const prodChecks = [
    ['Landing', 'https://drckaltetechnik.vercel.app/'],
    ['Catalog JSON', 'https://drckaltetechnik.vercel.app/admin-tools/coldroompro/shared-admin-catalog.json'],
    ['ColdRoomPro', 'https://drckaltetechnik.vercel.app/admin-tools/coldroompro/'],
    ['DRC logo', 'https://drckaltetechnik.vercel.app/assets/drc-logo.svg'],
    ['Hamm photo', 'https://drckaltetechnik.vercel.app/assets/photos/hamm-depo.jpg'],
  ];
  for (const [name, url] of prodChecks) {
    const code = safe(`curl -sIL --max-time 8 "${url}" -o /dev/null -w "%{http_code}"`) || 'TIMEOUT';
    log(code === '200' ? 'OK' : 'WARN', 'PROD', `${name.padEnd(14)} → HTTP ${code}`);
  }

  // ════════ I) LOKAL SERVİSLER ════════
  console.log('\n━━━ I) LOKAL SERVİSLER ━━━');
  const procs = safe(`ps aux | grep -E "cloudflared|node server.js|HamburgDepo" | grep -v grep | wc -l | tr -d ' '`);
  log('INFO', 'PROCESS', `${procs} aktif process (server, tunnel, watchdog)`);

  const localCode = safe(`curl -sIL --max-time 5 "http://localhost:3000/" -o /dev/null -w "%{http_code}"`);
  log(localCode === '200' ? 'OK' : 'WARN', 'LOKAL', `localhost:3000 → HTTP ${localCode}`);

  const launchd = safe('launchctl list 2>&1 | grep -E "hamburgdepo|drcman" | wc -l | tr -d " "');
  log('INFO', 'LAUNCHD', `${launchd} aktif launchd servisi`);

  // ════════ J) DİSK ════════
  console.log('\n━━━ J) DİSK / LOG ━━━');
  const projectSize = safe(`du -sh "/Users/anilakbas/Desktop/Hamburg depo stok programı " 2>/dev/null | awk '{print $1}'`);
  log('INFO', 'DİSK', `Proje boyutu: ${projectSize}`);

  const logSizes = safe(`du -sh "$HOME/Library/Logs/HamburgDepo" 2>/dev/null | awk '{print $1}'`);
  log('INFO', 'DİSK', `Log klasörü: ${logSizes || '(yok)'}`);

  const runtimeSize = safe(`du -sh "$HOME/Library/Application Support/HamburgDepo/runtime" 2>/dev/null | awk '{print $1}'`);
  log('INFO', 'DİSK', `Runtime klasörü: ${runtimeSize || '(yok)'}`);

  // ════════ K) DRC MAN FAQ ════════
  console.log('\n━━━ K) DRC MAN FAQ ━━━');
  try {
    const part1 = JSON.parse(fs.readFileSync('scripts/drc_man_all_products_faq.part1.json','utf8'));
    const part2 = JSON.parse(fs.readFileSync('scripts/drc_man_all_products_faq.part2.json','utf8'));
    log('OK', 'DRC MAN', `all_products: ${part1.length} + ${part2.length} = ${part1.length + part2.length} Q&A`);
    const stockTech = JSON.parse(fs.readFileSync('scripts/drc_man_stock_technical_faq.json','utf8'));
    log('OK', 'DRC MAN', `stock_technical: ${stockTech.length} Q&A`);
  } catch(e) { log('ERROR', 'DRC MAN', e.message); }

  // ════════ ÖZET ════════
  console.log('\n' + '═'.repeat(80));
  const ok = findings.filter(f => f.level === 'OK').length;
  const info = findings.filter(f => f.level === 'INFO').length;
  const warn = findings.filter(f => f.level === 'WARN').length;
  const err = findings.filter(f => f.level === 'ERROR').length;
  console.log(`📊 ÖZET — ${findings.length} kontrol`);
  console.log(`   ✅ OK: ${ok}  ·  ℹ INFO: ${info}  ·  ⚠ WARN: ${warn}  ·  ❌ ERROR: ${err}`);
  console.log('═'.repeat(80));
  if (warn > 0) {
    console.log('\n⚠ UYARILAR:');
    findings.filter(f => f.level === 'WARN').forEach(f => console.log(`   [${f.area}] ${f.msg}`));
  }
  if (err > 0) {
    console.log('\n❌ HATALAR:');
    findings.filter(f => f.level === 'ERROR').forEach(f => console.log(`   [${f.area}] ${f.msg}`));
  }

  fs.writeFileSync('/tmp/health_check.json', JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2));
  await pool.end();
})();
