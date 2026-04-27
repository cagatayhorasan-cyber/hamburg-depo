#!/usr/bin/env node
// Manuel/keysiz DE çevirisi uygulama scripti.
// JSON girdi formatı: [{"id": 123, "name_de": "...", "notes_de": "..."}]
//
// Kullanım:
//   node scripts/apply-de-translations.js /tmp/translations.json
//   node scripts/apply-de-translations.js /tmp/translations.json --force   (dolu name_de/notes_de'yi de üzerine yaz)
//
// Idempotent: --force olmadıkça sadece boş alanlara yazar.

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

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));
  const force = args.includes("--force");

  if (!filePath) {
    console.error("[hata] JSON dosyası belirtilmedi. Örn: node scripts/apply-de-translations.js /tmp/translations.json");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("[hata] DATABASE_URL bulunamadı.");
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`[hata] Dosya bulunamadı: ${filePath}`);
    process.exit(1);
  }

  const translations = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(translations)) {
    console.error("[hata] JSON bir dizi (array) olmalı.");
    process.exit(1);
  }
  console.log(`[info] Uygulanacak kayıt: ${translations.length} | force: ${force}`);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const entry of translations) {
    const id = Number(entry.id);
    const nameDe = String(entry.name_de || "").trim();
    const notesDe = String(entry.notes_de || "").trim();
    if (!id) {
      console.warn(`  [warn] id eksik: ${JSON.stringify(entry).slice(0, 80)}`);
      failCount += 1;
      continue;
    }

    const { rows } = await client.query(
      "SELECT COALESCE(name_de, '') AS name_de, COALESCE(notes_de, '') AS notes_de FROM items WHERE id = $1",
      [id]
    );
    if (!rows[0]) {
      console.warn(`  [warn] #${id}: DB'de yok`);
      failCount += 1;
      continue;
    }
    const current = rows[0];

    const setParts = [];
    const values = [];
    if (nameDe && (force || !current.name_de)) {
      setParts.push(`name_de = $${values.length + 1}`);
      values.push(nameDe);
    }
    if (notesDe && (force || !current.notes_de)) {
      setParts.push(`notes_de = $${values.length + 1}`);
      values.push(notesDe);
    }

    if (setParts.length === 0) {
      skipCount += 1;
      continue;
    }

    values.push(id);
    await client.query(
      `UPDATE items SET ${setParts.join(", ")} WHERE id = $${values.length}`,
      values
    );
    successCount += 1;
    const parts = [];
    if (setParts.find((s) => s.startsWith("name_de"))) parts.push(`name_de="${nameDe.slice(0, 50)}${nameDe.length > 50 ? "…" : ""}"`);
    if (setParts.find((s) => s.startsWith("notes_de"))) parts.push(`notes_de="${notesDe.slice(0, 50)}${notesDe.length > 50 ? "…" : ""}"`);
    console.log(`  [ok] #${id} → ${parts.join(" | ")}`);
  }

  console.log(`\n== ÖZET ==`);
  console.log(`Güncellenen: ${successCount}`);
  console.log(`Atlanan (zaten dolu): ${skipCount}`);
  console.log(`Hatalı: ${failCount}`);

  await client.end();
}

main().catch((err) => {
  console.error("[fatal]", err.message);
  process.exit(1);
});
