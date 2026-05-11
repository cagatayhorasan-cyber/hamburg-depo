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
  await c.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS main_category TEXT`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_items_main_category ON items (main_category)`);
  console.log("✓ items.main_category eklendi + indeks");
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
