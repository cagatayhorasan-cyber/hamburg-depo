const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, query } = require("../server/db");

const REPORT_DIR = path.join(process.cwd(), "data", "reports");

const CATEGORY_MAP = [
  { match: /SOGUTMA GRUBU/i, tr: "Soğutma Grubu", de: "Kälteaggregat" },
  { match: /EVAPOR/i, tr: "Evaporatör", de: "Verdampfer" },
  { match: /KOMPRES/i, tr: "Kompresör", de: "Kompressor" },
  { match: /FAN/i, tr: "Fan / Fan Motoru", de: "Lüfter / Lüftermotor" },
  { match: /SOGUTUCU GAZ|KALTEMITTEL|GAZ/i, tr: "Soğutucu Gaz", de: "Kältemittel" },
  { match: /SOGUTMA YAGLARI|YAG/i, tr: "Soğutma Yağı", de: "Kälteöl" },
  { match: /LIKIT TANK/i, tr: "Likit Tankı", de: "Flüssigkeitssammler" },
  { match: /VALF|FILTRE/i, tr: "Valf / Filtre", de: "Ventil / Filter" },
  { match: /ELEKTRIK PANOSU/i, tr: "Elektrik Panosu", de: "Schaltschrank" },
  { match: /KONTROL|ELEKTRIK/i, tr: "Kontrol / Elektrik", de: "Steuerung / Elektrik" },
  { match: /BORU/i, tr: "Boru", de: "Rohr" },
  { match: /KOPUK BORU/i, tr: "Köpük Boru İzolasyonu", de: "Rohrisolierung" },
  { match: /KABLO/i, tr: "Kablo", de: "Kabel" },
  { match: /KLIMA.*AKSESUAR/i, tr: "Klima Aksesuarı", de: "Klima-Zubehör" },
  { match: /KLIMA.*DIS UNITE/i, tr: "Klima Dış Ünitesi", de: "Klima-Außengerät" },
  { match: /KLIMA.*IC UNITE/i, tr: "Klima İç Ünitesi", de: "Klima-Innengerät" },
  { match: /BUZDOLABI|VITRIN/i, tr: "Buzdolabı / Vitrin", de: "Kühlschrank / Kühlvitrine" },
  { match: /KONDANSER|KONDENSER/i, tr: "Kondenser", de: "Verflüssiger" },
  { match: /KAPI/i, tr: "Kapı", de: "Tür" },
  { match: /SOGUK ODA KAPILARI/i, tr: "Soğuk Oda Kapıları", de: "Kühlraumtüren" },
  { match: /PANEL SISTEMLERI/i, tr: "Panel Sistemleri", de: "Paneelsysteme" },
  { match: /PANEL/i, tr: "Panel", de: "Paneel" },
  { match: /POMPA/i, tr: "Pompa", de: "Pumpe" },
  { match: /PROFIL/i, tr: "Profil", de: "Profil" },
  { match: /YAPI MALZEMESI/i, tr: "Yapı Malzemesi", de: "Baumaterial" },
  { match: /KONTROL CIHAZLARI/i, tr: "Kontrol Cihazları", de: "Steuergeräte" },
];

const TR_REPLACEMENTS = [
  ["kaucuk", "kauçuk"],
  ["rezistansli", "rezistanslı"],
  ["rezistanslı", "rezistanslı"],
  ["fanli", "fanlı"],
  ["fansiz", "fansız"],
  ["siyah", "siyah"],
  ["bakir", "bakır"],
  ["izolasyonlu", "izolasyonlu"],
  ["sogutucu", "soğutucu"],
  ["sogutma", "soğutma"],
  ["buzdolabi", "buzdolabı"],
  ["tek kapi", "tek kapı"],
  ["cift kapi", "çift kapı"],
  ["ic unite", "iç ünite"],
  ["dis unite", "dış ünite"],
  ["ic", "iç"],
  ["gazli", "gazlı"],
  ["tavan tipi", "tavan tipi"],
  ["yan tip", "yan tip"],
  ["trifaze", "trifaze"],
  ["yatay", "yatay"],
  ["dikey", "dikey"],
  ["likit", "likit"],
  ["bransman", "branşman"],
  ["kumanda", "kumanda"],
  ["kablo", "kablo"],
  ["kopuk", "köpük"],
  ["yag", "yağ"],
  ["urun", "ürün"],
  ["urun tipi", "ürün tipi"],
];

