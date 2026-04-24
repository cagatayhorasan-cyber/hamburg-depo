#!/usr/bin/env node
/*
 * Embraco ürün açıklama zenginleştirme scripti.
 *
 * Amaç: items tablosunda brand='Embraco' olan kayıtların notes alanındaki
 * Model / HP / Gaz / Besleme / Kapasite / Rejim / Üretim Yeri verilerini
 * parse edip, notes (TR) ve notes_de (DE) alanlarının başına "Detay:" ile
 * başlayan tek satır, okunabilir bir ürün özeti ekler.
 *
 * cleanPublicDetailPart ("Detay:" prefix'ini soyar) ve getPublicItemDetail
 * boru-ayrılmış parçaların ilkini öne çıkardığı için, kullanıcı ürün
 * detayını açtığında bu özet en üstte görünür.
 *
 * Çalışma:
 *   DATABASE_URL="postgres://..." node scripts/enrich-embraco-descriptions.js
 *   (DATABASE_URL yoksa sqlite data/hamburg-depo.sqlite'ı kullanır — dry-run)
 *
 * Parametreler:
 *   --dry-run      (sadece ne yapacağını yaz, DB'ye dokunma)
 *   --force        (mevcut "Detay:" önekine rağmen üstüne yaz)
 *   --limit=N      (ilk N kaydı işle; test için)
 */

"use strict";

const path = require("path");
const fs = require("fs");

const cwd = path.resolve(__dirname, "..");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const limitArg = [...args].find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) || 0 : 0;

// --- helpers ---

function pickField(notes, labelRegex) {
  const parts = String(notes || "").split("|");
  for (const part of parts) {
    const m = part.match(labelRegex);
    if (m) {
      return m[1].trim();
    }
  }
  return "";
}

function parseEmbracoNotes(notes) {
  return {
    model: pickField(notes, /\bModel\s*:\s*([^|]+)/i),
    hp: pickField(notes, /\bHP\s*:\s*([^|]+)/i)
        || pickField(notes, /Kompres[öo]r G[üu]c[üu].*?:\s*([^|]+)/i),
    gaz: pickField(notes, /\bGaz\s*:\s*([^|]+)/i),
    besleme: pickField(notes, /\bBesleme\s*:\s*([^|]+)/i),
    kapasite: pickField(notes, /\bKapasite\s*:\s*([^|]+)/i),
    rejim: pickField(notes, /[ÇC]al[ıi][şs]ma Rejimi\s*:\s*([^|]+)/i),
    uretim: pickField(notes, /[ÜU]retim Yeri\s*:\s*([^|]+)/i),
    tip: pickField(notes, /Kompres[öo]r Tipi\s*:\s*([^|]+)/i) || "Hermetik Pistonlu",
    frekans: pickField(notes, /Frekans.*?:\s*([^|]+)/i),
  };
}

function buildDetailTR(itemName, fields) {
  const parts = [];
  const head = `${itemName} ${fields.tip.toLowerCase()} kompresör`;
  parts.push(head.trim());

  const specs = [];
  if (fields.kapasite) specs.push(`${fields.kapasite} kapasite`);
  if (fields.hp) specs.push(`${fields.hp} HP`);
  if (fields.gaz) specs.push(`${fields.gaz} gazı`);
  if (fields.besleme) specs.push(fields.besleme);
  if (fields.frekans) specs.push(`${fields.frekans} Hz`);

  let sentence = parts[0];
  if (specs.length) sentence += "; " + specs.join(", ");
  sentence += ".";

  if (fields.rejim) {
    // Rejim hali "LBP (-23,3°C / +54,4°C)" gibi geliyor; kısalt
    const short = fields.rejim.match(/^(LBP|MBP|HBP)/i)?.[1] || fields.rejim.split("(")[0].trim();
    if (short) sentence += ` Çalışma rejimi ${short}.`;
  }
  if (fields.uretim) {
    sentence += ` Üretim: ${fields.uretim}.`;
  }
  return sentence;
}

function buildDetailDE(itemName, fields) {
  // Türkçe tip → DE
  const typeTr = (fields.tip || "").toLowerCase();
  const type = typeTr.includes("hermetik") ? "Hermetik-Kolbenverdichter"
             : typeTr.includes("pistonlu") ? "Kolbenverdichter"
             : "Verdichter";

  const parts = [];
  parts.push(`${itemName} ${type}`);

  const specs = [];
  if (fields.kapasite) specs.push(`Leistung ${fields.kapasite}`);
  if (fields.hp) specs.push(`${fields.hp} PS`);
  if (fields.gaz) specs.push(`Kältemittel ${fields.gaz}`);
  if (fields.besleme) specs.push(`Versorgung ${fields.besleme}`);
  if (fields.frekans) specs.push(`${fields.frekans} Hz`);

  let sentence = parts[0];
  if (specs.length) sentence += "; " + specs.join(", ");
  sentence += ".";

  if (fields.rejim) {
    const short = fields.rejim.match(/^(LBP|MBP|HBP)/i)?.[1] || fields.rejim.split("(")[0].trim();
    const mapping = { LBP: "Tiefkühlbereich (LBP)", MBP: "Normalkühlbereich (MBP)", HBP: "Klima-/Hochdruckbereich (HBP)" };
    const rejimDe = mapping[short?.toUpperCase?.()] || short;
    if (rejimDe) sentence += ` Einsatzbereich: ${rejimDe}.`;
  }
  if (fields.uretim) {
    const map = { "Brezilya": "Brasilien", "Slovakya": "Slowakei", "Çin": "China", "Türkiye": "Türkei" };
    sentence += ` Herstellung: ${map[fields.uretim] || fields.uretim}.`;
  }
  return sentence;
}

