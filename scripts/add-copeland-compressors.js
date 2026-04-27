#!/usr/bin/env node
// Copeland Scroll Kompresör ZH30K4E + ZH21K4E ürünlerini canlı Postgres'e ekler
// ve başlangıç stok girişini movements tablosuna yazar.
//
// Idempotent: product_code zaten varsa ürünü geçer; ürün zaten varsa
// sadece giriş hareketini tekrarlamaz (bugün için aynı notlu giriş kontrolü).
//
// Çalıştırma:
//   node scripts/add-copeland-compressors.js

"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const PRODUCTS = [
  {
    product_code: "CMP-COPELAND-ZH30K4E",
    name: "Copeland Scroll Kompresör ZH30K4E-TFD-524",
    brand: "Copeland (Emerson)",
    category: "Kompresör > Scroll",
    unit: "adet",
    min_stock: 1,
    sale_price: 400,
    list_price: 400,
    default_price: 400,
    initial_stock: 22,
    notes: [
      "Model: ZH30K4E-TFD-524",
      "Tip: Scroll (Hermetik) | 4 HP | ~8.5–9 kW (~29.000 BTU/h)",
      "Elektrik: 380-420V / 3 Faz / 50Hz",
      "Soğutucu: R134a / R407C / R410A",
      "Debi: 11.7 m³/h | Yağ: POE",
      "Kullanım: Pozitif soğuk oda (+0/+8°C), MT uygulamalar, Klima/Chiller",
      "Uyarı: Negatif oda (-18°C) için önerilmez",
      "Isı pompası (ZH serisi) scroll kompresör. Pozitif soğuk oda ve MT uygulamalar için uygundur.",
    ].join("\n"),
  },
  {
    product_code: "CMP-COPELAND-ZH21K4E",
    name: "Copeland Scroll Kompresör ZH21K4E-TFD-524",
    brand: "Copeland (Emerson)",
    category: "Kompresör > Scroll",
    unit: "adet",
    min_stock: 1,
    sale_price: 400,
    list_price: 400,
    default_price: 400,
    initial_stock: 8,
    notes: [
      "Model: ZH21K4E-TFD-524",
      "Tip: Scroll (Hermetik) | ~3 HP | ~6 kW (~20.000 BTU/h)",
      "Elektrik: 380-420V / 3 Faz / 50Hz",
      "Soğutucu: R134a / R407C",
      "Debi: ~8 m³/h | Yağ: POE",
      "Kullanım: Küçük pozitif soğuk oda, MT, Klima/Heat Pump",
      "Uyarı: Negatif oda için uygun değil",
    ].join("\n"),
  },
];

async function run() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL bulunamadı (.env).");
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  // Hareket için admin user — Anıl, yoksa ilk admin
  const adminRes = await client.query(
    "SELECT id, name FROM users WHERE role = 'admin' ORDER BY (username='anil') DESC, id LIMIT 1"
  );
  const adminId = adminRes.rows[0]?.id || null;
  const adminName = adminRes.rows[0]?.name || "(bilinmiyor)";
  console.log(`[info] Girişi yapacak admin: #${adminId} ${adminName}`);

  const today = new Date().toISOString().slice(0, 10);
  const report = [];

  for (const p of PRODUCTS) {
    const existing = await client.query(
      "SELECT id, name FROM items WHERE product_code = $1 LIMIT 1",
      [p.product_code]
    );

    let itemId;
    let itemCreated = false;
    if (existing.rows.length) {
      itemId = existing.rows[0].id;
      console.log(`[skip] ${p.product_code} zaten var → items.id=${itemId} (${existing.rows[0].name})`);
    } else {
      const ins = await client.query(
        `INSERT INTO items
           (name, brand, category, unit, min_stock, product_code, notes, is_active,
            default_price, list_price, sale_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, $10)
         RETURNING id`,
        [
          p.name,
          p.brand,
          p.category,
          p.unit,
          p.min_stock,
          p.product_code,
          p.notes,
          p.default_price,
          p.list_price,
          p.sale_price,
        ]
      );
      itemId = ins.rows[0].id;
      itemCreated = true;
      console.log(`[new]  ${p.product_code} eklendi → items.id=${itemId}`);
    }

    // Açılış stoğu — daha önce bu ürüne açılış girişi var mı?
    const existingMove = await client.query(
      `SELECT id FROM movements
       WHERE item_id = $1 AND type = 'entry' AND note = $2 LIMIT 1`,
      [itemId, "Acilis stogu - Copeland Kompresor alimi"]
    );

    if (existingMove.rows.length) {
      console.log(`[skip] ${p.product_code} için açılış hareketi zaten var (id=${existingMove.rows[0].id})`);
      report.push({ product_code: p.product_code, itemId, itemCreated, stockEntry: "skipped" });
      continue;
    }

    const mv = await client.query(
      `INSERT INTO movements
         (item_id, type, quantity, unit_price, movement_date, note, user_id)
       VALUES ($1, 'entry', $2, $3, $4, $5, $6)
       RETURNING id`,
      [itemId, p.initial_stock, p.sale_price, today, "Acilis stogu - Copeland Kompresor alimi", adminId]
    );
    console.log(
      `[stok] ${p.product_code}: +${p.initial_stock} adet giriş → movements.id=${mv.rows[0].id}`
    );
    report.push({
      product_code: p.product_code,
      itemId,
      itemCreated,
      stockEntry: { id: mv.rows[0].id, qty: p.initial_stock },
    });
  }

  // Özet
  console.log("\n== ÖZET ==");
  for (const r of report) {
    console.log(JSON.stringify(r));
  }

  await client.end();
}

run().catch((err) => {
  console.error("[hata]", err.message);
  process.exit(1);
});