const DE_REPLACEMENTS = [
  [/\btek kapı\b/gi, "eintürig"],
  [/\bçift kapı\b/gi, "zweitürig"],
  [/\bpozitif\b/gi, "positiv"],
  [/\bnegatif\b/gi, "negativ"],
  [/\bnormal dijital ekran\b/gi, "Standard-Digitalanzeige"],
  [/\bdijital ekran\b/gi, "Digitalanzeige"],
  [/\btft ekran\b/gi, "TFT-Display"],
  [/\btft ekranlı\b/gi, "mit TFT-Display"],
  [/\br290 gazlı\b/gi, "mit R290"],
  [/\bmonoblok\b/gi, "Monoblock"],
  [/\btavan tipi\b/gi, "Deckenausführung"],
  [/\byan tip\b/gi, "Seitenausführung"],
  [/\btek fanlı\b/gi, "mit einem Lüfter"],
  [/\b3 fanlı\b/gi, "mit 3 Lüftern"],
  [/\b2x400 fan\b/gi, "2x400 Lüfter"],
  [/\b1x300 fan\b/gi, "1x300 Lüfter"],
  [/\b1x450 fan\b/gi, "1x450 Lüfter"],
  [/\b2x450 fan\b/gi, "2x450 Lüfter"],
  [/\bfanlı\b/gi, "mit Lüfter"],
  [/\bfansız\b/gi, "ohne Lüfter"],
  [/\brezistanslı\b/gi, "mit Abtauheizung"],
  [/\bmotorsuz\b/gi, "ohne Motor"],
  [/\bdikey\b/gi, "vertikal"],
  [/\byatay\b/gi, "horizontal"],
  [/\blikit tankı\b/gi, "Flüssigkeitssammler"],
  [/\blikit receiver\b/gi, "Flüssigkeitssammler"],
  [/\bbranşman kiti\b/gi, "Abzweig-Kit"],
  [/\bkumanda\b/gi, "Regler"],
  [/\biç ünite\b/gi, "Innengerät"],
  [/\bdış ünite\b/gi, "Außengerät"],
  [/\bsiyah kauçuk\b/gi, "schwarzer Kautschuk"],
  [/\bbakır boru\b/gi, "Kupferrohr"],
  [/\bizolasyonlu\b/gi, "isoliert"],
  [/\borifis dahil\b/gi, "inkl. Düse"],
  [/\btrifaze\b/gi, "dreiphasig"],
  [/\bkompresör hariç\b/gi, "ohne Kompressor"],
  [/\bsadece batarya\b/gi, "nur Register"],
  [/\bkablo\b/gi, "Kabel"],
  [/\bköpük\b/gi, "Schaum"],
  [/\byağ\b/gi, "Öl"],
  [/\bürün tipi\b/gi, "Produkttyp"],
  [/\bmarka\b/gi, "Marke"],
  [/\bboru tipi\b/gi, "Rohrtyp"],
  [/\bçiftli\b/gi, "doppelt"],
  [/\btek kapı, dijital termostatlı\b/gi, "eintürig, mit Digitalthermostat"],
];

const INTERNAL_NOTE_PATTERNS = [
  /fiyat kaynagi/i,
  /tahmini alis/i,
  /tahmini alış/i,
  /tedarikci/i,
  /tedarikçi/i,
  /ithalat/i,
  /aktiflestirildi/i,
  /aktifleştirildi/i,
  /referans fiyat/i,
  /kullanici duzeltmesi/i,
  /kullanıcı düzeltmesi/i,
  /gelen fatura/i,
  /kontak fatura/i,
  /eslesen_aktif_kart/i,
  /\bid:\s*\d+/i,
  /\bkod:\s*/i,
  /\bad:\s*/i,
  /arsiv/i,
];

