const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));
if (process.env.FORCE_SQLITE === "1") {
  delete process.env.DATABASE_URL;
}

const { dbClient, initDatabase, get, query, withTransaction } = require("../server/db");

const TRAINING_TOPIC = "DRC MAN Urun Egitimi";
const PRODUCT_FAQ_SOURCE_SUMMARY = "DRC MAN urun egitimi";
const PRODUCT_QUESTION_COUNT = 5;
const TRAINING_INSERT_BATCH_SIZE = 240;
const EXPORT_DIR = path.join(process.cwd(), ".codex_tmp", "drc_man_product_training");
const PRODUCT_JSON_PATH = path.join(EXPORT_DIR, "drc_man_products.json");
const KNOWLEDGE_MD_PATH = path.join(EXPORT_DIR, "hamburg_urun_egitimi.md");
const PRODUCT_FAQ_PATH = path.join(EXPORT_DIR, "drc_man_product_faq.json");
const STATIC_PRODUCT_FAQ_PATH = path.join(process.cwd(), "scripts", "drc_man_product_faq.json");
const STATIC_PRODUCT_FAQ_PART_PATHS = [
  path.join(process.cwd(), "scripts", "drc_man_product_faq.part1.json"),
  path.join(process.cwd(), "scripts", "drc_man_product_faq.part2.json"),
];

const MARKET_NOTES = [
  {
    test: (item) => hasAny(item, ["SYSVRF2 260", "319125"]),
    tr: "Internet karsilastirmasi: Systemair SYSVRF2 260 AIR EVO icin EUR5.856,50 net fiyat goruldu; program fiyati dogru bantta.",
    de: "Internetvergleich: Fuer Systemair SYSVRF2 260 AIR EVO wurde ca. 5.856,50 EUR netto gesehen; der Programmpreis liegt im richtigen Band.",
  },
  {
    test: (item) => hasAny(item, ["WALL 28", "455458"]),
    tr: "Internet karsilastirmasi: WALL 28 Q icin EUR549,95 net fiyat goruldu; program fiyati dogru bantta.",
    de: "Internetvergleich: WALL 28 Q wurde bei ca. 549,95 EUR netto gesehen; der Programmpreis passt.",
  },
  {
    test: (item) => hasAny(item, ["WALL 56", "455461"]),
    tr: "Internet karsilastirmasi: WALL 56 Q icin yaklasik EUR689,35 net fiyat goruldu; mevcut fiyat dusuk kalirsa satis oncesi admin kontrolu gerekir.",
    de: "Internetvergleich: WALL 56 Q wurde bei ca. 689,35 EUR netto gesehen; der aktuelle Preis sollte vor Verkauf vom Admin geprueft werden.",
  },
  {
    test: (item) => hasAny(item, ["WALL 71", "469544"]),
    tr: "Internet karsilastirmasi: WALL 71 Q icin yaklasik EUR729,30 net fiyat goruldu; mevcut fiyat dusuk kalirsa satis oncesi admin kontrolu gerekir.",
    de: "Internetvergleich: WALL 71 Q wurde bei ca. 729,30 EUR netto gesehen; der aktuelle Preis sollte vor Verkauf vom Admin geprueft werden.",
  },
  {
    test: (item) => hasAny(item, ["UNEU2168U"]),
    tr: "Internet karsilastirmasi: UNEU2168U komple kondenser unitesi olarak yaklasik EUR594,41 goruldu; urun kompresor mu komple unite mi diye satis oncesi teyit et.",
    de: "Internetvergleich: UNEU2168U wurde als komplette Verfluessigereinheit bei ca. 594,41 EUR gesehen; vor Verkauf klaeren, ob es Kompressor oder komplette Einheit ist.",
  },
  {
    test: (item) => hasAny(item, ["RFKH022"]),
    tr: "Internet karsilastirmasi: Sanhua RFKH022 icin yaklasik EUR69,90 net goruldu; EUR70-79 bandi daha guvenli satis bandidir.",
    de: "Internetvergleich: Sanhua RFKH022 wurde bei ca. 69,90 EUR netto gesehen; 70-79 EUR ist ein sichereres Verkaufsband.",
  },
  {
    test: (item) => hasAny(item, ["SERVIS-VALFI-SANHUA", "Servis Valfi Sanhua"]),
    tr: "Internet karsilastirmasi: Sanhua servis valfi 1/4-3/8 icin EUR4,71 baslayan fiyat goruldu; Almanya satisinda EUR5-6 bandi daha saglikli olur.",
    de: "Internetvergleich: Sanhua Serviceventile 1/4-3/8 starten um ca. 4,71 EUR; fuer Deutschland ist 5-6 EUR gesuender.",
  },
  {
    test: (item) => hasAny(item, ["YZF10-20"]),
    tr: "Internet karsilastirmasi: Weiguang YZF10-20 Avrupa piyasasinda yaklasik EUR20-35, Turkiye tarafinda EUR10-13 bandinda; Almanya satisinda mevcut fiyat dusuk kalabilir.",
    de: "Internetvergleich: Weiguang YZF10-20 liegt in Europa ca. bei 20-35 EUR, in der Tuerkei ca. 10-13 EUR; der aktuelle Preis kann in Deutschland niedrig sein.",
  },
  {
    test: (item) => hasAny(item, ["YZF25-40"]),
    tr: "Internet karsilastirmasi: Weiguang YZF25-40 icin Avrupa bandi yaklasik EUR19,99-29,43; mevcut fiyat Almanya satisi icin dusuk.",
    de: "Internetvergleich: Weiguang YZF25-40 liegt in Europa ca. bei 19,99-29,43 EUR; der aktuelle Preis ist fuer Deutschland niedrig.",
  },
  {
    test: (item) => hasAny(item, ["YZF34-45"]),
    tr: "Internet karsilastirmasi: Weiguang YZF34-45 icin Avrupa bandi yaklasik EUR27,50-32,09; fiyat biraz yukari cekilebilir.",
    de: "Internetvergleich: Weiguang YZF34-45 liegt in Europa ca. bei 27,50-32,09 EUR; der Preis kann etwas angehoben werden.",
  },
  {
    test: (item) => hasAny(item, ["ECO WHITE", "Silikon Eco White"]),
    tr: "Internet karsilastirmasi: Selsil Eco White Turkiye'de yaklasik EUR2,10, Avrupa'da yaklasik EUR4,50; Almanya satisinda mevcut fiyat dusuk kalir.",
    de: "Internetvergleich: Selsil Eco White liegt in der Tuerkei ca. bei 2,10 EUR, in Europa ca. bei 4,50 EUR; fuer Deutschland ist der aktuelle Preis niedrig.",
  },
  {
    test: (item) => hasAny(item, ["NS88"]),
    tr: "Internet karsilastirmasi: Sibax NS88 PU kopuk yaklasik EUR2,91-4,36 bandinda; mevcut fiyat alt sinirda.",
    de: "Internetvergleich: Sibax NS88 PU-Schaum liegt ca. bei 2,91-4,36 EUR; der aktuelle Preis ist am unteren Rand.",
  },
  {
    test: (item) => hasAny(item, ["Drenaj Pompasi A1", "A1"]),
    tr: "Internet karsilastirmasi: Basic drenaj pompalari EUR34,68 net civarindan baslar, Siccom gibi kaliteli muadiller EUR52,75-69,72 bandindadir; mevcut fiyat basic pompa icin uygun.",
    de: "Internetvergleich: Einfache Kondensatpumpen starten um ca. 34,68 EUR netto, Siccom-aehnliche Qualitaet liegt ca. bei 52,75-69,72 EUR; der aktuelle Preis passt fuer Basic.",
  },
  {
    test: (item) => hasAny(item, ["Kaucuk Izolasyon"]),
    tr: "Kontrol notu: Fiyat ancak izolasyonlu bakir boru/top olarak dogru olabilir; sadece kaucuk izolasyon ise urun adi ve fiyat tekrar kontrol edilmeli.",
    de: "Pruefhinweis: Der Preis passt nur, wenn es isolierte Kupferrohr-Rollen sind; bei reiner Kautschukisolierung Name und Preis erneut pruefen.",
  },
  {
    test: (item) => hasAny(item, ["DCB31"]),
    tr: "Internet karsilastirmasi: DCB31/DCB311 tipi defrost kontrol bandi yaklasik EUR12,60-16,60; program fiyati dogru bantta.",
    de: "Internetvergleich: DCB31/DCB311 Defrostregler liegen ca. bei 12,60-16,60 EUR; der Programmpreis passt.",
  },
];

