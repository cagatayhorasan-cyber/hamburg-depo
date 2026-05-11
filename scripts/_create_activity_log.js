"use strict";
/**
 * user_activity_log tablosu oluşturma migration.
 * Hamburg sistemine yeni özellik: admin kullanicıların
 * tüm müşteri davranışlarını takip etsin (search, view, cart, order).
 */
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

  await c.query(`
    CREATE TABLE IF NOT EXISTS user_activity_log (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      user_role TEXT,
      user_name TEXT,
      session_id TEXT,
      event_type TEXT NOT NULL,
      event_label TEXT,
      target_type TEXT,
      target_id BIGINT,
      page_path TEXT,
      metadata JSONB,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_activity_user ON user_activity_log (user_id, created_at DESC)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_activity_type ON user_activity_log (event_type, created_at DESC)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_activity_session ON user_activity_log (session_id)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_activity_target ON user_activity_log (target_type, target_id, created_at DESC)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_activity_created ON user_activity_log (created_at DESC)`);

  const r = await c.query(`SELECT COUNT(*) AS n FROM user_activity_log`);
  console.log(`[OK] user_activity_log tablosu hazir. Mevcut satir: ${r.rows[0].n}`);
  await c.end();
})().catch(e => { console.error("HATA:", e.message); process.exit(1); });
