#!/usr/bin/env node
/*
 * Genel ürün açıklama zenginleştirme scripti (marka-bağımsız, kategori-bilinçli).
 *
 * Hedef: items tablosunda brand dolu olan kayıtların notes ve notes_de
 * alanlarının başına, kategoriye uygun tek satır "Detay:/Detail:" özeti ekler.
 *
 * Kullanım:
 *   node scripts/enrich-product-descriptions.js --brand=Danfoss          # tek marka
 *   node scripts/enrich-product-descriptions.js --brand=all --limit=50   # tüm markalar, ilk 50
 *   node scripts/enrich-product-descriptions.js --brand=all --dry-run    # dry-run
 *   node scripts/enrich-product-descriptions.js --brand=Danfoss --force  # mevcut Detay'i ezer
 *
 * Ortam:
 *   DATABASE_URL="postgres://..."    # varsa postgres
 *   (yoksa data/hamburg-depo.live-postgres.sqlite'a --dry-run yapılabilir)
 */

"use strict";

const path = require("path");
const fs = require("fs");
const cwd = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const brandArg = (args.find((a) => a.startsWith("--brand=")) || "--brand=all").split("=")[1];
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) || 0 : 0;

// --- field extractors (notes OR name fallback) ---

function pickField(notes, re) {
  const parts = String(notes || "").split("|");
  for (const part of parts) {
    const m = part.match(re);
    if (m) return m[1].trim();
  }
  return "";
}

function extractGasFromName(name) {
  const m = String(name || "").match(/\bR[- ]?(\d{2,4}[aA]?|290|600[aA]?|744|1234[a-zA-Z]{1,4})\b/);
  return m ? `R${m[1].toUpperCase()}` : "";
}