function upsertDetailPrefix(existing, newDetail) {
  const text = String(existing || "");
  const prefix = `Detay: ${newDetail}`;
  if (!text) return prefix;
  // Mevcut "Detay: ..." parçasını çıkar, yenisini başa koy
  const parts = text.split("|").map((p) => p.trim()).filter(Boolean);
  const cleaned = parts.filter((p) => !/^Detay\s*:/i.test(p) && !/^Detail\s*:/i.test(p));
  return [prefix, ...cleaned].join(" | ");
}

function upsertDetailPrefixDE(existing, newDetail) {
  const text = String(existing || "");
  const prefix = `Detail: ${newDetail}`;
  if (!text) return prefix;
  const parts = text.split("|").map((p) => p.trim()).filter(Boolean);
  const cleaned = parts.filter((p) => !/^Detay\s*:/i.test(p) && !/^Detail\s*:/i.test(p));
  return [prefix, ...cleaned].join(" | ");
}

// --- main ---

async function main() {
  const isPostgres = Boolean(process.env.DATABASE_URL);
  console.log(`[enrich-embraco] mode=${isPostgres ? "postgres" : "sqlite"} dry=${dryRun} force=${force} limit=${limit || "all"}`);

  let rows;
  let pg = null;
  let sqlite = null;

  if (isPostgres) {
    const { Pool } = require("pg");
    pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const sql = `
      SELECT id, name, name_de, notes, notes_de
      FROM items
      WHERE brand = 'Embraco'
      ORDER BY id
      ${limit ? `LIMIT ${limit}` : ""}
    `;
    const res = await pg.query(sql);
    rows = res.rows.map((r) => ({
      id: r.id, name: r.name, nameDe: r.name_de, notes: r.notes, notesDe: r.notes_de,
    }));
  } else {
    // Fallback: sqlite3 CLI ile JSON'a çevir (lokal dry-run için)
    const { execSync } = require("child_process");
    const dbPath = path.join(cwd, "data", "hamburg-depo.live-postgres.sqlite");
    if (!fs.existsSync(dbPath)) throw new Error(`SQLite DB yok: ${dbPath}`);
    // Önce kolon adlarını oku - _de kolonları olmayabilir
    const cols = execSync(`sqlite3 "${dbPath}" "PRAGMA table_info(items)" | awk -F'|' '{print $2}'`).toString().split("\n");
    const hasNameDe = cols.includes("name_de");
    const hasNotesDe = cols.includes("notes_de");
    const sql = `
      SELECT json_object(
        'id', id,
        'name', name,
        'nameDe', ${hasNameDe ? "COALESCE(name_de, '')" : "''"},
        'notes', COALESCE(notes, ''),
        'notesDe', ${hasNotesDe ? "COALESCE(notes_de, '')" : "''"}
      )
      FROM items
      WHERE brand = 'Embraco'
      ORDER BY id
      ${limit ? `LIMIT ${limit}` : ""};
    `;
    const out = execSync(`sqlite3 "${dbPath}" "${sql.replace(/"/g, '\\"').replace(/\n/g, " ")}"`).toString();
    rows = out.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    if (!dryRun) {
      console.error("[enrich-embraco] SQLite write mode kapali (yalniz Postgres). DATABASE_URL'siz sadece --dry-run yapabilirsin.");
      process.exit(2);
    }
  }

  console.log(`[enrich-embraco] ${rows.length} Embraco kaydı bulundu`);

  let updated = 0;
  let skipped = 0;
  let emptyFields = 0;

  const pgUpdates = [];

  for (const row of rows) {
    const fields = parseEmbracoNotes(row.notes);
    if (!fields.model && !fields.hp && !fields.gaz && !fields.kapasite) {
      emptyFields++;
      if (!force) {
        skipped++;
        continue;
      }
    }

    const detailTR = buildDetailTR(row.name, fields);
    const detailDE = buildDetailDE(row.nameDe || row.name, fields);

    const alreadyHasTR = /^Detay\s*:/i.test(String(row.notes || "").trim());
    const alreadyHasDE = /^Detail\s*:/i.test(String(row.notesDe || "").trim());

    if (alreadyHasTR && alreadyHasDE && !force) {
      skipped++;
      continue;
    }

    const newNotes = upsertDetailPrefix(row.notes, detailTR);
    const newNotesDe = upsertDetailPrefixDE(row.notesDe, detailDE);

    if (dryRun) {
      if (updated < 5) {
        console.log(`[dry] id=${row.id} ${row.name}`);
        console.log(`        TR: ${detailTR}`);
        console.log(`        DE: ${detailDE}`);
      }
      updated++;
      continue;
    }

    if (isPostgres) {
      pgUpdates.push({ id: row.id, notes: newNotes, notesDe: newNotesDe });
    } else {
      sqlite.prepare(`UPDATE items SET notes=?, notes_de=? WHERE id=?`).run(newNotes, newNotesDe, row.id);
    }
    updated++;
  }

  if (isPostgres && !dryRun && pgUpdates.length) {
    console.log(`[enrich-embraco] ${pgUpdates.length} kayıt postgres'e yazılıyor...`);
    // Batch update with a single transaction
    const client = await pg.connect();
    try {
      await client.query("BEGIN");
      for (const u of pgUpdates) {
        await client.query("UPDATE items SET notes=$1, notes_de=$2 WHERE id=$3", [u.notes, u.notesDe, u.id]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`[enrich-embraco] DONE updated=${updated} skipped=${skipped} empty_fields=${emptyFields}`);

  if (pg) await pg.end();
  if (sqlite) sqlite.close();
}

main().catch((err) => {
  console.error("[enrich-embraco] HATA:", err);
  process.exit(1);
});
