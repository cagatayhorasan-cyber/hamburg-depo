"use strict";
/**
 * DRC MAN — 20.000 soruluk SOĞUK ODA canlı soru-cevap havuzu.
 * ColdRoomPro tool'undaki gerçek opsiyonları (PRODUCT_TYPES, panel kalınlığı,
 * gas seçenekleri) temel alır. Sadece soğuk oda hesabı + ekipman seçimi
 * + teklif yönlendirmesi — başka kategori (kablo, pompa, vb.) yok.
 *
 * Çıktı:
 *   scripts/drc_man_coldroom_qa_20k_faq.json   — bilgi havuzu
 *   scripts/drc_man_coldroom_offers_20.json    — 20 örnek teklif
 */

const fs = require("fs");
const path = require("path");

const FAQ_OUT = path.join(__dirname, "drc_man_coldroom_qa_20k_faq.json");
const OFFERS_OUT = path.join(__dirname, "drc_man_coldroom_offers_20.json");

// ColdRoomPro PRODUCT_TYPES'tan birebir alındı
const PRODUCT_TYPES = [
  { id: "obst_gemuse", tr: "Sebze & Meyve", de: "Obst & Gemüse", temp: 2, rh: 90 },
  { id: "fleisch_frisch", tr: "Et (taze)", de: "Fleisch (frisch)", temp: 0, rh: 85 },
  { id: "tk_fleisch", tr: "Donmuş Et", de: "Tiefkühl Fleisch", temp: -18, rh: 90 },
  { id: "tk_fisch", tr: "Donmuş Balık", de: "Tiefkühl Fisch", temp: -20, rh: 90 },
  { id: "milch", tr: "Süt Ürünleri", de: "Milchprodukte", temp: 4, rh: 80 },
  { id: "tk_kost", tr: "Donmuş Gıda", de: "Tiefkühlkost", temp: -22, rh: 85 },
  { id: "blumen", tr: "Çiçek", de: "Blumen", temp: 5, rh: 90 },
  { id: "getranke", tr: "Bira / İçecek", de: "Bier / Getränke", temp: 4, rh: 65 },
  { id: "eis", tr: "Dondurma", de: "Eis", temp: -25, rh: 90 },
  { id: "custom", tr: "Özel Uygulama", de: "Benutzerdefiniert", temp: 0, rh: 85 },
];

// Panel kalınlıkları (INSULATION_K'dan)
const PANELS = [
  { mm: 60, k: 0.38, app: "küçük büfe / kısa süreli" },
  { mm: 80, k: 0.29, app: "standart artı oda (chiller)" },
  { mm: 100, k: 0.23, app: "donmuş gıda + standart" },
  { mm: 120, k: 0.19, app: "düşük sıcaklık + verim" },
  { mm: 150, k: 0.15, app: "şok dondurucu + ultra" },
  { mm: 200, k: 0.12, app: "blast / ultra-düşük lab" },
];

// Tipik boyut presetleri
const SIZES = [
  { w: 2, l: 2, h: 2, m3: 8, label_tr: "mini büfe", label_de: "Mini-Bistro" },
  { w: 3, l: 3, h: 2.5, m3: 22.5, label_tr: "küçük market", label_de: "kleiner Markt" },
  { w: 3, l: 4, h: 3, m3: 36, label_tr: "kafe", label_de: "Café" },
  { w: 4, l: 4, h: 3, m3: 48, label_tr: "restoran", label_de: "Restaurant" },
  { w: 5, l: 4, h: 3, m3: 60, label_tr: "depo orta", label_de: "mittleres Lager" },
  { w: 6, l: 5, h: 3, m3: 90, label_tr: "toptancı", label_de: "Großhändler" },
  { w: 8, l: 6, h: 4, m3: 192, label_tr: "endüstriyel", label_de: "industriell" },
  { w: 10, l: 8, h: 5, m3: 400, label_tr: "soğuk depo (büyük)", label_de: "Großkaltlager" },
];

