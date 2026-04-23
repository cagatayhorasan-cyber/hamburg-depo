#!/usr/bin/env node
// Items.name → items.name_de  +  Items.notes → items.notes_de (Almanca) toplu çeviri scripti.
//
// Kullanım:
//   OPENAI_API_KEY=sk-... node scripts/translate-notes-to-de.js
//   OPENAI_API_KEY=sk-... node scripts/translate-notes-to-de.js --only=23888,23889
//   OPENAI_API_KEY=sk-... node scripts/translate-notes-to-de.js --force   (dolu name_de/notes_de'yi de yeniden yaz)
//   node scripts/translate-notes-to-de.js --dry-run                        (sadece hangi ürünlere dokunulacak, çeviri yok)
//
// Gereksinim:
//   - DATABASE_URL (.env veya ortam)
//   - OPENAI_API_KEY (.env veya ortam)  [--dry-run ile şart değil]
//
// Script idempotent: name_de VEYA notes_de boş olan satırlara dokunur; ikisi de doluysa --force olmadan atlar.
// Boş olan alana yazar, dolu olana dokunmaz (--force ile ikisini de tekrar yazar).

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

function parseArgs(argv) {
  const args = {
    dryRun: false,
    force: false,
    only: null,
    batchSize: 3,
    model: "gpt-4o-mini",
    stockedOnly: false,
    activeOnly: false,
    minLength: 0,
    limit: 0,
  };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--force") args.force = true;
    else if (a === "--stocked-only") args.stockedOnly = true;
    else if (a === "--active-only") args.activeOnly = true;
    else if (a.startsWith("--only=")) args.only = a.slice(7).split(",").map((x) => Number(x.trim())).filter(Boolean);
    else if (a.startsWith("--batch=")) args.batchSize = Math.max(1, Number(a.slice(8)) || 3);
    else if (a.startsWith("--model=")) args.model = a.slice(8);
    else if (a.startsWith("--min-length=")) args.minLength = Math.max(0, Number(a.slice(13)) || 0);
    else if (a.startsWith("--limit=")) args.limit = Math.max(0, Number(a.slice(8)) || 0);
  }
  return args;
}

const SYSTEM_PROMPT = `Sen bir endüstriyel soğutma (Kältetechnik) uzmanı çevirmensin.
Türkçe ürün adlarını ve teknik notlarını sade, hatasız, profesyonel B2B Almancası'na çevirirsin.

Kurallar (hem ad hem nota uygulanır):
- Cümle/madde sayısını koru. "|" ayırıcıları aynen tut.
- Teknik terimleri Almanca literatürde kabul gören şekilde bırak: Scroll (Hermetik), Hermetik, POE, MBP, LBP, CO₂, R404A, R134a, R290, Heat Pump, VRF, Chiller, Evaporator, Kondensator.
- Birimleri değiştirme (kW, BTU/h, V, Hz, m³/h, mm, bar, kg, HP, inç/inc). Ondalık virgülü Alman tarzı (.→,) yap ama model kodlarında dokunma.
- Model isim/kodlarını (ZH30K4E-TFD-524, NEU6220GK, SYSVRF3 VOL 28Q, vb.) olduğu gibi bırak.
- Çeviri örnekleri:
  "Soğuk oda" → "Kuehlraum", "Donuk Depo" → "Tiefkuehl", "Kompresör" → "Verdichter",
  "Kondenser" → "Verfluessiger", "Evaporatör" → "Verdampfer", "Yağ" → "Oel", "Fan" → "Luefter",
  "Bakır Boru" → "Kupferrohr", "Servis Valfi" → "Service-Ventil", "Likit Filtre Dryer" → "Filtertrockner",
  "İzolasyon" → "Isolierung", "Boru" → "Rohr", "Köpük" → "Schaum", "Tabancalı" → "Pistolenschaum",
  "Kontrol Ünitesi" → "Steuereinheit", "Microchannel" → "Microchannel", "U Profili" → "U-Profil".
- "Uyarı:" → "Warnung:", "Kullanım:" → "Anwendung:", "Tip:" → "Typ:" (soğutma bağlamında).
- Umlaut YOK — sistem ASCII bekliyor: ä→ae, ö→oe, ü→ue, ß→ss. Örnek: "Kühlraum" → "Kuehlraum".
- Çevirirken açıklama ekleme. Sadece çeviriyi ver.

Girdi formatı: her ürün \`ID:...\`, \`NAME:...\`, \`NOTES:...\`, \`---\` ile ayrılır.
Çıktı formatı: JSON object with "translations" key.
Her eleman: \`{"id": <int>, "name_de": "<Almanca ad>", "notes_de": "<Almanca not>"}\`.
NOTES boşsa notes_de'yi boş string döndür. NAME boş olmaz.
Order-preserving: giriş sırasıyla aynı sırada dön. Başka hiçbir şey yazma.`;

