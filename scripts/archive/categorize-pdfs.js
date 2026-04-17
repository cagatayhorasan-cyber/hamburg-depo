const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const root = "/Users/anilakbas/Desktop/Hamburg depo stok programı ";
const reportsDir = path.join(root, "data/reports");
const inputPath = path.join(reportsDir, "kullanici-pdf-listesi-2026-04-17.txt");
const outJson = path.join(reportsDir, "kullanici-pdf-kategorileri-2026-04-17.json");
const outCsv = path.join(reportsDir, "kullanici-pdf-kategorileri-2026-04-17.csv");
const outMd = path.join(reportsDir, "kullanici-pdf-kategorileri-ozet-2026-04-17.md");

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s./_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(text, length = 240) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, length);
}

function pdfText(file) {
  try {
    return cp.execFileSync(
      "/opt/homebrew/bin/pdftotext",
      ["-f", "1", "-l", "1", "-nopgbrk", file, "-"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 1024 * 1024 * 8,
        timeout: 2500,
      },
    );
  } catch {
    return "";
  }
}

function detectLanguage(text) {
  const norm = normalize(text);
  const deHits = [
    "rechnung", "angebot", "kontoauszug", "kundennummer", "zahlungs", "steuernummer",
    "lieferschein", "ust", "betrag", "bank", "kontoinhaber",
  ].filter((token) => norm.includes(token)).length;
  const trHits = [
    "teklif", "fatura", "urun", "ürün", "miktar", "birim fiyat", "adet", "stok",
    "satis", "satış", "sevkiyat", "irsaliye",
  ].filter((token) => norm.includes(token)).length;
  const enHits = [
    "invoice", "quotation", "catalogue", "catalog", "price list", "technical", "datasheet",
  ].filter((token) => norm.includes(token)).length;
  if (deHits >= trHits && deHits >= enHits && deHits > 0) return "DE";
  if (trHits >= deHits && trHits >= enHits && trHits > 0) return "TR";
  if (enHits > 0) return "EN";
  return "Belirsiz";
}

function categorize(file, text) {
  const name = path.basename(file);
  const haystack = `${name}\n${text}`;
  const norm = normalize(haystack);

  const has = (...tokens) => tokens.some((token) => norm.includes(normalize(token)));

  if (has("kontoauszug", "kt bank", "hesap özeti", "hesap ozeti")) {
    return {
      category: "Finans / Banka",
      subcategory: has("dekont") ? "Dekont" : "Hesap Özeti / Kontoauszug",
    };
  }
  if (has("dekont", "havale", "transfer")) {
    return {
      category: "Finans / Banka",
      subcategory: "Dekont / Transfer",
    };
  }
  if (has("rechnung", "invoice", "fatura")) {
    if (has("proforma")) {
      return {
        category: "Ticari Belge",
        subcategory: "Proforma Fatura",
      };
    }
    return {
      category: "Ticari Belge",
      subcategory: "Fatura",
    };
  }
  if (has("angebot", "teklif", "quotation", "özel teklif", "ozel teklif")) {
    return {
      category: "Ticari Belge",
      subcategory: "Teklif / Angebot",
    };
  }
  if (has("sipariş", "siparis", "purchase order", "bestellung")) {
    return {
      category: "Ticari Belge",
      subcategory: "Sipariş / Bestellung",
    };
  }
  if (has("irsaliye", "lieferschein", "sevk", "sevkiyat")) {
    return {
      category: "Ticari Belge",
      subcategory: "İrsaliye / Sevk",
    };
  }
  if (has("catalogue", "catalog", "brochure", "brosur", "broşür", "katalog", "prospekt")) {
    return {
      category: "Ürün Dokümanı",
      subcategory: "Katalog / Broşür",
    };
  }
  if (has("aboutus", "about us", "peyk", "kurulum yonergesi", "kurulum yönergesi")) {
    return {
      category: "Ürün Dokümanı",
      subcategory: "Kurumsal / Sistem Dokümanı",
    };
  }
  if (has("price list", "fiyat listesi", "preisliste")) {
    return {
      category: "Ürün Dokümanı",
      subcategory: "Fiyat Listesi",
    };
  }
  if (
    has("datasheet", "data sheet", "teknik", "technical", "manual", "kullanma kilavuzu", "kullanma kılavuzu") ||
    /\b(dcb|dcl|dkh|doc|gtc|mtc|oc)\d+/i.test(name) ||
    /\b(dcb|dcl|dkh|doc|gtc|mtc|oc)\d+/i.test(norm) ||
    /\b(english|turkish)\b/i.test(name) ||
    /mb-[a-z0-9]/i.test(name) ||
    /caj|fh|tag|neu|njx|eme|ff\s?8\.?5/i.test(norm)
  ) {
    return {
      category: "Ürün Dokümanı",
      subcategory: "Teknik Doküman / Datasheet",
    };
  }
  if (has("stok", "stock", "lager", "miktar birim")) {
    return {
      category: "Stok / Liste",
      subcategory: "Stok Listesi",
    };
  }
  if (has("rapor", "report", "analysis", "analiz")) {
    return {
      category: "Rapor",
      subcategory: "Analiz / Rapor",
    };
  }

  return {
    category: "Diğer",
    subcategory: "Manuel İnceleme",
  };
}