async function main() {
  await initDatabase();
  const admin = await get("SELECT id FROM users WHERE role = ? ORDER BY id ASC LIMIT 1", ["admin"]);
  const items = await loadTrainingItems();
  if (!items.length) {
    throw new Error("DRC MAN urun egitimi icin urun bulunamadi.");
  }

  const support = buildProductSupport(items);
  const trainingEntries = buildTrainingEntries(items, support);
  const productFaqEntries = buildProductFaq(trainingEntries);
  await withTransaction(async (tx) => {
    await replaceAgentTrainingEntries(tx, trainingEntries, admin?.id);
  });

  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.writeFileSync(PRODUCT_JSON_PATH, JSON.stringify(buildDrcManMaterialRows(items), null, 2), "utf8");
  fs.writeFileSync(KNOWLEDGE_MD_PATH, buildKnowledgeMarkdown(items), "utf8");

  const productFaqJson = JSON.stringify(productFaqEntries, null, 2);
  fs.writeFileSync(PRODUCT_FAQ_PATH, productFaqJson, "utf8");
  fs.writeFileSync(STATIC_PRODUCT_FAQ_PATH, productFaqJson, "utf8");
  writeProductFaqParts(productFaqEntries);

  const stocked = items.filter((item) => Number(item.currentStock || 0) > 0);
  console.log(
    JSON.stringify(
      {
        topic: TRAINING_TOPIC,
        products: items.length,
        stockedProducts: stocked.length,
        productQuestionCount: PRODUCT_QUESTION_COUNT,
        trainingEntries: trainingEntries.length,
        productJsonPath: PRODUCT_JSON_PATH,
        knowledgeMarkdownPath: KNOWLEDGE_MD_PATH,
        productFaqPath: PRODUCT_FAQ_PATH,
        staticProductFaqPath: STATIC_PRODUCT_FAQ_PATH,
      },
      null,
      2
    )
  );
}

function writeProductFaqParts(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return;
  }

  const chunkSize = Math.ceil(entries.length / STATIC_PRODUCT_FAQ_PART_PATHS.length);
  STATIC_PRODUCT_FAQ_PART_PATHS.forEach((filePath, index) => {
    const start = index * chunkSize;
    const subset = entries.slice(start, start + chunkSize);
    fs.writeFileSync(filePath, JSON.stringify(subset), "utf8");
  });
}

async function loadTrainingItems() {
  const stockSql = `
    COALESCE((
      SELECT SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END)
      FROM movements
      WHERE item_id = items.id
    ), 0)
  `;
  const rows = await query(`
    SELECT
      id,
      barcode,
      name,
      brand,
      category,
      unit,
      min_stock,
      default_price,
      sale_price,
      product_code,
      notes,
      ${stockSql} AS current_stock
    FROM items
    WHERE COALESCE(is_active, TRUE) = TRUE
    ORDER BY
      CASE WHEN ${stockSql} > 0 THEN 0 ELSE 1 END,
      ${stockSql} DESC,
      brand ASC,
      name ASC
  `);

  return rows.map((row) => ({
    id: Number(row.id),
    barcode: row.barcode || "",
    name: row.name || "",
    brand: row.brand || "",
    category: row.category || "",
    unit: row.unit || "adet",
    minStock: Number(row.min_stock || 0),
    defaultPrice: Number(row.default_price || 0),
    salePrice: Number(row.sale_price || 0),
    productCode: row.product_code || "",
    notes: row.notes || "",
    currentStock: Number(row.current_stock || 0),
  }));
}

function buildProductSupport(items) {
  const byCategory = new Map();
  const byBrand = new Map();
  const byCategoryBrand = new Map();

  for (const item of items) {
    const categoryKey = normalizeLoose(item.category || "genel");
    const brandKey = normalizeLoose(item.brand || "markasiz");
    const categoryBrandKey = `${categoryKey}::${brandKey}`;
    pushToMapArray(byCategory, categoryKey, item);
    pushToMapArray(byBrand, brandKey, item);
    pushToMapArray(byCategoryBrand, categoryBrandKey, item);
  }

  for (const map of [byCategory, byBrand, byCategoryBrand]) {
    for (const [key, value] of map.entries()) {
      map.set(key, value.sort(compareSupportItems));
    }
  }

  return { byCategory, byBrand, byCategoryBrand };
}

function pushToMapArray(map, key, value) {
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key).push(value);
}

function compareSupportItems(left, right) {
  const leftStock = Number(left.currentStock || 0);
  const rightStock = Number(right.currentStock || 0);
  if (leftStock > 0 && rightStock <= 0) return -1;
  if (rightStock > 0 && leftStock <= 0) return 1;
  if (rightStock !== leftStock) return rightStock - leftStock;
  return `${left.brand} ${left.name}`.localeCompare(`${right.brand} ${right.name}`, "tr");
}

async function replaceAgentTrainingEntries(tx, entries, adminUserId) {
  const isActiveValue = dbClient === "postgres" ? true : 1;
  await tx.execute("DELETE FROM agent_training WHERE topic = ?", [TRAINING_TOPIC]);

  for (let index = 0; index < entries.length; index += TRAINING_INSERT_BATCH_SIZE) {
    const slice = entries.slice(index, index + TRAINING_INSERT_BATCH_SIZE);
    const placeholders = slice.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",\n");
    const params = [];
    slice.forEach((entry) => {
      params.push(
        TRAINING_TOPIC,
        entry.audience || "all",
        entry.keywords,
        entry.trQuestion,
        entry.trAnswer,
        entry.deQuestion,
        entry.deAnswer,
        JSON.stringify(entry.suggestions || []),
        isActiveValue,
        adminUserId ? Number(adminUserId) : null
      );
    });

    await tx.execute(
      `
        INSERT INTO agent_training (
          topic, audience, keywords, tr_question, tr_answer, de_question, de_answer,
          suggestions, is_active, created_by_user_id
        )
        VALUES ${placeholders}
      `,
      params
    );
  }
}

