"use strict";
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
async function urlOk(u) {
  try {
    const r = await fetch(u, { method: "HEAD", headers: { "User-Agent": UA, "Referer": "https://duckduckgo.com/" } });
    return r.ok && (r.headers.get("content-type") || "").startsWith("image/");
  } catch (_) { return false; }
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // Gercek fotograf icin: render/cizim'i atla, gercek vitrin fotosu ara
  // Kara liste: seckinsogutma (cizim/render kullanir)
  const queries = [
    "Frigocraft Daisy VG vitrin gerçek fotoğraf",
    "dik camlı şarküteri reyon vitrin mağaza",
    "vertical glass deli display refrigerator",
    "dik camlı vitrin et şarküteri reyonu",
  ];
  const blacklist = ["seckinsogutma", "pinterest", "facebook", "instagram", "amazon", "alibaba", "aliexpress"];
  let chosen = null;
  for (const q of queries) {
    console.log(`\nsearch: "${q}"`);
    const results = await ddgImageSearch(q);
    const filtered = results.filter(r =>
      r.image && r.image.startsWith("http")
      && r.width >= 400 && r.height >= 300
      && !blacklist.some(b => (r.source||"").toLowerCase().includes(b) || r.image.toLowerCase().includes(b))
    );
    for (let i = 0; i < Math.min(8, filtered.length); i++) {
      const r = filtered[i];
      console.log(`  ${i+1}. ${r.image.slice(0, 90)} (${r.width}x${r.height}, ${(r.source||"").slice(0,35)})`);
    }
    for (const r of filtered.slice(0, 5)) {
      if (await urlOk(r.image)) { chosen = r.image; break; }
      await sleep(200);
    }
    if (chosen) break;
    await sleep(1500);
  }
  console.log(`\n-> ${chosen}`);

  if (chosen) {
    const daisyIds = [56, 57, 58, 23585, 23586, 23587, 23901, 23902];
    await c.query("UPDATE items SET image_url = $1 WHERE id = ANY($2::int[])", [chosen, daisyIds]);
    console.log(`${daisyIds.length} DAISY VG karti guncellendi`);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