// Gaz seçenekleri (uygulama bazlı)
const GASES = [
  { id: "r290", tr: "R290 (propan, doğal)", de: "R290 (Propan, natürlich)", gwp: 3, app: "kompakt artı oda" },
  { id: "r449a", tr: "R449A (R404A retrofit)", de: "R449A (R404A-Retrofit)", gwp: 1397, app: "geçiş + yeni proje" },
  { id: "r134a", tr: "R134a", de: "R134a", gwp: 1430, app: "yüksek pozitif chiller" },
  { id: "r448a", tr: "R448A", de: "R448A", gwp: 1387, app: "negatif düşük GWP" },
];

// Soru template'leri (TR — 11 farklı kalıp)
const TR_TEMPLATES = [
  (sz, pt, pn, gz) => `${sz.w}x${sz.l}x${sz.h} m ${pt.tr} odası için kapasite ne olmalı?`,
  (sz, pt, pn, gz) => `${pt.tr} için ${sz.w}x${sz.l}x${sz.h} m oda hangi panel kalınlığı uygundur?`,
  (sz, pt, pn, gz) => `${sz.label_tr} ölçüsünde ${pt.tr} odası için tahmini fiyat nedir?`,
  (sz, pt, pn, gz) => `${pt.tr} muhafazası için ${gz.tr} uygun mu?`,
  (sz, pt, pn, gz) => `${sz.w}x${sz.l}x${sz.h} m ${pt.tr} ${pn.mm}mm panel ile ne kadar enerji harcar?`,
  (sz, pt, pn, gz) => `${pt.tr} odasında ${pn.mm}mm panel U-değeri ne kadar?`,
  (sz, pt, pn, gz) => `${sz.label_tr} ${pt.tr} için kompresör HP gücü ne olmalı?`,
  (sz, pt, pn, gz) => `${pt.tr} ${sz.w}x${sz.l}x${sz.h} m oda için evaporatör seçimi nedir?`,
  (sz, pt, pn, gz) => `${pt.tr} odası ${gz.tr} ile teklif vermek istiyorum, ne hesaplanmalı?`,
  (sz, pt, pn, gz) => `${pt.tr} odası ${sz.w}x${sz.l}x${sz.h} m için kapı tipi ne?`,
  (sz, pt, pn, gz) => `${pt.tr} için ${pn.mm}mm panel + ${gz.tr} kombinasyonu doğru mu?`,
];

const DE_TEMPLATES = [
  (sz, pt, pn, gz) => `Welche Kapazität braucht ein ${sz.w}x${sz.l}x${sz.h} m ${pt.de} Raum?`,
  (sz, pt, pn, gz) => `Welche Paneldicke ist passend für ${sz.w}x${sz.l}x${sz.h} m ${pt.de}?`,
  (sz, pt, pn, gz) => `Was ist der Schätzpreis für einen ${pt.de} Raum in ${sz.label_de} Größe?`,
  (sz, pt, pn, gz) => `Ist ${gz.de} geeignet für ${pt.de}?`,
  (sz, pt, pn, gz) => `${sz.w}x${sz.l}x${sz.h} m ${pt.de} mit ${pn.mm}mm Paneel — Energieverbrauch?`,
  (sz, pt, pn, gz) => `Welcher U-Wert hat ein ${pn.mm}mm Paneel im ${pt.de} Raum?`,
  (sz, pt, pn, gz) => `Welche Verdichter-PS für ${sz.label_de} ${pt.de}?`,
  (sz, pt, pn, gz) => `Welche Verdampferauswahl für ${pt.de} ${sz.w}x${sz.l}x${sz.h} m Raum?`,
  (sz, pt, pn, gz) => `Ich möchte ein Angebot für ${pt.de} mit ${gz.de} — was wird berechnet?`,
  (sz, pt, pn, gz) => `Welcher Türtyp für ${pt.de} ${sz.w}x${sz.l}x${sz.h} m Raum?`,
  (sz, pt, pn, gz) => `Ist ${pn.mm}mm + ${gz.de} richtig für ${pt.de}?`,
];