async function main() {
  await initDatabase();

  const rows = await query(
    `
      WITH movement_summary AS (
        SELECT item_id, SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END) AS current_stock
        FROM movements
        GROUP BY item_id
      )
      SELECT
        items.id,
        items.name,
        items.brand,
        items.category,
        items.unit,
        items.product_code AS "productCode",
        items.barcode,
        items.notes,
        COALESCE(movement_summary.current_stock, 0) AS "currentStock"
      FROM items
      LEFT JOIN movement_summary ON movement_summary.item_id = items.id
      WHERE COALESCE(items.is_active, TRUE) = TRUE
        AND COALESCE(movement_summary.current_stock, 0) > 0
      ORDER BY items.category ASC, items.brand ASC, items.name ASC
    `,
    []
  );

  const items = rows.map((row) => buildCatalogItem(row));
  const grouped = groupByCategory(items);
  const dateTag = new Date().toISOString().slice(0, 10);

  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const jsonPath = path.join(REPORT_DIR, `stok-teknik-katalog-${dateTag}-tr-de.json`);
  const mdPath = path.join(REPORT_DIR, `stok-teknik-katalog-${dateTag}-tr-de.md`);
  const htmlPath = path.join(REPORT_DIR, `stok-teknik-katalog-${dateTag}-tr-de.html`);

  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    itemCount: items.length,
    categories: Object.entries(grouped).map(([categoryKey, categoryItems]) => ({
      key: categoryKey,
      tr: categoryItems[0].categoryTr,
      de: categoryItems[0].categoryDe,
      itemCount: categoryItems.length,
    })),
    items,
  }, null, 2));

  fs.writeFileSync(mdPath, renderMarkdown(items, grouped));
  fs.writeFileSync(htmlPath, renderHtml(items, grouped));

  console.log(JSON.stringify({
    ok: true,
    itemCount: items.length,
    categoryCount: Object.keys(grouped).length,
    jsonPath,
    mdPath,
    htmlPath,
  }, null, 2));
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function buildCatalogItem(row) {
  const category = translateCategory(row.category);
  const technicalSegmentsTr = buildTechnicalSegmentsTr(row);
  const technicalSegmentsDe = technicalSegmentsTr.map((segment) => translateToGerman(segment));
  const spec = extractStructuredSpec(row, technicalSegmentsTr);

  return {
    id: Number(row.id),
    brand: String(row.brand || "").trim(),
    name: beautifyTurkish(String(row.name || "").trim()),
    categoryRaw: String(row.category || "").trim(),
    categoryTr: category.tr,
    categoryDe: category.de,
    unit: String(row.unit || "").trim(),
    unitDe: translateUnit(String(row.unit || "").trim()),
    stock: Number(row.currentStock || 0),
    productCode: String(row.productCode || "").trim(),
    barcode: String(row.barcode || "").trim(),
    customerCardTr: buildCustomerCardTr(row, spec),
    customerCardDe: buildCustomerCardDe(row, spec),
    structuredSpec: spec,
    technicalTr: technicalSegmentsTr,
    technicalDe: technicalSegmentsDe,
    noteRaw: String(row.notes || "").trim(),
  };
}

function translateCategory(category) {
  const raw = String(category || "").trim();
  for (const entry of CATEGORY_MAP) {
    if (entry.match.test(raw)) {
      return entry;
    }
  }
  return {
    tr: beautifyTurkish(raw || "Genel"),
    de: beautifyGermanFallback(raw || "Allgemein"),
  };
}

function buildTechnicalSegmentsTr(row) {
  const notes = String(row.notes || "");
  const segments = notes
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => !INTERNAL_NOTE_PATTERNS.some((pattern) => pattern.test(segment)))
    .map((segment) => beautifyTurkish(cleanLeadingLabels(segment)));

  const values = [];
  const seen = new Set();

  if (row.productCode) {
    pushUnique(values, seen, `Ürün kodu: ${row.productCode}`);
  }
  if (row.barcode) {
    pushUnique(values, seen, `Stok kodu: ${row.barcode}`);
  }
  if (segments.length === 0) {
    const derived = deriveTechnicalLineFromName(String(row.name || ""));
    if (derived) {
      pushUnique(values, seen, derived);
    }
  }

  for (const segment of segments) {
    pushUnique(values, seen, segment);
  }

  if (!values.length) {
    pushUnique(values, seen, "Teknik detay stok kartında ayrıca girilmemiş.");
  }

  return values;
}