function buildTrainingEntries(items, support) {
  const entries = [
    buildOverviewEntry(items),
    buildPriceControlEntry(items),
    buildBrandRuleEntry(),
    buildNoCostDisclosureEntry(),
  ];

  for (const item of items) {
    entries.push(...buildProductQuestionEntries(item, support));
  }

  return entries;
}

function buildOverviewEntry(items) {
  const stocked = items.filter((item) => Number(item.currentStock || 0) > 0);
  const topFamilies = summarizeFamilies(stocked);
  const exampleCode = displayCode(stocked[0] || items[0] || { id: 0 });
  const trLines = [
    "DRC MAN urun hafizasi: urunler once canli Hamburg stok mantigiyla okunur.",
    `Stoklu urun sayisi: ${stocked.length}. Egitilen toplam aktif urun: ${items.length}.`,
    `Her aktif urun icin ${PRODUCT_QUESTION_COUNT} temel soru vardir: fiyat, stok, nerede kullanilir, muadil var mi, usta alternatifi.`,
    `Ana aileler: ${topFamilies}.`,
    "Kural: once tam model/kod, sonra marka, kategori, stok adedi ve satis fiyati okunur. Alis/maliyet fiyati musteriye veya personele soylenmez; sadece admin gorebilir.",
    "Muadil veya usta cozum sorusunda birebir uyum otomatik varsayilmaz; model, olcu, gaz tipi, elektrik ve kapasite uyumu teyit edilir.",
  ];
  const deLines = [
    "DRC MAN Produktgedaechtnis: Produkte werden zuerst nach Live-Hamburg-Bestand gelesen.",
    `Artikel mit Bestand: ${stocked.length}. Insgesamt trainierte aktive Produkte: ${items.length}.`,
    `Zu jedem aktiven Produkt gibt es ${PRODUCT_QUESTION_COUNT} Kernfragen: Preis, Bestand, Einsatzbereich, moegliche Alternative und Meisterloesung.`,
    `Hauptfamilien: ${topFamilies}.`,
    "Regel: zuerst exaktes Modell/Code, dann Marke, Kategorie, Bestand und Verkaufspreis lesen. Einkauf/Marge wird Kunden oder Personal nicht genannt; nur Admin.",
    "Bei Alternativen wird keine 1:1-Kompatibilitaet automatisch versprochen; Modell, Mass, Kaeltemittel, Elektrik und Leistung muessen geprueft werden.",
  ];

  return buildGlobalEntry({
    exportId: "hamburg_overview",
    familyId: "overview",
    keywords: [
      "urunlerimiz",
      "urun hafizasi",
      "stoklu urunler",
      "fiyat",
      "stok",
      "kullanim",
      "muadil",
      "usta alternatifi",
    ],
    trQuestion: "Urunlerimizi nasil okuyorsun?",
    trQuestionVariants: ["DRC MAN urunleri nasil okur?", "Her urun icin hangi sorular var?"],
    trAnswer: trLines.join("\n"),
    deQuestion: "Wie liest du unsere Produkte?",
    deQuestionVariants: ["Wie antwortet DRC MAN zu Produkten?", `Welche ${PRODUCT_QUESTION_COUNT} Fragen gibt es je Produkt?`],
    deAnswer: deLines.join("\n"),
    suggestions: [
      `${exampleCode} fiyati nedir?`,
      `${exampleCode} stokta var mi?`,
      `${exampleCode} nerede kullanilir?`,
    ],
  });
}

function buildPriceControlEntry(items) {
  const watched = items
    .map((item) => ({ item, note: marketNote(item, "tr") }))
    .filter((entry) => entry.note)
    .slice(0, 18);
  const trLines = [
    "Fiyat kontrol refleksi:",
    "- Dogru bantta olanlar: SYSVRF2 260 AIR EVO, WALL 28 Q, DCB31.",
    "- Admin kontrolu isteyenler: WALL 56 Q, WALL 71 Q, UNEU2168U, Sanhua RFKH022, Sanhua servis valfi, Weiguang fan motorlari, Selsil Eco White.",
    "- Izolasyon kaleminde urun tanimi teyit edilir: sadece kaucuk izolasyon mu, izolasyonlu bakir boru/top mu?",
    "",
    ...watched.map(({ item, note }) => `- ${item.name}: ${formatSale(item)}. ${note}`),
  ];
  const deLines = [
    "Preispruef-Reflex:",
    "- Im richtigen Band: SYSVRF2 260 AIR EVO, WALL 28 Q, DCB31.",
    "- Admin-Pruefung noetig: WALL 56 Q, WALL 71 Q, UNEU2168U, Sanhua RFKH022, Sanhua Serviceventil, Weiguang Ventilatormotoren, Selsil Eco White.",
    "- Bei Isolierung Produktdefinition klaeren: reine Kautschukisolierung oder isolierte Kupferrohr-Rolle?",
  ];

  return buildGlobalEntry({
    exportId: "hamburg_price_control",
    familyId: "price_control",
    keywords: [
      "fiyat kontrol",
      "internet karsilastirma",
      "dusuk fiyat",
      "admin kontrolu",
      "wall 56",
      "wall 71",
      "dcb31",
    ],
    trQuestion: "Hangi urun fiyatlari kontrol edilmeli?",
    trQuestionVariants: ["Hangi fiyatlar kritik?", "Internet karsilastirmasi olan urunler hangileri?"],
    trAnswer: trLines.join("\n"),
    deQuestion: "Welche Produktpreise muessen geprueft werden?",
    deQuestionVariants: ["Welche Preise sind kritisch?", "Welche Produkte haben einen Internetvergleich?"],
    deAnswer: deLines.join("\n"),
    suggestions: ["WALL 56 Q fiyat dogru mu?", "DCB31 fiyati dogru mu?", "Sanhua servis valfi kac euro?"],
  });
}

function buildBrandRuleEntry() {
  return buildGlobalEntry({
    exportId: "hamburg_brand_rule",
    familyId: "brand_rules",
    keywords: ["dunan", "sanhua", "marka", "ayri", "servis valfi"],
    trQuestion: "DunAn ve Sanhua ayni marka mi?",
    trQuestionVariants: ["Sanhua ile DunAn ayni sey mi?", "Servis valfinde hangi marka ayri tutulur?"],
    trAnswer: [
      "DunAn ve Sanhua ayri marka olarak tutulur.",
      "Sanhua servis valfi stoklu ana kayittir; DunAn ayni marka gibi birlestirilmez.",
      "Musteriye veya stok aramasina cevap verirken marka adini kayittaki gibi soyle: Sanhua ayri, DunAn ayri.",
    ].join("\n"),
    deQuestion: "Sind DunAn und Sanhua dieselbe Marke?",
    deQuestionVariants: ["Sind Sanhua und DunAn identisch?", "Welche Marken werden getrennt gefuehrt?"],
    deAnswer: [
      "DunAn und Sanhua sind getrennte Marken.",
      "Das Sanhua-Serviceventil ist der lagernde Hauptartikel; DunAn wird nicht als gleiche Marke zusammengefuehrt.",
      "Bei Suche und Kundenantwort Marke exakt wie im Artikelstamm nennen: Sanhua separat, DunAn separat.",
    ].join("\n"),
    suggestions: ["Sanhua servis valfi stokta mi?", "DunAn servis valfi var mi?"],
  });
}