function supplierHint(file, text) {
  const norm = normalize(`${path.basename(file)} ${text}`);
  const known = [
    "azak", "akf", "drc", "kontak", "mespan", "ibs", "electrosan", "gunay",
    "frigo", "systemair", "embraco", "kt bank", "burak", "dogan durmaz",
  ];
  for (const item of known) {
    if (norm.includes(item)) return item;
  }
  return "";
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function toCsvRow(values) {
  return values.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",");
}

const files = fs
  .readFileSync(inputPath, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

const rows = files.map((file) => {
  const text = pdfText(file);
  const category = categorize(file, text);
  const preview = excerpt(text);
  const language = detectLanguage(text || path.basename(file));
  const folder = path.dirname(file).replace("/Users/anilakbas/", "");
  return {
    file,
    folder,
    filename: path.basename(file),
    category: category.category,
    subcategory: category.subcategory,
    supplierHint: supplierHint(file, text),
    language,
    textPreview: preview,
  };
});

rows.sort((a, b) => {
  if (a.category !== b.category) return a.category.localeCompare(b.category, "tr");
  if (a.subcategory !== b.subcategory) return a.subcategory.localeCompare(b.subcategory, "tr");
  return a.filename.localeCompare(b.filename, "tr");
});

const categoryCounts = {};
const subcategoryCounts = {};
for (const row of rows) {
  categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1;
  const key = `${row.category} / ${row.subcategory}`;
  subcategoryCounts[key] = (subcategoryCounts[key] || 0) + 1;
}

fs.mkdirSync(reportsDir, { recursive: true });
fs.writeFileSync(
  outJson,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      total: rows.length,
      categoryCounts,
      subcategoryCounts,
      rows,
    },
    null,
    2,
  ),
);

const csvColumns = [
  "category",
  "subcategory",
  "language",
  "supplierHint",
  "folder",
  "filename",
  "file",
  "textPreview",
];
fs.writeFileSync(
  outCsv,
  [toCsvRow(csvColumns), ...rows.map((row) => toCsvRow(csvColumns.map((key) => row[key])))].join("\n"),
);

const md = [
  "# Kullanici PDF Kategori Ozeti",
  "",
  `Toplam PDF: ${rows.length}`,
  "",
  "## Ana Kategoriler",
  "",
  ...Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `- ${key}: ${value}`),
  "",
  "## Alt Kategoriler",
  "",
  ...Object.entries(subcategoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([key, value]) => `- ${key}: ${value}`),
  "",
  "## Ornekler",
  "",
  ...rows.slice(0, 40).map((row) => `- [${row.category}] ${row.filename} | ${row.language} | ${row.textPreview}`),
  "",
].join("\n");
fs.writeFileSync(outMd, md);

console.log(
  JSON.stringify(
    {
      total: rows.length,
      categoryCounts,
      outJson,
      outCsv,
      outMd,
    },
    null,
    2,
  ),
);