function extractStructuredSpec(row, technicalSegmentsTr) {
  const haystack = [row.name, row.notes, ...technicalSegmentsTr].filter(Boolean).join(" | ");
  const spec = {
    refrigerant: extractFirst(haystack, /\b(R ?(?:134A|404A|449A?|448A?|407C|290|600A?|22|507A?))\b/i, (v) => v.replace(/\s+/g, "").toUpperCase()),
    application: extractApplication(haystack),
    hp: extractFirst(haystack, /(\d+(?:[.,]\d+)?(?:\/\d+)?)\s*HP\b/i, normalizeNumericText),
    watt: extractFirst(haystack, /(\d{2,5}(?:[.,]\d+)?)\s*W\b/i, normalizeNumericText),
    voltage: extractFirst(haystack, /(\d{2,4})\s*V\b/i, (v) => `${v} V`),
    phase: extractPhase(haystack),
    capacity: extractFirst(haystack, /(\d{2,5}(?:[.,]\d+)?)\s*W(?:ATT)?/i, (v) => `${normalizeNumericText(v)} W`),
    fans: extractFanInfo(haystack),
    tempRange: extractTempRange(haystack),
    model: extractModel(row, haystack),
    compressorType: extractFirst(haystack, /(Hermetik Pistonlu|Scroll|Rotary|Inverter|Monoblok)/i, sentenceCase),
  };
  return spec;
}

function buildCustomerCardTr(row, spec) {
  const lines = [];
  pushCardLine(lines, "Ürün", beautifyTurkish(row.name));
  pushCardLine(lines, "Marka", row.brand);
  pushCardLine(lines, "Model", spec.model);
  pushCardLine(lines, "Gaz", spec.refrigerant);
  pushCardLine(lines, "Kullanım tipi", spec.application);
  pushCardLine(lines, "Güç", spec.hp ? `${spec.hp} HP` : "");
  pushCardLine(lines, "Elektrik", spec.voltage);
  pushCardLine(lines, "Faz", spec.phase);
  pushCardLine(lines, "Kapasite", spec.capacity);
  pushCardLine(lines, "Fan", spec.fans);
  pushCardLine(lines, "Çalışma aralığı", spec.tempRange);
  pushCardLine(lines, "Tip", spec.compressorType);
  pushCardLine(lines, "Stok", `${Number(row.currentStock || 0)} ${row.unit || ""}`.trim());
  pushCardLine(lines, "Ürün kodu", row.productCode);
  pushCardLine(lines, "Stok kodu", row.barcode);
  return lines;
}

function buildCustomerCardDe(row, spec) {
  const lines = [];
  pushCardLine(lines, "Produkt", beautifyTurkish(row.name));
  pushCardLine(lines, "Marke", row.brand);
  pushCardLine(lines, "Modell", spec.model);
  pushCardLine(lines, "Kältemittel", spec.refrigerant);
  pushCardLine(lines, "Einsatzbereich", translateApplicationDe(spec.application));
  pushCardLine(lines, "Leistung", spec.hp ? `${spec.hp} HP` : "");
  pushCardLine(lines, "Spannung", spec.voltage);
  pushCardLine(lines, "Phase", translatePhaseDe(spec.phase));
  pushCardLine(lines, "Kapazität", spec.capacity);
  pushCardLine(lines, "Lüfter", translateFanDe(spec.fans));
  pushCardLine(lines, "Arbeitsbereich", translateTempRangeDe(spec.tempRange));
  pushCardLine(lines, "Bauart", translateCompressorTypeDe(spec.compressorType));
  pushCardLine(lines, "Lager", `${Number(row.currentStock || 0)} ${translateUnit(String(row.unit || "").trim())}`.trim());
  pushCardLine(lines, "Produktcode", row.productCode);
  pushCardLine(lines, "Lagercode", row.barcode);
  return lines;
}