function buildNoCostDisclosureEntry() {
  return buildGlobalEntry({
    exportId: "hamburg_cost_disclosure",
    familyId: "cost_rules",
    keywords: ["alis fiyati", "maliyet", "gizli", "admin", "satis fiyati"],
    trQuestion: "Alis fiyatini kim gorebilir?",
    trQuestionVariants: ["Maliyet bilgisini kim gorur?", "Personel alis fiyatini gorebilir mi?"],
    trAnswer: [
      "Alis/maliyet fiyati sadece admin icindir.",
      "Personel ve musteri cevaplarinda DRC MAN sadece satis fiyati, stok, marka, kategori ve kullanim amacini anlatir.",
      "Bir kullanici maliyet isterse cevap: 'Bu bilgi admin yetkisindedir; satis fiyati ve stok durumunu paylasabilirim.'",
    ].join("\n"),
    deQuestion: "Wer darf Einkaufspreise sehen?",
    deQuestionVariants: ["Wer sieht die Kosten?", "Darf Personal Einkaufspreise sehen?"],
    deAnswer: [
      "Einkaufs-/Kostenpreise sind nur fuer Admin.",
      "Fuer Personal und Kunden nennt DRC MAN nur Verkaufspreis, Bestand, Marke, Kategorie und Einsatzbereich.",
      "Bei Kostenfrage: 'Diese Information ist Admin-Bereich; Verkaufspreis und Bestand kann ich nennen.'",
    ].join("\n"),
    suggestions: ["DCB31 satis fiyati nedir?", "Stokta hangi urunler var?"],
  });
}

function buildProductQuestionEntries(item, support) {
  const alternatives = findRelatedAlternatives(item, support, 3);
  return [
    buildProductPriceEntry(item),
    buildProductStockEntry(item),
    buildProductUsageEntry(item),
    buildProductEquivalentEntry(item, alternatives),
    buildProductTechnicianEntry(item, alternatives),
  ];
}

function buildProductPriceEntry(item) {
  const code = displayCode(item);
  const stockLineTr = stockStatusText(item, "tr");
  const stockLineDe = stockStatusText(item, "de");
  const noteTr = marketNote(item, "tr");
  const noteDe = marketNote(item, "de");
  const priceLineTr = Number(item.salePrice || 0) > 0
    ? `${code} icin guncel satis fiyati ${formatSale(item)}.`
    : `${code} icin sistemde tanimli satis fiyati yok; satis oncesi admin fiyat kontrolu gerekir.`;
  const priceLineDe = Number(item.salePrice || 0) > 0
    ? `Der aktuelle Verkaufspreis fuer ${code} ist ${formatSale(item)}.`
    : `Fuer ${code} ist kein Verkaufspreis gepflegt; vor Verkauf ist eine Admin-Preispruefung noetig.`;

  return buildProductEntry(item, "price", {
    keywordsExtra: ["fiyat", "satis", "ucret", "euro", "preis", "verkaufspreis"],
    trQuestion: `${code} fiyati nedir?`,
    trQuestionVariants: [
      `${item.name} kac euro?`,
      `${code} kaca veriyoruz?`,
      `${item.name} satis fiyati ne?`,
    ],
    trAnswer: [
      priceLineTr,
      `Urun: ${item.name} (${item.brand || "Marka yok"}). Kategori: ${item.category || "Genel"}.`,
      `Stok ozeti: ${stockLineTr}.`,
      noteTr ? `Piyasa notu: ${noteTr}` : "Piyasa notu: internet karsilastirmasi yoksa satis oncesi admin fiyat kontrolu istenir.",
      "Maliyet/alis fiyati bu cevapta paylasilmaz.",
    ].join("\n"),
    deQuestion: `Was kostet ${code}?`,
    deQuestionVariants: [
      `Wie teuer ist ${item.name}?`,
      `Was ist der Verkaufspreis von ${code}?`,
      `${item.name} Preis`,
    ],
    deAnswer: [
      priceLineDe,
      `Produkt: ${item.name} (${item.brand || "ohne Marke"}). Kategorie: ${item.category || "Allgemein"}.`,
      `Bestandsuebersicht: ${stockLineDe}.`,
      noteDe ? `Preisnotiz: ${noteDe}` : "Preisnotiz: Wenn kein Internetvergleich hinterlegt ist, vor Verkauf Admin-Preispruefung einholen.",
      "Einkaufs-/Kostenpreis wird hier nicht genannt.",
    ].join("\n"),
    suggestions: buildProductSuggestions(item, "price"),
  });
}

function buildProductStockEntry(item) {
  const code = displayCode(item);
  const minLineTr = Number(item.minStock || 0) > 0
    ? `Kritik esik: ${formatNumber(item.minStock)} ${item.unit}.`
    : "Bu urun icin kritik stok esigi tanimli degil.";
  const minLineDe = Number(item.minStock || 0) > 0
    ? `Kritische Schwelle: ${formatNumber(item.minStock)} ${formatUnitDe(item.unit)}.`
    : "Fuer diesen Artikel ist keine kritische Bestandsschwelle gepflegt.";

  return buildProductEntry(item, "stock", {
    keywordsExtra: ["stok", "mevcut", "adet", "kac adet", "bestand", "lager", "auf lager"],
    trQuestion: `${code} stokta var mi?`,
    trQuestionVariants: [
      `${item.name} stok durumu nedir?`,
      `${code} kac adet var?`,
      `${item.name} depoda mevcut mu?`,
    ],
    trAnswer: [
      `${item.name} icin sistem stogu: ${stockStatusText(item, "tr")}.`,
      minLineTr,
      Number(item.currentStock || 0) > 0
        ? "Urun stoklu gorunuyor; operasyon veya satis icin kayit uzerinden ilerlenebilir."
        : "Urun stokta gorunmuyor; siparis veya katalog kalemi olarak takip edilmeli.",
      `Satis fiyati ozeti: ${formatSale(item)}.`,
    ].join("\n"),
    deQuestion: `Ist ${code} auf Lager?`,
    deQuestionVariants: [
      `Wie ist der Bestand von ${item.name}?`,
      `Wie viele Stueck ${code} haben wir?`,
      `${item.name} Lagerbestand`,
    ],
    deAnswer: [
      `Systembestand fuer ${item.name}: ${stockStatusText(item, "de")}.`,
      minLineDe,
      Number(item.currentStock || 0) > 0
        ? "Der Artikel ist lagernd und kann aus dem Bestand bearbeitet werden."
        : "Der Artikel ist aktuell nicht lagernd; als Bestell- oder Katalogposition behandeln.",
      `Verkaufspreis-Uebersicht: ${formatSale(item)}.`,
    ].join("\n"),
    suggestions: buildProductSuggestions(item, "stock"),
  });
}

