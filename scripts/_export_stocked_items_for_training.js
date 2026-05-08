const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).reduce((a,l)=>{const [k,...v]=l.split('=');a[k]=v.join('=').replace(/^"|"$/g,'');return a;},{});
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const r = await pool.query(`
    WITH stock AS (
      SELECT m.item_id,
             SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END)::numeric AS qty,
             MAX(m.unit_price) FILTER (WHERE m.type='entry')::numeric AS last_entry_cost
      FROM movements m GROUP BY m.item_id
    )
    SELECT i.id, i.name, COALESCE(i.name_de,'') AS name_de,
           COALESCE(i.brand,'') AS brand, COALESCE(i.category,'') AS category,
           COALESCE(i.unit,'') AS unit, COALESCE(i.product_code,'') AS product_code,
           COALESCE(i.barcode,'') AS barcode, COALESCE(i.notes,'') AS notes,
           COALESCE(i.notes_de,'') AS notes_de,
           COALESCE(i.default_price,0)::numeric AS def_price,
           COALESCE(i.sale_price,0)::numeric AS sale_price,
           COALESCE(i.list_price,0)::numeric AS list_price,
           s.qty AS stock,
           s.last_entry_cost
    FROM items i JOIN stock s ON s.item_id=i.id
    WHERE i.is_active=true AND s.qty > 0
    ORDER BY (s.qty * COALESCE(i.default_price,0)) DESC
  `);
  fs.writeFileSync('/tmp/stocked_items.json', JSON.stringify(r.rows, null, 2));
  console.log(`✓ ${r.rowCount} stoklu ürün → /tmp/stocked_items.json`);
  await pool.end();
})();
