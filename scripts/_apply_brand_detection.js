const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).reduce((a,l)=>{const [k,...v]=l.split('=');a[k]=v.join('=').replace(/^"|"$/g,'');return a;},{});
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const data = JSON.parse(fs.readFileSync('/tmp/brand_detection_dryrun.json','utf8'));
const updates = data.detected;
console.log(`UPDATE edilecek: ${updates.length} ürün`);

const BATCH_SIZE = 100;

(async () => {
  let done = 0;
  let byBrand = {};

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      for (const u of batch) {
        // Sadece hâlâ markasız ise UPDATE et (idempotent)
        const r = await c.query(
          `UPDATE items SET brand=$1,
            notes = COALESCE(notes,'') || $2
          WHERE id=$3 AND COALESCE(brand,'')=''`,
          [u.suggested,
           ` [2026-05-09 marka auto-detect: ${u.suggested} (${u.matchType})]`,
           u.id]
        );
        done += r.rowCount;
        byBrand[u.suggested] = (byBrand[u.suggested] || 0) + r.rowCount;
      }
      await c.query('COMMIT');
      const pct = ((done / updates.length) * 100).toFixed(1);
      process.stdout.write(`\r  Batch ${Math.ceil(i/BATCH_SIZE)+1}: ${done}/${updates.length} (%${pct})`);
    } catch (e) {
      await c.query('ROLLBACK');
      console.error(`\n❌ Batch ${i}-${i+batch.length} ROLLBACK:`, e.message);
      throw e;
    } finally { c.release(); }
  }

  console.log(`\n\n✅ TOPLAM UPDATE: ${done}/${updates.length}`);
  console.log('\nMarka dağılımı:');
  Object.entries(byBrand).sort((a,b)=>b[1]-a[1]).forEach(([b,n]) =>
    console.log(`  ${n.toString().padStart(4)} × ${b}`));

  // Doğrulama
  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM items WHERE is_active=true AND COALESCE(brand,'')='') AS markasiz_kalan,
      (SELECT COUNT(DISTINCT brand)::int FROM items WHERE is_active=true AND COALESCE(brand,'')<>'') AS unique_marka
  `);
  console.log(`\nMarkasız kalan: ${stats.rows[0].markasiz_kalan} (önce 405)`);
  console.log(`Toplam unique marka: ${stats.rows[0].unique_marka}`);

  await pool.end();
})();