// Cevap üretici (her kombinasyon için kapasite + fiyat hesaplı)
function buildAnswer(sz, pt, pn, gz, lang) {
  const dt = 32 - pt.temp;
  const wallArea = 2 * (sz.w * sz.h + sz.l * sz.h) + sz.w * sz.l;
  // Hızlı kapasite hesabı (kW)
  const baseKw = ((sz.w * sz.l * 22) + (sz.m3 * dt * 1.75 * pn.k / 0.23) + (sz.m3 * 6)) * 1.10 / 1000;
  const safetyFactor = pt.temp < 0 ? 1.5 : 1.25;
  const reqKw = (baseKw * safetyFactor).toFixed(1);
  // HP (kW × 1.1 / 0.75 ≈ kW × 1.47)
  const hp = Math.max(1, Math.round(baseKw * 1.47));
  // Panel + kapı + cihaz fiyat tahmini
  const panelEur = Math.round(wallArea * 50);  // €50/m² ColdRoomPro default
  const doorEur = (pn.mm <= 80) ? 1100 : 1700;
  const cihazEur = Math.round(reqKw * 950);
  const kontrol = 480;
  const sarf = 800;
  const total = panelEur + doorEur + cihazEur + kontrol + sarf;

  if (lang === "tr") {
    return `${sz.w}×${sz.l}×${sz.h} m ${pt.tr} (hedef ${pt.temp}°C, RH %${pt.rh}) odası için: ` +
      `**Kapasite** ≈ ${reqKw} kW (~${hp} HP). ` +
      `**Panel** ${pn.mm} mm PIR (k=${pn.k} W/m²K) — toplam ${wallArea.toFixed(0)} m². ` +
      `**Kapı** ${pn.mm <= 80 ? "menteşeli artı oda" : "rezistanslı negatif/şok"}. ` +
      `**Gaz**: ${gz.tr} (GWP ${gz.gwp}, kullanım: ${gz.app}). ` +
      `**Ön teklif** (montaj hariç): Panel €${panelEur} + Kapı €${doorEur} + Cihaz €${cihazEur} + Kontrol €${kontrol} + Sarf €${sarf} = **€${total} net**. ` +
      `Bağlayıcı teklif için Satış sekmesi.`;
  }
  return `Für ${sz.w}×${sz.l}×${sz.h} m ${pt.de} Raum (Ziel ${pt.temp}°C, ${pt.rh}% RH): ` +
    `**Kapazität** ≈ ${reqKw} kW (~${hp} PS). ` +
    `**Paneel** ${pn.mm} mm PIR (k=${pn.k} W/m²K) — gesamt ${wallArea.toFixed(0)} m². ` +
    `**Tür** ${pn.mm <= 80 ? "Drehtür Plus-Raum" : "Heiztür Tiefkühl/Schock"}. ` +
    `**Gas**: ${gz.de} (GWP ${gz.gwp}, ${gz.app}). ` +
    `**Vorab-Angebot** (ohne Montage): Paneel €${panelEur} + Tür €${doorEur} + Gerät €${cihazEur} + Steuerung €${kontrol} + Material €${sarf} = **€${total} netto**. ` +
    `Verbindliches Angebot über Verkauf-Tab.`;
}

function buildKeywords(sz, pt, pn, gz) {
  return [
    `${sz.w}x${sz.l}x${sz.h}`, sz.label_tr, sz.label_de,
    pt.id, pt.tr.toLowerCase(), pt.de.toLowerCase(),
    `${pn.mm}mm`, "panel",
    gz.id, gz.tr.toLowerCase(), gz.de.toLowerCase(),
    "soğuk oda", "kuhlraum", "cold room",
  ].slice(0, 18);
}

