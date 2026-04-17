const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = "/Users/anilakbas/Desktop/Hamburg depo stok programı ";
const sharedCatalogPath = path.join(root, "public/shared-admin-catalog.json");
const materialCatalogPath = path.join(
  root,
  "admin-tools/coldroompro-source/src/materialCatalog.js",
);
const reportsDir = path.join(root, "data/reports");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function parseMaterialCatalog(file) {
  const source = fs.readFileSync(file, "utf8");
  const transformed = source.replace(/export const /g, "const ");
  const wrapped = `${transformed}\nmodule.exports = { MATERIALS, PIPE_CATALOG, INSULATION_CATALOG };`;
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(wrapped, sandbox, { filename: file, timeout: 15000 });
  return sandbox.module.exports;
}

function sharedCatalogArray(raw) {
  if (Array.isArray(raw)) return raw;
  return raw.items || raw.products || Object.values(raw).find(Array.isArray) || [];
}

function buildLookup(items) {
  const byKey = new Map();
  for (const item of items) {
    const keys = new Set([
      normalize(item.name),
      normalize(item.productCode),
      normalize(item.barcode),
      normalize(item.code),
      ...((item.codes || []).map(normalize)),
    ]);
    for (const key of keys) {
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, item);
    }
  }
  return byKey;
}

const CATEGORY_PARTIAL_HINTS = [
  "aksesuarlarmontaj",
  "aracklimasarzvanasi",
  "aydinlatmaopsiyonlari",
  "bakirbaglantielemanlari",
  "bakirborular",
  "bakirkurutucufiltreler",
  "basinckontrolpresostatlar",
  "basinckontrol",
  "beyazesyayedekparcalari",
  "borumakaslari",
  "borusisirme",
  "dijitalgazterazileri",
  "dikeytipbuzdolaplari",
  "elektrikmalzemeleri",
  "elektrikkontrol",
  "endustriyelsplitdisunite",
  "endustriyelspliticunite",
  "evaporatorler",
  "expansionvalfler",
  "fanmotorlari",
  "fanlarmotorlar",
  "fanhizkontroller",
  "genlesmevanalari",
  "gozetlemecamlari",
  "hermetikkompresorler",
  "izolasyonlarvebantlar",
  "izolasyonconta",
  "kimyasalurunler",
  "klimayedekparcalari",
  "kompresorler",
  "kondenserler",
  "kureselvana",
  "manifoldlar",
  "mikrokanallikondenserler",
  "servisekipmanlariveelaletleri",
  "sogukodaaksesuarlari",
  "sogukodakontrolcihazlari",
  "sogutmagrubu",
  "sogutmamalzemeleri",
  "sogutucuakiskanlar",
  "sogutmaaletleri",
  "solenoidvalfler",
  "termik",
  "termostatvetermometreler",
  "transmitter",
  "vanalarveregulatorler",
];

function inferStatus(item, rich) {
  const text = [item.name, item.category, item.brand, item.productCode, item.barcode]
    .filter(Boolean)
    .join(" ");
  const technicalSignals = [
    /\b(r\d{2,4}[a-z]?)\b/i,
    /\b\d+(\.\d+)?\s?(w|kw|hp|v|hz|mm|cm|m2|kg|lt|l)\b/i,
    /\b(1\/4|3\/8|1\/2|5\/8|3 faz|trifaze|mono|ntc|odf|solder|flare)\b/i,
  ];

  const strongRich =
    rich &&
    rich.specs &&
    Object.values(rich.specs).filter((v) => String(v || "").trim()).length >= 4;
  if (strongRich) return "hazir";

  const derived = deriveNameSummary(item).parts;
  if (derived.length >= 2) return "kismi";

  const normCategory = normalize(item.category);
  if (
    derived.length >= 1 &&
    CATEGORY_PARTIAL_HINTS.some((hint) => normCategory.includes(hint))
  ) {
    return "kismi";
  }

  const hitCount = technicalSignals.filter((re) => re.test(text)).length;
  if (hitCount >= 2) return "kismi";

  const specialCats = [
    "servis ekipmanlari ve el aletleri",
    "kimyasal urunler",
    "soguk oda aksesuarlari",
    "elektrik malzemeleri",
  ];
  if (specialCats.includes(normalize(item.category))) return "ozel_urun";

  return "teyit_gerekli";
}