function buildProductUsageEntry(item) {
  const code = displayCode(item);
  const note = extractNoteHighlights(item.notes);

  return buildProductEntry(item, "usage", {
    keywordsExtra: ["nerede kullanilir", "ne ise yarar", "kullanim", "uygulama", "einsatz", "wofuer"],
    trQuestion: `${code} nerede kullanilir?`,
    trQuestionVariants: [
      `${item.name} ne ise yarar?`,
      `${code} hangi is icin kullanilir?`,
      `${item.name} kullanim alani nedir?`,
    ],
    trAnswer: [
      `${item.name} icin temel kullanim: ${purposeHint(item)}`,
      `Kategori: ${item.category || "Genel"}. Marka: ${item.brand || "Marka yok"}. Kod: ${code}.`,
      note ? `Saha notu: ${note}.` : "Saha notu: montajdan once model, olcu ve uygulama ortami teyit edilir.",
      `Stok/fiyat ozeti: ${stockStatusText(item, "tr")} / ${formatSale(item)}.`,
    ].join("\n"),
    deQuestion: `Wo wird ${code} verwendet?`,
    deQuestionVariants: [
      `Wofuer ist ${item.name}?`,
      `Wo setzt man ${code} ein?`,
      `${item.name} Einsatzbereich`,
    ],
    deAnswer: [
      `Grundeinsatz von ${item.name}: ${purposeHintDe(item)}`,
      `Kategorie: ${item.category || "Allgemein"}. Marke: ${item.brand || "ohne Marke"}. Code: ${code}.`,
      note ? `Praxis-Hinweis: ${note}.` : "Praxis-Hinweis: Vor Montage Modell, Mass und Einsatzumgebung pruefen.",
      `Bestand/Preis: ${stockStatusText(item, "de")} / ${formatSale(item)}.`,
    ].join("\n"),
    suggestions: buildProductSuggestions(item, "usage"),
  });
}

function buildProductEquivalentEntry(item, alternatives) {
  const code = displayCode(item);
  const altTr = formatAlternativeList(alternatives, "tr");
  const altDe = formatAlternativeList(alternatives, "de");
  const compatibilityTr = compatibilityChecklist(item, "tr");
  const compatibilityDe = compatibilityChecklist(item, "de");

  return buildProductEntry(item, "equivalent", {
    keywordsExtra: ["muadil", "alternatif", "yerine ne", "equivalent", "alternative", "ersatz"],
    trQuestion: `${code} muadili var mi?`,
    trQuestionVariants: [
      `${item.name} yerine ne kullanilir?`,
      `${code} icin alternatif var mi?`,
      `${item.name} muadil urun hangisi?`,
    ],
    trAnswer: [
      alternatives.length
        ? `${item.name} icin stokta ilk bakilacak yakin alternatifler: ${altTr}.`
        : `${item.name} icin sistemde stoklu yakin alternatif gorunmuyor.`,
      `Muadil karari verirken ${compatibilityTr} teyit edilir.`,
      "Birebir muadil onayi teknik kontrol olmadan verilmez; DRC MAN sadece ilk bakilacak adaylari soyler.",
    ].join("\n"),
    deQuestion: `Gibt es eine Alternative fuer ${code}?`,
    deQuestionVariants: [
      `Was kann man statt ${item.name} verwenden?`,
      `Hat ${code} einen Ersatz?`,
      `${item.name} Alternative`,
    ],
    deAnswer: [
      alternatives.length
        ? `Fuer ${item.name} sind diese nahen Lager-Alternativen zuerst zu pruefen: ${altDe}.`
        : `Fuer ${item.name} ist aktuell keine nahe Lager-Alternative im System sichtbar.`,
      `Fuer eine Ersatzfreigabe muessen ${compatibilityDe} geprueft werden.`,
      "Eine 1:1-Freigabe wird ohne technische Kontrolle nicht automatisch gegeben; DRC MAN nennt nur die ersten Kandidaten.",
    ].join("\n"),
    suggestions: buildProductSuggestions(item, "equivalent"),
  });
}

function buildProductTechnicianEntry(item, alternatives) {
  const code = displayCode(item);
  const altTr = formatAlternativeList(alternatives, "tr");
  const altDe = formatAlternativeList(alternatives, "de");

  return buildProductEntry(item, "technician", {
    keywordsExtra: ["usta", "usta cozum", "alternatif cozum", "master", "meister", "praxis"],
    trQuestion: `${code} yoksa usta olarak ne yapariz?`,
    trQuestionVariants: [
      `${item.name} icin usta alternatifi nedir?`,
      `${code} olmazsa sahada nasil cozeriz?`,
      `${item.name} icin pratik cozum ne olur?`,
    ],
    trAnswer: [
      Number(item.currentStock || 0) > 0
        ? `Usta gozuyle ilk tercih stoktaki birebir urun: ${code}.`
        : `${code} stokta yoksa usta acil cozum icin yakin stoklu adaylara bakar${alternatives.length ? `: ${altTr}.` : "."}`,
      technicianAlternativeHint(item, alternatives, "tr"),
      `Kontrol listesi: ${compatibilityChecklist(item, "tr")}.`,
      "Olcu, gaz, elektrik ve kapasite uyumu teyitsiz alternatif montaj onaylanmaz.",
    ].join("\n"),
    deQuestion: `Was macht man meisterlich, wenn ${code} fehlt?`,
    deQuestionVariants: [
      `Was ist die Meister-Alternative fuer ${item.name}?`,
      `Wie loest man ${code} in der Praxis, wenn es fehlt?`,
      `${item.name} Praxisloesung`,
    ],
    deAnswer: [
      Number(item.currentStock || 0) > 0
        ? `Aus Meistersicht ist zuerst das lagernde Original zu nehmen: ${code}.`
        : `Wenn ${code} nicht lagernd ist, schaut man fuer eine Sofortloesung zuerst auf nahe Lager-Kandidaten${alternatives.length ? `: ${altDe}.` : "."}`,
      technicianAlternativeHint(item, alternatives, "de"),
      `Pruefliste: ${compatibilityChecklist(item, "de")}.`,
      "Ohne bestaetigte Mass-, Kaeltemittel-, Elektro- und Leistungs-Kompatibilitaet wird keine Alternativmontage freigegeben.",
    ].join("\n"),
    suggestions: buildProductSuggestions(item, "technician"),
  });
}

function buildProductEntry(item, kind, payload) {
  const code = displayCode(item);
  const exportId = `hamburg_product_${sanitizeIdentifier(code)}_${kind}`;
  const familyId = `product_${sanitizeIdentifier(code)}`;
  const keywordList = Array.from(new Set([
    ...productKeywords(item),
    ...(payload.keywordsExtra || []),
    kind,
  ])).slice(0, 48);

  return {
    exportId,
    familyId,
    sourceSummary: PRODUCT_FAQ_SOURCE_SUMMARY,
    audience: "all",
    keywordList,
    keywords: keywordList.join(" "),
    trSubject: payload.trQuestion,
    deSubject: payload.deQuestion,
    trQuestion: payload.trQuestion,
    trQuestionVariants: payload.trQuestionVariants || [],
    trAnswer: payload.trAnswer,
    deQuestion: payload.deQuestion,
    deQuestionVariants: payload.deQuestionVariants || [],
    deAnswer: payload.deAnswer,
    suggestions: dedupeSuggestions(payload.suggestions || []),
  };
}

