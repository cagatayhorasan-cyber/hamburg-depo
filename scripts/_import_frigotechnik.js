"use strict";
/**
 * Frigotechnik.de scrape edilmiş 7.731 ürünü Hamburg items tablosuna import et.
 * Duplicate kontrolu:
 *   1. product_code (SKU) eşleşmesi → atla
 *   2. brand + normalize(title) eşleşmesi → atla
 *   3. Yeni: INSERT
 */
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) { const v = m[2].replace(/^["']|["']$/g, ""); if (!process.env[m[1]]) process.env[m[1]] = v; }
}
const { Client } = require("pg");

const SRC = "/Users/anilakbas/Desktop/drcotomasyon/frigotechnik/logs/products.json";
const DRY_RUN = process.argv.includes("--dry-run");

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 80);
}

function trimText(s, max = 1500) {
  if (!s) return "";
  s = String(s).trim();
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

function formatSpecs(specs) {
  if (!specs || typeof specs !== "object" || Object.keys(specs).length === 0) return "";
  const lines = [];
  for (const [k, v] of Object.entries(specs)) {
    if (v === null || v === undefined || v === "") continue;
    lines.push(`${k}: ${String(v).slice(0, 200)}`);
  }
  return lines.join(" | ").slice(0, 2000);
}

function categoryFromFrigo(p) {
  // Frigotechnik category mevcut: main_category, sub_category
  return {
    main: p.main_category || "Sonstiges",
    sub:  p.sub_category || p.main_category || "Sonstiges",
  };
}

(async () => {
  console.log(`📂 Okunuyor: ${SRC}`);
  const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
  console.log(`   ${data.length} ürün`);

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  console.log("📊 Mevcut Hamburg ürün index'i hazırlanıyor...");
  const existingRows = await c.query(`SELECT product_code, brand, name FROM items WHERE is_active = true`);
  const skuSet = new Set();
  const normSet = new Set();
  for (const r of existingRows.rows) {
    if (r.product_code) skuSet.add(String(r.product_code).toLowerCase().trim());
    if (r.brand && r.name) normSet.add(normalize(r.brand) + "|" + normalize(r.name).slice(0, 40));
  }
  console.log(`   ${existingRows.rowCount} Hamburg ürünü → ${skuSet.size} SKU + ${normSet.size} brand+name hash`);

  // Filter + sınıflandır
  const toInsert = [];
  const skipped = { dup_sku: 0, dup_name: 0, no_title: 0, no_brand: 0 };
  for (const p of data) {
    if (!p.title) { skipped.no_title++; continue; }
    if (!p.brand) { skipped.no_brand++; continue; }

    const sku = String(p.sku || "").toLowerCase().trim();
    if (sku && skuSet.has(sku)) { skipped.dup_sku++; continue; }
    const norm = normalize(p.brand) + "|" + normalize(p.title).slice(0, 40);
    if (normSet.has(norm)) { skipped.dup_name++; continue; }

    toInsert.push(p);
    skuSet.add(sku);
    normSet.add(norm);
  }

  console.log(`\n🔍 Filtre sonucu:`);
  console.log(`   Yeni eklenecek: ${toInsert.length}`);
  console.log(`   SKU dup atlandı: ${skipped.dup_sku}`);
  console.log(`   İsim dup atlandı: ${skipped.dup_name}`);
  console.log(`   Başlık eksik atlandı: ${skipped.no_title}`);
  console.log(`   Marka eksik atlandı: ${skipped.no_brand}`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] İlk 5 örnek:");
    for (const p of toInsert.slice(0, 5)) {
      const cat = categoryFromFrigo(p);
      console.log(`  - [${p.brand}] ${p.title.slice(0, 60)} | ${cat.main} / ${cat.sub}`);
    }
    await c.end();
    return;
  }

  // Batch insert (200'lük)
  console.log("\n💾 Batch INSERT başlıyor...");
  const BATCH = 200;
  let inserted = 0;
  const startTs = Date.now();

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const slice = toInsert.slice(i, i + BATCH);
    // Multi-row VALUES
    const values = [];
    const params = [];
    let p = 1;
    for (const it of slice) {
      const cat = categoryFromFrigo(it);
      const specsLine = formatSpecs(it.specs);
      const notesParts = [];
      if (it.description) notesParts.push(trimText(it.description, 1000));
      if (specsLine) notesParts.push("Technische Daten: " + specsLine);
      const notes = notesParts.join("\n\n");
      const productCode = String(it.sku || "").slice(0, 50);
      values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, 0, 0, 0, true, 14, true, $${p++}, $${p++}, $${p++})`);
      params.push(
        trimText(it.title, 250),                            // name
        String(it.brand || "").slice(0, 100),               // brand
        String(cat.sub).slice(0, 100),                      // category (alt)
        String(cat.main).slice(0, 100),                     // main_category
        "adet",                                              // unit
        productCode,                                         // product_code
        String(it.image || "").slice(0, 500) || "/assets/categories/refrigeration.svg", // image_url
        trimText(it.title, 250),                            // name_de
        trimText(it.description, 1500),                     // notes_de
        trimText(notes, 1500)                               // notes
      );
    }

    const sql = `
      INSERT INTO items (name, brand, category, main_category, unit, product_code, image_url,
                         default_price, sale_price, list_price, is_active, lead_time_days, allow_backorder,
                         name_de, notes_de, notes)
      VALUES ${values.join(", ")}
    `;
    try {
      await c.query(sql, params);
      inserted += slice.length;
    } catch (e) {
      console.error(`  [BATCH ERROR] ${i}-${i + slice.length}: ${e.message}`);
    }

    if (i % 1000 === 0) {
      const elapsed = Math.round((Date.now() - startTs) / 1000);
      console.log(`   ${inserted}/${toInsert.length} eklendi (${elapsed}s)`);
    }
  }

  console.log(`\n✅ ${inserted} yeni ürün Hamburg items tablosuna eklendi.`);

  const finalCount = await c.query(`SELECT COUNT(*) AS n FROM items WHERE is_active = true`);
  console.log(`   Toplam aktif ürün: ${finalCount.rows[0].n}`);

  const mainDist = await c.query(`SELECT main_category, COUNT(*) AS n FROM items WHERE is_active=true GROUP BY main_category ORDER BY n DESC LIMIT 16`);
  console.log("\n📊 Yeni ana kategori dağılımı:");
  console.table(mainDist.rows.map(x => ({ main: x.main_category, count: Number(x.n) })));

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