// === GENERATE 20K FAQ ===
function generateFaq() {
  const entries = [];
  for (const sz of SIZES) {
    for (const pt of PRODUCT_TYPES) {
      for (const pn of PANELS) {
        for (const gz of GASES) {
          for (let t = 0; t < TR_TEMPLATES.length; t += 1) {
            const trQ = TR_TEMPLATES[t](sz, pt, pn, gz);
            const deQ = DE_TEMPLATES[t](sz, pt, pn, gz);
            const trA = buildAnswer(sz, pt, pn, gz, "tr");
            const deA = buildAnswer(sz, pt, pn, gz, "de");
            entries.push({
              id: `coldroom_qa_${sz.w}x${sz.l}x${sz.h}_${pt.id}_${pn.mm}_${gz.id}_t${t + 1}`,
              family_id: `coldroom_${pt.id}`,
              context_id: "coldroom_qa_20k",
              keywords: buildKeywords(sz, pt, pn, gz),
              tr_subject: trQ,
              de_subject: deQ,
              tr_answer: trA,
              de_answer: deA,
            });
          }
        }
      }
    }
  }
  return entries;
}

// === 20 ÖRNEK TEKLİF ===
function generateOffers() {
  // 20 farklı senaryo: birbirinden farklı boyut+ürün+panel+gaz kombinasyonu
  const scenarios = [
    [SIZES[0], PRODUCT_TYPES[0], PANELS[1], GASES[0]],   // 2x2x2 sebze 80mm R290
    [SIZES[1], PRODUCT_TYPES[4], PANELS[1], GASES[0]],   // 3x3x2.5 süt 80mm R290
    [SIZES[2], PRODUCT_TYPES[1], PANELS[1], GASES[0]],   // 3x4x3 et 80mm R290
    [SIZES[3], PRODUCT_TYPES[0], PANELS[1], GASES[0]],   // 4x4x3 sebze 80mm R290
    [SIZES[3], PRODUCT_TYPES[7], PANELS[1], GASES[0]],   // 4x4x3 içecek 80mm R290
    [SIZES[4], PRODUCT_TYPES[0], PANELS[1], GASES[0]],   // 5x4x3 sebze depo
    [SIZES[4], PRODUCT_TYPES[1], PANELS[1], GASES[1]],   // 5x4x3 et R449A
    [SIZES[5], PRODUCT_TYPES[2], PANELS[2], GASES[1]],   // 6x5x3 TK et 100mm R449A
    [SIZES[5], PRODUCT_TYPES[5], PANELS[2], GASES[1]],   // 6x5x3 TK gıda
    [SIZES[6], PRODUCT_TYPES[5], PANELS[2], GASES[1]],   // 8x6x4 TK endüstriyel
    [SIZES[6], PRODUCT_TYPES[3], PANELS[3], GASES[3]],   // 8x6x4 TK balık 120mm R448A
    [SIZES[7], PRODUCT_TYPES[5], PANELS[3], GASES[1]],   // 10x8x5 TK büyük depo
    [SIZES[7], PRODUCT_TYPES[8], PANELS[4], GASES[3]],   // 10x8x5 dondurma 150mm
    [SIZES[2], PRODUCT_TYPES[6], PANELS[1], GASES[2]],   // 3x4x3 çiçek R134a
    [SIZES[3], PRODUCT_TYPES[4], PANELS[1], GASES[2]],   // 4x4x3 süt R134a (yüksek pozitif)
    [SIZES[1], PRODUCT_TYPES[6], PANELS[1], GASES[0]],   // 3x3x2.5 çiçek küçük
    [SIZES[4], PRODUCT_TYPES[7], PANELS[1], GASES[0]],   // 5x4x3 içecek R290
    [SIZES[3], PRODUCT_TYPES[5], PANELS[2], GASES[1]],   // 4x4x3 TK gıda 100mm
    [SIZES[5], PRODUCT_TYPES[8], PANELS[3], GASES[3]],   // 6x5x3 dondurma 120mm
    [SIZES[6], PRODUCT_TYPES[2], PANELS[2], GASES[1]],   // 8x6x4 TK et 100mm
  ];
  return scenarios.map(([sz, pt, pn, gz], i) => {
    const dt = 32 - pt.temp;
    const wallArea = 2 * (sz.w * sz.h + sz.l * sz.h) + sz.w * sz.l;
    const baseKw = ((sz.w * sz.l * 22) + (sz.m3 * dt * 1.75 * pn.k / 0.23) + (sz.m3 * 6)) * 1.10 / 1000;
    const safetyFactor = pt.temp < 0 ? 1.5 : 1.25;
    const reqKw = +(baseKw * safetyFactor).toFixed(1);
    const hp = Math.max(1, Math.round(baseKw * 1.47));
    const panelEur = Math.round(wallArea * 50);
    const doorEur = pn.mm <= 80 ? 1100 : 1700;
    const cihazEur = Math.round(reqKw * 950);
    const kontrol = 480;
    const sarf = 800;
    const totalNet = panelEur + doorEur + cihazEur + kontrol + sarf;
    const totalGross = Math.round(totalNet * 1.19);  // %19 KDV
    return {
      offer_no: `DRC-OFFER-2026-${String(i + 1).padStart(3, "0")}`,
      project: `${sz.w}×${sz.l}×${sz.h} m ${pt.tr}`,
      project_de: `${sz.w}×${sz.l}×${sz.h} m ${pt.de}`,
      target_temp_c: pt.temp,
      panel_mm: pn.mm,
      panel_k: pn.k,
      refrigerant: gz.tr,
      refrigerant_id: gz.id,
      capacity_kw: reqKw,
      compressor_hp: hp,
      wall_area_m2: +wallArea.toFixed(1),
      lines: [
        { item: "Panel " + pn.mm + " mm PIR", qty: +wallArea.toFixed(1), unit: "m²", price_eur: 50, total_eur: panelEur },
        { item: pn.mm <= 80 ? "Soğuk oda kapısı (menteşeli artı)" : "Soğuk oda kapısı (rezistanslı negatif/şok)", qty: 1, unit: "adet", price_eur: doorEur, total_eur: doorEur },
        { item: `Kondenser ünitesi + evaporatör (${reqKw} kW, ${hp} HP)`, qty: 1, unit: "set", price_eur: cihazEur, total_eur: cihazEur },
        { item: "Kontrol panosu (Dixell/Eliwell)", qty: 1, unit: "adet", price_eur: kontrol, total_eur: kontrol },
        { item: "Boru / bakır / sarf malzeme", qty: 1, unit: "set", price_eur: sarf, total_eur: sarf },
      ],
      total_net_eur: totalNet,
      total_gross_eur: totalGross,
      vat_rate: 19,
      validity_days: 15,
      created_at: new Date().toISOString(),
      note: "Ön teklif. Bağlayıcı teklif için POS / Satış sekmesi.",
    };
  });
}

// === MAIN ===
const entries = generateFaq();
fs.writeFileSync(FAQ_OUT, JSON.stringify(entries));
console.log(`✓ FAQ: ${entries.length} entry → ${FAQ_OUT}`);
console.log(`  Boyut: ${(fs.statSync(FAQ_OUT).size / (1024*1024)).toFixed(2)} MB`);

const offers = generateOffers();
fs.writeFileSync(OFFERS_OUT, JSON.stringify(offers, null, 2));
console.log(`✓ Teklifler: ${offers.length} adet → ${OFFERS_OUT}`);
console.log(`  Toplam net aralık: €${Math.min(...offers.map(o => o.total_net_eur))} - €${Math.max(...offers.map(o => o.total_net_eur))}`);