function buildGlobalEntry(payload) {
  const keywordList = Array.from(new Set(payload.keywords || [])).slice(0, 48);
  return {
    exportId: payload.exportId,
    familyId: payload.familyId,
    sourceSummary: PRODUCT_FAQ_SOURCE_SUMMARY,
    audience: "all",
    keywordList,
    keywords: keywordList.join(" "),
    trSubject: payload.trQuestion,
    deSubject: payload.deQuestion,
    trQuestion: payload.trQuestion,
    trQuestionVariants: payload.trQuestionVariants || [],
    trAnswer: payload.trAnswer,
    deQuestion: payload.deQuestion,
    deQuestionVariants: payload.deQuestionVariants || [],
    deAnswer: payload.deAnswer,
    suggestions: dedupeSuggestions(payload.suggestions || []),
  };
}

function buildProductSuggestions(item, kind) {
  const code = displayCode(item);
  const map = {
    price: [
      `${code} stokta var mi?`,
      `${code} nerede kullanilir?`,
      `${code} muadili var mi?`,
      `${code} icin usta cozum nedir?`,
    ],
    stock: [
      `${code} fiyati nedir?`,
      `${code} nerede kullanilir?`,
      `${code} muadili var mi?`,
      `${code} icin usta cozum nedir?`,
    ],
    usage: [
      `${code} fiyati nedir?`,
      `${code} stokta var mi?`,
      `${code} muadili var mi?`,
      `${code} icin usta cozum nedir?`,
    ],
    equivalent: [
      `${code} fiyati nedir?`,
      `${code} stokta var mi?`,
      `${code} nerede kullanilir?`,
      `${code} icin usta cozum nedir?`,
    ],
    technician: [
      `${code} fiyati nedir?`,
      `${code} stokta var mi?`,
      `${code} nerede kullanilir?`,
      `${code} muadili var mi?`,
    ],
  };
  return map[kind] || [`${code} fiyati nedir?`, `${code} stokta var mi?`];
}

function findRelatedAlternatives(item, support, limit = 3) {
  const categoryKey = normalizeLoose(item.category || "genel");
  const brandKey = normalizeLoose(item.brand || "markasiz");
  const categoryBrandKey = `${categoryKey}::${brandKey}`;
  const seen = new Set([Number(item.id)]);
  const results = [];

  const pushCandidates = (candidates, predicate = null) => {
    for (const candidate of candidates || []) {
      if (results.length >= limit) {
        return;
      }
      if (!candidate || seen.has(Number(candidate.id))) {
        continue;
      }
      if (Number(candidate.currentStock || 0) <= 0) {
        continue;
      }
      if (predicate && !predicate(candidate)) {
        continue;
      }
      results.push(candidate);
      seen.add(Number(candidate.id));
    }
  };

  const sameUnit = (candidate) => normalizeLoose(candidate.unit) === normalizeLoose(item.unit);
  pushCandidates(support.byCategoryBrand.get(categoryBrandKey), sameUnit);
  pushCandidates(support.byCategoryBrand.get(categoryBrandKey));
  pushCandidates(support.byCategory.get(categoryKey), sameUnit);
  pushCandidates(support.byCategory.get(categoryKey));
  pushCandidates(support.byBrand.get(brandKey));

  return results.slice(0, limit);
}

function stockStatusText(item, language = "tr") {
  const amount = Number(item.currentStock || 0);
  if (language === "de") {
    if (amount > 0) {
      return `${formatNumber(amount)} ${formatUnitDe(item.unit)} auf Lager`;
    }
    return "0 Bestand, Bestell-/Katalogartikel";
  }
  if (amount > 0) {
    return `${formatNumber(amount)} ${item.unit} stokta`;
  }
  return "stok 0, siparis/katalog kalemi";
}

function compatibilityChecklist(item, language = "tr") {
  const category = normalizeLoose(item.category);
  const name = normalizeLoose(item.name);

  if (category.includes("kompres")) {
    return language === "de"
      ? "Kaeltemittel, Leistung, Hubraum, Spannung und Anlaufkomponenten"
      : "gaz tipi, kapasite, silindir hacmi, voltaj ve start ekipmani";
  }
  if (category.includes("fan")) {
    return language === "de"
      ? "Watt, Durchmesser, Drehrichtung, Welle und Befestigung"
      : "watt, cap, donus yonu, mil ve montaj olculeri";
  }
  if (category.includes("expansion") || category.includes("genlesme")) {
    return language === "de"
      ? "Kaeltemittel, Kapazitaet, Orifice/Nozzle und Anschlussmass"
      : "gaz tipi, kapasite, orifis/nozul ve baglanti olcusu";
  }
  if (category.includes("solenoid") || category.includes("valf") || category.includes("servis")) {
    return language === "de"
      ? "Anschlussmass, Druckbereich, Kaeltemittel und Spulenspannung"
      : "baglanti olcusu, basin cinsine uygunluk, gaz tipi ve bobin voltaji";
  }
  if (category.includes("kontrol") || category.includes("termostat") || name.includes("kontrol")) {
    return language === "de"
      ? "Versorgungsspannung, Sensorart, Ausgang/Relais und Programmierung"
      : "besleme voltaji, sensor tipi, cikis/role kapasitesi ve program uyumu";
  }
  if (category.includes("yag")) {
    return language === "de"
      ? "Oeltyp, Viskositaet und Kompressor-Kompatibilitaet"
      : "yag tipi, viskozite ve kompresor uyumu";
  }
  if (category.includes("akiskan") || name.includes("r290") || name.includes("r404") || name.includes("r134")) {
    return language === "de"
      ? "Kaeltemitteltyp, Flaschengroesse und Sicherheitsklasse"
      : "gaz tipi, tup boyutu ve guvenlik sinifi";
  }
  if (category.includes("izolasyon") || category.includes("yapi")) {
    return language === "de"
      ? "Mass, Materialstaerke und Einsatzoberflaeche"
      : "olcu, malzeme kalinligi ve uygulama yuzeyi";
  }
  return language === "de"
    ? "Modell, Mass, Kapazitaet und Anschlussdetails"
    : "model, olcu, kapasite ve baglanti detaylari";
}