function buildUserMessage(items) {
  return items
    .map((it) => `ID:${it.id}\nNAME:${it.name}\nNOTES:\n${it.notes}\n---`)
    .join("\n");
}

async function callOpenAI({ apiKey, model, items }) {
  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(items) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  // response_format: json_object → tek bir object. "translations" key arayacağız; yoksa direkt array da kabul.
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`OpenAI JSON parse hatası: ${e.message}\nContent: ${content.slice(0, 300)}`);
  }
  const arr = Array.isArray(parsed) ? parsed : (parsed.translations || parsed.items || parsed.results || []);
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error(`OpenAI response beklenen formatta değil: ${content.slice(0, 300)}`);
  }
  return arr;
}

async function run() {
  loadEnv();
  const args = parseArgs(process.argv);

  if (!process.env.DATABASE_URL) {
    console.error("[hata] DATABASE_URL bulunamadı (.env veya ortamda).");
    process.exit(1);
  }
  if (!args.dryRun && !process.env.OPENAI_API_KEY) {
    console.error("[hata] OPENAI_API_KEY bulunamadı. --dry-run ile çalıştır ya da key ekle.");
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let queryText = `
    SELECT id,
           name,
           COALESCE(name_de, '') AS name_de,
           COALESCE(brand, '') AS brand,
           category,
           COALESCE(notes, '') AS notes,
           COALESCE(notes_de, '') AS notes_de
    FROM items
    WHERE COALESCE(name, '') <> ''
  `;
  const params = [];
  const addParam = (val) => {
    params.push(val);
    return `$${params.length}`;
  };
  if (!args.force) {
    // name_de VEYA notes_de eksik olanları getir (en az biri çevrilmemiş)
    queryText += ` AND (COALESCE(name_de, '') = '' OR (COALESCE(notes, '') <> '' AND COALESCE(notes_de, '') = ''))`;
  }
  if (args.activeOnly) {
    queryText += ` AND COALESCE(is_active, TRUE) = TRUE`;
  }
  if (args.stockedOnly) {
    queryText += ` AND id IN (
      SELECT item_id FROM movements
      GROUP BY item_id
      HAVING COALESCE(SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END), 0) > 0
    )`;
  }
  if (args.minLength > 0) {
    queryText += ` AND LENGTH(COALESCE(notes, '')) >= ${addParam(args.minLength)}`;
  }
  if (args.only && args.only.length) {
    queryText += ` AND id = ANY(${addParam(args.only)}::bigint[])`;
  }
  queryText += ` ORDER BY id`;
  if (args.limit > 0) {
    queryText += ` LIMIT ${addParam(args.limit)}`;
  }

  const activeFilters = [];
  if (args.activeOnly) activeFilters.push("active-only");
  if (args.stockedOnly) activeFilters.push("stocked-only");
  if (args.minLength > 0) activeFilters.push(`min-length=${args.minLength}`);
  if (args.only && args.only.length) activeFilters.push(`only=${args.only.length} id`);
  if (args.limit > 0) activeFilters.push(`limit=${args.limit}`);
  if (args.force) activeFilters.push("force");
  if (activeFilters.length) {
    console.log(`[info] Filtreler: ${activeFilters.join(", ")}`);
  }

  const { rows } = await client.query(queryText, params);
  console.log(`[info] Çevrilecek ürün sayısı: ${rows.length}`);
  if (rows.length === 0) {
    await client.end();
    return;
  }

  if (args.dryRun) {
    console.log("[dry-run] Aşağıdaki ürünler çevrilecek (API çağrısı yapılmadı):");
    for (const r of rows) {
      const preview = r.notes.replace(/\s+/g, " ").slice(0, 70);
      const tagName = r.name_de ? "" : " [name_de boş]";
      const tagNote = r.notes && !r.notes_de ? " [notes_de boş]" : "";
      console.log(`  #${r.id} ${r.name}${tagName}${tagNote} → "${preview}${r.notes.length > 70 ? "…" : ""}"`);
    }
    await client.end();
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = args.model;
  console.log(`[info] Model: ${model} | Batch: ${args.batchSize}`);

  let successCount = 0;
  let failCount = 0;
  const failures = [];

  for (let i = 0; i < rows.length; i += args.batchSize) {
    const batch = rows.slice(i, i + args.batchSize);
    const batchNums = `${i + 1}-${Math.min(i + args.batchSize, rows.length)}/${rows.length}`;
    console.log(`[batch ${batchNums}] ${batch.map((b) => `#${b.id}`).join(", ")}`);
    try {
      const translations = await callOpenAI({ apiKey, model, items: batch });
      for (const t of translations) {
        const id = Number(t.id);
        const nameDe = String(t.name_de || "").trim();
        const notesDe = String(t.notes_de || "").trim();
        if (!id || (!nameDe && !notesDe)) {
          console.warn(`  [warn] #${id}: boş çeviri, atlandı`);
          failCount += 1;
          failures.push({ id, reason: "empty_translation" });
          continue;
        }
        // Mevcut DB row'unu al, boş olan alanlara yaz; --force ise ikisine de yaz
        const row = batch.find((b) => Number(b.id) === id) || {};
        const existingNameDe = String(row.name_de || "").trim();
        const existingNotesDe = String(row.notes_de || "").trim();
        const setParts = [];
        const values = [];
        if (nameDe && (args.force || !existingNameDe)) {
          setParts.push(`name_de = $${values.length + 1}`);
          values.push(nameDe);
        }
        if (notesDe && (args.force || !existingNotesDe)) {
          setParts.push(`notes_de = $${values.length + 1}`);
          values.push(notesDe);
        }
        if (setParts.length === 0) {
          console.log(`  [skip] #${id}: her iki alan zaten dolu`);
          continue;
        }
        values.push(id);
        await client.query(`UPDATE items SET ${setParts.join(", ")} WHERE id = $${values.length}`, values);
        successCount += 1;
        const summary = [
          nameDe ? `name="${nameDe.slice(0, 40)}${nameDe.length > 40 ? "…" : ""}"` : "",
          notesDe ? `notes="${notesDe.slice(0, 40)}${notesDe.length > 40 ? "…" : ""}"` : "",
        ].filter(Boolean).join(" | ");
        console.log(`  [ok] #${id} → ${summary}`);
      }
    } catch (err) {
      console.error(`  [err] batch ${batchNums}: ${err.message}`);
      failCount += batch.length;
      for (const b of batch) failures.push({ id: b.id, reason: err.message.slice(0, 80) });
    }
  }

  console.log(`\n== ÖZET ==`);
  console.log(`Başarılı: ${successCount}`);
  console.log(`Başarısız: ${failCount}`);
  if (failures.length) {
    console.log(`Başarısız ID'ler: ${failures.map((f) => `#${f.id}`).join(", ")}`);
    console.log(`  → Yeniden çalıştır: node scripts/translate-notes-to-de.js --only=${failures.map((f) => f.id).join(",")}`);
  }

  await client.end();
}

run().catch((err) => {
  console.error("[fatal]", err.message);
  process.exit(1);
});