function deriveNameSummary(item) {
  const name = item.name || "";
  const category = item.category || "";
  const parts = [];
  const add = (label, value) => {
    if (value) parts.push(`${label}: ${value}`);
  };

  const modelCode = name.match(/\b([0-9]{3}[A-Z]?[0-9]{0,4}|[0-9]{2,3}[A-Z][0-9]{3,6}|DCL\s?\d+[A-Z]?|DML\s?\d+[A-Z]?|DMB\s?\d+[A-Z]?|TES?\s?\d+|EVR\s?\d+)\b/i);
  const size = name.match(/(\d+(?:[.,]\d+)?\s?(?:mm|cm|m2|kg|l|lt|w|kw|hp))/i);
  const conn = name.match(/(1\/4"|3\/8"|1\/2"|5\/8"|3\/4"|7\/8"|1\s?1\/8"|6mm|10mm|12mm|16 mm|16mm)/i);
  const ref = name.match(/\b(R\d{2,4}[A-Z]?(?:\/R\d{2,4}[A-Z]?)*)\b/i);
  const fan = name.match(/(\d+x\d+\s?fan|\d+\s?fanlı|fansız|motorsuz)/i);
  const pressureRange = name.match(/(\d+(?:[.,]\d+)?\s*\*?\s*\d+(?:[.,]\d+)?\s*Bar)/i);

  const normBrand = normalize(item.brand);
  const normCategory = normalize(category);

  if (normBrand === "danfoss") {
    add("Marka", "Danfoss");
    if (/dcl/i.test(name)) add("Tip", "katı çekirdek filtre");
    if (/dml/i.test(name)) add("Tip", "moleküler elek filtre");
    if (/dmb/i.test(name)) add("Tip", "çift yönlü filtre");
    if (/dcb/i.test(name)) add("Tip", "çift yönlü filtre");
    if (/evr/i.test(name)) add("Tip", "solenoid valf");
    if (/\bkp\b/i.test(name)) add("Tip", "basınç şalteri");
    if (/\bkpe\b/i.test(name)) add("Tip", "elektronik basınç şalteri");
    if (/te|txv|expansion|genlesme/i.test(name) || normalize(category).includes("expansion")) add("Tip", "genleşme valfi");
    if (/nrv/i.test(name)) add("Tip", "çek valf");
    if (/dcl|dml|dmb|dcb/i.test(name)) add("Gaz", "geniş HFC/HFO uyumu");
  }

  if (normBrand === "castel") {
    add("Marka", "Castel");
    if (/solenoid/i.test(name)) add("Tip", "solenoid valf");
    if (/expansion|genlesme/i.test(name) || normCategory.includes("genlesme")) add("Tip", "genleşme valfi");
    if (/shut-?off|ball valve|vana/i.test(name) || normCategory.includes("vana")) add("Tip", "vana");
    add("Gaz", "HFC/HFO uyumlu seri");
  }

  if (normBrand === "carel") {
    add("Marka", "Carel");
    add("Tip", "elektronik kontrolör");
    add("Kullanim", "soğutma otomasyonu");
    if (/ir33/i.test(name)) add("Seri", "ir33");
  }

  if (normBrand === "dixell") {
    add("Marka", "Dixell");
    add("Tip", "elektronik kontrolör");
    add("Kullanim", "soğutma kontrolü");
    if (/\bxr\b/i.test(name)) add("Seri", "XR");
  }

  if (normBrand === "sanhua") {
    add("Marka", "Sanhua");
    if (/syj/i.test(name)) add("Tip", "gözetleme camı");
    else if (/valf|valve/i.test(name)) add("Tip", "valf");
  }

  if (normBrand === "systemair") {
    add("Marka", "Systemair");
    if (/sysvrf|vrf/i.test(name)) add("Tip", "VRF ekipmanı");
  }

  if (normBrand === "thermotrick") {
    add("Marka", "Thermotrick");
    add("Tip", "bakır bağlantı elemanı");
  }

  if (normBrand === "olab") {
    add("Marka", "Olab");
    add("Tip", "bakır bağlantı elemanı");
  }

  if (normBrand === "ebmpapst") {
    add("Marka", "ebm-papst");
    add("Tip", "fan / fan motoru");
  }

  if (normBrand === "olefini") {
    add("Marka", "Olefini");
    add("Tip", "hava perdesi");
  }

  if (["value","refco","rothenberger","wipcool"].includes(normBrand)) {
    add("Tip", "servis ekipmanı");
  }

  if (["schneider","siemens","abb","hyundai","entes","enda","bitzer"].includes(normBrand) && normCategory.includes("elektrikmalzemeleri")) {
    add("Tip", "elektrik ekipmanı");
  }

  if (normBrand === "frigocraft") {
    if (/split|ic un|iç ün|dis un|dış ünite/i.test(name)) add("Tip", "split soğutma ekipmanı");
    add("Seri", "FrigoCraft industrial split");
  }

  if (normBrand === "gunay") {
    if (/gna|gnd|gne|gni|gnp|gns|gnky|gnkf/i.test(name)) add("Tip", "evaporatör / soğutucu");
    if (/gbox|gzbox|gbbox|gebox|gmbox|gybox|gdbox|gk /i.test(name)) add("Tip", "kondenser / dış ünite");
  }

  if (normBrand === "bitzer") {
    if (/rota|rotalock|adapter|adapt[oö]r|vana/i.test(name)) add("Tip", "kompresör bağlantı aksesuarı");
    else add("Tip", "kompresör aksesuarı");
  }

  if (normBrand === "gvn" || normBrand === "gvnguven") {
    if (/vlr|hlr|receiver|likit/i.test(name)) add("Tip", "likit tankı / receiver");
    else add("Tip", "soğutma komponenti");
  }

  if (normBrand === "hongsen") {
    add("Tip", "vana / sibop");
  }

  if (normBrand === "blue") {
    add("Tip", "soğutma komponenti");
  }

  if (normBrand === "resideo" || normBrand === "honeywell") {
    add("Tip", "kontrol / otomasyon bileşeni");
  }

  if (normBrand === "coolmount" || normBrand === "coldflex" || normBrand === "pvc") {
    add("Tip", "montaj / izolasyon aksesuarı");
  }

  if (normBrand === "qaem" || normBrand === "halcor") {
    add("Tip", "bakır boru");
  }

  if (/weiguang|yzf|gzf/i.test(name)) add("Tip", "fan motoru");
  if (/kondansat[oö]r|capacitor/i.test(name)) add("Tip", "kondansatör");
  if (/sarj vanasi|şarj vanası/i.test(name)) add("Tip", "araç klima şarj vanası");
  if (/maxipro|press fitting|pressfit/i.test(name)) add("Tip", "press bağlantı elemanı");
  if (/mp ?55/i.test(name)) add("Tip", "yağ basınç kontrolü");
  if (/\baks\b/i.test(name)) add("Tip", "transmitter / sensör");
  if (/\bkp\b/i.test(name) && !parts.some((p) => p.startsWith("Tip:"))) add("Tip", "presostat");
  if (/\bir33\b/i.test(name) && !parts.some((p) => p.startsWith("Tip:"))) add("Tip", "elektronik kontrolör");
  if (/\bxr\d+/i.test(name) && !parts.some((p) => p.startsWith("Tip:"))) add("Tip", "elektronik kontrolör");
  if (/presostat|protestat|pressure switch|basinc switch|basınç switch/i.test(name) && !parts.some((p) => p.startsWith("Tip:"))) add("Tip", "presostat");
  if (/kontaktor/i.test(name)) add("Tip", "kontaktör");
  if (/yardimci kontak|yardımcı kontak/i.test(name)) add("Tip", "yardımcı kontak");
  if (/motor koruma/i.test(name)) add("Tip", "motor koruma şalteri / rölesi");
  if (/koruma rolesi|koruma rölesi|termik role|termik röle/i.test(name)) add("Tip", "koruma rölesi");
  if (/door switch|kapi switch|kapı switch|kapı swichi/i.test(name)) add("Tip", "kapı switch");
  if (/faze? yon|faz yön|faz koruma/i.test(name)) add("Tip", "faz koruma cihazı");
  if (/flow switch|akis anahtari|akış anahtarı/i.test(name)) add("Tip", "akış şalteri");
  if (/manuel reset/i.test(name)) add("Reset", "manuel");
  if (/otomatik reset/i.test(name)) add("Reset", "otomatik");
  if (/dryer|filtre|filter/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "filtre/dryer");
  if (/servis valfi|service valve|valf/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "valf");
  if (/sight|gozetleme/i.test(name)) add("Tip", "gözetleme camı");
  if (/kompres/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "kompresör");
  if (/evapor/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "evaporatör");
  if (/kondanser|kondenser/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "kondenser");
  if (/rotalock|adapt[oö]r|union|ünyon|dirsek|m[aâ]n[şs]on|reduksiyon|tee|subap|tapa|press fitings|kelep[çc]e/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "bağlantı elemanı");
  if (/bak[iı]r/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "bakır bağlantı elemanı");
  if (/hava perdesi/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "hava perdesi");
  if (/servis seti|manifold|vacuum|vakum|pompa|hortum seti|sarj hortumu|şarj hortumu|gaz sarj/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "servis ekipmanı");
  if (/izolasyon|bant/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "izolasyon malzemesi");
  if (/split/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "split soğutma ekipmanı");
  if (/fan motoru|devir fan motoru|axial fan/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "fan motoru");
  if (/dikey buzdolabi|tek kapi|cift kapi|monoblok/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "ticari buzdolabı");
  if (/kurutucu filtre/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "kurutucu filtre");
  if (/likit tank|receiver/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "likit receiver");
  if (/kaynak teli|flux|dekapan/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "kaynak sarfı");
  if (/gaz terazisi/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "dijital gaz terazisi");
  if (/boru makasi|boru makası|sisirme aleti|şişirme aleti/i.test(name) && !parts.some((p) => p.includes("Tip"))) add("Tip", "boru işleme aleti");

  add("Model", modelCode && modelCode[1]);
  add("Gaz", ref && ref[1]);
  add("Bağlantı", conn && conn[1]);
  add("Ölçü", size && size[1]);
  add("Fan", fan && fan[1]);
  add("Basınç", pressureRange && pressureRange[1].replace(/\s+/g, " "));

  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("elektronikkontrolorler")) {
    add("Tip", "elektronik kontrolör");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("termostatvetermometreler")) {
    add("Tip", "termostat / termometre");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("basinckontrolpresostatlar")) {
    add("Tip", "presostat");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("transmitter")) {
    add("Tip", "transmitter");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("celikkurutucufiltreler")) {
    add("Tip", "çelik kurutucu filtre");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("solenoidvalfler")) {
    add("Tip", "solenoid valf");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("gozetlemecamlari")) {
    add("Tip", "gözetleme camı");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("fanmotorlari")) {
    add("Tip", "fan motoru");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("axialfanlar")) {
    add("Tip", "aksiyal fan / fan motoru");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("bakirbaglantielemanlari")) {
    add("Tip", "bakır bağlantı elemanı");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("bakirkurutucufiltreler")) {
    add("Tip", "bakır kurutucu filtre");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("borumakaslari")) {
    add("Tip", "boru makası / servis aleti");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("borusisirme")) {
    add("Tip", "boru şişirme aleti");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("dijitalgazterazileri")) {
    add("Tip", "dijital gaz terazisi");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("drenajpompasi")) {
    add("Tip", "drenaj pompası");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("dikeytipbuzdolaplari")) {
    add("Tip", "dikey tip buzdolabı");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("aydinlatmaopsiyonlari")) {
    add("Tip", "aydınlatma opsiyonu");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("digergazlar")) {
    add("Tip", "soğutucu gaz");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("aksesuarlarmontaj")) {
    add("Tip", "montaj aksesuarı");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("aluminyumkaynakteli")) {
    add("Tip", "alüminyum kaynak teli");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("dekapanflux")) {
    add("Tip", "dekapan / flux");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("elektrikkontrol")) {
    add("Tip", "elektrik / kontrol bileşeni");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("kompresorler")) {
    add("Tip", "kompresör");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("endustriyelsplitdisunite")) {
    add("Tip", "endüstriyel split dış ünite");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("endustriyelspliticunite")) {
    add("Tip", "endüstriyel split iç ünite");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("vanalarveregulatorler")) {
    add("Tip", "vana / regülatör");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("klimayedekparcalari")) {
    add("Tip", "klima yedek parçası");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("kimyasalurunler")) {
    add("Tip", "kimyasal ürün");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("sogukodaaksesuarlari")) {
    add("Tip", "soğuk oda aksesuarı");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("mikrokanallikondenserler")) {
    add("Tip", "mikro kanallı kondenser");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("fanhizkontroller")) {
    add("Tip", "fan hız kontrolü");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("hermetikkompresorler")) {
    add("Tip", "hermetik kompresör");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("termik")) {
    add("Tip", "termik koruma");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("kureselvana")) {
    add("Tip", "küresel vana");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("manifoldlar")) {
    add("Tip", "manifold");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("sogutmaaletleri")) {
    add("Tip", "soğutma servis aleti");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("sogutmamalzemeleri")) {
    add("Tip", "soğutma malzemesi");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("aracklimasarzvanasi")) {
    add("Tip", "araç klima şarj vanası");
  }
  if (!parts.some((p) => p.startsWith("Tip:")) && normCategory.includes("bakirborular")) {
    add("Tip", "bakır boru");
  }

  if (!parts.length && normCategory.includes("sogutucuakiskanlar")) {
    add("Tip", "soğutucu akışkan");
    add("Gaz", ref && ref[1]);
  }

  return { parts };
}

function buildSummaryLine(item, rich, status) {
  const specs = rich?.specs || {};
  const parts = [];
  const push = (label, value) => {
    if (value) parts.push(`${label}: ${value}`);
  };
  push("Gaz", specs.refrigerant);
  push("Guc", specs.hpower || specs.cooling_capacity_watt);
  push("Voltaj", specs.power_supply);
  push("Tip", specs.compressor_type || specs.application);
  push("Model", specs.compressor_model || specs.product_model);
  if (!parts.length) {
    const derived = deriveNameSummary(item).parts;
    parts.push(...derived);
  }
  if (!parts.length && status === "kismi") {
    push("Kart", "urun adinda kismi teknik isaretler var");
  }
  if (!parts.length && status === "ozel_urun") {
    push("Kart", "ozel/yardimci urun");
  }
  if (!parts.length) {
    push("Kart", "teyit gerekli");
  }
  return parts.join(" | ");
}

function toCsvRow(values) {
  return values
    .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
    .join(",");
}

const shared = sharedCatalogArray(readJson(sharedCatalogPath));
const materials = parseMaterialCatalog(materialCatalogPath);
const richItems = [
  ...(materials.MATERIALS || []),
  ...(materials.PIPE_CATALOG || []),
  ...(materials.INSULATION_CATALOG || []),
];
const lookup = buildLookup(richItems);

const rows = shared.map((item) => {
  const keys = [
    normalize(item.productCode),
    normalize(item.barcode),
    normalize(item.name),
    ...((item.codes || []).map(normalize)),
  ].filter(Boolean);
  let rich = null;
  for (const key of keys) {
    if (lookup.has(key)) {
      rich = lookup.get(key);
      break;
    }
  }
  const status = inferStatus(item, rich);
  return {
    name: item.name || "",
    brand: item.brand || "",
    category: item.category || "",
    unit: item.unit || "",
    productCode: item.productCode || "",
    barcode: item.barcode || "",
    visiblePrice: item.visiblePrice ?? "",
    technicalStatus: status,
    technicalSummary: buildSummaryLine(item, rich, status),
    source: rich ? "zengin_katalog_eslesmesi" : "genel_katalog_heuristic",
  };
});

const counts = rows.reduce((acc, row) => {
  acc[row.technicalStatus] = (acc[row.technicalStatus] || 0) + 1;
  return acc;
}, {});

rows.sort((a, b) => {
  if (a.category !== b.category) return a.category.localeCompare(b.category, "tr");
  if (a.brand !== b.brand) return a.brand.localeCompare(b.brand, "tr");
  return a.name.localeCompare(b.name, "tr");
});

fs.mkdirSync(reportsDir, { recursive: true });

const jsonPath = path.join(reportsDir, "master-teknik-envanter-2026-04-17.json");
const csvPath = path.join(reportsDir, "master-teknik-envanter-2026-04-17.csv");
const mdPath = path.join(reportsDir, "master-teknik-envanter-ozet-2026-04-17.md");

fs.writeFileSync(
  jsonPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      total: rows.length,
      counts,
      rows,
    },
    null,
    2,
  ),
);