function technicianAlternativeHint(item, alternatives, language = "tr") {
  const category = normalizeLoose(item.category);

  if (category.includes("kompres")) {
    return language === "de"
      ? "Praxisregel: erst gleiche Kaeltemittelgruppe und nahe Leistungsbandbreite suchen; Startequipment und Anschluesse danach abgleichen."
      : "Usta mantigi: once ayni gaz grubunda ve yakin kapasite bandinda stok aranir; sonra start ekipmani ve baglantilar eslestirilir.";
  }
  if (category.includes("fan")) {
    return language === "de"
      ? "Praxisregel: Motor nur dann alternativ setzen, wenn Watt, Fluegeldurchmesser, Wellenmass und Drehrichtung uebereinstimmen."
      : "Usta mantigi: fan motorda ancak watt, pervane capi, mil olcusu ve donus yonu tutuyorsa alternatif dusunulur.";
  }
  if (category.includes("yag")) {
    return language === "de"
      ? "Praxisregel: Oeltyp und Viskositaet nicht mischen; im Zweifel gleiche Klasse nachfuellen und Herstellerfreigabe kontrollieren."
      : "Usta mantigi: yagda tip ve viskozite karistirilmaz; gerekirse ayni sinifta alternatif secilir ve kompresor uyumu teyit edilir.";
  }
  if (category.includes("valf") || category.includes("servis") || category.includes("genlesme")) {
    return language === "de"
      ? "Praxisregel: zuerst Anschlussmass und Kaeltemittel pruefen; danach nur funktionell gleichwertige Lagerteile einsetzen."
      : "Usta mantigi: once baglanti olcusu ve gaz tipi bakilir; sonra sadece islev olarak ayni gorevi yapan stoklu parca degerlendirilir.";
  }
  if (category.includes("kontrol") || category.includes("termostat")) {
    return language === "de"
      ? "Praxisregel: Versorgung, Sensor und Relaiswerte passen mu diye bak; fonksiyon esitse yaklasik alternatif kullanilabilir."
      : "Usta mantigi: besleme, sensor ve role degerleri uyuyorsa fonksiyon olarak yakin kontrol cihazina gidilir.";
  }
  if (!alternatives.length) {
    return language === "de"
      ? "Praxisregel: wenn kein naher Lagerkandidat sichtbar ist, nach Kategorie, Mass und Modell manuell suchen."
      : "Usta mantigi: yakinda stoklu aday gorunmuyorsa kategori, olcu ve modele gore manuel esleme yapilir.";
  }
  return language === "de"
    ? "Praxisregel: zuerst den naechsten Lagerkandidaten pruefen, dann Einbauraum und Anschlussdetails gegentesten."
    : "Usta mantigi: once en yakin stoklu aday kontrol edilir, sonra montaj alani ve baglanti detaylari yerinde karsilastirilir.";
}

function formatAlternativeList(items, language = "tr") {
  if (!items.length) {
    return "";
  }
  return items
    .map((item) => {
      const unit = language === "de" ? formatUnitDe(item.unit) : item.unit;
      return `${displayCode(item)} (${item.name}; ${formatNumber(item.currentStock)} ${unit})`;
    })
    .join(", ");
}

function extractNoteHighlights(notes) {
  return String(notes || "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const normalized = normalizeLoose(part);
      return !normalized.startsWith("kaynak:")
        && !normalized.startsWith("fiyat kaynagi:")
        && !normalized.startsWith("tahmini alis maliyeti:")
        && !normalized.startsWith("gelen fatura tedarikcisi:");
    })
    .slice(0, 2)
    .join(", ");
}

function dedupeSuggestions(items) {
  return Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 5);
}

function sanitizeIdentifier(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "item";
}

function buildDrcManMaterialRows(items) {
  return items.map((item) => ({
    kategori: item.category || "Hamburg Depo",
    isim: [item.brand, item.name].filter(Boolean).join(" ").trim(),
    kod: displayCode(item),
    fiyat: roundMoney(item.salePrice || 0),
    para_birimi: "EUR",
    birim: item.unit || "adet",
    watt: null,
    hp: null,
    boru_capi_inch: "",
    kaynak_dosya: "hamburg-live-supabase",
    aciklama: [
      "Hamburg canli urun egitimi",
      `Marka: ${item.brand || "-"}`,
      `Stok: ${formatNumber(item.currentStock)} ${item.unit || ""}`.trim(),
      `Satis: ${formatSale(item)}`,
      marketNote(item, "tr"),
      "Maliyet sadece admin tarafinda gorulur; DRC MAN genel cevapta paylasmaz.",
    ]
      .filter(Boolean)
      .join(" | "),
  }));
}

function buildProductFaq(entries) {
  return entries.map((entry, index) => {
    const trQuestions = Array.from(new Set([entry.trQuestion, ...(entry.trQuestionVariants || [])].filter(Boolean)));
    const deQuestions = Array.from(new Set([entry.deQuestion, ...(entry.deQuestionVariants || [])].filter(Boolean)));
    return {
      id: entry.exportId || `hamburg_product_${String(index + 1).padStart(5, "0")}`,
      family_id: entry.familyId || "general",
      keywords: entry.keywordList || Array.from(new Set(String(entry.keywords || "").split(/\s+/).filter(Boolean))).slice(0, 64),
      tr_subject: entry.trSubject || trQuestions[0] || entry.trQuestion || "",
      de_subject: entry.deSubject || deQuestions[0] || entry.deQuestion || "",
      tr_questions: trQuestions,
      de_questions: deQuestions,
      tr_answer: entry.trAnswer,
      de_answer: entry.deAnswer,
      suggestions: entry.suggestions || [],
      source_summary: entry.sourceSummary || PRODUCT_FAQ_SOURCE_SUMMARY,
    };
  });
}

function buildKnowledgeMarkdown(items) {
  const stocked = items.filter((item) => item.currentStock > 0);
  const lines = [
    "# Hamburg Urun Egitimi",
    "",
    "Konu: hamburg_stok, malzeme, urun, fiyat, stok, kullanim, muadil, usta alternatifi",
    "",
    "DRC MAN icin ana refleks: urun sorusunda once tam model/kod okunur; sonra marka, kategori, stok adedi ve satis fiyati soylenir. Alis/maliyet fiyati sadece admin icindir ve genel cevapta paylasilmaz.",
    "",
    `Egitilen toplam aktif urun: ${items.length}. Stoklu urun sayisi: ${stocked.length}.`,
    `Her aktif urun icin ${PRODUCT_QUESTION_COUNT} soru seti uretildi: fiyat, stok, nerede kullanilir, muadil var mi, usta alternatif cozum.`,
    "",
    "## Marka Kurallari",
    "",
    "- Sanhua ve DunAn ayri markalardir; tek marka gibi birlestirilmez.",
    "- Sanhua servis valfi stoklu ana kayittir; DunAn servis valfi ayridir.",
    "- Kaucuk izolasyon kaleminde urun tanimi teyit edilir: sadece izolasyon mu, izolasyonlu bakir boru/top mu?",
    "",
    "## Fiyat Kontrol Refleksi",
    "",
    "- Dogru bantta olanlar: Systemair SYSVRF2 260 AIR EVO, Systemair WALL 28 Q, DCB31.",
    "- Admin kontrolu isteyenler: WALL 56 Q, WALL 71 Q, UNEU2168U, Sanhua RFKH022, Sanhua servis valfi, Weiguang fan motorlari, Selsil Eco White.",
    "- Fiyat dusuk gorunurse DRC MAN satisi durdurmaz; 'admin fiyat kontrolu gerekir' diye uyarir.",
    "",
    "## Urun Listesi",
    "",
    "| Kod | Urun | Marka | Kategori | Stok | Satis | Not |",
    "| --- | --- | --- | --- | ---: | ---: | --- |",
  ];

  for (const item of items) {
    lines.push(
      [
        displayCode(item),
        item.name,
        item.brand || "-",
        item.category || "-",
        `${formatNumber(item.currentStock)} ${item.unit}`,
        formatSale(item),
        marketNote(item, "tr") || extractNoteHighlights(item.notes) || purposeHint(item),
      ]
        .map(escapeMarkdownCell)
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |")
    );
  }

  return `${lines.join("\n")}\n`;
}