function extractSizeFromName(name) {
  // 1/4" or 1-1/8" or 5/8 inch patterns
  const m = String(name || "").match(/\b(\d{1,2}(?:[- ]?\d{1,2})?\/\d{1,2}(?:[- ]?\d{1,2}\/\d{1,2})?"?|ODF \d+|\d{1,3}mm)\b/);
  return m ? m[1].replace(/\s+/g, " ") : "";
}

function extractQ0(notes) {
  // Bitzer XML teknik veri: "Q₀: 16200W" veya "Q0: 16200 W"
  const m = String(notes || "").match(/Q[₀0]\s*:\s*([\d.,]+\s*W)/);
  return m ? m[1].replace(/\s+/g, "") : "";
}
function extractPe(notes) {
  const m = String(notes || "").match(/P[ₑe]\s*:\s*([\d.,]+\s*kW)/);
  return m ? m[1].replace(/\s+/g, "") : "";
}
function extractHpFromName(name) {
  // "1/3 HP", "1/2+ HP", "3/4 HP", "1 HP", "2,5 HP"
  const m = String(name || "").match(/(\d+(?:[/.,]\d+)?\+?)\s*HP\b/i);
  return m ? m[1] : "";
}
function extractVoltageFromName(name) {
  // "220V", "380V", "220/240V", "400V/50Hz"
  const m = String(name || "").match(/\b(\d{3}(?:\/\d{3})?)\s*V\b/i);
  return m ? `${m[1]}V` : "";
}

function parseFields(row) {
  const notes = row.notes || "";
  const name = row.name || "";
  return {
    model: pickField(notes, /\bModel\s*:?\s*([^|]+)/i)
        || pickField(notes, /\bTasarım\s*:\s*([^|]+)/i)
        || pickField(notes, /\bSeri\s*:\s*([^|]+)/i),
    hp: pickField(notes, /\bHP\s*:\s*([^|]+)/i)
       || pickField(notes, /Kompres[öo]r G[üu]c[üu].*?:\s*([^|]+)/i)
       || extractHpFromName(name),
    gaz: pickField(notes, /\bGaz\s*:\s*([^|]+)/i) || extractGasFromName(name),
    besleme: pickField(notes, /\bBesleme\s*:\s*([^|]+)/i)
          || pickField(notes, /\bVoltaj\s*:\s*([^|]+)/i)
          || extractVoltageFromName(name),
    kapasite: pickField(notes, /\bKapasite\s*:\s*([^|]+)/i)
          || extractQ0(notes)
          || pickField(notes, /\bSwept Volume\s*:\s*([^|]+)/i)
          || pickField(notes, /\bG[üu]c[üu]\s*:\s*([^|]+W|[^|]+kW)/i),
    guc_elektrik: extractPe(notes),
    rejim: pickField(notes, /[ÇC]al[ıi][şs]ma Rejimi\s*:\s*([^|]+)/i),
    uretim: pickField(notes, /[ÜU]retim Yeri\s*:\s*([^|]+)/i),
    tip: pickField(notes, /Kompres[öo]r Tipi\s*:\s*([^|]+)/i)
       || pickField(notes, /Vana\s*(?:\/ Orifis)?\s*Tipi\s*:\s*([^|]+)/i)
       || pickField(notes, /[ÜU]r[üu]n Tipi\s*:\s*([^|]+)/i),
    frekans: pickField(notes, /Frekans.*?:\s*([^|]+)/i),
    baglanti: pickField(notes, /Ba[ğg]lant[ıi].*?:\s*([^|]+)/i)
            || pickField(notes, /Ba[ğg]lant[ıi] [ŞS]ekli\s*:\s*([^|]+)/i),
    boyut: pickField(notes, /\bBoyut\s*:\s*([^|]+)/i)
        || extractSizeFromName(name),
    orifis: pickField(notes, /\bOrifis\s*(?:No)?\s*:?\s*([^|]+)/i),
  };
}

// İsimde kategori kelimesi zaten varsa "tekrar ekleme" — "X Kompressor kompresör" gibi
// yavan çıktıları önler.
function nameAlreadyIncludes(name, words) {
  const normalized = String(name || "").toLowerCase();
  return words.some((w) => normalized.includes(w.toLowerCase()));
}

// Spec değeri zaten isimde varsa ekleme (ör. "1/3 HP 220V R-404A")
function specAlreadyInName(name, specValue) {
  if (!specValue) return true;
  const n = String(name || "").toLowerCase();
  // Normalize: "R-404A" ≈ "R404A", ara boşluk/çizgi/dash farklarını yok say
  const v = String(specValue).toLowerCase().replace(/[-\s]+/g, "");
  const nn = n.replace(/[-\s]+/g, "");
  return nn.includes(v);
}

// --- category templates ---

const COMPRESSOR_CATS = new Set([
  "Kompresorler", "Kompresörler", "Kompresorler ", "Hermetik Kompresörler",
  "Scroll Kompresorler", "Scroll Kompresörler", "Sogutma Grubu", "Soğutma Grubu",
  "Kompresor", "Kompresör",
]);

const REFRIGERANT_CATS = new Set([
  "Sogutucu Gaz", "Soğutucu Gaz", "Soğutucu Gazlar", "Sogutucu Gazlar",
  "Kältemittel", "Refrigerant",
  "Soğutucu Akışkanlar", "Sogutucu Akiskanlar",
  "Diğer Gazlar", "Diger Gazlar",
]);

const VALVE_CATS = new Set([
  "Solenoid Valfler", "Expansion Valfler", "Genleşme Vanaları", "Valfler & Genleşme Valfleri",
  "Vanalar ve Regülatörler", "Servis Valfi", "Tek Yönlü Vana", "Küresel Vana",
  "Genlesme Valfleri", "Çekvalfler",
  "4 Yollu Vanalar / Heat-Pump", "4 Yollu Vana",
  "Rotalock Vana", "Klima Servis Vanası", "VALF / FILTRE",
  "Manifoldlar", "Manifold",
]);

const FILTER_CATS = new Set([
  "Çelik Kurutucu Filtreler", "Filtreler & Kurutucular", "Filtre Drier",
  "Filtreler", "Susuzlaştırıcı Filtreler",
  "Celik Emiş Filtreler", "Celik Emis Filtreler",
  "Bakır Kurutucu Filtreler", "Bakir Kurutucu Filtreler",
]);

const PRESOSTAT_CATS = new Set([
  "Basınç Kontrol ( Presostatlar )", "Basınç Kontrolü", "Basinc Kontrol",
  "Switch Basınç Kontrol", "Mekanik Basınç Kontrol",
  "Basınç Şalterleri", "Basinc Salterleri", "Basınç Kontrol",
]);

const SENSOR_CATS = new Set([
  "Transmitter", "Termostat ve Termometreler", "Termostat",
  "Sıcaklık Sensörleri", "Sensör",
  "Mekanik Sicaklik Kontrol", "Dijital Sicaklik Kontrol",
  "Termik",
]);

const FAN_CATS = new Set([
  "Fan Motorları", "Fan Motoru", "Fanlar & Motorlar", "Fanlar",
  "Axial Fanlar", "Fan Hız Kontroller",
]);

const SIGHT_GLASS_CATS = new Set([
  "Gözetleme Camları", "Gozetleme Camlari", "Gözetleme Cam", "Sight Glass",
]);

const SPLIT_CATS = new Set([
  "Split Soğutma Cihazları", "Split Unit", "Split",
  "Endüstriyel Split İç Ünite", "Endüstriyel Split Dış Ünite",
  "Endustriyel Split Ic Unite", "Endustriyel Split Dis Unite",
  "Endüstriyel Split", "Split Sistemler",
]);

const DIGITAL_CATS = new Set([
  "Dijital Kontrol", "Kontrol Paneli", "Kontrol Panelleri",
  "Elektronik Kontrol", "Elektronik Kartlar",
  "Elektronik Kontrolörler", "Elektronik Kontrolorler",
  "Kontroller", "Kontrolörler", "Kontrolor",
]);

const EVAPORATOR_CATS = new Set(["Evaporatörler", "Evaporatorler", "Evaporatör", "Evaporator", "EVAPORATOR"]);
const CONDENSER_CATS = new Set([
  "Kondenserler", "Kondenser",
  "Mikro Kanallı Kondenserler", "Mikro Kanalli Kondenserler",
  "Kabinli Kondenser",
]);
const CONDENSING_UNIT_CATS = new Set(["Kondenser Üniteleri", "Kondenser Uniteleri", "Kondens Ünite"]);

const COPPER_PIPE_CATS = new Set([
  "Bakır Borular", "Bakir Borular", "Bakır Boru", "Bakir Boru",
  "Bakır Borular & Hatlar", "Bakir Borular & Hatlar",
  "Tekli İzolasyonlu Borular", "Çiftli İzolasyonlu Borular",
  "İzolasyonlu Borular", "Izolasyonlu Borular",
  "Kılcal Borular", "Kilcal Borular",
]);
const COPPER_FITTING_CATS = new Set([
  "Bakır Bağlantı Elemanları", "Bakir Baglanti Elemanlari",
  "Bakır Bağlantı", "Rakor", "Dirsek", "T Fitting",
]);

const OIL_CATS = new Set(["Soğutma Yağları", "Sogutma Yaglari", "Soğutma Yağı"]);
const CHEMICAL_CATS = new Set(["Kimyasal Ürünler", "Kimyasal Urunler"]);
const WELDING_CATS = new Set(["Kaynak Telleri", "Kaynak Teli"]);

const INSULATION_CATS = new Set([
  "İzolasyonlar ve Bantlar", "Izolasyonlar ve Bantlar",
  "İzolasyon", "Izolasyon", "Yalıtım",
]);

const HEATING_CATS = new Set(["Isıtma Malzemeleri", "Isitma Malzemeleri", "Rezistans"]);
const COLDROOM_CATS = new Set(["Soğuk Oda Aksesuarları", "Soguk Oda Aksesuarlari", "Soğuk Oda"]);
const AIRCURTAIN_CATS = new Set(["Hava Perdeleri", "Hava Perdesi"]);
const TOOL_CATS = new Set([
  "Servis Ekipmanları ve El Aletleri", "Servis Ekipmani",
  "Servis Aletleri", "El Aletleri",
]);
const ELECTRIC_CATS = new Set([
  "Elektrik Malzemeleri", "Elektrik Malzemesi",
  "Elektrik & Kontrol",
]);
const AC_PARTS_CATS = new Set(["Klima Yedek Parçaları", "Klima Yedek Parcalari", "Klima Parça"]);

// İsim-bazlı fallback: kategori "Soğutma Malzemeleri" gibi jenerikse
// isimdeki anahtar kelimeye göre daha iyi şablon seç.
function detectTemplateFromName(name) {
  const n = String(name || "").toLowerCase();
  if (/g[öo]zetleme\s*cam|sight\s*glass|schauglas/i.test(n)) return "sightglass";
  if (/kurutucu\s*filtre|filter\s*drier|trocknerfilter|\bdrayer\b|\bdrier\b|kartu[sş]\s*dra|h-?100|h-?48|nem\s*asit|ya[ğg]\s*filtre|oil\s*filter|filtre/i.test(n)) return "filter";
  if (/solenoid|magnetventil/i.test(n)) return "valve";
  if (/presostat|druckschalter|pressostat|basın[cç]\s*kontrol/i.test(n)) return "presostat";
  if (/transmitter|transducer/i.test(n)) return "sensor";
  if (/termostat|thermostat|sıcaklık\s*kontrol|temp\s*sensor/i.test(n)) return "sensor";
  if (/\bfan\b|l[üu]fter|ventilator/i.test(n)) return "fan";
  if (/scroll|hermetik|verdichter|kompres[öo]r|kompressor/i.test(n)) return "compressor";
  if (/\bvana\b|\bvalf\b|ventil|magnetventil|k[üu]resel|rotalock|manifold/i.test(n)) return "valve";
  if (/evaporat[öo]r|verdampfer/i.test(n)) return "evaporator";
  if (/kondensat|kondenser|verfl[üu]ssiger|condensor/i.test(n)) return "condenser";
  if (/kapiler|kılcal|kilcal|kapillar/i.test(n)) return "copper_pipe";
  if (/bakır\s*boru|kupferrohr/i.test(n)) return "copper_pipe";
  if (/bakır.*(ba[ğg]lant|rakor|dirsek|t.*fitting)/i.test(n)) return "copper_fitting";
  if (/vakum\s*pompa|vacuum\s*pump|boru\s*makas|boru\s*[sş]i[sş]irme|kelepçeler|kerpeten/i.test(n)) return "tool";
  if (/ya[ğg]|[öo]l\s|oil\s/i.test(n) && /kompres|ester|mineral|poe|pag/i.test(n)) return "oil";
  if (/r\s*-?\s*\d{2,4}[a-zA-Z]*/i.test(n) && /gaz|k[äa]ltemittel|refrigerant|silindir\s*t[üu]p|einwegdose/i.test(n)) return "refrigerant";
  if (/inverter|control\s*board|kontrol\s*kart/i.test(n)) return "digital";
  return null;
}

// Templates receive (brand, fields, name, lang) → string
const TEMPLATES = {
  compressor: (brand, f, name, lang) => {
    const nameHasType = nameAlreadyIncludes(name, ["kompresor", "kompresör", "kompressor", "verdichter"]);
    if (lang === "de") {
      const typeSuffix = nameHasType ? "" :
          /hermetik|pistonlu/i.test(f.tip) ? " Hermetik-Kolbenverdichter"
        : /scroll/i.test(f.tip) ? " Scroll-Verdichter"
        : " Verdichter";
      const specs = [];
      if (f.kapasite && !specAlreadyInName(name, f.kapasite)) specs.push(`Kälteleistung ${f.kapasite}`);
      if (f.guc_elektrik && !specAlreadyInName(name, f.guc_elektrik)) specs.push(`Motor ${f.guc_elektrik}`);
      if (f.hp && !specAlreadyInName(name, f.hp + "HP")) specs.push(`${f.hp} PS`);
      if (f.gaz && !specAlreadyInName(name, f.gaz)) specs.push(`Kältemittel ${f.gaz}`);
      if (f.besleme && !specAlreadyInName(name, f.besleme)) specs.push(f.besleme);
      let s = `${name}${typeSuffix}`;
      if (specs.length) s += `; ${specs.join(", ")}`;
      s += ".";
      if (f.rejim) {
        const short = (f.rejim.match(/^(LBP|MBP|HBP)/i) || [])[1];
        const map = { LBP: "Tiefkühlbereich (LBP)", MBP: "Normalkühlbereich (MBP)", HBP: "Hochdruckbereich (HBP)" };
        s += ` Einsatzbereich: ${map[short?.toUpperCase?.()] || f.rejim.split("(")[0].trim()}.`;
      }
      return s;
    }
    const typeSuffix = nameHasType ? "" : (f.tip ? ` ${f.tip.toLowerCase()} kompresör` : " kompresör");
    const specs = [];
    if (f.kapasite && !specAlreadyInName(name, f.kapasite)) specs.push(`soğutma kapasitesi ${f.kapasite}`);
    if (f.guc_elektrik && !specAlreadyInName(name, f.guc_elektrik)) specs.push(`motor ${f.guc_elektrik}`);
    if (f.hp && !specAlreadyInName(name, f.hp + "HP")) specs.push(`${f.hp} HP`);
    if (f.gaz && !specAlreadyInName(name, f.gaz)) specs.push(`${f.gaz} gazı`);
    if (f.besleme && !specAlreadyInName(name, f.besleme)) specs.push(f.besleme);
    let s = `${name}${typeSuffix}`;
    if (specs.length) s += `; ${specs.join(", ")}`;
    s += ".";
    if (f.rejim) {
      const short = (f.rejim.match(/^(LBP|MBP|HBP)/i) || [])[1];
      s += ` Çalışma rejimi ${short || f.rejim.split("(")[0].trim()}.`;
    }
    return s;
  },

  valve: (brand, f, name, lang) => {
    const nameHasTypeTR = nameAlreadyIncludes(name, ["valf", "vana", "ventil", "vanası", "valfi"]);
    const nameHasTypeDE = nameAlreadyIncludes(name, ["ventil", "hahn"]);
    if (lang === "de") {
      const typeSuffix = nameHasTypeDE ? "" :
        /solenoid/i.test(f.tip || name) ? " Magnetventil"
        : /termostatik|expansion|genle[sş]me/i.test(f.tip || name) ? " thermostatisches Expansionsventil"
        : /k[üu]resel/i.test(name) ? " Kugelhahn"
        : /tek y[öo]nl[üu]|check/i.test(name) ? " Rückschlagventil"
        : " Ventil";
      const specs = [];
      if (f.boyut) specs.push(`Größe ${f.boyut}`);
      if (f.orifis) specs.push(`Düse ${f.orifis}`);
      if (f.gaz) specs.push(`Kältemittel ${f.gaz}`);
      if (f.baglanti) specs.push(f.baglanti);
      let s = `${name}${typeSuffix}`;
      if (specs.length) s += `; ${specs.join(", ")}`;
      s += ".";
      return s;
    }
    const typeSuffix = nameHasTypeTR ? "" :
        /solenoid/i.test(f.tip || name) ? " solenoid valf"
      : /termostatik|expansion|genle[sş]me/i.test(f.tip || name) ? " termostatik genleşme valfi"
      : /k[üu]resel/i.test(name) ? " küresel vana"
      : /tek y[öo]nl[üu]|check/i.test(name) ? " tek yönlü vana"
      : " vana";
    const specs = [];
    if (f.boyut) specs.push(`ölçü ${f.boyut}`);
    if (f.orifis) specs.push(`orifis ${f.orifis}`);
    if (f.gaz) specs.push(`${f.gaz} gazı`);
    if (f.baglanti) specs.push(f.baglanti);
    let s = `${name}${typeSuffix}`;
    if (specs.length) s += `; ${specs.join(", ")}`;
    s += ".";
    return s;
  },

  filter: (brand, f, name, lang) => {
    const nameHasTypeTR = nameAlreadyIncludes(name, ["filtre", "drier", "kurutucu"]);
    const nameHasTypeDE = nameAlreadyIncludes(name, ["filter", "trockner"]);
    if (lang === "de") {
      const typeSuffix = nameHasTypeDE ? "" : " Trocknerfilter (Kältekreis)";
      const specs = [];
      if (f.boyut) specs.push(`Größe ${f.boyut}`);
      if (f.baglanti) specs.push(f.baglanti);
      if (f.gaz) specs.push(`Kältemittel ${f.gaz}`);
      let s = `${name}${typeSuffix}`;
      if (specs.length) s += `; ${specs.join(", ")}`;
      s += ".";
      return s;
    }
    const typeSuffix = nameHasTypeTR ? "" : " kurutucu filtre (soğutma devresi)";
    const specs = [];
    if (f.boyut) specs.push(`boyut ${f.boyut}`);
    if (f.baglanti) specs.push(f.baglanti);
    if (f.gaz) specs.push(`${f.gaz} gazı`);
    let s = `${name}${typeSuffix}`;
    if (specs.length) s += `; ${specs.join(", ")}`;
    s += ".";
    return s;
  },

  presostat: (brand, f, name, lang) => {
    const nameHasTypeTR = nameAlreadyIncludes(name, ["presostat", "basınç"]);
    const nameHasTypeDE = nameAlreadyIncludes(name, ["druckschalter", "pressostat"]);
    if (lang === "de") {
      const typeSuffix = nameHasTypeDE ? "" : " Druckschalter / Presostat";
      let s = `${name}${typeSuffix}`;
      if (f.baglanti) s += `; Anschluss ${f.baglanti}`;
      s += ".";
      return s;
    }
    const typeSuffix = nameHasTypeTR ? "" : " basınç kontrol presostatı";
    let s = `${name}${typeSuffix}`;
    if (f.baglanti) s += `; bağlantı ${f.baglanti}`;
    s += ".";
    return s;
  },

  sensor: (brand, f, name, lang) => {
    const isTransmitter = /transmitter|transducer/i.test(name);
    const nameHasTypeTR = nameAlreadyIncludes(name, ["transmitter", "termostat", "sensör", "sensor"]);
    const nameHasTypeDE = nameAlreadyIncludes(name, ["transmitter", "thermostat", "sensor"]);
    if (lang === "de") {
      const typeSuffix = nameHasTypeDE ? "" : ` ${isTransmitter ? "Drucktransmitter" : "Thermostat / Sensor"}`;
      let s = `${name}${typeSuffix}`;
      if (f.besleme) s += `; Versorgung ${f.besleme}`;
      s += ".";
      return s;
    }
    const typeSuffix = nameHasTypeTR ? "" : ` ${isTransmitter ? "basınç transmitteri" : "termostat / sensör"}`;
    let s = `${name}${typeSuffix}`;
    if (f.besleme) s += `; besleme ${f.besleme}`;
    s += ".";
    return s;
  },

  fan: (brand, f, name, lang) => {
    const nameHasTypeTR = nameAlreadyIncludes(name, ["fan", "motor"]);
    const nameHasTypeDE = nameAlreadyIncludes(name, ["lüfter", "ventilator", "motor"]);
    if (lang === "de") {
      const typeSuffix = nameHasTypeDE ? "" : " Lüftermotor";
      const specs = [];
      if (f.besleme) specs.push(`Versorgung ${f.besleme}`);
      if (f.kapasite) specs.push(`Leistung ${f.kapasite}`);
      let s = `${name}${typeSuffix}`;
      if (specs.length) s += `; ${specs.join(", ")}`;
      s += ".";
      return s;
    }
    const typeSuffix = nameHasTypeTR ? "" : " fan motoru";
    const specs = [];
    if (f.besleme) specs.push(`besleme ${f.besleme}`);
    if (f.kapasite) specs.push(`güç ${f.kapasite}`);
    let s = `${name}${typeSuffix}`;
    if (specs.length) s += `; ${specs.join(", ")}`;
    s += ".";
    return s;
  },

  sightglass: (brand, f, name, lang) => {
    const nameHasTR = nameAlreadyIncludes(name, ["gözetleme cam", "gozetleme cam"]);
    const nameHasDE = nameAlreadyIncludes(name, ["schauglas"]);
    const boyutInName = specAlreadyInName(name, f.boyut);
    if (lang === "de") {
      const suffix = nameHasDE ? "" : " Schauglas für Kältekreis";
      return `${name}${suffix}${f.boyut && !boyutInName ? `; Größe ${f.boyut}` : ""}.`;
    }
    const suffix = nameHasTR ? "" : " soğutma devresi gözetleme camı";
    return `${name}${suffix}${f.boyut && !boyutInName ? `; boyut ${f.boyut}` : ""}.`;
  },

  split: (brand, f, name, lang) => {
    const nameHasTR = nameAlreadyIncludes(name, ["split"]);
    const nameHasDE = nameAlreadyIncludes(name, ["split"]);
    if (lang === "de") {
      const suffix = nameHasDE ? " (Kondensator + Verdampfer)" : " Split-Kühlgerät (Kondensator + Verdampfer)";
      return `${name}${suffix}${f.gaz ? `; Kältemittel ${f.gaz}` : ""}.`;
    }
    const suffix = nameHasTR ? " (kondenser + evaporatör)" : " split soğutma cihazı (kondenser + evaporatör)";
    return `${name}${suffix}${f.gaz ? `; ${f.gaz} gazı` : ""}.`;
  },

  digital: (brand, f, name, lang) => {
    if (lang === "de") {
      return `${name} Digitalregler / Steuerung${f.besleme ? `; Versorgung ${f.besleme}` : ""}.`;
    }
    return `${name} dijital kontrolör / pano${f.besleme ? `; besleme ${f.besleme}` : ""}.`;
  },

  generic: (brand, f, name, lang, category) => {
    if (lang === "de") {
      const cat = String(category || "").trim();
      return `${name}${cat ? ` – Kategorie: ${cat}` : ""}. ${brand}-Markenprodukt für industrielle Kältetechnik.`;
    }
    const cat = String(category || "").trim();
    return `${name}${cat ? ` – kategori: ${cat}` : ""}. ${brand} marka endüstriyel soğutma ürünü.`;
  },

  evaporator: (brand, f, name, lang) => {
    const has = nameAlreadyIncludes(name, ["evaporat", "verdampfer"]);
    if (lang === "de") {
      const suffix = has ? "" : " Verdampfer (Wärmeübertrager)";
      const extras = [];
      if (f.kapasite && !specAlreadyInName(name, f.kapasite)) extras.push(`Leistung ${f.kapasite}`);
      if (f.gaz && !specAlreadyInName(name, f.gaz)) extras.push(`Kältemittel ${f.gaz}`);
      return `${name}${suffix}${extras.length ? `; ${extras.join(", ")}` : ""}.`;
    }
    const suffix = has ? "" : " evaporatör (ısı değiştirici)";
    const extras = [];
    if (f.kapasite && !specAlreadyInName(name, f.kapasite)) extras.push(`kapasite ${f.kapasite}`);
    if (f.gaz && !specAlreadyInName(name, f.gaz)) extras.push(`${f.gaz} gazı`);
    return `${name}${suffix}${extras.length ? `; ${extras.join(", ")}` : ""}.`;
  },

  condenser: (brand, f, name, lang) => {
    const has = nameAlreadyIncludes(name, ["kondenser", "kondensator"]);
    if (lang === "de") {
      const suffix = has ? "" : " Verflüssiger (Kondensator)";
      const extras = [];
      if (f.kapasite && !specAlreadyInName(name, f.kapasite)) extras.push(`Leistung ${f.kapasite}`);
      return `${name}${suffix}${extras.length ? `; ${extras.join(", ")}` : ""}.`;
    }
    const suffix = has ? "" : " kondenser";
    const extras = [];
    if (f.kapasite && !specAlreadyInName(name, f.kapasite)) extras.push(`kapasite ${f.kapasite}`);
    return `${name}${suffix}${extras.length ? `; ${extras.join(", ")}` : ""}.`;
  },

  condensing_unit: (brand, f, name, lang) => {
    const has = nameAlreadyIncludes(name, ["ünite", "unite", "aggregat"]);
    if (lang === "de") {
      const suffix = has ? "" : " Verflüssigungssatz (Kompressor + Kondensator)";
      const extras = [];
      if (f.gaz && !specAlreadyInName(name, f.gaz)) extras.push(`Kältemittel ${f.gaz}`);
      if (f.hp && !specAlreadyInName(name, f.hp + "HP")) extras.push(`${f.hp} PS`);
      return `${name}${suffix}${extras.length ? `; ${extras.join(", ")}` : ""}.`;
    }
    const suffix = has ? " (kompresör + kondenser)" : " kondenser ünitesi (kompresör + kondenser)";
    const extras = [];
    if (f.gaz && !specAlreadyInName(name, f.gaz)) extras.push(`${f.gaz} gazı`);
    if (f.hp && !specAlreadyInName(name, f.hp + "HP")) extras.push(`${f.hp} HP`);
    return `${name}${suffix}${extras.length ? `; ${extras.join(", ")}` : ""}.`;
  },

  copper_pipe: (brand, f, name, lang) => {
    if (lang === "de") {
      return `${name} Kupferrohr für Kältekreis${f.boyut && !specAlreadyInName(name, f.boyut) ? `; Größe ${f.boyut}` : ""}.`;
    }
    return `${name} soğutma devresi bakır boru${f.boyut && !specAlreadyInName(name, f.boyut) ? `; boyut ${f.boyut}` : ""}.`;
  },

  copper_fitting: (brand, f, name, lang) => {
    if (lang === "de") {
      return `${name} Kupferfitting für Kältetechnik${f.baglanti ? `; ${f.baglanti}` : ""}.`;
    }
    return `${name} soğutma sistemi bakır bağlantı elemanı${f.baglanti ? `; ${f.baglanti}` : ""}.`;
  },

  insulation: (brand, f, name, lang) => {
    if (lang === "de") {
      return `${name} Kälteisolierung / Dämm-Material.`;
    }
    return `${name} soğutma izolasyon / yalıtım malzemesi.`;
  },

  heating: (brand, f, name, lang) => {
    if (lang === "de") {
      return `${name} Heizung / Widerstand (Entfroster / Wärmespur)${f.besleme && !specAlreadyInName(name, f.besleme) ? `; Versorgung ${f.besleme}` : ""}.`;
    }
    return `${name} ısıtma rezistansı (defrost / sıcaklık takip)${f.besleme && !specAlreadyInName(name, f.besleme) ? `; besleme ${f.besleme}` : ""}.`;
  },

  coldroom: (brand, f, name, lang) => {
    if (lang === "de") {
      return `${name} Kühlraum-Zubehör.`;
    }
    return `${name} soğuk oda aksesuarı.`;
  },

  aircurtain: (brand, f, name, lang) => {
    if (lang === "de") {
      return `${name} Luftschleier (Tür-Luftvorhang)${f.besleme && !specAlreadyInName(name, f.besleme) ? `; Versorgung ${f.besleme}` : ""}.`;
    }
    return `${name} hava perdesi (kapı soğuk hava bariyeri)${f.besleme && !specAlreadyInName(name, f.besleme) ? `; besleme ${f.besleme}` : ""}.`;
  },

  tool: (brand, f, name, lang) => {
    if (lang === "de") {
      return `${name} Service-Werkzeug / Montagehilfe für Kältetechniker.`;
    }
    return `${name} soğutma teknisyeni servis el aleti / montaj ekipmanı.`;
  },

  electric: (brand, f, name, lang) => {
    if (lang === "de") {
      return `${name} Elektro-Komponente (Kältetechnik)${f.besleme && !specAlreadyInName(name, f.besleme) ? `; Versorgung ${f.besleme}` : ""}.`;
    }
    return `${name} elektrik malzemesi (soğutma sistemi)${f.besleme && !specAlreadyInName(name, f.besleme) ? `; besleme ${f.besleme}` : ""}.`;
  },

  ac_part: (brand, f, name, lang) => {
    if (lang === "de") {
      return `${name} Klima-Ersatzteil${f.gaz && !specAlreadyInName(name, f.gaz) ? `; Kältemittel ${f.gaz}` : ""}.`;
    }
    return `${name} klima yedek parçası${f.gaz && !specAlreadyInName(name, f.gaz) ? `; ${f.gaz} gazı` : ""}.`;
  },

  refrigerant: (brand, f, name, lang) => {
    const hasGazWordTR = nameAlreadyIncludes(name, ["soğutucu gaz", "sogutucu gaz", "kältemittel", "gaz"]);
    const hasGazWordDE = nameAlreadyIncludes(name, ["kältemittel", "refrigerant"]);
    if (lang === "de") {
      const suffix = hasGazWordDE ? "" : " Kältemittel";
      return `${name}${suffix} für Kälte- und Klimaanlagen.`;
    }
    const suffix = hasGazWordTR ? "" : " soğutucu gaz";
    return `${name}${suffix} (soğutma ve klima sistemleri için).`;
  },

  oil: (brand, f, name, lang) => {
    const hasTR = nameAlreadyIncludes(name, ["yağ", "yag"]);
    const hasDE = nameAlreadyIncludes(name, ["öl", "oil"]);
    if (lang === "de") {
      const suffix = hasDE ? "" : " Kältemaschinenöl";
      return `${name}${suffix} (Schmiermittel für Kompressoren).`;
    }
    const suffix = hasTR ? "" : " soğutma kompresör yağı";
    return `${name}${suffix} (sistem yağlayıcı).`;
  },

  chemical: (brand, f, name, lang) => {
    if (lang === "de") return `${name} Chemikalie / Reiniger / Lecksuchspray für Kältetechnik.`;
    return `${name} soğutma sistemleri için kimyasal ürün / temizleyici / kaçak bulma spreyi.`;
  },

  welding: (brand, f, name, lang) => {
    if (lang === "de") return `${name} Lötstab / Schweißdraht für Kupferleitungen.`;
    return `${name} bakır hat lehim / kaynak teli.`;
  },
};

function pickTemplate(category, name) {
  if (COMPRESSOR_CATS.has(category)) return "compressor";
  if (VALVE_CATS.has(category)) return "valve";
  if (FILTER_CATS.has(category)) return "filter";
  if (PRESOSTAT_CATS.has(category)) return "presostat";
  if (SENSOR_CATS.has(category)) return "sensor";
  if (FAN_CATS.has(category)) return "fan";
  if (SIGHT_GLASS_CATS.has(category)) return "sightglass";
  if (SPLIT_CATS.has(category)) return "split";
  if (DIGITAL_CATS.has(category)) return "digital";
  if (EVAPORATOR_CATS.has(category)) return "evaporator";
  if (CONDENSER_CATS.has(category)) return "condenser";
  if (CONDENSING_UNIT_CATS.has(category)) return "condensing_unit";
  if (COPPER_PIPE_CATS.has(category)) return "copper_pipe";
  if (COPPER_FITTING_CATS.has(category)) return "copper_fitting";
  if (INSULATION_CATS.has(category)) return "insulation";
  if (HEATING_CATS.has(category)) return "heating";
  if (COLDROOM_CATS.has(category)) return "coldroom";
  if (AIRCURTAIN_CATS.has(category)) return "aircurtain";
  if (TOOL_CATS.has(category)) return "tool";
  if (ELECTRIC_CATS.has(category)) return "electric";
  if (AC_PARTS_CATS.has(category)) return "ac_part";
  if (REFRIGERANT_CATS.has(category)) return "refrigerant";
  if (OIL_CATS.has(category)) return "oil";
  if (CHEMICAL_CATS.has(category)) return "chemical";
  if (WELDING_CATS.has(category)) return "welding";
  // Kategori generic ise isimden kurtarmaya çalış
  const fromName = detectTemplateFromName(name);
  if (fromName) return fromName;
  return "generic";
}

function buildDetail(row, lang) {
  const fields = parseFields(row);
  const nameForSubject = (lang === "de" && row.nameDe) ? row.nameDe : row.name;
  // Template seçimi her iki dil için de aynı isim tabanlı olsun (TR tercih edilir)
  const tpl = pickTemplate(row.category || "", row.name || row.nameDe || "");
  const fn = TEMPLATES[tpl];
  return fn(row.brand, fields, nameForSubject, lang, row.category);
}

function upsertDetailPrefix(existing, newDetail, langTag) {
  const prefix = `${langTag}: ${newDetail}`;
  const text = String(existing || "");
  if (!text) return prefix;
  const parts = text.split("|").map((p) => p.trim()).filter(Boolean);
  const cleaned = parts.filter((p) => !/^Detay\s*:/i.test(p) && !/^Detail\s*:/i.test(p));
  return [prefix, ...cleaned].join(" | ");
}

// --- main ---

async function main() {
  const isPostgres = Boolean(process.env.DATABASE_URL);
  console.log(`[enrich-product] mode=${isPostgres ? "postgres" : "sqlite"} brand=${brandArg} dry=${dryRun} force=${force} limit=${limit || "all"}`);

  let rows;
  let pg = null;

  if (isPostgres) {
    const { Pool } = require("pg");
    pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const where = brandArg === "all"
      ? `brand IS NOT NULL AND brand != ''`
      : `brand = $1`;
    const params = brandArg === "all" ? [] : [brandArg];
    const sql = `
      SELECT id, name, name_de, notes, notes_de, brand, category
      FROM items
      WHERE ${where}
      ORDER BY id
      ${limit ? `LIMIT ${limit}` : ""}
    `;
    const res = await pg.query(sql, params);
    rows = res.rows.map((r) => ({
      id: r.id, name: r.name, nameDe: r.name_de, notes: r.notes, notesDe: r.notes_de,
      brand: r.brand, category: r.category,
    }));
  } else {
    const { execSync } = require("child_process");
    const dbPath = path.join(cwd, "data", "hamburg-depo.live-postgres.sqlite");
    if (!fs.existsSync(dbPath)) throw new Error(`SQLite yok: ${dbPath}`);
    const cols = execSync(`sqlite3 "${dbPath}" "PRAGMA table_info(items)" | awk -F'|' '{print $2}'`).toString().split("\n");
    const hasNameDe = cols.includes("name_de");
    const hasNotesDe = cols.includes("notes_de");
    const brandClause = brandArg === "all" ? `brand != ''` : `brand = '${brandArg.replace(/'/g, "''")}'`;
    const sql = `
      SELECT json_object(
        'id', id, 'name', name,
        'nameDe', ${hasNameDe ? "COALESCE(name_de, '')" : "''"},
        'notes', COALESCE(notes, ''),
        'notesDe', ${hasNotesDe ? "COALESCE(notes_de, '')" : "''"},
        'brand', brand, 'category', category
      )
      FROM items
      WHERE ${brandClause}
      ORDER BY id
      ${limit ? `LIMIT ${limit}` : ""};
    `;
    const out = execSync(`sqlite3 "${dbPath}" "${sql.replace(/"/g, '\\"').replace(/\n/g, " ")}"`, { maxBuffer: 256 * 1024 * 1024 }).toString();
    rows = out.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if (!dryRun) {
      console.error("[enrich-product] SQLite write mode kapali. DATABASE_URL'siz sadece --dry-run.");
      process.exit(2);
    }
  }

  console.log(`[enrich-product] ${rows.length} kayıt bulundu`);

  let updated = 0, skipped = 0, shown = 0;
  const pgUpdates = [];
  const templateStats = {};

  for (const row of rows) {
    const alreadyTR = /^\s*Detay\s*:/i.test(String(row.notes || "").trim());
    const alreadyDE = /^\s*Detail\s*:/i.test(String(row.notesDe || "").trim());
    if (alreadyTR && alreadyDE && !force) { skipped++; continue; }

    const tpl = pickTemplate(row.category || "", row.name || row.nameDe || "");
    templateStats[tpl] = (templateStats[tpl] || 0) + 1;

    const detailTR = buildDetail(row, "tr");
    const detailDE = buildDetail(row, "de");
    const newNotes = upsertDetailPrefix(row.notes, detailTR, "Detay");
    const newNotesDe = upsertDetailPrefix(row.notesDe, detailDE, "Detail");

    if (dryRun) {
      if (shown < 8) {
        console.log(`[dry] id=${row.id} brand=${row.brand} cat=${row.category} tpl=${tpl}`);
        console.log(`      TR: ${detailTR}`);
        console.log(`      DE: ${detailDE}`);
        shown++;
      }
      updated++;
      continue;
    }

    if (isPostgres) {
      pgUpdates.push({ id: row.id, notes: newNotes, notesDe: newNotesDe });
    }
    updated++;
  }

  if (isPostgres && !dryRun && pgUpdates.length) {
    console.log(`[enrich-product] ${pgUpdates.length} kayıt postgres'e yazılıyor...`);
    const client = await pg.connect();
    try {
      await client.query("BEGIN");
      const BATCH = 500;
      for (let i = 0; i < pgUpdates.length; i += BATCH) {
        const batch = pgUpdates.slice(i, i + BATCH);
        for (const u of batch) {
          await client.query("UPDATE items SET notes=$1, notes_de=$2 WHERE id=$3", [u.notes, u.notesDe, u.id]);
        }
        if (i % 2000 === 0 && i > 0) console.log(`  ... ${i}/${pgUpdates.length}`);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`[enrich-product] DONE updated=${updated} skipped=${skipped}`);
  console.log(`[enrich-product] template stats:`);
  Object.entries(templateStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([tpl, count]) => console.log(`  ${tpl}: ${count}`));
  if (pg) await pg.end();
}

main().catch((err) => {
  console.error("[enrich-product] HATA:", err);
  process.exit(1);
});