const csvHeader = [
  "name",
  "brand",
  "category",
  "unit",
  "productCode",
  "barcode",
  "visiblePrice",
  "technicalStatus",
  "technicalSummary",
  "source",
];
const csv = [toCsvRow(csvHeader), ...rows.map((row) => toCsvRow(csvHeader.map((k) => row[k])))].join("\n");
fs.writeFileSync(csvPath, csv);

const topReady = rows.filter((r) => r.technicalStatus === "hazir").slice(0, 40);
const topPartial = rows.filter((r) => r.technicalStatus === "kismi").slice(0, 40);
const topVerify = rows.filter((r) => r.technicalStatus === "teyit_gerekli").slice(0, 40);

const md = [
  "# Master Teknik Envanter Ozeti",
  "",
  `Toplam kart: ${rows.length}`,
  "",
  "## Durum Dagilimi",
  "",
  `- Hazir: ${counts.hazir || 0}`,
  `- Kismi: ${counts.kismi || 0}`,
  `- Ozel urun: ${counts.ozel_urun || 0}`,
  `- Teyit gerekli: ${counts.teyit_gerekli || 0}`,
  "",
  "## Hazir Ornekleri",
  "",
  ...topReady.map((r) => `- ${r.name} | ${r.brand} | ${r.technicalSummary}`),
  "",
  "## Kismi Ornekleri",
  "",
  ...topPartial.map((r) => `- ${r.name} | ${r.brand} | ${r.technicalSummary}`),
  "",
  "## Teyit Gerekli Ornekleri",
  "",
  ...topVerify.map((r) => `- ${r.name} | ${r.brand} | ${r.category}`),
  "",
].join("\n");
fs.writeFileSync(mdPath, md);

console.log(JSON.stringify({ total: rows.length, counts, jsonPath, csvPath, mdPath }, null, 2));