function productKeywords(item) {
  const raw = [
    item.name,
    item.brand,
    item.category,
    item.productCode,
    item.barcode,
    displayCode(item),
    normalizeLoose(item.name),
    normalizeLoose(item.productCode || ""),
    normalizeLoose(item.notes || ""),
  ].join(" ");
  const baseTokens = raw
    .split(/[^A-Za-z0-9ÄÖÜäöüĞğİıÖöŞşÜüÇç._/-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const expandedTokens = baseTokens.flatMap((token) => [
    token,
    ...token.split(/[._/-]+/).filter((part) => part.length >= 2),
  ]);
  return Array.from(new Set(expandedTokens)).slice(0, 28);
}

function summarizeFamilies(items) {
  const counts = new Map();
  for (const item of items) {
    const key = item.category || "Genel";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([category, count]) => `${category} (${count})`)
    .join(", ");
}

function marketNote(item, language) {
  const match = MARKET_NOTES.find((entry) => entry.test(item));
  if (!match) {
    return "";
  }
  return language === "de" ? match.de : match.tr;
}

function purposeHint(item) {
  const category = normalizeLoose(item.category);
  const name = normalizeLoose(item.name);
  if (category.includes("vrf") && name.includes("dis")) {
    return "VRF sistemin dis unitesidir; ic unitelerle kapasite ve haberlesme uyumu kontrol edilir.";
  }
  if (category.includes("vrf") && name.includes("ic")) {
    return "VRF ic unitesidir; ayni seri dis unite, kumanda ve kapasite eslesmesiyle satilir.";
  }
  if (category.includes("kondenser")) {
    return "Sogutma devresinin dis unite/kondenser tarafidir; gaz, kapasite ve montaj mesafesi teyit edilir.";
  }
  if (category.includes("genlesme")) {
    return "Sivi hatti beslemesini ayarlar; gaz tipi, kapasite ve baglanti olcusu dogru secilmelidir.";
  }
  if (category.includes("servis")) {
    return "Servis, sarj ve hat baglantisi icin kullanilir; olcu ve marka ayrimi karistirilmaz.";
  }
  if (category.includes("fan")) {
    return "Evaporator veya kondenser hava akisi icin fan motorudur; watt, cap ve montaj uyumu kontrol edilir.";
  }
  if (category.includes("filtre")) {
    return "Sivi hattinda nem ve kir tutar; her devre acilisinda degisim/refakat kontrolu gerekir.";
  }
  if (category.includes("drenaj")) {
    return "Klima/sogutma drenaj suyunu uzaklastirir; basma yuksekligi ve debi kontrol edilir.";
  }
  if (category.includes("kontrol") || category.includes("termostat")) {
    return "Kontrol, defrost veya pano yonetimi icindir; sensor, cikis ve besleme uyumu kontrol edilir.";
  }
  if (category.includes("montaj")) {
    return "Montaj sarf malzemesidir; adet/tuketim ve uygulama yuzeyi kontrol edilir.";
  }
  if (category.includes("izolasyon")) {
    return "Boru yogusmasi ve enerji kaybi icin izolasyon kalemidir; cap, et kalinligi ve top metraji netlestirilir.";
  }
  if (category.includes("akiskan") || name.includes("r290")) {
    return "Sogutucu akiskan kalemidir; gaz uyumu, yanicilik sinifi ve tup miktari mutlaka kontrol edilir.";
  }
  return "Sogutma malzemesi olarak marka, model, stok ve satis fiyatiyla birlikte okunur.";
}

function purposeHintDe(item) {
  const category = normalizeLoose(item.category);
  const name = normalizeLoose(item.name);
  if (category.includes("vrf") && name.includes("dis")) {
    return "VRF-Ausseneinheit; Kapazitaet, Kommunikation und passende Innengeraete pruefen.";
  }
  if (category.includes("vrf") && name.includes("ic")) {
    return "VRF-Innengeraet; mit passender Ausseneinheit, Regler und Leistungsstufe verkaufen.";
  }
  if (category.includes("kondenser")) {
    return "Aussen-/Verfluessigereinheit; Kaeltemittel, Leistung und Leitungslange pruefen.";
  }
  if (category.includes("genlesme")) {
    return "Expansionsventil; Kaeltemittel, Leistung und Anschlussmass muessen passen.";
  }
  if (category.includes("servis")) {
    return "Service-/Anschlussventil; Abmessung und Marke nicht vermischen.";
  }
  if (category.includes("fan")) {
    return "Ventilatormotor fuer Luftstrom; Watt, Durchmesser und Montage pruefen.";
  }
  if (category.includes("filtre")) {
    return "Filtertrockner fuer Fluessigkeitsleitung; Feuchte und Schmutzschutz.";
  }
  if (category.includes("drenaj")) {
    return "Kondensatpumpe; Foerderhoehe und Leistung pruefen.";
  }
  if (category.includes("kontrol") || category.includes("termostat")) {
    return "Regelung/Defrost/Schaltschrank; Sensor, Ausgang und Versorgung pruefen.";
  }
  if (category.includes("montaj")) {
    return "Montageverbrauchsmaterial; Verbrauch und Untergrund pruefen.";
  }
  if (category.includes("izolasyon")) {
    return "Rohrisolierung gegen Kondensat und Energieverlust; Durchmesser und Rollenlaenge klaeren.";
  }
  if (category.includes("akiskan") || name.includes("r290")) {
    return "Kaeltemittelartikel; Kompatibilitaet, Brennbarkeitsklasse und Flaschenmenge pruefen.";
  }
  return "Kaeltetechnik-Artikel; immer mit Marke, Modell, Bestand und Verkaufspreis lesen.";
}

function hasAny(item, needles) {
  const text = normalizeLoose([item.name, item.brand, item.category, item.productCode, item.barcode].join(" "));
  return needles.some((needle) => text.includes(normalizeLoose(needle)));
}

function displayCode(item) {
  return String(item.productCode || item.barcode || `ITEM-${String(item.id).padStart(5, "0")}`).trim();
}

function formatSale(item) {
  const price = Number(item.salePrice || 0);
  return price > 0 ? formatEuro(price) : "fiyat yok";
}

function formatUnitDe(unit) {
  const normalized = normalizeLoose(unit);
  if (normalized === "adet") {
    return "Stueck";
  }
  if (normalized === "top") {
    return "Rolle";
  }
  return unit || "Stueck";
}

function formatEuro(value) {
  return `EUR ${roundMoney(value).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeLoose(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
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
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
