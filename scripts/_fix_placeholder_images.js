"use strict";
/**
 * 36 kategorideki ~9300 placeholder gorseli kategori-bazli
 * temsil eden gerçek bir urun fotografi ile degistir.
 *
 * Her kategori icin DuckDuckGo'dan tip-bazli arama, urlOk dogrulama,
 * sadece is_active=true ve image_url placeholder/null olan urunler
 * guncellenir. Manuel atanmis (gercek URL) gorseller dokunulmaz.
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

const QUERIES = {
  "Kompresörler": "soğutma kompresörü hermetik",
  "Fan Motorları": "soğuk oda fan motoru aksiyel",
  "Genleşme Vanaları": "TXV expansion valve genleşme vanası",
  "Bakır Borular": "soğutma bakır boru bobini",
  "Servis Ekipmanları ve El Aletleri": "manifold gauge soğutma servis ekipmanı",
  "Vanalar ve Regülatörler": "soğutma vana regülatör küresel",
  "Filtreler & Kurutucular": "filter dryer kurutucu soğutma sistemi",
  "Solenoid Vanaları": "solenoid valve soğutma sistemi",
  "Basınç Kontrol ( Presostatlar )": "presostat soğutma basınç şalteri",
  "Termostat ve Termometreler": "soğutma termostat dijital",
  "Kondenser Üniteleri": "kondenser ünitesi soğutma dış ünite",
  "Elektrik Malzemeleri": "kontaktör röle elektrik malzemesi pano",
  "Transmitter": "basınç transmitter soğutma 4-20ma",
  "Isıtma Malzemeleri": "soğutma rezistansı defrost ısıtma",
  "Endüstriyel Split Dış Ünite": "VRF dış ünite endüstriyel split",
  "Hava Perdeleri": "hava perdesi mağaza endüstriyel",
  "Klima Yedek Parçaları": "klima yedek parça kart sensör",
  "Elektronik Kontrolörler": "soğuk oda elektronik kontrol cihazı dixell",
  "Hat Aksesuarları": "soğutma titreşim alıcı hat aksesuarı",
  "Soğuk Oda Aksesuarları": "soğuk oda köşe profili PVC aksesuar",
  "İzolasyonlar ve Bantlar": "kauçuk izolasyon hortumu boru armaflex",
  "Likit Tanklar": "likit tank soğutma receiver dikey",
  "İzolasyonlu Borular": "izolasyonlu bakır boru klima",
  "Soğutma Grupları": "soğutma grubu komple ünite",
  "Soğutma Malzemeleri": "soğutma sistemi malzeme",
  "Soğutucu Akışkanlar": "refrigerant gas R404A tüp",
  "Soğutma Yağları": "POE kompresör yağı 5L teneke",
  "Kaynak Telleri": "kaynak teli silver brazing soğutma",
  "Yağ Ayırıcılar": "oil separator yağ ayırıcı soğutma",
  "Kapiler Hortumlar ve Rakorlar": "kapiler boru rakor",
  "Eşanjörler": "plate heat exchanger eşanjör soğutma",
  "Endüstriyel Split İç Ünite": "kaset tip iç ünite split",
  "Buzdolapları ve Vitrinler": "ticari soğutmalı vitrin reyon",
  "Panel": "soğuk oda sandviç panel poliüretan",
  "Pompa ve Drenaj": "klima drenaj pompası kondens",
  "Soğuk Oda Kapıları": "soğuk oda menteşeli kapı endüstriyel",
  "Klima Sistemleri": "endüstriyel klima sistem multi",
};

async function ddgOnce(q) {
  const r1 = await fetch("https://duckduckgo.com/?q=" + encodeURIComponent(q), { headers: { "User-Agent": UA } });
  const html = await r1.text();
  const m = html.match(/vqd=['"]([\d-]+)['"]|vqd=([\d-]+)/);
  const vqd = m?.[1] || m?.[2];
  if (!vqd) return [];
  await sleep(200);
  const r2 = await fetch(
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&p=1`,
    { headers: { "User-Agent": UA, "Referer": "https://duckduckgo.com/", "X-Requested-With": "XMLHttpRequest" } }
  );
  if (!r2.ok) return [];
  const data = await r2.json();
  return Array.isArray(data?.results) ? data.results : [];
}
async function ddg(q) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await ddgOnce(q); }
    catch (e) {
      console.log(`  [retry ${attempt}/3] ${e.code || e.message}`);
      if (attempt === 3) return [];
      await sleep(4000 * attempt);
    }
  }
  return [];
}
async function urlOk(u) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(u, { method: "HEAD", headers: { "User-Agent": UA, "Referer": "https://duckduckgo.com/" } });
      return r.ok && (r.headers.get("content-type") || "").startsWith("image/");
    } catch (_) {
      if (attempt === 2) return false;
      await sleep(1000);
    }
  }
  return false;
}
function pick(results) {
  const blacklist = ["pinterest.", "facebook.", "instagram.", "twitter.", "x.com", "tiktok.", "youtube.", "imgur.", "alibaba.", "aliexpress."];
  return results.filter((r) =>
    r.image && r.image.startsWith("http")
    && r.width >= 250 && r.height >= 250
    && !blacklist.some(b => (r.source || "").toLowerCase().includes(b) || r.image.toLowerCase().includes(b))
  );
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const map = {};
  let totalUpdated = 0;
  const cats = Object.keys(QUERIES);

  for (let i = 0; i < cats.length; i++) {
    const cat = cats[i];
    const q = QUERIES[cat];
    console.log(`\n[${i+1}/${cats.length}] ${cat} -> "${q}"`);
    const results = await ddg(q);
    const filtered = pick(results);
    let chosen = null;
    for (const r of filtered.slice(0, 5)) {
      if (await urlOk(r.image)) { chosen = r.image; break; }
      await sleep(200);
    }
    if (!chosen) { console.log(`  [SKIP] uygun gorsel yok`); await sleep(1500); continue; }
    console.log(`  -> ${chosen.slice(0, 95)}`);
    map[cat] = chosen;
    const upd = await c.query(
      `UPDATE items SET image_url = $1
        WHERE is_active = true
          AND category = $2
          AND (image_url IS NULL OR image_url = '' OR image_url LIKE '/assets/%')`,
      [chosen, cat]
    );
    console.log(`  ${upd.rowCount} kayit guncellendi`);
    totalUpdated += upd.rowCount;
    await sleep(1800);
  }

  fs.writeFileSync(path.join(__dirname, "_category_image_map.json"), JSON.stringify(map, null, 2));
  console.log(`\n[DONE] ${totalUpdated} placeholder -> gercek gorsel`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
