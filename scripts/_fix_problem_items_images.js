"use strict";
/**
 * Kullanicinin "resim yanlis / yok" dedigi 10 problem urun icin
 * isme gore DuckDuckGo'dan dogru gorsel bul, items.image_url'a yaz.
 */
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) { const v = m[2].replace(/^["']|["']$/g, ""); if (!process.env[m[1]]) process.env[m[1]] = v; }
}
const { Client } = require("pg");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGETS = [
  // [item_id(s), search_query, label]
  { ids: [37], query: "2x0,75 sinyal kablosu", label: "Sinyal Kablosu" },
  { ids: [23899], query: "TTR kablo 3x1.5 elektrik kablosu", label: "TTR 3x1.5 Kontak" },
  { ids: [23898, 23807], query: "TTR kablo 5x1.5 elektrik kablosu", label: "TTR 5x1.5 Kontak / Genel" },
  { ids: [42], query: "Tecumseh komple soğutma grubu kondenser ünitesi", label: "8HP Tecumseh" },
  { ids: [324], query: "Embraco scroll kompresör soğutma", label: "Embraco Scroll" },
  { ids: [23780, 23781], query: "GVN GMH likit filtre dryer kurutucu soğutma", label: "GVN GMH Dryer" },
  { ids: [22492], query: "Refnoks RFD-052S filtre dryer kurutucu", label: "Refnoks Dryer" },
  { ids: [10809, 23776], query: "Sanhua SYJ06 gözetleme camı sight glass", label: "Sanhua Sight Glass" },
  { ids: [22496], query: "Selsil multi purpose silikon yapıştırıcı tüp", label: "Selsil Silikon" },
];

async function ddgImageSearch(query) {
  const r1 = await fetch("https://duckduckgo.com/?q=" + encodeURIComponent(query), { headers: { "User-Agent": UA } });
  const html = await r1.text();
  const m = html.match(/vqd=['"]([\d-]+)['"]|vqd=([\d-]+)/);
  const vqd = m?.[1] || m?.[2];
  if (!vqd) return [];
  await sleep(120);
  const r2 = await fetch(
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&p=1`,
    { headers: { "User-Agent": UA, "Referer": "https://duckduckgo.com/", "X-Requested-With": "XMLHttpRequest" } }
  );
  if (!r2.ok) return [];
  const data = await r2.json();
  return Array.isArray(data?.results) ? data.results : [];
}

function pickBest(results) {
  const blacklist = ["pinterest.", "facebook.", "instagram.", "twitter.", "x.com", "tiktok.", "youtube.", "imgur.", "amazon.", "alibaba."];
  const filtered = results.filter((r) => {
    if (!r.image || !r.image.startsWith("http")) return false;
    if (blacklist.some((b) => (r.source || "").toLowerCase().includes(b) || r.image.toLowerCase().includes(b))) return false;
    if (r.width && r.height && (r.width < 200 || r.height < 200)) return false;
    return true;
  });
  return filtered[0]?.image || null;
}

async function urlOk(u) {
  try {
    const r = await fetch(u, { method: "HEAD", headers: { "User-Agent": UA, "Referer": "https://duckduckgo.com/" } });
    return r.ok && (r.headers.get("content-type") || "").startsWith("image/");
  } catch (_) { return false; }
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  for (const t of TARGETS) {
    console.log(`\n[${t.label}] -> "${t.query}"`);
    const results = await ddgImageSearch(t.query);
    console.log(`  ${results.length} sonuc`);
    const candidates = results.slice(0, 5);
    for (let i = 0; i < candidates.length; i++) {
      const r = candidates[i];
      console.log(`  ${i+1}. ${(r.image || "").slice(0, 90)} (${r.width}x${r.height}, ${(r.source || "").slice(0, 30)})`);
    }
    let chosen = null;
    for (const r of candidates) {
      if (!r.image) continue;
      if (await urlOk(r.image)) { chosen = r.image; break; }
      await sleep(200);
    }
    if (!chosen) {
      console.log(`  [SKIP] uygun URL bulunamadi`);
      await sleep(1500);
      continue;
    }
    console.log(`  -> ${chosen}`);
    for (const id of t.ids) {
      await c.query("UPDATE items SET image_url = $1 WHERE id = $2", [chosen, id]);
      console.log(`     #${id} guncellendi`);
    }
    await sleep(1800);
  }

  await c.end();
  console.log("\n[DONE]");
})().catch(e => { console.error(e); process.exit(1); });
