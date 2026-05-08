const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).reduce((a,l)=>{const [k,...v]=l.split('=');a[k]=v.join('=').replace(/^"|"$/g,'');return a;},{});
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  console.log('Tüm aktif ürünleri yüklüyor...');
  const r = await pool.query(`
    WITH stock AS (
      SELECT m.item_id,
             SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END)::numeric AS qty
      FROM movements m GROUP BY m.item_id
    )
    SELECT i.id, i.name, COALESCE(i.name_de,'') AS name_de,
           COALESCE(i.brand,'') AS brand, COALESCE(i.category,'') AS category,
           COALESCE(i.unit,'') AS unit, COALESCE(i.product_code,'') AS product_code,
           COALESCE(i.barcode,'') AS barcode,
           SUBSTRING(COALESCE(i.notes,'') FROM 1 FOR 250) AS notes,
           COALESCE(i.default_price,0)::numeric AS def_price,
           COALESCE(i.sale_price,0)::numeric AS sale_price,
           COALESCE(i.list_price,0)::numeric AS list_price,
           COALESCE(s.qty, 0)::numeric AS stock
    FROM items i LEFT JOIN stock s ON s.item_id=i.id
    WHERE i.is_active=true
    ORDER BY i.id
  `);
  fs.writeFileSync('/tmp/all_active_items.json', JSON.stringify(r.rows));
  const sizeKB = fs.statSync('/tmp/all_active_items.json').size / 1024;
  console.log(`✓ ${r.rowCount} aktif ürün → /tmp/all_active_items.json (${sizeKB.toFixed(1)} KB)`);
  await pool.end();
})();
