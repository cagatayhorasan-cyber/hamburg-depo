"use strict";
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) { const v = m[2].replace(/^["']|["']$/g, ""); if (!process.env[m[1]]) process.env[m[1]] = v; }
}
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // items columns
  const itemCols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='items'`);
  const have = new Set(itemCols.rows.map(r => r.column_name));

  if (!have.has("member_price")) {
    console.log("[migration] items.member_price ekleniyor...");
    await c.query("ALTER TABLE items ADD COLUMN member_price NUMERIC NOT NULL DEFAULT 0");
  } else { console.log("[skip] items.member_price zaten var"); }

  if (!have.has("vendor_id")) {
    console.log("[migration] items.vendor_id ekleniyor...");
    await c.query("ALTER TABLE items ADD COLUMN vendor_id BIGINT");
  } else { console.log("[skip] items.vendor_id zaten var"); }

  // vendors table
  const vendorTable = await c.query(`SELECT to_regclass('public.vendors') AS exists`);
  if (!vendorTable.rows[0].exists) {
    console.log("[migration] vendors tablosu olusturuluyor...");
    await c.query(`
      CREATE TABLE vendors (
        id BIGSERIAL PRIMARY KEY,
        owner_user_id BIGINT NOT NULL REFERENCES users(id),
        business_name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended','rejected')),
        commission_pct NUMERIC NOT NULL DEFAULT 10,
        contact_email TEXT,
        contact_phone TEXT,
        address TEXT,
        vat_id TEXT,
        iban TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ,
        approved_at TIMESTAMPTZ
      )
    `);
    await c.query("CREATE INDEX idx_vendors_owner ON vendors (owner_user_id)");
    await c.query("CREATE INDEX idx_vendors_status ON vendors (status)");
    await c.query("CREATE INDEX idx_items_vendor ON items (vendor_id) WHERE vendor_id IS NOT NULL");
  } else { console.log("[skip] vendors tablosu zaten var"); }

  // Verify
  const itemColsNow = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='items' AND column_name IN ('member_price','vendor_id')`);
  console.log(`\nitems yeni kolonlar: ${itemColsNow.rows.map(r=>r.column_name).join(", ")}`);

  const vendorColsNow = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='vendors' ORDER BY ordinal_position`);
  console.log(`vendors kolonlar: ${vendorColsNow.rows.map(r=>r.column_name).join(", ")}`);

  await c.end();
  console.log("\n[DONE]");
})().catch(e => { console.error(e); process.exit(1); });