function cleanLeadingLabels(text) {
  return String(text || "")
    .replace(/^Detay:\s*/i, "")
    .replace(/^Detail:\s*/i, "")
    .replace(/^Not:\s*/i, "")
    .replace(/^Model\s*/i, "Model: ")
    .replace(/^Ürün Tipi:\s*/i, "Ürün tipi: ")
    .replace(/^Urun Tipi:\s*/i, "Ürün tipi: ")
    .trim();
}

function beautifyTurkish(text) {
  let result = String(text || "");
  for (const [from, to] of TR_REPLACEMENTS) {
    result = result.replace(new RegExp(from, "gi"), to);
  }
  result = result
    .replace(/\bIc\b/g, "İç")
    .replace(/\bDis\b/g, "Dış")
    .replace(/\bSoguk\b/g, "Soğuk")
    .replace(/\bYag\b/g, "Yağ")
    .replace(/\bKaucuk\b/g, "Kauçuk")
    .replace(/\bKopuk\b/g, "Köpük")
    .replace(/\bBuzdolabi\b/g, "Buzdolabı")
    .replace(/\bCift\b/g, "Çift")
    .replace(/\bUrun\b/g, "Ürün")
    .replace(/\bUnite\b/g, "Ünite")
    .replace(/\bKiti\b/g, "Kiti");
  return sentenceCase(result);
}

function beautifyGermanFallback(text) {
  return sentenceCase(
    String(text || "")
      .replace(/SOGUTMA/gi, "Kälte")
      .replace(/KOMPRESOR/gi, "Kompressor")
      .replace(/EVAPORATOR/gi, "Verdampfer")
      .replace(/FAN/gi, "Lüfter")
      .replace(/KABLO/gi, "Kabel")
  );
}

function translateToGerman(text) {
  const raw = String(text || "").trim();
  if (/^Ürün kodu:\s*/i.test(raw)) {
    return `Produktcode: ${raw.replace(/^Ürün kodu:\s*/i, "")}`;
  }
  if (/^Stok kodu:\s*/i.test(raw)) {
    return `Lagercode: ${raw.replace(/^Stok kodu:\s*/i, "")}`;
  }
  if (/^Model:\s*/i.test(raw)) {
    return `Modell: ${raw.replace(/^Model:\s*/i, "")}`;
  }
  const source = beautifyTurkish(raw);
  let result = source;
  for (const [pattern, replacement] of DE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  result = result
    .replace(/Ürün kodu:/gi, "Produktcode:")
    .replace(/Stok kodu:/gi, "Lagercode:")
    .replace(/Model:/gi, "Modell:")
    .replace(/Ürün tipi:/gi, "Produkttyp:")
    .replace(/Bakır/gi, "Kupfer")
    .replace(/Kauçuk/gi, "Kautschuk")
    .replace(/Soğutucu gaz/gi, "Kältemittel")
    .replace(/Likit tankı/gi, "Flüssigkeitssammler")
    .replace(/Branşman/gi, "Abzweig")
    .replace(/Kumanda/gi, "Regler")
    .replace(/Yatay/gi, "Horizontal")
    .replace(/Dikey/gi, "Vertikal")
    .replace(/Yan tip/gi, "Seitenausführung")
    .replace(/Tavan tipi/gi, "Deckenausführung")
    .replace(/Marka:/gi, "Marke:")
    .replace(/Boru tipi:/gi, "Rohrtyp:")
    .replace(/1\.Boru Çapı:/gi, "1. Rohrdurchmesser:")
    .replace(/Teknik detay stok kartında ayrıca girilmemiş\./gi, "Keine zusätzlichen technischen Angaben in der Lagerkarte hinterlegt.");
  return sentenceCase(result);
}

function extractFirst(text, regex, formatter = (v) => v) {
  const match = String(text || "").match(regex);
  if (!match) {
    return "";
  }
  return formatter(String(match[1] || match[0]).trim());
}

function normalizeNumericText(value) {
  return String(value || "").replace(",", ".").trim();
}

function extractApplication(text) {
  const source = String(text || "");
  if (/\bLBP\b/i.test(source)) return "LBP";
  if (/\bMBP\b/i.test(source)) return "MBP";
  if (/\bHBP\b/i.test(source)) return "HBP";
  if (/negatif/i.test(source)) return "Negatif uygulama";
  if (/pozitif/i.test(source)) return "Pozitif uygulama";
  return "";
}

function extractPhase(text) {
  const source = String(text || "");
  if (/3\s*faz|trifaze|dreiphas/i.test(source)) return "3 faz";
  if (/monofaze|mono faz|single phase|1 faz/i.test(source)) return "1 faz";
  return "";
}

function extractFanInfo(text) {
  const source = String(text || "");
  const xFan = source.match(/(\d+X\d+)\s*FAN/i);
  if (xFan) return `${xFan[1]} fan`;
  const fanli = source.match(/(\d+)\s*FANLI/i);
  if (fanli) return `${fanli[1]} fanlı`;
  if (/tek fanli|tek fanlı/i.test(source)) return "1 fanlı";
  if (/fansiz|fansız/i.test(source)) return "Fansız";
  if (/fanli|fanlı/i.test(source)) return "Fanlı";
  return "";
}

function extractTempRange(text) {
  const source = String(text || "");
  const explicit = source.match(/([+-]?\d+(?:[.,]\d+)?)\s*°?\s*C\s*\/\s*([+-]?\d+(?:[.,]\d+)?)\s*°?\s*C/i);
  if (explicit) return `${normalizeNumericText(explicit[1])} / ${normalizeNumericText(explicit[2])} °C`;
  const explicit2 = source.match(/([+-]?\d+(?:[.,]\d+)?)\s*°?\s*C\s*-\s*([+-]?\d+(?:[.,]\d+)?)\s*°?\s*C/i);
  if (explicit2) return `${normalizeNumericText(explicit2[1])} - ${normalizeNumericText(explicit2[2])} °C`;
  return "";
}

function extractModel(row, text) {
  const fromNotes = extractFirst(text, /Model:\s*([^|]+)/i, (v) => v.trim());
  if (fromNotes) return fromNotes;
  const fromName = String(row.name || "").match(/\b([A-Z]{1,6}[A-Z0-9./-]{2,})\b/g);
  if (fromName && fromName.length) {
    return fromName[fromName.length - 1];
  }
  return "";
}

function pushCardLine(lines, label, value) {
  const clean = String(value || "").trim();
  if (!clean) return;
  lines.push({ label, value: clean });
}

function translateApplicationDe(value) {
  if (value === "Negatif uygulama") return "Negativanwendung";
  if (value === "Pozitif uygulama") return "Positivanwendung";
  return value || "";
}

function translatePhaseDe(value) {
  if (value === "3 faz") return "3-phasig";
  if (value === "1 faz") return "1-phasig";
  return value || "";
}

function translateFanDe(value) {
  return String(value || "")
    .replace(/fanlı/gi, "mit Lüfter")
    .replace(/fansız/gi, "ohne Lüfter")
    .replace(/fan/gi, "Lüfter");
}

function translateTempRangeDe(value) {
  return value || "";
}

function translateCompressorTypeDe(value) {
  return String(value || "")
    .replace(/Hermetik Pistonlu/gi, "Hermetischer Hubkolben")
    .replace(/Monoblok/gi, "Monoblock");
}

function deriveTechnicalLineFromName(name) {
  const text = beautifyTurkish(name);
  const match = text.match(/(R\d{2,4}[A-Z]?)/i);
  if (match) {
    return `Soğutucu akışkan: ${match[1].toUpperCase()}`;
  }
  return text ? `Ürün adı üzerinden tanım: ${text}` : "";
}

function groupByCategory(items) {
  return items.reduce((acc, item) => {
    const key = `${item.categoryTr}|||${item.categoryDe}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {});
}

function translateUnit(unit) {
  const value = String(unit || "").trim().toLowerCase();
  if (value === "adet") return "Stück";
  if (value === "kutu") return "Karton";
  if (value === "rulo") return "Rolle";
  if (value === "m") return "m";
  if (value === "kg") return "kg";
  if (value === "top") return "Bund";
  if (value === "koli") return "Karton";
  return unit || "-";
}

function pushUnique(values, seen, value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || seen.has(normalized)) {
    return;
  }
  seen.add(normalized);
  values.push(String(value).trim());
}

function sentenceCase(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdown(items, grouped) {
  const lines = [];
  lines.push("# Stok Teknik Katalog / Lager Technikkatalog");
  lines.push("");
  lines.push(`- Olusturma tarihi / Erstellungsdatum: ${new Date().toISOString()}`);
  lines.push(`- Toplam aktif stok kalemi / Aktive Lagerartikel: ${items.length}`);
  lines.push("");
  lines.push("## Kategori Ozeti / Kategorieübersicht");
  lines.push("");
  for (const categoryItems of Object.values(grouped)) {
    lines.push(`- ${categoryItems[0].categoryTr} / ${categoryItems[0].categoryDe}: ${categoryItems.length}`);
  }
  lines.push("");

  for (const categoryItems of Object.values(grouped)) {
    const head = categoryItems[0];
    lines.push(`## ${head.categoryTr} / ${head.categoryDe}`);
    lines.push("");
    for (const item of categoryItems) {
      lines.push(`### ${item.name}`);
      lines.push("");
      lines.push(`- Marka / Marke: ${item.brand || "-"}`);
      lines.push(`- Kategori / Kategorie: ${item.categoryTr} / ${item.categoryDe}`);
      lines.push(`- Stok / Lager: ${item.stock} ${item.unit} / ${item.stock} ${item.unitDe}`);
      lines.push(`- Ürün kodu / Produktcode: ${item.productCode || "-"}`);
      lines.push(`- Stok kodu / Lagercode: ${item.barcode || "-"}`);
      lines.push(`- Musteri bilgi karti (TR):`);
      for (const entry of item.customerCardTr) {
        lines.push(`  - ${entry.label}: ${entry.value}`);
      }
      lines.push(`- Kundenkarte (DE):`);
      for (const entry of item.customerCardDe) {
        lines.push(`  - ${entry.label}: ${entry.value}`);
      }
      lines.push(`- Teknik Bilgiler (TR):`);
      for (const segment of item.technicalTr) {
        lines.push(`  - ${segment}`);
      }
      lines.push(`- Technische Angaben (DE):`);
      for (const segment of item.technicalDe) {
        lines.push(`  - ${segment}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

function renderHtml(items, grouped) {
  const categoryCards = Object.values(grouped).map((categoryItems) => {
    const head = categoryItems[0];
    const itemCards = categoryItems.map((item) => `
      <article class="item-card">
        <div class="item-head">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.brand || "-")} · ${escapeHtml(item.categoryTr)} / ${escapeHtml(item.categoryDe)}</p>
          </div>
          <div class="stock">${escapeHtml(String(item.stock))} ${escapeHtml(item.unit)} / ${escapeHtml(item.unitDe)}</div>
        </div>
        <div class="meta-grid">
          <div><strong>Ürün kodu</strong><span>${escapeHtml(item.productCode || "-")}</span></div>
          <div><strong>Produktcode</strong><span>${escapeHtml(item.productCode || "-")}</span></div>
          <div><strong>Stok kodu</strong><span>${escapeHtml(item.barcode || "-")}</span></div>
          <div><strong>Lagercode</strong><span>${escapeHtml(item.barcode || "-")}</span></div>
        </div>
        <div class="lang-grid">
          <section>
            <h4>Müşteri Bilgi Kartı (TR)</h4>
            <ul>${item.customerCardTr.map((entry) => `<li><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}</li>`).join("")}</ul>
          </section>
          <section>
            <h4>Kundenkarte (DE)</h4>
            <ul>${item.customerCardDe.map((entry) => `<li><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}</li>`).join("")}</ul>
          </section>
        </div>
        <div class="lang-grid" style="margin-top:12px;">
          <section>
            <h4>Teknik Bilgiler (TR)</h4>
            <ul>${item.technicalTr.map((segment) => `<li>${escapeHtml(segment)}</li>`).join("")}</ul>
          </section>
          <section>
            <h4>Technische Angaben (DE)</h4>
            <ul>${item.technicalDe.map((segment) => `<li>${escapeHtml(segment)}</li>`).join("")}</ul>
          </section>
        </div>
      </article>
    `).join("");

    return `
      <section class="category-block">
        <div class="category-head">
          <h2>${escapeHtml(head.categoryTr)} / ${escapeHtml(head.categoryDe)}</h2>
          <span>${categoryItems.length} kalem / Artikel</span>
        </div>
        <div class="item-list">${itemCards}</div>
      </section>
    `;
  }).join("");

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Stok Teknik Katalog / Lager Technikkatalog</title>
  <style>
    :root {
      --bg: #f5f7fb;
      --ink: #152033;
      --muted: #5b6b83;
      --line: #dbe4f0;
      --card: #ffffff;
      --accent: #0c6d7d;
      --accent-soft: #dff4f6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(180deg, #eef4f8 0%, var(--bg) 100%);
      color: var(--ink);
      line-height: 1.45;
    }
    .page {
      width: min(1400px, calc(100% - 40px));
      margin: 28px auto 60px;
    }
    .hero {
      background: linear-gradient(135deg, #0f1f33 0%, #0c6d7d 100%);
      color: white;
      border-radius: 24px;
      padding: 28px 30px;
      box-shadow: 0 20px 60px rgba(15, 31, 51, 0.18);
    }
    .hero h1 {
      margin: 0 0 10px;
      font-size: 34px;
    }
    .hero p {
      margin: 0;
      color: rgba(255,255,255,0.84);
      max-width: 900px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin: 22px 0 28px;
    }
    .summary-card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px 18px;
    }
    .summary-card strong {
      display: block;
      font-size: 20px;
      margin-bottom: 4px;
    }
    .category-block {
      margin: 28px 0;
    }
    .category-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 14px;
    }
    .category-head h2 {
      margin: 0;
      font-size: 22px;
    }
    .category-head span {
      color: var(--muted);
      font-size: 13px;
    }
    .item-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 14px;
    }
    .item-card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 12px 30px rgba(24, 39, 75, 0.06);
    }
    .item-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .item-head h3 {
      margin: 0 0 4px;
      font-size: 18px;
    }
    .item-head p {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
    }
    .stock {
      white-space: nowrap;
      background: var(--accent-soft);
      color: var(--accent);
      padding: 8px 10px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 13px;
      height: fit-content;
    }
    .meta-grid, .lang-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 12px;
    }
    .meta-grid {
      margin-bottom: 12px;
      font-size: 13px;
    }
    .meta-grid div {
      background: #f8fbfd;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 12px;
    }
    .meta-grid strong {
      display: block;
      margin-bottom: 4px;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .lang-grid section {
      background: #fbfcfe;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px 14px;
    }
    .lang-grid h4 {
      margin: 0 0 8px;
      font-size: 14px;
    }
    .lang-grid ul {
      margin: 0;
      padding-left: 18px;
    }
    .lang-grid li + li {
      margin-top: 5px;
    }
    @media (max-width: 820px) {
      .meta-grid, .lang-grid { grid-template-columns: 1fr; }
      .item-head { flex-direction: column; }
      .page { width: min(100% - 20px, 1400px); }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <h1>Stok Teknik Katalog / Lager Technikkatalog</h1>
      <p>Bu katalog canlı stoktaki aktif ürünlerden üretildi. Teknik veriler stok kartı notları ve ürün isimlerinden derlenmiştir. Diese Übersicht wurde aus aktiven Lagerartikeln erzeugt; technische Angaben stammen aus Lagernotizen und Produktnamen.</p>
    </section>
    <section class="summary">
      <div class="summary-card"><strong>${items.length}</strong><span>Toplam kalem / Gesamtartikel</span></div>
      <div class="summary-card"><strong>${Object.keys(grouped).length}</strong><span>Kategori / Kategorien</span></div>
      <div class="summary-card"><strong>${new Date().toLocaleString("tr-TR")}</strong><span>Olusturma / Erstellt</span></div>
    </section>
    ${categoryCards}
  </main>
</body>
</html>`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
