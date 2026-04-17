const today = new Date().toISOString().split("T")[0];
const MAX_ITEMS_TABLE_ROWS = 250;
const SEARCH_DEBOUNCE_MS = 180;
const UI_LANGUAGE_STORAGE_KEY = "hamburg-ui-language";
const LOW_GWP_KEYWORDS = ["r290", "r744", "co2", "propan", "low gwp", "eco", "inverter"];
const MONITORING_KEYWORDS = ["iot", "gateway", "sensor", "termostat", "dcb", "kontrol", "alarm", "defrost", "monitor"];
const BLOCKED_HTML_TAGS = new Set(["script", "style", "iframe", "object", "embed", "meta", "base", "link"]);
const URL_HTML_ATTRIBUTES = new Set(["href", "src", "xlink:href", "action", "formaction", "poster"]);
const INNER_HTML_OWNER = [Element.prototype, HTMLElement.prototype]
  .find((proto) => Object.getOwnPropertyDescriptor(proto, "innerHTML"));
const INNER_HTML_DESCRIPTOR = INNER_HTML_OWNER
  ? Object.getOwnPropertyDescriptor(INNER_HTML_OWNER, "innerHTML")
  : null;

function setRawInnerHtml(node, value) {
  if (INNER_HTML_DESCRIPTOR?.set) {
    INNER_HTML_DESCRIPTOR.set.call(node, String(value));
  }
}

function getRawInnerHtml(node) {
  if (INNER_HTML_DESCRIPTOR?.get) {
    return INNER_HTML_DESCRIPTOR.get.call(node);
  }
  return "";
}

function isSafeHtmlUrl(value) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return true;
  }
  if (candidate.startsWith("#") || candidate.startsWith("/") || candidate.startsWith("./") || candidate.startsWith("../")) {
    return true;
  }
  if (/^(https?:|mailto:|tel:|blob:|data:image\/)/i.test(candidate)) {
    return true;
  }
  return false;
}

function sanitizeHtmlTree(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const toRemove = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const tagName = String(node.tagName || "").toLowerCase();

    if (BLOCKED_HTML_TAGS.has(tagName)) {
      toRemove.push(node);
      continue;
    }

    Array.from(node.attributes).forEach((attribute) => {
      const name = String(attribute.name || "").toLowerCase();
      const value = String(attribute.value || "");

      if (name.startsWith("on") || name === "srcdoc") {
        node.removeAttribute(attribute.name);
        return;
      }

      if (name === "style" && /expression\s*\(|url\s*\(\s*['"]?\s*javascript:/i.test(value)) {
        node.removeAttribute("style");
        return;
      }

      if (URL_HTML_ATTRIBUTES.has(name) && !isSafeHtmlUrl(value)) {
        node.removeAttribute(attribute.name);
      }
    });
  }

  toRemove.forEach((node) => node.remove());
}

function sanitizeHtmlMarkup(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  if (!INNER_HTML_DESCRIPTOR?.set || !INNER_HTML_DESCRIPTOR?.get) {
    return value;
  }

  const template = document.createElement("template");
  setRawInnerHtml(template, value);
  sanitizeHtmlTree(template.content);
  return getRawInnerHtml(template);
}

function patchInnerHtmlSecurity() {
  if (!INNER_HTML_OWNER || !INNER_HTML_DESCRIPTOR?.set || !INNER_HTML_DESCRIPTOR?.get || window.__hamburgInnerHtmlPatched) {
    return;
  }

  Object.defineProperty(INNER_HTML_OWNER, "innerHTML", {
    configurable: true,
    enumerable: INNER_HTML_DESCRIPTOR.enumerable,
    get() {
      return INNER_HTML_DESCRIPTOR.get.call(this);
    },
    set(value) {
      INNER_HTML_DESCRIPTOR.set.call(this, sanitizeHtmlMarkup(String(value ?? "")));
    },
  });

  window.__hamburgInnerHtmlPatched = true;
}

patchInnerHtmlSecurity();

function createCurrencyFormatter(language) {
  return new Intl.NumberFormat(language === "de" ? "de-DE" : "tr-TR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

function createNumberFormatter(language) {
  return new Intl.NumberFormat(language === "de" ? "de-DE" : "tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

let currency = createCurrencyFormatter("tr");
let numberFormat = createNumberFormatter("tr");

const UI_TEXT = {
  tr: {
    title: "D-R-C Kältetechnik GmbH Portal",
    companyName: "D-R-C Kältetechnik GmbH",
    authLocationLine: "Hamm & Börnsen bei Hamburg, Deutschland",
    authShowcaseTitle: "Kältetechnik, Lager & Angebot – Alles in einem Portal",
    authShowcaseCopy: "Soguk oda sistemlerinden kontrol ekipmanlarina kadar tum urun ve sureclerinizi tek merkezden yonetin.",
    authHeroPrimary: "Produkte entdecken",
    authHeroSecondary: "Angebot anfordern",
    authLocationCards: [
      { label: "Hauptsitz", name: "Hamm", copy: "Schildkamp 1 · 59063 Hamm" },
      { label: "Lager bei Hamburg", name: "Börnsen", copy: "Lauenburger Landstraße 3b · 21039 Börnsen" },
    ],
    authLoginTitle: "Giriş ve müşteri hesabı",
    authLoginDesc: "Satis, stok ve proje araclarina buradan girilir. Musteriler de kendi hesaplariyla siparislerini takip eder.",
    solutionsEyebrow: "Unsere Lösungen",
    solutionsTitle: "Kühlräume, kontrol ve servis ayni akista",
    brandWallTitle: "Portfolio Marken",
    brandWallCopy: "D-R-C portfoyunde sahada en cok kullanilan sogutma markalari.",
    productFamilies: ["Kühlräume", "Evaporatoren", "Kondensatoren", "Steuerungssysteme", "Kühlraumtüren", "Panel Systeme", "Service & Support"],
    aboutTitle: "Über uns",
    aboutCopy: "D-R-C Kältetechnik GmbH, endustriyel sogutma cozumlerinde uzmanlasmis; urun tedariği, stok yonetimi ve teklif sureclerini tek platformda birlestiren modern bir yapidir.",
    addressesTitle: "Standorte",
    contactTitle: "Kontakt",
    contactLabels: ["Telefon", "E-Mail"],
    companyCards: [
      { label: "Hauptsitz", title: "Schildkamp 1<br>59063 Hamm", country: "Deutschland" },
      { label: "Lager Hamburg", title: "Lauenburger Landstraße 3b<br>21039 Börnsen", country: "Deutschland" },
    ],
    badgePrimary: "Deutschland Lager",
    badgeSecondary: "DRC PEYK Remote Control",
    peykEyebrow: "DRC PEYK",
    peykTitle: "Uzaktan izleme ve kontrol sistemi",
    peykCopy: "Oda sicakligi, alarm, defrost ve servis mudahalesini tek panelden yonetin.",
    peykPoints: ["Canli izleme", "Alarm bildirimi", "Uzaktan mudahale"],
    leanEyebrow: "B2B Portal · Hamm & Hamburg",
    leanTopbarTagline: "Hamm & Hamburg · B2B Portal",
    leanHeroTitle: "Endüstriyel Soğutma — Tedarik, Servis, Proje",
    leanHeroSub: "Personel, bayi ve müşteri için tek portal: stok, sipariş, teklif, soğuk oda projesi ve fiyat yönetimi aynı ekranda.",
    leanCtaLogin: "Giriş Yap",
    leanCtaRegister: "Müşteri Kaydı",
    leanValueProps: [
      { title: "Hamburg & Hamm depodan hızlı tedarik", copy: "Kompresör, kondenser, evaporatör, kontrol ve soğuk oda malzemeleri aynı gün sevkiyata hazır." },
      { title: "B2B portal ile stok & sipariş", copy: "Canlı stok, net/brüt fiyat, sepet ve sipariş takibini kendi hesabınızdan yönetin." },
      { title: "Proje destekli teklif", copy: "ColdRoomPro destekli soğuk oda hesaplaması ile proje malzeme listesi ve teklif tek adımda." }
    ],
    leanFooterLabels: ["Hauptsitz", "Lager Hamburg", "İletişim"],
    uiLanguage: "Arayuz Dili",
    loginIdentifier: "Kullanici Adi veya E-Posta",
    password: "Sifre",
    loginButton: "Giris Yap",
    forgotTitle: "Sifremi Unuttum",
    forgotDesc: "Kullanici adi veya e-postayi girin. Eslesen hesap varsa sifre yenileme talimati guvenli kanaldan gonderilir.",
    forgotButton: "Yenileme Baglantisi Gonder",
    noCustomerAccount: "Musteri hesabi yok mu?",
    registerTitle: "Musteri Kaydi",
    registerDesc: "Musteri hesabinizi buradan olusturabilirsiniz.",
    fullName: "Ad Soyad",
    email: "E-Posta",
    phone: "Telefon / WhatsApp",
    optionalUsername: "Kullanici Adi (Istege Bagli)",
    optionalUsernamePlaceholder: "Bos birakirsaniz sistem uretir",
    registerButton: "Musteri Hesabi Ac",
    resetTitle: "Yeni Sifre Belirle",
    resetDesc: "E-postadaki baglanti ile geldiyseniz yeni sifrenizi burada belirleyin.",
    resetButton: "Sifreyi Guncelle",
    appLabel: "Uygulama:",
    heroTitle: "Operasyon ve satis kontrol merkezi",
    heroSubtitle: "Tek ekranda stok, satis, teklif, karbon odağı ve DRC IoT gorunumu.",
    downloadXlsx: "Excel Rapor",
    downloadPdf: "PDF Ozet",
    logout: "Cikis Yap",
    tabQuotes: "Hizli Satis",
    tabQuotesDesc: "Teklif, sepet ve direkt satis islemleri",
    tabItems: "Malzemeler",
    tabItemsDesc: "Urun kartlari, filtreleme ve stoklu urun listesi",
    tabArchive: "Arsiv",
    tabArchiveDesc: "Pasif urunleri sakla ve geri al",
    tabMovements: "Stok",
    tabMovementsDesc: "Giris, cikis ve yeni urun kaydi",
    tabExpenses: "Masraf",
    tabExpensesDesc: "Firma giderlerini ve harcamalari yonet",
    tabCashbook: "Kasa",
    tabCashbookDesc: "Tahsilat ve kasa hareketleri",
    tabOrders: "Siparisler",
    tabOrdersDesc: "Siparis takibi ve durum guncelleme",
    tabCustomerOrders: "Siparis Ver",
    tabCustomerOrdersDesc: "Stoktaki urunleri gorup talep gonder",
    tabMessages: "Admin'e Yaz",
    tabMessagesDesc: "Istek, sikayet ve destek mesaji gonder",
    tabIot: "DRC IoT",
    tabIotDesc: "Uzaktan izleme, alarm ve enerji gorunumu",
    tabUsers: "Kullanicilar",
    tabUsersDesc: "Admin, personel ve musteri hesaplari",
    tabSecurity: "Guvenlik",
    tabSecurityDesc: "Olay kaydi, bloklanan IP ve erisim denemeleri",
    tabTools: "Proje Araclari",
    tabToolsDesc: "Soguk oda cizim ve hesaplama araclari",
    tabTraining: "DRC MAN Egitim",
    tabTrainingDesc: "Soru-cevap, gaz egitimi ve retrofit kontrol araclari",
    roles: { admin: "admin", staff: "personel", customer: "musteri" },
    stats: {
      customerItems: "Stoktaki Urun",
      customerItemsDesc: "Siparise acik aktif urunler",
      critical: "Kritik Urun",
      criticalDesc: "Stogu azalan urunler",
      totalItems: "Malzeme Cesidi",
      totalItemsDesc: "Kayitli aktif kart",
      stockValue: "Stok Maliyeti",
      stockValueDesc: "Alis fiyatina gore toplam",
      stockCostValue: "Stok Maliyeti",
      stockCostValueDesc: "Alis fiyatina gore toplam",
      stockSaleValue: "Satis Stok Degeri",
      stockSaleValueDesc: "Satis fiyatina gore toplam",
      expenseTotal: "Toplam Masraf",
      expenseTotalDesc: "Tum giderler",
      cashBalance: "Kasa Bakiyesi",
      cashBalanceDesc: "Net nakit durum",
    },
    common: {
      edit: "Duzenle",
      delete: "Sil",
      cancelEdit: "Duzenlemeyi Iptal Et",
      save: "Kaydet",
      addToCart: "Sepete Ekle",
      addToOrder: "Siparise Ekle",
      viewOnly: "Goruntuleme",
      restore: "Geri Al",
      archive: "Arsivle",
      reverse: "Iptal Et",
      reversed: "Iptal edildi",
      reverseRecord: "Iptal kaydi",
      active: "Aktif",
      passive: "Pasif",
      in: "Giris",
      out: "Cikis",
      unbilledSale: "Faturasiz Satis",
      approved: "Onaylandi",
      preparing: "Hazirlaniyor",
      completed: "Tamamlandi",
      cancelled: "Iptal",
      pending: "Beklemede",
      export: "Yurt Disi",
      inland: "Yurt Ici",
      release: "Bloku Kaldir",
      markRead: "Okundu",
      close: "Kapat",
    },
    messages: {
      welcome: (name, needsVerify) => `${name} olarak giris yaptiniz${needsVerify ? " | E-posta henuz dogrulanmadi" : ""}`,
      customerRegisterMailSent: "Hesabiniz olusturuldu. Dogrulama maili gonderildi ve kendi musteri panelinizdesiniz.",
      customerRegisterNoMail: "Hesabiniz olusturuldu, ancak mail sistemi ayarli olmadigi icin dogrulama maili gonderilemedi.",
      operationDone: "Islem tamamlandi.",
      passwordUpdated: "Sifreniz guncellendi.",
      stockIntakeSaved: "Yeni urun karti ve ilk stok girisi basariyla kaydedildi.",
      bulkUpdated: (count) => `${count} kaydin satis fiyati guncellendi.`,
      itemsSummaryShort: (count, total) => `${count} / ${total} malzeme goruntuleniyor`,
      itemsSummaryLong: (count, total, max) => `${count} / ${total} malzeme bulundu. Performans icin ilk ${max} kayit gosteriliyor.`,
      stockedSummary: (count) => `${count} ürün stokta`,
      noStockedItems: "Stokta urun bulunamadi.",
      archiveSummary: (count) => `${count} pasif urun arsivde tutuluyor`,
      noArchive: "Pasif urun yok.",
      noQuotes: "Henuz teklif yok.",
      emptyQuoteDraft: "Sepet bos. Soldan urun secip ekleyin.",
      quoteSummary: (_subtotal, _discount, _netTotal, _vatAmount, grossTotal, collectedAmount, remaining, unbilledTotal, unbilledRemaining) => `Faturali: ${grossTotal} | Faturasiz: ${unbilledTotal} | Tahsil: ${collectedAmount} | Kalan: ${remaining} | Faturasiz kalan: ${unbilledRemaining}`,
      noPosItems: "Aramaya uygun urun bulunamadi.",
      noAdminOrders: "Henuz musteri siparisi yok.",
      noCustomerCatalog: "Siparise acik stoklu urun bulunamadi.",
      emptyCustomerCart: "Sepetiniz bos. Soldan stoktaki urunleri ekleyebilirsiniz.",
      noCustomerOrderLines: "Henuz siparis kalemi yok.",
      customerOrderSummary: (lines, units, total) => `${lines} kalem | Toplam talep: ${units} adet/birim${total ? ` | Tahmini toplam: ${total}` : ""}`,
      noCustomerOrders: "Daha once gonderilmis siparisiniz yok.",
      customerLinked: (name) => `Kayitli musteri: ${name}`,
      customerFreeText: (name) => `Yeni/kayitsiz musteri adi olarak kaydedilecek: ${name}`,
      noAdminMessages: "Henuz admine gonderilmis mesaj yok.",
      noOwnAdminMessages: "Henuz admin ekibine gonderilmis mesajiniz yok.",
      adminMessagesSummary: (total, fresh) => `${total} mesaj | ${fresh} yeni`,
      adminMessageHistorySummary: (total, fresh) => `${total} mesaj | ${fresh} acik takip`,
      adminMessageSent: "Mesajiniz admin ekibine gonderildi.",
      noSecurityEvents: "Henuz kaydedilmis guvenlik olayi yok.",
      noSecurityBlocks: "Aktif veya gecmis IP blogu yok.",
      securitySummary: (events, blocks, activeBlocks) => `${events} olay | ${blocks} blok kaydi | ${activeBlocks} aktif blok`,
      trainingSummary: (count) => `${count} egitim kaydi var. DRC MAN bu kayitlari once kontrol eder.`,
      noTraining: "Henuz egitim kaydi yok. Ilk soru-cevap ciftinizi soldan ekleyin.",
      trainingSaved: "Egitim Kaydet",
      trainingUpdated: "Egitimi Guncelle",
      quoteSaved: (id) => `Teklif kaydedildi. Son Teklifler alaninda #${id} olarak durur. Stok ve kasa degismez.`,
      orderSent: "Siparisiniz alindi. Durumunu Siparis Gecmisi alanindan takip edebilirsiniz.",
      directSaleDone: (id, paid, remaining, hasCash) => `Direkt satis tamamlandi. Stok dusuldu, kayit Son Teklifler ve Stok Hareketleri alanina yazildi${hasCash ? ", tahsilat da Kasa Defteri'ne islendi" : ""}. No: #${id} | Tahsil edilen: ${paid} | Kalan: ${remaining}`,
      unbilledDone: (total, paid, remaining, hasCash, cashEntryId) => `Faturasiz satis kaydedildi. Stok dusuldu${hasCash ? `, tahsilat Kasa Defteri'ne islendi${cashEntryId ? ` (#${cashEntryId})` : ""}` : ""}. Toplam: ${total} | Tahsil edilen: ${paid} | Kalan: ${remaining}`,
      noOrderPhone: "Bu siparis icin kayitli telefon numarasi yok.",
      invalidWhatsappPhone: "Telefon numarasi WhatsApp icin uygun formatta degil.",
      addQuoteFirst: "Once teklif kalemi ekleyin.",
      addCartFirst: "Once sepete urun ekleyin.",
      addOrderFirst: "Siparis gondermeden once sepete en az bir urun ekleyin.",
      deleteTrainingConfirm: "Bu egitim kaydini silmek istediginize emin misiniz?",
      deleteItemConfirm: "Bu malzeme kartini silmek istiyor musunuz?",
      archiveItemConfirm: "Bu malzeme aktif listeden kaldirilip arsive tasinsin mi?",
      deleteExpenseConfirm: "Bu masraf kaydini silmek istiyor musunuz?",
      deleteCashConfirm: "Bu kasa hareketini silmek istiyor musunuz?",
      reverseMovementConfirm: "Bu stok hareketi ters kayit olusturularak iptal edilsin mi?",
    },
  },
  de: {
    title: "D-R-C Kältetechnik GmbH Portal",
    companyName: "D-R-C Kältetechnik GmbH",
    authLocationLine: "Hamm & Börnsen bei Hamburg, Deutschland",
    authShowcaseTitle: "Kältetechnik, Lager & Angebot – Alles in einem Portal",
    authShowcaseCopy: "Von Kuehlraumsystemen bis zu Steuerungskomponenten verwalten Sie Produkte und Prozesse zentral in einem Portal.",
    authHeroPrimary: "Produkte entdecken",
    authHeroSecondary: "Angebot anfordern",
    authLocationCards: [
      { label: "Hauptsitz", name: "Hamm", copy: "Schildkamp 1 · 59063 Hamm" },
      { label: "Lager bei Hamburg", name: "Börnsen", copy: "Lauenburger Landstraße 3b · 21039 Börnsen" },
    ],
    authLoginTitle: "Anmeldung und Kundenkonto",
    authLoginDesc: "Von hier aus erreichen Sie Verkauf, Lager und Projektwerkzeuge. Kunden verfolgen ihre Bestellungen mit dem eigenen Konto.",
    solutionsEyebrow: "Unsere Lösungen",
    solutionsTitle: "Kühlräume, Regelung und Service in einem Ablauf",
    brandWallTitle: "Portfolio Marken",
    brandWallCopy: "Kernmarken aus dem D-R-C Portfolio fuer Verkauf, Lager und Projekteinsatz.",
    productFamilies: ["Kühlräume", "Evaporatoren", "Kondensatoren", "Steuerungssysteme", "Kühlraumtüren", "Panel Systeme", "Service & Support"],
    aboutTitle: "Über uns",
    aboutCopy: "D-R-C Kältetechnik GmbH ist auf industrielle Kältelösungen spezialisiert und vereint Materialversorgung, Lagerorganisation und Angebotsprozesse in einer modernen Plattform.",
    addressesTitle: "Standorte",
    contactTitle: "Kontakt",
    contactLabels: ["Telefon", "E-Mail"],
    companyCards: [
      { label: "Hauptsitz", title: "Schildkamp 1<br>59063 Hamm", country: "Deutschland" },
      { label: "Lager Hamburg", title: "Lauenburger Landstraße 3b<br>21039 Börnsen", country: "Deutschland" },
    ],
    badgePrimary: "Deutschland Lager",
    badgeSecondary: "DRC PEYK Remote Control",
    peykEyebrow: "DRC PEYK",
    peykTitle: "Fernmonitoring- und Steuerungssystem",
    peykCopy: "Raumtemperatur, Alarm, Abtauung und Serviceeingriffe werden zentral ueber ein Panel verwaltet.",
    peykPoints: ["Live Monitoring", "Alarmmeldungen", "Fernzugriff"],
    leanEyebrow: "B2B Portal · Hamm & Hamburg",
    leanTopbarTagline: "Hamm & Hamburg · B2B Portal",
    leanHeroTitle: "Industrielle Kältetechnik — Vertrieb, Service, Projekt",
    leanHeroSub: "Ein Portal für Personal, Partner und Kunden: Bestand, Bestellung, Angebot, Kühlraumprojekt und Preispflege in einer Oberfläche.",
    leanCtaLogin: "Anmelden",
    leanCtaRegister: "Kundenkonto anlegen",
    leanValueProps: [
      { title: "Schneller Versand ab Hamburg & Hamm", copy: "Verdichter, Kondensatoren, Verdampfer, Regelung und Kühlraumartikel versandfertig am selben Tag." },
      { title: "B2B-Portal: Bestand & Bestellung", copy: "Live-Bestand, Netto-/Bruttopreise, Warenkorb und Bestellverlauf in Ihrem eigenen Konto." },
      { title: "Projektbasiertes Angebot", copy: "Kühlraumauslegung mit ColdRoomPro — Stückliste und Angebot in einem Schritt." }
    ],
    leanFooterLabels: ["Hauptsitz", "Lager Hamburg", "Kontakt"],
    uiLanguage: "Sprache",
    loginIdentifier: "Benutzername oder E-Mail",
    password: "Passwort",
    loginButton: "Anmelden",
    forgotTitle: "Passwort vergessen",
    forgotDesc: "Benutzername oder E-Mail eingeben. Wenn ein passendes Konto vorhanden ist, werden Reset-Anweisungen sicher versendet.",
    forgotButton: "Reset-Link senden",
    noCustomerAccount: "Noch kein Kundenkonto?",
    registerTitle: "Kundenregistrierung",
    registerDesc: "Hier koennen Sie Ihr Kundenkonto anlegen.",
    fullName: "Vor- und Nachname",
    email: "E-Mail",
    phone: "Telefon / WhatsApp",
    optionalUsername: "Benutzername (optional)",
    optionalUsernamePlaceholder: "Leer lassen, dann wird automatisch einer erzeugt",
    registerButton: "Kundenkonto anlegen",
    resetTitle: "Neues Passwort festlegen",
    resetDesc: "Wenn Sie ueber einen Link gekommen sind, koennen Sie hier ein neues Passwort setzen.",
    resetButton: "Passwort speichern",
    appLabel: "Anwendung:",
    heroTitle: "Operations- und Verkaufszentrale",
    heroSubtitle: "Lager, Verkauf, Angebote, Carbon-Fokus und DRC-IoT auf einen Blick.",
    downloadXlsx: "Excel Export",
    downloadPdf: "PDF Uebersicht",
    logout: "Abmelden",
    tabQuotes: "Schnellverkauf",
    tabQuotesDesc: "Angebote, Warenkorb und Direktverkauf",
    tabItems: "Artikel",
    tabItemsDesc: "Artikelkarten, Filter und Lagerliste",
    tabArchive: "Archiv",
    tabArchiveDesc: "Passive Artikel verwalten und zurueckholen",
    tabMovements: "Lager",
    tabMovementsDesc: "Eingang, Ausgang und neuer Artikel",
    tabExpenses: "Ausgaben",
    tabExpensesDesc: "Betriebsausgaben verwalten",
    tabCashbook: "Kasse",
    tabCashbookDesc: "Zahlungen und Kassenbewegungen",
    tabOrders: "Bestellungen",
    tabOrdersDesc: "Bestellungen pruefen und Status pflegen",
    tabCustomerOrders: "Bestellen",
    tabCustomerOrdersDesc: "Verfuegbare Artikel ansehen und anfragen",
    tabMessages: "An Admin",
    tabMessagesDesc: "Wunsch, Beschwerde und Support senden",
    tabIot: "DRC IoT",
    tabIotDesc: "Fernmonitoring, Alarme und Energieblick",
    tabUsers: "Benutzer",
    tabUsersDesc: "Admin-, Personal- und Kundenkonten",
    tabSecurity: "Sicherheit",
    tabSecurityDesc: "Ereignisprotokoll, blockierte IPs und Zugriffsversuche",
    tabTools: "Projektwerkzeuge",
    tabToolsDesc: "Zeichnung und Berechnung fuer Kuehlraeume",
    tabTraining: "DRC MAN Training",
    tabTrainingDesc: "Frage-Antwort, Kaeltemitteltraining und Retrofit-Hilfen",
    roles: { admin: "admin", staff: "personal", customer: "kunde" },
    stats: {
      customerItems: "Artikel auf Lager",
      customerItemsDesc: "Aktive Artikel fuer Bestellungen",
      critical: "Kritische Artikel",
      criticalDesc: "Artikel mit niedrigem Bestand",
      totalItems: "Artikelanzahl",
      totalItemsDesc: "Aktive Karten im System",
      stockValue: "Bestandskosten",
      stockValueDesc: "Gesamtwert nach Einkaufspreis",
      stockCostValue: "Bestandskosten",
      stockCostValueDesc: "Gesamtwert nach Einkaufspreis",
      stockSaleValue: "Verkaufswert Bestand",
      stockSaleValueDesc: "Gesamtwert nach Verkaufspreis",
      expenseTotal: "Gesamtausgaben",
      expenseTotalDesc: "Alle erfassten Ausgaben",
      cashBalance: "Kassenbestand",
      cashBalanceDesc: "Netto-Kassenstand",
    },
    common: {
      edit: "Bearbeiten",
      delete: "Loeschen",
      cancelEdit: "Bearbeitung abbrechen",
      save: "Speichern",
      addToCart: "In den Warenkorb",
      addToOrder: "Zur Bestellung",
      viewOnly: "Nur Ansicht",
      restore: "Zurueckholen",
      archive: "Archivieren",
      reverse: "Stornieren",
      reversed: "Storniert",
      reverseRecord: "Stornodatensatz",
      active: "Aktiv",
      passive: "Passiv",
      in: "Eingang",
      out: "Ausgang",
      unbilledSale: "Verkauf ohne Rechnung",
      approved: "Bestaetigt",
      preparing: "In Vorbereitung",
      completed: "Abgeschlossen",
      cancelled: "Storniert",
      pending: "Offen",
      export: "Export",
      inland: "Inland",
      release: "Freigeben",
      markRead: "Gelesen",
      close: "Schliessen",
    },
    messages: {
      welcome: (name, needsVerify) => `Angemeldet als ${name}${needsVerify ? " | E-Mail noch nicht bestaetigt" : ""}`,
      customerRegisterMailSent: "Ihr Konto wurde erstellt. Die Bestaetigungs-E-Mail wurde versendet und Sie befinden sich jetzt im Kundenbereich.",
      customerRegisterNoMail: "Ihr Konto wurde erstellt, aber das Mail-System ist noch nicht aktiv. Deshalb konnte keine Bestaetigung versendet werden.",
      operationDone: "Vorgang abgeschlossen.",
      passwordUpdated: "Ihr Passwort wurde aktualisiert.",
      stockIntakeSaved: "Neuer Artikel und erster Lagerbestand wurden erfolgreich gespeichert.",
      bulkUpdated: (count) => `Die Verkaufspreise von ${count} Datensaetzen wurden aktualisiert.`,
      itemsSummaryShort: (count, total) => `${count} / ${total} Artikel werden angezeigt`,
      itemsSummaryLong: (count, total, max) => `${count} / ${total} Artikel gefunden. Aus Performancegruenden werden nur die ersten ${max} angezeigt.`,
      stockedSummary: (count) => `${count} Artikel auf Lager`,
      noStockedItems: "Keine lagernden Artikel gefunden.",
      archiveSummary: (count) => `${count} passive Artikel befinden sich im Archiv.`,
      noArchive: "Keine archivierten Artikel vorhanden.",
      noQuotes: "Noch keine Angebote vorhanden.",
      emptyQuoteDraft: "Der Warenkorb ist leer. Links koennen Artikel hinzugefuegt werden.",
      quoteSummary: (_subtotal, _discount, _netTotal, _vatAmount, grossTotal, collectedAmount, remaining, unbilledTotal, unbilledRemaining) => `Mit Rechnung: ${grossTotal} | Ohne Rechnung: ${unbilledTotal} | Bezahlt: ${collectedAmount} | Offen: ${remaining} | Ohne Rechnung offen: ${unbilledRemaining}`,
      noPosItems: "Keine passenden Artikel fuer die Suche gefunden.",
      noAdminOrders: "Noch keine Kundenbestellungen vorhanden.",
      noCustomerCatalog: "Keine bestellbaren Artikel mit Bestand vorhanden.",
      emptyCustomerCart: "Ihr Warenkorb ist leer. Links koennen lagernde Artikel hinzugefuegt werden.",
      noCustomerOrderLines: "Noch keine Bestellpositionen vorhanden.",
      customerOrderSummary: (lines, units, total) => `${lines} Positionen | Gesamtmenge: ${units}${total ? ` | Voraussichtlich: ${total}` : ""}`,
      noCustomerOrders: "Es gibt noch keinen gesendeten Bestellverlauf.",
      customerLinked: (name) => `Kunde hinterlegt: ${name}`,
      customerFreeText: (name) => `Wird als freier Kundenname gespeichert: ${name}`,
      noAdminMessages: "Es gibt noch keine an Admin gesendeten Nachrichten.",
      noOwnAdminMessages: "Sie haben noch keine Nachricht an das Admin-Team gesendet.",
      adminMessagesSummary: (total, fresh) => `${total} Nachrichten | ${fresh} neu`,
      adminMessageHistorySummary: (total, fresh) => `${total} Nachrichten | ${fresh} offen`,
      adminMessageSent: "Ihre Nachricht wurde an das Admin-Team gesendet.",
      noSecurityEvents: "Es gibt noch keine protokollierten Sicherheitsereignisse.",
      noSecurityBlocks: "Es gibt keine aktiven oder vergangenen IP-Sperren.",
      securitySummary: (events, blocks, activeBlocks) => `${events} Ereignisse | ${blocks} Sperreintraege | ${activeBlocks} aktiv`,
      trainingSummary: (count) => `${count} Trainingseintraege vorhanden. DRC MAN prueft diese zuerst.`,
      noTraining: "Noch kein Training vorhanden. Links koennen Sie das erste Frage-Antwort-Paar anlegen.",
      trainingSaved: "Training speichern",
      trainingUpdated: "Training aktualisieren",
      quoteSaved: (id) => `Angebot gespeichert. Es erscheint unter Letzte Angebote als #${id}. Bestand und Kasse bleiben unveraendert.`,
      orderSent: "Ihre Bestellung wurde aufgenommen. Den Status sehen Sie im Bestellverlauf.",
      directSaleDone: (id, paid, remaining, hasCash) => `Direktverkauf abgeschlossen. Bestand wurde reduziert und der Eintrag unter Letzte Angebote sowie Lagerbewegungen gespeichert${hasCash ? "; die Zahlung steht auch im Kassenbuch" : ""}. Nr.: #${id} | Bezahlt: ${paid} | Offen: ${remaining}`,
      unbilledDone: (total, paid, remaining, hasCash, cashEntryId) => `Verkauf ohne Rechnung gespeichert. Bestand wurde reduziert${hasCash ? `; die Zahlung steht auch im Kassenbuch${cashEntryId ? ` (#${cashEntryId})` : ""}` : ""}. Gesamt: ${total} | Bezahlt: ${paid} | Offen: ${remaining}`,
      noOrderPhone: "Fuer diese Bestellung ist keine Telefonnummer hinterlegt.",
      invalidWhatsappPhone: "Die Telefonnummer ist fuer WhatsApp nicht gueltig.",
      addQuoteFirst: "Bitte zuerst mindestens eine Angebotsposition hinzufuegen.",
      addCartFirst: "Bitte zuerst Artikel in den Warenkorb legen.",
      addOrderFirst: "Bitte vor dem Senden mindestens einen Artikel in den Warenkorb legen.",
      deleteTrainingConfirm: "Soll dieser Trainingseintrag wirklich geloescht werden?",
      deleteItemConfirm: "Soll diese Artikelkarte wirklich geloescht werden?",
      archiveItemConfirm: "Soll dieser Artikel aus der aktiven Liste ins Archiv verschoben werden?",
      deleteExpenseConfirm: "Soll dieser Ausgabeneintrag wirklich geloescht werden?",
      deleteCashConfirm: "Soll diese Kassenbewegung wirklich geloescht werden?",
      reverseMovementConfirm: "Soll diese Lagerbewegung mit einer Gegenbuchung storniert werden?",
    },
  },
};

const state = {
  user: null,
  summary: null,
  activeTab: "items",
  itemsVersion: 0,
  items: [],
  archivedItems: [],
  movements: [],
  expenses: [],
  cashbook: [],
  users: [],
  orders: [],
  adminMessages: [],
  securityEvents: [],
  securityBlocks: [],
  agentTraining: [],
  agentTrainingLoaded: false,
  inventoryLoadedAll: false,
  archiveLoaded: false,
  inventoryLoadPromise: null,
  retrofitChecklist: null,
  filters: {
    search: "",
    brand: "all",
    category: "all",
  },
  quoteDraft: [],
  customerOrderDraft: [],
  customerCatalogFilters: { search: "", category: "all", brand: "all", sort: "name" },
  customers: [],
  customersLoaded: false,
  projects: [],
  projectsFilters: { search: "", status: "all" },
  activeProject: null, // {project, items} for detail modal
  quoteFilters: {
    search: "",
    brand: "all",
    category: "all",
  },
  uiLanguage: localStorage.getItem(UI_LANGUAGE_STORAGE_KEY) === "de" ? "de" : "tr",
  assistantStatus: null,
  assistantUserId: null,
  assistantLanguage: "tr",
  assistantMessages: [],
  filterOptionsSignature: "",
  filterOptions: { brand: [], category: [] },
  itemSelectSignature: "",
  itemSearchSuggestionSignature: "",
  movementSelectableItems: null,
  inventoryWarmupScheduled: false,
};

let filterDebounceTimer = null;
let quoteFilterDebounceTimer = null;
const TOOL_SCOPE_COOKIE = "hamburg_tool_scope";

const refs = {
  loginScreen: document.getElementById("loginScreen"),
  appScreen: document.getElementById("appScreen"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  forgotPasswordForm: document.getElementById("forgotPasswordForm"),
  forgotPasswordError: document.getElementById("forgotPasswordError"),
  forgotPasswordSuccess: document.getElementById("forgotPasswordSuccess"),
  customerRegisterForm: document.getElementById("customerRegisterForm"),
  customerRegisterError: document.getElementById("customerRegisterError"),
  customerRegisterSuccess: document.getElementById("customerRegisterSuccess"),
  resetPasswordPanel: document.getElementById("resetPasswordPanel"),
  resetPasswordForm: document.getElementById("resetPasswordForm"),
  resetPasswordError: document.getElementById("resetPasswordError"),
  resetPasswordSuccess: document.getElementById("resetPasswordSuccess"),
  welcomeText: document.getElementById("welcomeText"),
  heroFocusPill: document.getElementById("heroFocusPill"),
  heroIotPill: document.getElementById("heroIotPill"),
  opsOverview: document.getElementById("opsOverview"),
  carbonOverview: document.getElementById("carbonOverview"),
  iotOverview: document.getElementById("iotOverview"),
  statsGrid: document.getElementById("statsGrid"),
  itemForm: document.getElementById("itemForm"),
  movementForm: document.getElementById("movementForm"),
  movementItemSearch: document.getElementById("movementItemSearch"),
  movementItemSuggestions: document.getElementById("movementItemSuggestions"),
  movementItemDropdown: document.getElementById("movementItemDropdown"),
  movementAutoCostHint: document.getElementById("movementAutoCostHint"),
  stockIntakeForm: document.getElementById("stockIntakeForm"),
  expenseForm: document.getElementById("expenseForm"),
  cashForm: document.getElementById("cashForm"),
  userForm: document.getElementById("userForm"),
  adminMessageForm: document.getElementById("adminMessageForm"),
  adminMessageError: document.getElementById("adminMessageError"),
  adminMessageSuccess: document.getElementById("adminMessageSuccess"),
  adminMessageSubmitButton: document.getElementById("adminMessageSubmitButton"),
  assistantTrainingForm: document.getElementById("assistantTrainingForm"),
  retrofitChecklistForm: document.getElementById("retrofitChecklistForm"),
  bulkPricingForm: document.getElementById("bulkPricingForm"),
  itemsTableBody: document.getElementById("itemsTableBody"),
  itemsSummary: document.getElementById("itemsSummary"),
  stockedItemsSummary: document.getElementById("stockedItemsSummary"),
  stockedItemsList: document.getElementById("stockedItemsList"),
  archiveTableBody: document.getElementById("archiveTableBody"),
  archiveSummary: document.getElementById("archiveSummary"),
  movementsTableBody: document.getElementById("movementsTableBody"),
  expensesTableBody: document.getElementById("expensesTableBody"),
  cashbookTableBody: document.getElementById("cashbookTableBody"),
  usersTableBody: document.getElementById("usersTableBody"),
  ordersTableBody: document.getElementById("ordersTableBody"),
  adminMessagesTableBody: document.getElementById("adminMessagesTableBody"),
  adminMessagesSummary: document.getElementById("adminMessagesSummary"),
  adminMessageHistorySummary: document.getElementById("adminMessageHistorySummary"),
  adminMessageList: document.getElementById("adminMessageList"),
  securityEventsTableBody: document.getElementById("securityEventsTableBody"),
  securityBlocksTableBody: document.getElementById("securityBlocksTableBody"),
  securitySummary: document.getElementById("securitySummary"),
  assistantTrainingTableBody: document.getElementById("assistantTrainingTableBody"),
  assistantTrainingSummary: document.getElementById("assistantTrainingSummary"),
  barcodeItemSelect: document.getElementById("barcodeItemSelect"),
  barcodeImage: document.getElementById("barcodeImage"),
  logoutButton: document.getElementById("logoutButton"),
  downloadXlsx: document.getElementById("downloadXlsx"),
  downloadPdf: document.getElementById("downloadPdf"),
  itemSearch: document.getElementById("itemSearch"),
  itemSearchSuggestions: document.getElementById("itemSearchSuggestions"),
  itemSearchDropdown: document.getElementById("itemSearchDropdown"),
  brandFilter: document.getElementById("brandFilter"),
  categoryFilter: document.getElementById("categoryFilter"),
  bulkBrandFilter: document.getElementById("bulkBrandFilter"),
  bulkCategoryFilter: document.getElementById("bulkCategoryFilter"),
  itemSubmitButton: document.getElementById("itemSubmitButton"),
  itemCancelEdit: document.getElementById("itemCancelEdit"),
  assistantTrainingSubmitButton: document.getElementById("assistantTrainingSubmitButton"),
  assistantTrainingCancelButton: document.getElementById("assistantTrainingCancelButton"),
  retrofitChecklistGenerateButton: document.getElementById("retrofitChecklistGenerateButton"),
  retrofitChecklistCopyButton: document.getElementById("retrofitChecklistCopyButton"),
  retrofitChecklistTitle: document.getElementById("retrofitChecklistTitle"),
  retrofitChecklistHint: document.getElementById("retrofitChecklistHint"),
  retrofitChecklistOutput: document.getElementById("retrofitChecklistOutput"),
  quoteForm: document.getElementById("quoteForm"),
  quoteCustomerDatalist: document.getElementById("quoteCustomerDatalist"),
  quoteCustomerNameInput: document.getElementById("quoteCustomerNameInput"),
  quoteCustomerUserIdInput: document.getElementById("quoteCustomerUserIdInput"),
  quoteCustomerHint: document.getElementById("quoteCustomerHint"),
  posCatalogGrid: document.getElementById("posCatalogGrid"),
  quoteDraftBody: document.getElementById("quoteDraftBody"),
  quoteDraftSummary: document.getElementById("quoteDraftSummary"),
  saveQuoteButton: document.getElementById("saveQuoteButton"),
  checkoutSaleButton: document.getElementById("checkoutSaleButton"),
  checkoutUnbilledSaleButton: document.getElementById("checkoutUnbilledSaleButton"),
  quotesList: document.getElementById("quotesList"),
  customerCatalogGrid: document.getElementById("customerCatalogGrid"),
  customerCatalogSearch: document.getElementById("customerCatalogSearch"),
  customerCatalogCategory: document.getElementById("customerCatalogCategory"),
  customerCatalogBrand: document.getElementById("customerCatalogBrand"),
  customerCatalogSort: document.getElementById("customerCatalogSort"),
  customerCatalogSummary: document.getElementById("customerCatalogSummary"),
  customerCartTotals: document.getElementById("customerCartTotals"),
  cartTotalNet: document.getElementById("cartTotalNet"),
  cartTotalVat: document.getElementById("cartTotalVat"),
  cartTotalGross: document.getElementById("cartTotalGross"),
  customerOrderReviewModal: document.getElementById("customerOrderReviewModal"),
  orderReviewList: document.getElementById("orderReviewList"),
  orderReviewNet: document.getElementById("orderReviewNet"),
  orderReviewVat: document.getElementById("orderReviewVat"),
  orderReviewGross: document.getElementById("orderReviewGross"),
  orderReviewNote: document.getElementById("orderReviewNote"),
  confirmCustomerOrderButton: document.getElementById("confirmCustomerOrderButton"),
  customerOrderForm: document.getElementById("customerOrderForm"),
  customerOrderBody: document.getElementById("customerOrderBody"),
  customerOrderSummary: document.getElementById("customerOrderSummary"),
  // Project module
  projectsList: document.getElementById("projectsList"),
  projectsListSummary: document.getElementById("projectsListSummary"),
  projectSearch: document.getElementById("projectSearch"),
  projectStatusFilter: document.getElementById("projectStatusFilter"),
  newProjectButton: document.getElementById("newProjectButton"),
  projectFormModal: document.getElementById("projectFormModal"),
  projectForm: document.getElementById("projectForm"),
  projectFormTitle: document.getElementById("projectFormTitle"),
  projectFormSubmitButton: document.getElementById("projectFormSubmitButton"),
  projectCustomerDatalist: document.getElementById("projectCustomerDatalist"),
  projectCustomerNameInput: document.getElementById("projectCustomerNameInput"),
  projectCustomerUserIdInput: document.getElementById("projectCustomerUserIdInput"),
  projectDetailModal: document.getElementById("projectDetailModal"),
  projectDetailTitle: document.getElementById("projectDetailTitle"),
  projectDetailStatus: document.getElementById("projectDetailStatus"),
  projectDetailCustomer: document.getElementById("projectDetailCustomer"),
  projectDetailItemCount: document.getElementById("projectDetailItemCount"),
  projectDetailTotal: document.getElementById("projectDetailTotal"),
  projectDetailType: document.getElementById("projectDetailType"),
  projectItemsList: document.getElementById("projectItemsList"),
  projectDetailNote: document.getElementById("projectDetailNote"),
  projectAddItemForm: document.getElementById("projectAddItemForm"),
  projectItemSearch: document.getElementById("projectItemSearch"),
  projectItemSuggestions: document.getElementById("projectItemSuggestions"),
  projectItemIdInput: document.getElementById("projectItemIdInput"),
  projectAddItemButton: document.getElementById("projectAddItemButton"),
  projectEditButton: document.getElementById("projectEditButton"),
  projectConvertQuoteButton: document.getElementById("projectConvertQuoteButton"),
  projectDeleteButton: document.getElementById("projectDeleteButton"),
  customerOrdersList: document.getElementById("customerOrdersList"),
  submitCustomerOrderButton: document.getElementById("submitCustomerOrderButton"),
  customerVerificationBanner: document.getElementById("customerVerificationBanner"),
  resendVerificationButton: document.getElementById("resendVerificationButton"),
  resendVerificationMessage: document.getElementById("resendVerificationMessage"),
  quoteItemSearch: document.getElementById("quoteItemSearch"),
  quoteBrandFilter: document.getElementById("quoteBrandFilter"),
  quoteCategoryFilter: document.getElementById("quoteCategoryFilter"),
  assistantWidget: document.getElementById("assistantWidget"),
  iotMonitorRoot: document.getElementById("iotMonitorRoot"),
  assistantToggle: document.getElementById("assistantToggle"),
  assistantPanel: document.getElementById("assistantPanel"),
  assistantClose: document.getElementById("assistantClose"),
  assistantLanguage: document.getElementById("assistantLanguage"),
  assistantStatus: document.getElementById("assistantStatus"),
  assistantMessages: document.getElementById("assistantMessages"),
  assistantForm: document.getElementById("assistantForm"),
  assistantInput: document.getElementById("assistantInput"),
  uiLanguageSelects: document.querySelectorAll(".ui-language-select"),
};

function currentUiText() {
  return UI_TEXT[state.uiLanguage] || UI_TEXT.tr;
}

function t(path, ...args) {
  const value = path.split(".").reduce((result, part) => result?.[part], currentUiText());
  if (typeof value === "function") {
    return value(...args);
  }
  return value ?? path;
}

function langText(trText, deText) {
  return state.uiLanguage === "de" ? deText : trText;
}

function setText(selector, value) {
  const node = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!node || typeof value !== "string") {
    return;
  }
  node.textContent = value;
}

function setHtml(selector, value) {
  const node = typeof selector === "string" ? document.querySelector(selector) : selector;
  if (!node || typeof value !== "string") {
    return;
  }
  node.innerHTML = value;
}

function replaceLabelText(label, text) {
  if (!label || typeof text !== "string") {
    return;
  }

  const textNode = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    textNode.textContent = `${text} `;
    return;
  }

  label.prepend(document.createTextNode(`${text} `));
}

function setFormFieldLabel(form, fieldName, text) {
  const field = form?.elements?.[fieldName];
  const label = field?.closest("label");
  replaceLabelText(label, text);
}

function setFieldPlaceholder(form, fieldName, text) {
  const field = form?.elements?.[fieldName];
  if (!field || typeof text !== "string") {
    return;
  }
  field.placeholder = text;
}

function setSelectOptionTexts(select, texts) {
  if (!select || !texts) {
    return;
  }
  Array.from(select.options).forEach((option) => {
    if (texts[option.value]) {
      option.textContent = texts[option.value];
    }
  });
}

function setTableHeaders(tableBody, labels) {
  const headers = tableBody?.closest("table")?.querySelectorAll("thead th");
  if (!headers?.length) {
    return;
  }
  labels.forEach((label, index) => {
    if (headers[index]) {
      headers[index].textContent = label;
    }
  });
}

function syncUiLanguageControls() {
  refs.uiLanguageSelects?.forEach((select) => {
    select.value = state.uiLanguage;
    select.setAttribute("aria-label", t("uiLanguage"));
  });
}

function setUiLanguage(language) {
  const nextLanguage = language === "de" ? "de" : "tr";
  state.uiLanguage = nextLanguage;
  localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, nextLanguage);
  currency = createCurrencyFormatter(nextLanguage);
  numberFormat = createNumberFormatter(nextLanguage);
  invalidateInventoryUiCaches();
  if (refs.quoteForm?.elements?.language) {
    refs.quoteForm.elements.language.value = nextLanguage;
  }
  applyUiTranslations();
  if (state.user) {
    renderAll();
  }
}

function applyUiTranslations() {
  document.documentElement.lang = state.uiLanguage;
  document.title = t("title");
  syncUiLanguageControls();

  setText("#loginScreen .ui-language-label", t("uiLanguage"));
  setText("#appScreen .ui-language-label", t("uiLanguage"));
  setText(".auth-brand-eyebrow", t("companyName"));
  setText(".auth-location-line", t("authLocationLine"));
  setText(".auth-showcase-title", t("authShowcaseTitle"));
  setText(".auth-showcase-copy", t("authShowcaseCopy"));
  document.querySelectorAll("[data-auth-cta]").forEach((node) => {
    const key = node.getAttribute("data-auth-cta") === "primary" ? "authHeroPrimary" : "authHeroSecondary";
    setText(node, t(key));
  });
  const locationCards = t("authLocationCards");
  document.querySelectorAll("[data-location-label]").forEach((node, index) => {
    setText(node, locationCards[index]?.label || node.textContent);
  });
  document.querySelectorAll("[data-location-name]").forEach((node, index) => {
    setText(node, locationCards[index]?.name || node.textContent);
  });
  document.querySelectorAll("[data-location-copy]").forEach((node, index) => {
    setText(node, locationCards[index]?.copy || node.textContent);
  });
  setText("#solutionsEyebrow", t("solutionsEyebrow"));
  setText("#solutionsTitle", t("solutionsTitle"));
  setText(".auth-login-heading h2", t("authLoginTitle"));
  setText(".auth-login-heading .muted", t("authLoginDesc"));
  setText(".brand-wall-title", t("brandWallTitle"));
  setText("#brandWallCopy", t("brandWallCopy"));
  document.querySelectorAll("[data-solution-name]").forEach((node, index) => {
    setText(node, t("productFamilies")[index] || node.textContent);
  });
  setText("#aboutEyebrow", t("aboutTitle"));
  setText("#aboutCopy", t("aboutCopy"));
  setText("#addressesEyebrow", t("addressesTitle"));
  setText("#contactEyebrow", t("contactTitle"));
  const companyCards = document.querySelectorAll(".company-info-card");
  const companyCardData = t("companyCards");
  companyCards.forEach((card, index) => {
    setText(card.querySelector("[data-company-card-label]"), companyCardData[index]?.label || "");
    setHtml(card.querySelector("[data-company-card-title]"), companyCardData[index]?.title || "");
    setText(card.querySelector("[data-company-card-country]"), companyCardData[index]?.country || "");
  });
  document.querySelectorAll("[data-contact-label]").forEach((node, index) => {
    setText(node, t("contactLabels")[index] || node.textContent);
  });
  setText(".badge-primary", t("badgePrimary"));
  setText(".badge-secondary", t("badgeSecondary"));
  setText("#peykEyebrow", t("peykEyebrow"));
  setText("#peykTitle", t("peykTitle"));
  setText("#peykCopy", t("peykCopy"));
  document.querySelectorAll("[data-peyk-point]").forEach((node, index) => {
    setText(node, t("peykPoints")[index] || node.textContent);
  });

  // Lean landing (Faz 6 v2)
  document.querySelectorAll("[data-lean-eyebrow]").forEach((node) => setText(node, t("leanEyebrow")));
  document.querySelectorAll("[data-lean-title]").forEach((node) => setText(node, t("leanHeroTitle")));
  document.querySelectorAll("[data-lean-sub]").forEach((node) => setText(node, t("leanHeroSub")));
  document.querySelectorAll("[data-lean-cta-login]").forEach((node) => setText(node, t("leanCtaLogin")));
  document.querySelectorAll("[data-lean-cta-register]").forEach((node) => setText(node, t("leanCtaRegister")));
  document.querySelectorAll("[data-lean-topbar-tagline]").forEach((node) => setText(node, t("leanTopbarTagline")));
  const leanVps = t("leanValueProps") || [];
  document.querySelectorAll("[data-lean-vp-title]").forEach((node) => {
    const idx = Number(node.getAttribute("data-lean-vp-title")) || 0;
    setText(node, leanVps[idx]?.title || node.textContent);
  });
  document.querySelectorAll("[data-lean-vp-copy]").forEach((node) => {
    const idx = Number(node.getAttribute("data-lean-vp-copy")) || 0;
    setText(node, leanVps[idx]?.copy || node.textContent);
  });
  const leanFooterLabels = t("leanFooterLabels") || [];
  document.querySelectorAll("[data-lean-footer-label]").forEach((node) => {
    const idx = Number(node.getAttribute("data-lean-footer-label")) || 0;
    setText(node, leanFooterLabels[idx] || node.textContent);
  });
  // Auth modal labels
  document.querySelectorAll("[data-auth-title-login]").forEach((node) => setText(node, t("authLoginTitle")));
  document.querySelectorAll("[data-auth-desc-login]").forEach((node) => setText(node, t("authLoginDesc")));
  document.querySelectorAll("[data-auth-title-register]").forEach((node) => setText(node, t("registerTitle")));
  document.querySelectorAll("[data-auth-desc-register]").forEach((node) => setText(node, t("registerDesc")));
  document.querySelectorAll("[data-auth-forgot-summary]").forEach((node) => setText(node, t("forgotTitle")));

  setFormFieldLabel(refs.loginForm, "identifier", t("loginIdentifier"));
  setFormFieldLabel(refs.loginForm, "password", t("password"));
  setText("#loginForm button[type='submit']", t("loginButton"));

  const authPanels = document.querySelectorAll("#loginScreen .auth-subpanel");
  const forgotPanel = authPanels[0];
  const registerPanel = authPanels[1];

  setText(forgotPanel?.querySelector("h3"), t("forgotTitle"));
  setText(forgotPanel?.querySelector("p.muted"), t("forgotDesc"));
  setFormFieldLabel(refs.forgotPasswordForm, "identifier", t("loginIdentifier"));
  setText("#forgotPasswordForm button[type='submit']", t("forgotButton"));

  setText(".auth-divider span", t("noCustomerAccount"));
  setText(registerPanel?.querySelector("h3"), t("registerTitle"));
  setText(registerPanel?.querySelector("p.muted"), t("registerDesc"));
  setFormFieldLabel(refs.customerRegisterForm, "name", t("fullName"));
  setFormFieldLabel(refs.customerRegisterForm, "email", t("email"));
  setFormFieldLabel(refs.customerRegisterForm, "phone", t("phone"));
  setFormFieldLabel(refs.customerRegisterForm, "username", t("optionalUsername"));
  setFormFieldLabel(refs.customerRegisterForm, "password", t("password"));
  setFieldPlaceholder(refs.customerRegisterForm, "phone", "+49...");
  setFieldPlaceholder(refs.customerRegisterForm, "username", t("optionalUsernamePlaceholder"));
  setText("#customerRegisterForm button[type='submit']", t("registerButton"));

  setText("#resetPasswordPanel h3", t("resetTitle"));
  setText("#resetPasswordPanel p.muted", t("resetDesc"));
  setFormFieldLabel(refs.resetPasswordForm, "password", langText("Yeni Sifre", "Neues Passwort"));
  setText("#resetPasswordForm button[type='submit']", t("resetButton"));

  setText(".hero h1", t("heroTitle"));
  setText(".hero .hero-subtitle", t("heroSubtitle"));
  setText(refs.downloadXlsx, t("downloadXlsx"));
  setText(refs.downloadPdf, t("downloadPdf"));
  setText(refs.logoutButton, t("logout"));

  [
    ["quotes", t("tabQuotes"), t("tabQuotesDesc")],
    ["items", t("tabItems"), t("tabItemsDesc")],
    ["archive", t("tabArchive"), t("tabArchiveDesc")],
    ["movements", t("tabMovements"), t("tabMovementsDesc")],
    ["expenses", t("tabExpenses"), t("tabExpensesDesc")],
    ["cashbook", t("tabCashbook"), t("tabCashbookDesc")],
    ["orders", isCustomerUser() ? t("tabCustomerOrders") : t("tabOrders"), isCustomerUser() ? t("tabCustomerOrdersDesc") : t("tabOrdersDesc")],
    ["messages", t("tabMessages"), t("tabMessagesDesc")],
    ["iot", t("tabIot"), t("tabIotDesc")],
    ["users", t("tabUsers"), t("tabUsersDesc")],
    ["security", t("tabSecurity"), t("tabSecurityDesc")],
    ["tools", t("tabTools"), t("tabToolsDesc")],
    ["training", t("tabTraining"), t("tabTrainingDesc")],
  ].forEach(([tab, title, desc]) => {
    document.querySelectorAll(`[data-tab="${tab}"]`).forEach((button) => {
      setText(button.querySelector(".tab-title"), title);
      setText(button.querySelector("small"), desc);
    });
  });
  setText(".tab-main-label", langText("Gunluk Islemler", "Taegliche Arbeit"));
  setText(".tab-admin-summary", langText("Yonetim ve Ayarlar", "Verwaltung und Einstellungen"));

  setText("[data-tab-content='items'] .sales-search-panel h2", langText("Malzeme Arama", "Artikelsuche"));
  replaceLabelText(refs.itemSearch?.closest("label"), langText("Arama", "Suche"));
  replaceLabelText(refs.brandFilter?.closest("label"), langText("Marka", "Marke"));
  replaceLabelText(refs.categoryFilter?.closest("label"), langText("Kategori", "Kategorie"));
  refs.itemSearch.placeholder = langText("Urun, marka veya stok kodu ara", "Artikel, Marke oder Lagercode suchen");
  setText(".stocked-panel h3", langText("Stokta Olan Ürünler", "Artikel auf Lager"));
  setText(".items-list-drawer summary", langText("Tum Malzeme Listesi", "Gesamte Artikelliste"));
  setText(".management-drawer summary", langText("Yonetim Araclari", "Verwaltungswerkzeuge"));

  const itemFormSection = refs.itemForm?.closest("section");
  setText(itemFormSection?.querySelector("h2"), langText("Malzeme Karti", "Artikelkarte"));
  setFormFieldLabel(refs.itemForm, "name", langText("Malzeme Adi", "Artikelname"));
  setFormFieldLabel(refs.itemForm, "brand", langText("Marka", "Marke"));
  setFormFieldLabel(refs.itemForm, "category", langText("Kategori", "Kategorie"));
  setFormFieldLabel(refs.itemForm, "unit", langText("Birim", "Einheit"));
  setFormFieldLabel(refs.itemForm, "minStock", langText("Kritik Stok", "Mindestbestand"));
  setFormFieldLabel(refs.itemForm, "defaultPrice", langText("Alis Fiyati", "Einkaufspreis"));
  setFormFieldLabel(refs.itemForm, "listPrice", langText("Liste Fiyati", "Listenpreis"));
  setFormFieldLabel(refs.itemForm, "salePrice", langText("Net/Satis Fiyati", "Netto-/Verkaufspreis"));
  setFormFieldLabel(refs.itemForm, "barcode", langText("Stok Kodu", "Lagercode"));
  setFormFieldLabel(refs.itemForm, "notes", langText("Not", "Notiz"));
  setFieldPlaceholder(refs.itemForm, "brand", langText("Orn. Embraco, Hisense", "z. B. Embraco, Hisense"));
  setFieldPlaceholder(refs.itemForm, "barcode", langText("DRC-00001 gibi", "z. B. DRC-00001"));
  setFieldPlaceholder(refs.itemForm, "notes", langText("Raf veya tedarik notu", "Regal- oder Lieferantennotiz"));
  refs.itemSubmitButton.textContent = refs.itemForm?.elements?.id?.value
    ? langText("Malzemeyi Guncelle", "Artikel aktualisieren")
    : langText("Malzeme Ekle", "Artikel anlegen");
  refs.itemCancelEdit.textContent = t("common.cancelEdit");

  setText(".panel-lite h3", langText("Toplu Fiyat Guncelleme", "Preisaktualisierung in Serie"));
  setFormFieldLabel(refs.bulkPricingForm, "brand", langText("Marka", "Marke"));
  setFormFieldLabel(refs.bulkPricingForm, "category", langText("Kategori", "Kategorie"));
  setFormFieldLabel(refs.bulkPricingForm, "pricingMode", langText("Hesaplama", "Berechnung"));
  setFormFieldLabel(refs.bulkPricingForm, "baseField", langText("Baz Alan", "Basisfeld"));
  setFormFieldLabel(refs.bulkPricingForm, "increasePercent", langText("Artis Yuzdesi", "Erhoehung in %"));
  setSelectOptionTexts(refs.bulkPricingForm?.elements?.pricingMode, {
    margin: langText("Alisa Gore Marj", "Marge auf Einkauf"),
    increase: langText("Mevcut Satisa Artis", "Aufschlag auf Verkauf"),
  });
  setSelectOptionTexts(refs.bulkPricingForm?.elements?.baseField, {
    purchase: langText("Alis Fiyati", "Einkaufspreis"),
    sale: langText("Satis Fiyati", "Verkaufspreis"),
  });
  setText("#bulkPricingForm button[type='submit']", langText("Satis Fiyatlarini Guncelle", "Verkaufspreise aktualisieren"));
  setText(".barcode-section h2", langText("Stok Kodu Onizleme", "Lagercode-Vorschau"));

  const movementsSections = document.querySelectorAll("[data-tab-content='movements'] .two-column > section");
  setText(movementsSections[0]?.querySelector("h2"), langText("Stok Giris / Cikis", "Lager Eingang / Ausgang"));
  setText(
    movementsSections[0]?.querySelector(".section-tip"),
    langText(
      "Bu form mevcut urunlerde stok giris ve cikis icin kullanilir. Ustteki arama kutusuna harf yazdikca urun listesi otomatik daralir.",
      "Dieses Formular wird fuer Lagerzugang und -ausgang bei vorhandenen Artikeln verwendet. Beim Tippen im Suchfeld wird die Artikelliste automatisch eingegrenzt."
    )
  );
  replaceLabelText(refs.movementItemSearch?.closest("label"), langText("Urun Arama", "Artikelsuche"));
  if (refs.movementItemSearch) {
    refs.movementItemSearch.placeholder = langText("Urun, marka veya stok kodu yazin", "Artikel, Marke oder Lagercode eingeben");
  }
  setFormFieldLabel(refs.movementForm, "itemId", langText("Malzeme", "Artikel"));
  setFormFieldLabel(refs.movementForm, "type", langText("Islem", "Vorgang"));
  setFormFieldLabel(refs.movementForm, "quantity", langText("Miktar", "Menge"));
  setFormFieldLabel(refs.movementForm, "unitPrice", langText("Birim Maliyet", "Stueckpreis"));
  setFormFieldLabel(refs.movementForm, "date", langText("Tarih", "Datum"));
  setFormFieldLabel(refs.movementForm, "note", langText("Aciklama", "Beschreibung"));
  setSelectOptionTexts(refs.movementForm?.elements?.type, {
    entry: langText("Giris", "Eingang"),
    exit: langText("Cikis", "Ausgang"),
  });
  setText("#movementForm button[type='submit']", langText("Hareket Kaydet", "Bewegung speichern"));
  setText(refs.movementAutoCostHint, langText("Maliyet bilgisi sistemde otomatik uygulanir.", "Der Kostenwert wird automatisch aus dem System uebernommen."));

  const stockIntakePanel = document.querySelector("[data-tab-content='movements'] .panel-lite");
  setText(stockIntakePanel?.querySelector("h3"), langText("Yeni Urun + Ilk Stok Girisi", "Neuer Artikel + Erstbestand"));
  setText(stockIntakePanel?.querySelector(".section-tip"), langText("Yeni marka, kategori veya urun karti burada acilir. Kaydedince urun otomatik olusur ve ilk stok girisi ayni anda islenir.", "Hier werden neue Marken, Kategorien oder Artikel angelegt. Beim Speichern wird gleichzeitig der Erstbestand gebucht."));
  setFormFieldLabel(refs.stockIntakeForm, "name", langText("Malzeme Adi", "Artikelname"));
  setFormFieldLabel(refs.stockIntakeForm, "brand", langText("Marka", "Marke"));
  setFormFieldLabel(refs.stockIntakeForm, "category", langText("Kategori", "Kategorie"));
  setFormFieldLabel(refs.stockIntakeForm, "unit", langText("Birim", "Einheit"));
  setFormFieldLabel(refs.stockIntakeForm, "quantity", langText("Ilk Miktar", "Erstmenge"));
  setFormFieldLabel(refs.stockIntakeForm, "unitPrice", langText("Birim Alis", "Einkauf pro Einheit"));
  setFormFieldLabel(refs.stockIntakeForm, "listPrice", langText("Liste Fiyati", "Listenpreis"));
  setFormFieldLabel(refs.stockIntakeForm, "salePrice", langText("Net/Satis Fiyati", "Netto-/Verkaufspreis"));
  setFormFieldLabel(refs.stockIntakeForm, "minStock", langText("Kritik Stok", "Mindestbestand"));
  setFormFieldLabel(refs.stockIntakeForm, "date", langText("Tarih", "Datum"));
  setFormFieldLabel(refs.stockIntakeForm, "barcode", langText("Stok Kodu", "Lagercode"));
  setFormFieldLabel(refs.stockIntakeForm, "notes", langText("Malzeme Notu", "Artikelnote"));
  setFormFieldLabel(refs.stockIntakeForm, "movementNote", langText("Hareket Notu", "Bewegungsnotiz"));
  setFieldPlaceholder(refs.stockIntakeForm, "name", langText("Orn. Embraco NJ 6220 Z", "z. B. Embraco NJ 6220 Z"));
  setFieldPlaceholder(refs.stockIntakeForm, "brand", langText("Orn. Embraco", "z. B. Embraco"));
  setFieldPlaceholder(refs.stockIntakeForm, "category", langText("Orn. Kompresor", "z. B. Kompressor"));
  setFieldPlaceholder(refs.stockIntakeForm, "barcode", langText("DRC-00001 gibi", "z. B. DRC-00001"));
  setFieldPlaceholder(refs.stockIntakeForm, "notes", langText("Raf, seri veya tedarik notu", "Regal-, Serien- oder Lieferantennotiz"));
  setFieldPlaceholder(refs.stockIntakeForm, "movementNote", langText("Ilk alis bilgisi", "Erste Einkaufsinfo"));
  setText("#stockIntakeForm button[type='submit']", langText("Yeni Urun ve Stok Girisi Kaydet", "Neuen Artikel mit Erstbestand speichern"));
  setText(movementsSections[1]?.querySelector("h2"), langText("Son Hareketler", "Letzte Bewegungen"));

  const expenseSections = document.querySelectorAll("[data-tab-content='expenses'] .two-column > section");
  setText(expenseSections[0]?.querySelector("h2"), langText("Masraf Ekle", "Ausgabe erfassen"));
  setFormFieldLabel(refs.expenseForm, "title", langText("Baslik", "Titel"));
  setFormFieldLabel(refs.expenseForm, "category", langText("Kategori", "Kategorie"));
  setFormFieldLabel(refs.expenseForm, "amount", langText("Tutar", "Betrag"));
  setFormFieldLabel(refs.expenseForm, "date", langText("Tarih", "Datum"));
  setFormFieldLabel(refs.expenseForm, "paymentType", langText("Odeme Tipi", "Zahlungsart"));
  setFormFieldLabel(refs.expenseForm, "note", langText("Aciklama", "Beschreibung"));
  setSelectOptionTexts(refs.expenseForm?.elements?.paymentType, {
    cash: langText("Nakit", "Bar"),
    bank: langText("Banka", "Bank"),
    card: langText("Kart", "Karte"),
  });
  setText("#expenseForm button[type='submit']", langText("Masraf Kaydet", "Ausgabe speichern"));
  setText(expenseSections[1]?.querySelector("h2"), langText("Masraf Listesi", "Ausgabenliste"));
  setText(expenseSections[1]?.querySelector(".section-tip"), langText("Her kaydi satirin sagindaki sil butonundan kaldirabilirsiniz.", "Jeden Eintrag koennen Sie ueber die rechte Loeschen-Schaltflaeche entfernen."));

  const cashSections = document.querySelectorAll("[data-tab-content='cashbook'] .two-column > section");
  setText(cashSections[0]?.querySelector("h2"), langText("Kasa Hareketi", "Kassenbewegung"));
  setFormFieldLabel(refs.cashForm, "type", langText("Islem", "Vorgang"));
  setFormFieldLabel(refs.cashForm, "title", langText("Baslik", "Titel"));
  setFormFieldLabel(refs.cashForm, "amount", langText("Tutar", "Betrag"));
  setFormFieldLabel(refs.cashForm, "date", langText("Tarih", "Datum"));
  setFormFieldLabel(refs.cashForm, "reference", langText("Referans", "Referenz"));
  setFormFieldLabel(refs.cashForm, "note", langText("Not", "Notiz"));
  setFieldPlaceholder(refs.cashForm, "title", langText("Orn. Tezgah satisi", "z. B. Barverkauf"));
  setSelectOptionTexts(refs.cashForm?.elements?.type, {
    in: langText("Kasa Girisi", "Kasseneingang"),
    out: langText("Kasa Cikisi", "Kassenausgang"),
    unbilled_sale: langText("Faturasiz Satis", "Verkauf ohne Rechnung"),
  });
  setText("#cashForm button[type='submit']", langText("Kasa Kaydet", "Kasse speichern"));
  setText(cashSections[1]?.querySelector("h2"), langText("Kasa Defteri", "Kassenbuch"));
  setText(
    cashSections[1]?.querySelector(".section-tip"),
    langText(
      "Kasa girisleri, cikislari ve faturasiz satis hareketleri burada listelenir. Referans alani fis, havale, kart slipi veya banka aciklamasi icin; Not alani ise serbest aciklama icindir.",
      "Hier werden Kassen-Eingaenge, -Ausgaenge und Verkaeufe ohne Rechnung gelistet. Das Referenzfeld ist fuer Beleg, Ueberweisung, Kartenslip oder Bankreferenz; das Notizfeld fuer freie Ergaenzungen."
    )
  );

  setText("[data-tab-content='quotes'] .pos-catalog h2", langText("Urun Katalogu", "Produktkatalog"));
  setText("[data-tab-content='quotes'] .pos-catalog .muted", langText("Arayin, filtreleyin ve tek tikla sepete ekleyin.", "Suchen, filtern und mit einem Klick in den Warenkorb legen."));
  replaceLabelText(refs.quoteItemSearch?.closest("label"), langText("Arama", "Suche"));
  replaceLabelText(refs.quoteBrandFilter?.closest("label"), langText("Marka", "Marke"));
  replaceLabelText(refs.quoteCategoryFilter?.closest("label"), langText("Kategori", "Kategorie"));
  refs.quoteItemSearch.placeholder = langText("Urun veya marka ara", "Artikel oder Marke suchen");
  setText("[data-tab-content='quotes'] .pos-cart h2", langText("Sepet ve Musteri", "Warenkorb und Kunde"));
  setText("[data-tab-content='quotes'] .pos-cart .muted", langText("Teklif olusturmadan once sepeti ve musteri bilgilerini tamamlayin.", "Vor dem Angebot bitte Warenkorb und Kundendaten vervollstaendigen."));
  setFormFieldLabel(refs.quoteForm, "customerName", langText("Musteri", "Kunde"));
  setFormFieldLabel(refs.quoteForm, "title", langText("Baslik", "Titel"));
  setFormFieldLabel(refs.quoteForm, "date", langText("Tarih", "Datum"));
  setFormFieldLabel(refs.quoteForm, "language", langText("Dil", "Sprache"));
  setFormFieldLabel(refs.quoteForm, "isExport", langText("Satis Tipi", "Verkaufsart"));
  setFormFieldLabel(refs.quoteForm, "discount", langText("Iskonto", "Rabatt"));
  setFormFieldLabel(refs.quoteForm, "paymentType", langText("Tahsilat Tipi", "Zahlungsart"));
  setFormFieldLabel(refs.quoteForm, "collectedAmount", langText("Tahsil Edilen", "Erhalten"));
  setFormFieldLabel(refs.quoteForm, "reference", langText("Referans", "Referenz"));
  setFormFieldLabel(refs.quoteForm, "note", langText("Not", "Notiz"));
  setFieldPlaceholder(refs.quoteForm, "title", langText("Orn. Soguk Oda Teklifi", "z. B. Kuehlraum-Angebot"));
  setFieldPlaceholder(refs.quoteForm, "reference", langText("Fis, havale, kart sonu", "Beleg, Ueberweisung, Kartenreferenz"));
  setSelectOptionTexts(refs.quoteForm?.elements?.language, { de: "Deutsch", tr: langText("Turkce", "Tuerkisch") });
  setSelectOptionTexts(refs.quoteForm?.elements?.isExport, {
    true: langText("Yurt Disi - KDV Yok", "Export - ohne MwSt"),
    false: langText("Yurt Ici - KDV Dahil", "Inland - inkl. MwSt"),
  });
  setSelectOptionTexts(refs.quoteForm?.elements?.paymentType, {
    cash: langText("Nakit", "Bar"),
    bank: langText("Banka", "Bank"),
    card: langText("Kart", "Karte"),
  });
  setText("[data-tab-content='quotes'] .section-tip", langText("Direkt Satis stok dusurur; tahsilat yazdiysaniz Kasa Defteri'ne de isler. Teklif Olarak Kaydet sadece Son Teklifler listesine kaydeder, stok ve kasa degismez. Faturasiz satis butonunda sepette gorunen tutar son satis tutaridir; ekstra KDV eklenmez.", "Direktverkauf reduziert den Bestand; bei eingetragener Zahlung wird auch das Kassenbuch aktualisiert. Als Angebot speichern legt nur einen Eintrag unter Letzte Angebote an, Bestand und Kasse bleiben unveraendert. Beim Verkauf ohne Rechnung gilt der sichtbare Warenkorbwert als Endsumme; es wird keine zusaetzliche MwSt hinzugefuegt."));
  setText(refs.checkoutSaleButton, langText("Direkt Satis Yap", "Direktverkauf"));
  setText(refs.checkoutUnbilledSaleButton, langText("Faturasiz Satis", "Ohne Rechnung"));
  setText(refs.saveQuoteButton, langText("Teklif Olarak Kaydet", "Als Angebot speichern"));
  setText("[data-tab-content='quotes'] .recent-quotes h2", langText("Son Teklifler", "Letzte Angebote"));

  const ordersSection = document.querySelector("[data-tab-content='orders'] .admin-only section");
  setText(ordersSection?.querySelector("h2"), langText("Siparis Takibi", "Bestellverfolgung"));
  setText(ordersSection?.querySelector(".section-tip"), langText("Musteri siparisleri burada toplanir ve durumlari takip edilir.", "Hier werden Kundenbestellungen gesammelt und im Status verfolgt."));
  setText("#customerVerificationBanner h3", langText("E-Posta Dogrulamasi Bekleniyor", "E-Mail-Bestaetigung ausstehend"));
  setText("#customerVerificationBanner p.muted", langText("Siparis bildirimleri ve sifre yenileme baglantilari icin e-posta adresinizi dogrulamaniz onerilir.", "Fuer Bestellhinweise und Passwortlinks wird eine bestaetigte E-Mail empfohlen."));
  setText(refs.resendVerificationButton, langText("Dogrulama Mailini Tekrar Gonder", "Bestaetigungs-E-Mail erneut senden"));
  setText("[data-tab-content='orders'] .customer-only .pos-catalog h2", langText("Stoktaki Urunler", "Verfuegbare Artikel"));
  setText("[data-tab-content='orders'] .customer-only .pos-catalog .muted", langText("Stoktaki urunler, stok adedi ve satis fiyatlari burada gosterilir.", "Hier sehen Sie lagernde Artikel, Bestandsmenge und Verkaufspreise."));
  setText("[data-tab-content='orders'] .customer-only .pos-cart h2", langText("Siparis Sepeti", "Bestellkorb"));
  setText("[data-tab-content='orders'] .customer-only .pos-cart .muted", langText("Istediginiz urunleri secip siparis talebi gonderebilirsiniz.", "Waehlen Sie die gewuenschten Artikel und senden Sie Ihre Bestellung."));
  setFormFieldLabel(refs.customerOrderForm, "date", langText("Tarih", "Datum"));
  setFormFieldLabel(refs.customerOrderForm, "note", langText("Siparis Notu", "Bestellnotiz"));
  setFieldPlaceholder(refs.customerOrderForm, "note", langText("Teslim tarihi, aciklama veya ozel not", "Lieferdatum, Beschreibung oder Sondernotiz"));
  setText(refs.submitCustomerOrderButton, langText("Siparişi Gözden Geçir", "Bestellung prüfen"));
  setText("[data-tab-content='orders'] .customer-only .recent-quotes h2", langText("Siparis Gecmisi", "Bestellverlauf"));

  setText("[data-tab-content='messages'] .admin-only h2", langText("Admin Mesaj Kutusu", "Admin-Nachrichten"));
  setText(refs.adminMessagesSummary, langText("Yeni istekler, sikayetler ve destek mesajlari burada toplanir.", "Hier laufen neue Wuensche, Beschwerden und Support-Nachrichten zusammen."));
  setText("[data-tab-content='messages'] .non-admin-only section:first-child h2", langText("Admin'e Mesaj Gonder", "Nachricht an Admin"));
  setText("[data-tab-content='messages'] .non-admin-only section:first-child .muted", langText("Sikayet, istek, destek talebi veya oneri mesajinizi admin ekibine yazin.", "Schreiben Sie hier Wunsch, Beschwerde, Support-Anfrage oder Vorschlag an das Admin-Team."));
  setText("[data-tab-content='messages'] .non-admin-only section:last-child h2", langText("Mesaj Gecmisim", "Mein Nachrichtenverlauf"));
  setText("[data-tab-content='messages'] .non-admin-only section:last-child .muted", langText("Burada size ait tum admin mesajlarinin durumunu gorebilirsiniz.", "Hier sehen Sie den Status Ihrer Nachrichten an das Admin-Team."));
  if (refs.adminMessageForm) {
    setFormFieldLabel(refs.adminMessageForm, "category", langText("Tur", "Typ"));
    setFormFieldLabel(refs.adminMessageForm, "subject", langText("Baslik", "Betreff"));
    setFormFieldLabel(refs.adminMessageForm, "message", langText("Mesaj", "Nachricht"));
    setFieldPlaceholder(refs.adminMessageForm, "subject", langText("Kisa konu basligi", "Kurzer Betreff"));
    setFieldPlaceholder(refs.adminMessageForm, "message", langText("Admin ekibine iletmek istediginiz detaylari yazin", "Schreiben Sie hier Ihr Anliegen an das Admin-Team"));
    setSelectOptionTexts(refs.adminMessageForm.elements.category, {
      request: langText("Istek", "Wunsch"),
      complaint: langText("Sikayet", "Beschwerde"),
      suggestion: langText("Oneri", "Vorschlag"),
    });
  }
  setText(refs.adminMessageSubmitButton, langText("Mesaji Gonder", "Nachricht senden"));

  const userSections = document.querySelectorAll("[data-tab-content='users'] .two-column > section");
  setText(userSections[0]?.querySelector("h2"), langText("Kullanici Ekle", "Benutzer anlegen"));
  setFormFieldLabel(refs.userForm, "name", t("fullName"));
  setFormFieldLabel(refs.userForm, "username", langText("Kullanici Adi", "Benutzername"));
  setFormFieldLabel(refs.userForm, "email", t("email"));
  setFormFieldLabel(refs.userForm, "phone", t("phone"));
  setFormFieldLabel(refs.userForm, "password", t("password"));
  setFormFieldLabel(refs.userForm, "role", langText("Rol", "Rolle"));
  setFieldPlaceholder(refs.userForm, "phone", "+49...");
  setSelectOptionTexts(refs.userForm?.elements?.role, {
    staff: langText("Personel", "Personal"),
    customer: langText("Musteri", "Kunde"),
    admin: "Admin",
  });
  setText("#userForm button[type='submit']", langText("Kullanici Ekle", "Benutzer anlegen"));
  setText(userSections[1]?.querySelector("h2"), langText("Kullanicilar", "Benutzer"));

  const toolsPanel = document.querySelector("[data-tab-content='tools'] .tools-panel");
  const iotPanel = document.querySelector("[data-tab-content='iot'] .iot-panel");
  setText(iotPanel?.querySelector(".section-head h2"), langText("DRC IoT Pack", "DRC IoT Pack"));
  setText(iotPanel?.querySelector(".section-head .muted"), langText("Uzaktan izleme ekraninda oda durumu, alarm akisi, karbon odagi ve saha karar notlari tek yerde toplanir.", "Im Fernmonitoring-Bildschirm laufen Raumstatus, Alarme, Carbon-Fokus und Feldnotizen an einem Ort zusammen."));
  setText(toolsPanel?.querySelector(".section-head h2"), langText("Proje Araclari", "Projektwerkzeuge"));
  setText(toolsPanel?.querySelector(".section-head .muted"), langText("Soguk oda hesaplama, 3D cizim, borulama ve teklif hazirligi icin kullanilan araclar burada toplandi. Bu bolume tum kullanicilar erisebilir.", "Werkzeuge fuer Kuehlraum-Berechnung, 3D-Zeichnung, Rohrfuehrung und Angebotsvorbereitung sind hier gesammelt. Dieser Bereich ist fuer alle angemeldeten Benutzer offen."));
  const toolCards = toolsPanel?.querySelectorAll(".tool-card") || [];
  setText(toolCards[0]?.querySelector("h3"), langText("Soguk Oda Proje Hesaplayici", "Kuehlraum-Projektrechner"));
  setText(toolCards[0]?.querySelector(".muted"), langText("Kapasite, malzeme, teklif ve proje akisi icin kullandiginiz ana ColdRoomPro uygulamasi.", "Die ColdRoomPro-Anwendung fuer Kapazitaet, Material, Angebot und Projektablauf."));
  setText(toolCards[0]?.querySelector(".tool-link"), langText("Yeni Sekmede Ac", "In neuem Tab oeffnen"));
  setText(toolCards[1]?.querySelector("h3"), langText("Soguk Oda Cizim Pro", "Kuehlraum-Zeichnung Pro"));
  setText(toolCards[1]?.querySelector(".muted"), langText("Yan yana oda, ortak duvar, borulama, 3D gorunum ve PDF/PNG ciktilari icin tam cizim araci.", "Zeichenwerkzeug fuer nebeneinanderliegende Raeume, gemeinsame Waende, Rohrfuehrung, 3D-Ansicht und PDF/PNG-Ausgaben."));
  setText(toolCards[1]?.querySelector(".tool-link"), langText("Yeni Sekmede Ac", "In neuem Tab oeffnen"));

  const trainingSections = document.querySelectorAll("[data-tab-content='training'] .two-column > section");
  setText(trainingSections[0]?.querySelector("h2"), langText("DRC MAN Egitim Kaydi", "DRC MAN Trainingseintrag"));
  setText(trainingSections[0]?.querySelector("p.muted"), langText("Buraya eklenen soru-cevaplar once DRC MAN tarafinda denenir. Egitim kayitlari admin tarafindan duzenlenir ve tum yerel kullanicilar ayni bilgiyi alir.", "Hier hinterlegte Fragen und Antworten werden zuerst von DRC MAN verwendet. Trainings werden vom Admin gepflegt und fuer alle lokalen Benutzer genutzt."));
  setFormFieldLabel(refs.assistantTrainingForm, "topic", langText("Konu", "Thema"));
  setFormFieldLabel(refs.assistantTrainingForm, "audience", langText("Hedef Kullanici", "Zielgruppe"));
  setFormFieldLabel(refs.assistantTrainingForm, "keywords", langText("Anahtar Kelimeler", "Schluesselwoerter"));
  setFormFieldLabel(refs.assistantTrainingForm, "trQuestion", langText("TR Soru", "TR Frage"));
  setFormFieldLabel(refs.assistantTrainingForm, "trAnswer", langText("TR Cevap", "TR Antwort"));
  setFormFieldLabel(refs.assistantTrainingForm, "deQuestion", langText("DE Soru", "DE Frage"));
  setFormFieldLabel(refs.assistantTrainingForm, "deAnswer", langText("DE Cevap", "DE Antwort"));
  setFormFieldLabel(refs.assistantTrainingForm, "suggestions", langText("Onerilen Sonraki Sorular", "Empfohlene Folgefragen"));
  setFormFieldLabel(refs.assistantTrainingForm, "isActive", langText("Durum", "Status"));
  setFieldPlaceholder(refs.assistantTrainingForm, "topic", langText("Orn. Faturasiz satis akisi", "z. B. Ablauf Verkauf ohne Rechnung"));
  setFieldPlaceholder(refs.assistantTrainingForm, "keywords", langText("stok girisi, malzeme girisi, wareneingang", "wareneingang, lagerzugang, materialeingang"));
  setFieldPlaceholder(refs.assistantTrainingForm, "trQuestion", langText("Orn. stok girisi nasil yapilir", "z. B. wie buche ich wareneingang"));
  setFieldPlaceholder(refs.assistantTrainingForm, "trAnswer", langText("Bu soruya verilecek net operasyon cevabi", "Klare operative Antwort fuer diese Frage"));
  setFieldPlaceholder(refs.assistantTrainingForm, "deQuestion", langText("Orn. wie buche ich wareneingang", "z. B. wie buche ich wareneingang"));
  setFieldPlaceholder(refs.assistantTrainingForm, "deAnswer", langText("Almanca cevap opsiyoneldir, bos kalirsa Turkce cevap kullanilir", "Deutsche Antwort ist optional; leer bedeutet, dass die tuerkische Antwort genutzt wird."));
  setFieldPlaceholder(refs.assistantTrainingForm, "suggestions", langText("virgulle ayirin: stok cikisi nasil yapilir, hareket iptali nasil olur", "mit Komma trennen: wie buche ich lagerausgang, wie storniere ich eine bewegung"));
  setSelectOptionTexts(refs.assistantTrainingForm?.elements?.audience, {
    all: langText("Tum Kullanicilar", "Alle Benutzer"),
    admin: langText("Sadece Admin", "Nur Admin"),
    staff: langText("Admin + Personel", "Admin + Personal"),
    customer: langText("Sadece Musteri", "Nur Kunde"),
  });
  setSelectOptionTexts(refs.assistantTrainingForm?.elements?.isActive, {
    true: langText("Aktif", "Aktiv"),
    false: langText("Pasif", "Passiv"),
  });
  refs.assistantTrainingSubmitButton.textContent = refs.assistantTrainingForm?.elements?.id?.value
    ? t("messages.trainingUpdated")
    : t("messages.trainingSaved");
  refs.assistantTrainingCancelButton.textContent = t("common.cancelEdit");
  setText(trainingSections[1]?.querySelector("h2"), langText("Egitim Listesi", "Trainingsliste"));

  const retrofitPanel = document.querySelector(".retrofit-checklist-panel");
  setText(retrofitPanel?.querySelector(".section-head h2"), langText("Retrofit Checklist", "Retrofit-Checkliste"));
  setText(
    retrofitPanel?.querySelector(".section-head .muted"),
    langText(
      "Mevcut gazdan yeni gaza gecis dusunulurken sahada atlanmamasi gereken adimlari bu arac hizli toparlar.",
      "Dieses Werkzeug fasst die wichtigen Schritte zusammen, die bei einer Umruestung auf ein anderes Kaeltemittel im Feld nicht uebersehen werden sollten."
    )
  );
  setFormFieldLabel(refs.retrofitChecklistForm, "currentGas", langText("Mevcut Gaz", "Bestandskaeltemittel"));
  setFormFieldLabel(refs.retrofitChecklistForm, "targetGas", langText("Planlanan Gaz", "Geplantes Kaeltemittel"));
  setFormFieldLabel(refs.retrofitChecklistForm, "applicationType", langText("Uygulama", "Anwendung"));
  setFormFieldLabel(refs.retrofitChecklistForm, "systemType", langText("Sistem Tipi", "Anlagentyp"));
  setFormFieldLabel(refs.retrofitChecklistForm, "oilType", langText("Yag Durumu", "Oelzustand"));
  setFormFieldLabel(refs.retrofitChecklistForm, "compressorApproval", langText("Kompresor Onayi", "Verdichterfreigabe"));
  setFormFieldLabel(refs.retrofitChecklistForm, "valveState", langText("Valf ve Orifis", "Ventil und Duesen"));
  setFormFieldLabel(refs.retrofitChecklistForm, "controlsState", langText("Kontrol ve Emniyet", "Regelung und Sicherheit"));
  setFormFieldLabel(refs.retrofitChecklistForm, "labelState", langText("Etiket ve Evrak", "Kennzeichnung und Unterlagen"));
  setFormFieldLabel(refs.retrofitChecklistForm, "notes", langText("Saha Notu", "Feldnotiz"));
  setFieldPlaceholder(
    refs.retrofitChecklistForm,
    "notes",
    langText(
      "Kompresor modeli, olculer, valf tipi, musteri istegi gibi notlari yazin",
      "Notieren Sie z. B. Verdichtermodell, Messwerte, Ventiltyp oder Kundenwunsch"
    )
  );
  setSelectOptionTexts(refs.retrofitChecklistForm?.elements?.targetGas, {
    "": langText("Henuz Net Degil", "Noch offen"),
  });
  setSelectOptionTexts(refs.retrofitChecklistForm?.elements?.applicationType, {
    positive: langText("Arti Muhafaza", "Pluskuehlung"),
    negative: langText("Negatif Depo", "Tiefkuehlung"),
    shock: langText("Sok Oda", "Schockraum"),
    compact: langText("Kompakt Sistem", "Kompakte Anlage"),
    industrial: langText("Endustriyel Tesis", "Industrieanlage"),
  });
  setSelectOptionTexts(refs.retrofitChecklistForm?.elements?.systemType, {
    legacy: langText("Eski Sistem / Legacy", "Bestandsanlage / Legacy"),
    retrofit: langText("Mevcut Sistem Retrofit", "Retrofit im Bestand"),
    new: langText("Yeni Proje", "Neuprojekt"),
  });
  setSelectOptionTexts(refs.retrofitChecklistForm?.elements?.oilType, {
    unknown: langText("Bilinmiyor", "Unbekannt"),
    mineral: langText("Mineral", "Mineral"),
    ab: langText("AB / Alkylbenzene", "AB / Alkylbenzene"),
    poe: "POE",
  });
  setSelectOptionTexts(refs.retrofitChecklistForm?.elements?.compressorApproval, {
    unknown: langText("Henuz Kontrol Edilmedi", "Noch nicht geprueft"),
    approved: langText("Onayli", "Freigegeben"),
    not_approved: langText("Uyumsuz / Onaysiz", "Nicht freigegeben / kritisch"),
  });
  setSelectOptionTexts(refs.retrofitChecklistForm?.elements?.valveState, {
    unchecked: langText("Henuz Kontrol Edilmedi", "Noch nicht geprueft"),
    checked: langText("Kontrol Edildi", "Geprueft"),
    replace: langText("Degisim Gerekebilir", "Tausch moeglich"),
  });
  setSelectOptionTexts(refs.retrofitChecklistForm?.elements?.controlsState, {
    unchecked: langText("Henuz Kontrol Edilmedi", "Noch nicht geprueft"),
    checked: langText("Kontrol Edildi", "Geprueft"),
    update_required: langText("Ayar / Guncelleme Gerekli", "Anpassung erforderlich"),
  });
  setSelectOptionTexts(refs.retrofitChecklistForm?.elements?.labelState, {
    pending: langText("Bekliyor", "Offen"),
    updated: langText("Guncellendi", "Aktualisiert"),
  });
  setText(refs.retrofitChecklistTitle, langText("Saha Kontrol Ciktisi", "Ausgabe fuer den Feldeinsatz"));
  setText(
    refs.retrofitChecklistHint,
    langText(
      "Formu doldurup checklist urettiginizde burada saha sirasina gore duzenlenmis bir yol haritasi goreceksiniz.",
      "Nach dem Erstellen sehen Sie hier eine nach Feldeinsatz sortierte Retrofit-Checkliste."
    )
  );
  setText(refs.retrofitChecklistGenerateButton, langText("Checklist Uret", "Checkliste erzeugen"));
  setText(refs.retrofitChecklistCopyButton, langText("Checklist Kopyala", "Checkliste kopieren"));

  setText(".assistant-head .eyebrow", langText("Soru Cevap", "Fragen und Antworten"));
  replaceLabelText(refs.assistantLanguage?.closest("label"), langText("Dil", "Sprache"));
  setText(refs.assistantClose, langText("Kapat", "Schliessen"));
  refs.assistantClose.setAttribute("aria-label", langText("DRC MAN panelini kapat", "DRC MAN Panel schliessen"));
  refs.assistantInput.placeholder = langText("Orn. En pahali urun hangisi?", "z. B. Welcher Artikel ist am teuersten?");
  setText("#assistantForm button[type='submit']", langText("Sor", "Fragen"));

  setTableHeaders(refs.itemsTableBody, [
    langText("Malzeme", "Artikel"),
    langText("Marka", "Marke"),
    langText("Kategori", "Kategorie"),
    langText("Stok", "Bestand"),
    langText("Alis", "Einkauf"),
    langText("Liste", "Liste"),
    langText("Net/Satis", "Netto/Verkauf"),
    langText("Kritik", "Minimum"),
    langText("Stok Kodu", "Lagercode"),
    langText("Islem", "Aktion"),
  ]);
  setTableHeaders(refs.archiveTableBody, [
    langText("Malzeme", "Artikel"),
    langText("Marka", "Marke"),
    langText("Kategori", "Kategorie"),
    langText("Alis", "Einkauf"),
    langText("Liste", "Liste"),
    langText("Net/Satis", "Netto/Verkauf"),
    langText("Stok Kodu", "Lagercode"),
    langText("Islem", "Aktion"),
  ]);
  setTableHeaders(refs.movementsTableBody, [
    langText("Tarih", "Datum"),
    langText("Malzeme", "Artikel"),
    langText("Tip", "Typ"),
    langText("Miktar", "Menge"),
    langText("Not", "Notiz"),
    langText("Kullanici", "Benutzer"),
    langText("Islem", "Aktion"),
  ]);
  setTableHeaders(refs.expensesTableBody, [
    langText("Tarih", "Datum"),
    langText("Baslik", "Titel"),
    langText("Kategori", "Kategorie"),
    langText("Odeme Tipi", "Zahlungsart"),
    langText("Aciklama", "Beschreibung"),
    langText("Tutar", "Betrag"),
    langText("Kullanici", "Benutzer"),
    langText("Islem", "Aktion"),
  ]);
  setTableHeaders(refs.cashbookTableBody, [
    langText("Tarih", "Datum"),
    langText("Tip", "Typ"),
    langText("Baslik", "Titel"),
    langText("Referans", "Referenz"),
    langText("Not", "Notiz"),
    langText("Tutar", "Betrag"),
    langText("Kullanici", "Benutzer"),
    langText("Islem", "Aktion"),
  ]);
  setTableHeaders(refs.ordersTableBody, [
    langText("Tarih", "Datum"),
    langText("Musteri", "Kunde"),
    langText("Kalemler", "Positionen"),
    langText("Durum", "Status"),
    langText("Not", "Notiz"),
    langText("Islem", "Aktion"),
  ]);
  setTableHeaders(refs.adminMessagesTableBody, [
    langText("Tarih", "Datum"),
    langText("Gonderen", "Absender"),
    langText("Tur", "Typ"),
    langText("Baslik", "Betreff"),
    langText("Mesaj", "Nachricht"),
    langText("Durum", "Status"),
    langText("Islem", "Aktion"),
  ]);
  setTableHeaders(refs.usersTableBody, [
    langText("Ad Soyad", "Name"),
    langText("Kullanici Adi", "Benutzername"),
    t("email"),
    langText("Telefon", "Telefon"),
    langText("Rol", "Rolle"),
  ]);
  setTableHeaders(refs.securityEventsTableBody, [
    langText("Tarih", "Datum"),
    langText("Seviye", "Stufe"),
    langText("Olay", "Ereignis"),
    langText("Kullanici", "Benutzer"),
    langText("Rol", "Rolle"),
    "IP",
    langText("Detay", "Details"),
  ]);
  setTableHeaders(refs.securityBlocksTableBody, [
    "IP",
    langText("Sebep", "Grund"),
    langText("Blok Bitisi", "Sperre bis"),
    langText("Durum", "Status"),
    langText("Islem", "Aktion"),
  ]);
  setTableHeaders(refs.assistantTrainingTableBody, [
    langText("Konu", "Thema"),
    langText("Hedef", "Ziel"),
    langText("TR Soru", "TR Frage"),
    langText("DE Soru", "DE Frage"),
    langText("Durum", "Status"),
    langText("Guncelleyen", "Aktualisiert von"),
    langText("Islem", "Aktion"),
  ]);

  const securitySections = document.querySelectorAll("[data-tab-content='security'] .two-column > section");
  setText(securitySections[0]?.querySelector("h2"), langText("Guvenlik Olaylari", "Sicherheitsereignisse"));
  setText(securitySections[1]?.querySelector("h2"), langText("IP Blok Listesi", "IP-Sperrliste"));
  setText(securitySections[1]?.querySelector(".muted"), langText("Supheli denemelerde sistem IP adresini gecici bloke eder. Gerekiyorsa buradan kaldirin.", "Bei verdaechtigen Versuchen sperrt das System die IP temporaer. Bei Bedarf hier freigeben."));
}

function effectiveRole() {
  return state.user?.role === "operator" ? "staff" : state.user?.role;
}

function isAdminUser() {
  return effectiveRole() === "admin";
}

function isStaffUser() {
  return effectiveRole() === "staff";
}

function canManageCashbook() {
  return isAdminUser() || isStaffUser();
}

function isCustomerUser() {
  return effectiveRole() === "customer";
}

function canViewPurchasePrices() {
  return isAdminUser();
}

function canManageStockIntake() {
  return isAdminUser() || isStaffUser();
}

function resolveBasePurchasePrice(item) {
  return firstPositiveNumber(item?.defaultPrice, item?.lastPurchasePrice, item?.averagePurchasePrice);
}

function resolveEffectiveSalePrice(item) {
  const explicitSalePrice = firstPositiveNumber(item?.salePrice);
  if (explicitSalePrice > 0) {
    return explicitSalePrice;
  }

  const explicitListPrice = firstPositiveNumber(item?.listPrice);
  if (explicitListPrice > 0) {
    return explicitListPrice;
  }

  const basePurchasePrice = resolveBasePurchasePrice(item);
  return basePurchasePrice > 0 ? Number((basePurchasePrice * 1.22).toFixed(2)) : 0;
}

function isCriticalStockItem(item) {
  const minStock = Number(item?.minStock || 0);
  const currentStock = Number(item?.currentStock || 0);
  return minStock > 0 && currentStock <= minStock;
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const numericValue = Number(value || 0);
    if (numericValue > 0) {
      return numericValue;
    }
  }
  return 0;
}

function visibleSalePrice(item) {
  return resolveEffectiveSalePrice(item);
}

function visibleListPrice(item) {
  return Number(item.listPrice || 0);
}

function cartSalePrice(item, quantity = 2) {
  const listPrice = Number(item.listPrice || 0);
  const netPrice = Number(item.salePrice || 0);
  if (Number(quantity) <= 1 && listPrice > 0) {
    return listPrice;
  }
  return netPrice > 0 ? netPrice : listPrice;
}

function updateQuoteLinePrice(line) {
  line.unitPrice = cartSalePrice(
    {
      listPrice: line.listPrice,
      salePrice: line.salePrice,
    },
    line.quantity
  );
}

function syncRoleSensitiveFields() {
  const canViewPurchase = canViewPurchasePrices();
  document.querySelectorAll("[data-purchase-column]").forEach((node) => {
    node.classList.toggle("hidden", !canViewPurchase);
  });

  const movementUnitPriceField = refs.movementForm?.elements?.unitPrice;
  if (movementUnitPriceField) {
    movementUnitPriceField.disabled = !canViewPurchase;
    movementUnitPriceField.required = canViewPurchase;
    if (!canViewPurchase) {
      movementUnitPriceField.value = "";
    }
  }

  if (refs.movementAutoCostHint) {
    refs.movementAutoCostHint.classList.toggle("hidden", canViewPurchase || isCustomerUser());
  }

  const canUseStockIntake = canManageStockIntake();
  [refs.stockIntakeForm?.elements?.unitPrice, refs.stockIntakeForm?.elements?.listPrice, refs.stockIntakeForm?.elements?.salePrice].filter(Boolean).forEach((field) => {
    field.disabled = !canUseStockIntake;
    field.required = canUseStockIntake && field.name === "unitPrice";
    if (!canUseStockIntake) {
      field.value = "";
    }
  });
}

bindEvents();
initialize();

function bindEvents() {
  bindAuthModal();
  bindProjectsEvents();
  refs.loginForm.addEventListener("pointerdown", unlockLoginInputs, { once: true });
  refs.loginForm.addEventListener("focusin", unlockLoginInputs, { once: true });
  refs.loginForm.addEventListener("submit", handleLogin);
  refs.forgotPasswordForm?.addEventListener("submit", handleForgotPassword);
  refs.customerRegisterForm?.addEventListener("submit", handleCustomerRegister);
  refs.resetPasswordForm?.addEventListener("submit", handleResetPassword);
  refs.adminMessageForm?.addEventListener("submit", handleAdminMessageSubmit);
  refs.itemForm.addEventListener("submit", handleItemSubmit);
  refs.movementForm.addEventListener("submit", (event) => handleSubmit(event, "/api/movements"));
  refs.stockIntakeForm?.addEventListener("submit", handleStockIntakeSubmit);
  refs.expenseForm.addEventListener("submit", (event) => handleSubmit(event, "/api/expenses"));
  refs.cashForm.addEventListener("submit", handleCashSubmit);
  refs.bulkPricingForm.addEventListener("submit", handleBulkPricingSubmit);
  refs.itemCancelEdit.addEventListener("click", resetItemForm);
  refs.saveQuoteButton.addEventListener("click", handleQuoteSave);
  refs.checkoutSaleButton.addEventListener("click", handleDirectSale);
  refs.checkoutUnbilledSaleButton?.addEventListener("click", handleUnbilledSale);
  refs.submitCustomerOrderButton?.addEventListener("click", openCustomerOrderReview);
  refs.confirmCustomerOrderButton?.addEventListener("click", handleCustomerOrderConfirm);
  refs.resendVerificationButton?.addEventListener("click", handleResendVerification);

  // Customer catalog filters
  refs.customerCatalogSearch?.addEventListener("input", (e) => {
    state.customerCatalogFilters.search = e.target.value;
    if (state._customerFilterTimer) clearTimeout(state._customerFilterTimer);
    state._customerFilterTimer = setTimeout(() => renderCustomerCatalog(), 150);
  });
  refs.customerCatalogCategory?.addEventListener("change", (e) => {
    state.customerCatalogFilters.category = e.target.value;
    renderCustomerCatalog();
  });
  refs.customerCatalogBrand?.addEventListener("change", (e) => {
    state.customerCatalogFilters.brand = e.target.value;
    renderCustomerCatalog();
  });
  refs.customerCatalogSort?.addEventListener("change", (e) => {
    state.customerCatalogFilters.sort = e.target.value;
    renderCustomerCatalog();
  });

  // Order review modal close handlers
  refs.customerOrderReviewModal?.querySelectorAll("[data-order-review-close]").forEach((el) => {
    el.addEventListener("click", closeCustomerOrderReview);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && refs.customerOrderReviewModal && !refs.customerOrderReviewModal.hasAttribute("hidden")) {
      closeCustomerOrderReview();
    }
  });

  if (refs.userForm) {
    refs.userForm.addEventListener("submit", handleUserFormSubmit);
    const cancelBtn = document.getElementById("userFormCancel");
    if (cancelBtn) cancelBtn.addEventListener("click", resetUserForm);
  }
  if (refs.assistantTrainingForm) {
    refs.assistantTrainingForm.addEventListener("submit", handleAssistantTrainingSubmit);
  }
  refs.assistantTrainingCancelButton?.addEventListener("click", resetAssistantTrainingForm);
  refs.retrofitChecklistForm?.addEventListener("submit", handleRetrofitChecklistGenerate);
  refs.retrofitChecklistCopyButton?.addEventListener("click", copyRetrofitChecklist);

  refs.logoutButton.addEventListener("click", logout);
  refs.downloadXlsx.addEventListener("click", () => {
    window.location.href = "/api/reports/xlsx";
  });
  refs.downloadPdf.addEventListener("click", () => {
    window.location.href = "/api/reports/pdf";
  });
  refs.barcodeItemSelect.addEventListener("change", updateBarcodePreview);
  refs.movementForm.elements.itemId.addEventListener("change", handleMovementItemSelectionChange);
  refs.movementForm.elements.unitPrice?.addEventListener("input", () => {
    refs.movementForm.elements.unitPrice.dataset.autoFilled = "false";
  });
  refs.movementItemSearch?.addEventListener("input", handleMovementItemSearchInput);
  refs.movementItemSearch?.addEventListener("focus", renderMovementItemDropdown);
  refs.movementItemSearch?.addEventListener("blur", () => {
    window.setTimeout(() => refs.movementItemDropdown?.classList.add("hidden"), 120);
  });
  refs.quoteItemSearch.addEventListener("input", handleQuoteFilterChange);
  refs.quoteBrandFilter.addEventListener("change", handleQuoteFilterChange);
  refs.quoteCategoryFilter.addEventListener("change", handleQuoteFilterChange);
  refs.quoteForm.elements.discount.addEventListener("input", renderQuotes);
  refs.quoteForm.elements.isExport.addEventListener("change", renderQuotes);
  refs.quoteForm.elements.collectedAmount.addEventListener("input", renderQuotes);
  refs.itemSearch.addEventListener("input", handleFilterChange);
  refs.itemSearch.addEventListener("focus", renderSearchDropdown);
  refs.itemSearch.addEventListener("blur", () => {
    window.setTimeout(() => refs.itemSearchDropdown?.classList.add("hidden"), 120);
  });
  refs.brandFilter.addEventListener("change", handleFilterChange);
  refs.categoryFilter.addEventListener("change", handleFilterChange);
  refs.assistantToggle.addEventListener("click", toggleAssistantPanel);
  refs.assistantClose.addEventListener("click", closeAssistantPanel);
  refs.assistantLanguage.addEventListener("change", handleAssistantLanguageChange);
  refs.assistantForm.addEventListener("submit", handleAssistantSubmit);
  refs.uiLanguageSelects?.forEach((select) => {
    select.addEventListener("change", (event) => {
      setUiLanguage(event.currentTarget.value);
    });
  });

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  [refs.movementForm, refs.stockIntakeForm, refs.expenseForm, refs.cashForm, refs.customerOrderForm].filter(Boolean).forEach((form) => {
    form.elements.date.value = today;
  });
  refs.quoteForm.elements.date.value = today;
  refs.quoteForm.elements.language.value = state.uiLanguage;
  refs.quoteForm.elements.isExport.value = "true";
}

async function initialize() {
  state.user = null;
  applyUiTranslations();
  showLogin();
  await handleAuthUrlActions();
}

async function handleLogin(event) {
  event.preventDefault();
  refs.loginError.textContent = "";

  const payload = formToObject(refs.loginForm);
  const result = await request("/api/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    refs.loginError.textContent = result.error;
    return;
  }

  state.user = result.user;
  refs.loginForm.reset();
  await refreshData();
}

async function handleCustomerRegister(event) {
  event.preventDefault();
  refs.customerRegisterError.textContent = "";
  refs.customerRegisterSuccess.textContent = "";

  const payload = formToObject(event.currentTarget);
  payload.language = state.uiLanguage;
  const result = await request("/api/customers/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    refs.customerRegisterError.textContent = result.error;
    return;
  }

  refs.customerRegisterSuccess.textContent = result.message || (result.mailSent
    ? t("messages.customerRegisterMailSent")
    : t("messages.customerRegisterNoMail"));
  state.user = result.user;
  event.currentTarget.reset();
  await refreshData();
}

async function handleForgotPassword(event) {
  event.preventDefault();
  refs.forgotPasswordError.textContent = "";
  refs.forgotPasswordSuccess.textContent = "";

  const payload = formToObject(event.currentTarget);
  payload.language = state.uiLanguage;
  const result = await request("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    refs.forgotPasswordError.textContent = result.error;
    return;
  }

  if (result.deliveryAvailable === false) {
    refs.forgotPasswordError.textContent = result.message || t("messages.customerRegisterNoMail");
  } else {
    refs.forgotPasswordSuccess.textContent = result.message || t("messages.operationDone");
  }
  event.currentTarget.reset();
}

async function handleResetPassword(event) {
  event.preventDefault();
  refs.resetPasswordError.textContent = "";
  refs.resetPasswordSuccess.textContent = "";

  const payload = formToObject(event.currentTarget);
  const result = await request("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    refs.resetPasswordError.textContent = result.error;
    return;
  }

  refs.resetPasswordSuccess.textContent = result.message || t("messages.passwordUpdated");
  event.currentTarget.reset();
  clearAuthQueryParams(["resetToken"]);
}

async function handleSubmit(event, url) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const result = await request(url, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    window.alert(result.error);
    return;
  }

  form.reset();
  if (form.elements.date) {
    form.elements.date.value = today;
  }
  await refreshData();
}

async function handleCashSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const result = await request("/api/cashbook", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    window.alert(result.error);
    return;
  }

  form.reset();
  form.elements.type.value = "in";
  if (form.elements.date) {
    form.elements.date.value = today;
  }
  await refreshData();
}

async function handleItemSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const itemId = payload.id;
  delete payload.id;
  const url = itemId ? `/api/items/${itemId}` : "/api/items";
  const method = itemId ? "PUT" : "POST";
  const result = await request(url, {
    method,
    body: JSON.stringify(payload),
  });

  if (result.error) {
    window.alert(result.error);
    return;
  }

  resetItemForm();
  await refreshData();
}

async function handleStockIntakeSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const result = await request("/api/item-intake", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    window.alert(result.error);
    return;
  }

  form.reset();
  if (form.elements.date) {
    form.elements.date.value = today;
  }

  await refreshData();

  if (result.id && refs.movementForm?.elements?.itemId) {
    await loadInventory(true);
    renderTabData("movements");
    refs.movementForm.elements.itemId.value = String(result.id);
    syncMovementPrice();
  }

  window.alert(t("messages.stockIntakeSaved"));
}

async function handleBulkPricingSubmit(event) {
  event.preventDefault();
  const payload = formToObject(event.currentTarget);
  const result = await request("/api/pricing/bulk", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  window.alert(t("messages.bulkUpdated", result.updated));
  await refreshData();
}

async function handleAssistantTrainingSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formToObject(form);
  const trainingId = Number(payload.id || 0);
  delete payload.id;

  const result = await request(trainingId ? `/api/assistant/trainings/${trainingId}` : "/api/assistant/trainings", {
    method: trainingId ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    window.alert(result.error);
    return;
  }

  resetAssistantTrainingForm();
  activateTab("training");
  await loadAssistantTraining(true);
}

async function deleteAssistantTraining(trainingId) {
  if (!trainingId || !window.confirm(t("messages.deleteTrainingConfirm"))) {
    return;
  }

  const result = await request(`/api/assistant/trainings/${trainingId}`, {
    method: "DELETE",
  });

  if (result.error) {
    window.alert(result.error);
    return;
  }

  if (Number(refs.assistantTrainingForm?.elements?.id?.value || 0) === Number(trainingId)) {
    resetAssistantTrainingForm();
  }

  activateTab("training");
  await loadAssistantTraining(true);
}

function resetItemForm() {
  refs.itemForm.reset();
  refs.itemForm.elements.id.value = "";
  refs.itemSubmitButton.textContent = langText("Malzeme Ekle", "Artikel anlegen");
  refs.itemCancelEdit.classList.add("hidden");
}

function invalidateInventoryUiCaches() {
  state.itemsVersion += 1;
  state.filterOptionsSignature = "";
  state.itemSelectSignature = "";
  state.itemSearchSuggestionSignature = "";
  state.movementSelectableItems = null;
}

async function logout() {
  await request("/api/logout", { method: "POST" });
  state.user = null;
  showLogin();
}

async function refreshData() {
  const previousUserId = Number(state.user?.id || 0);
  const data = await request("/api/bootstrap");
  if (data.error) {
    showLogin();
    return;
  }

  Object.assign(state, data);
  state.agentTrainingLoaded = false;
  state.inventoryLoadedAll = false;
  state.archiveLoaded = false;
  state.inventoryLoadPromise = null;
  state.inventoryWarmupScheduled = false;
  invalidateInventoryUiCaches();
  if (previousUserId !== Number(state.user?.id || 0)) {
    state.assistantMessages = [];
    state.assistantLanguage = "tr";
    state.assistantUserId = Number(state.user?.id || 0);
    if (refs.assistantLanguage) {
      refs.assistantLanguage.value = "tr";
    }
  }
  showApp();
  renderAll();
  scheduleInventoryWarmup();
  scheduleCustomerListLoad();
}

async function scheduleCustomerListLoad() {
  const role = state.user?.role;
  if (!role || !(isAdminUser() || isStaffUser())) return;
  if (state.customersLoaded) return;
  try {
    const data = await request("/api/customers");
    if (!data || data.error) return;
    state.customers = Array.isArray(data.customers) ? data.customers : [];
    state.customersLoaded = true;
    renderCustomerDatalist();
  } catch (_error) {
    // silent fail; customer dropdown just stays empty
  }
}

function renderCustomerDatalist() {
  if (!refs.quoteCustomerDatalist) return;
  refs.quoteCustomerDatalist.innerHTML = "";
  state.customers.forEach((customer) => {
    const option = document.createElement("option");
    const label = customer.name || customer.username || customer.email || `#${customer.id}`;
    const extras = [];
    if (customer.username && customer.username !== label) extras.push(customer.username);
    if (customer.email) extras.push(customer.email);
    if (customer.phone) extras.push(customer.phone);
    option.value = label;
    option.dataset.customerId = String(customer.id);
    if (extras.length) option.label = extras.join(" · ");
    refs.quoteCustomerDatalist.append(option);
  });
  if (refs.quoteCustomerNameInput && !refs.quoteCustomerNameInput._drcDatalistBound) {
    refs.quoteCustomerNameInput.addEventListener("input", syncQuoteCustomerSelection);
    refs.quoteCustomerNameInput.addEventListener("change", syncQuoteCustomerSelection);
    refs.quoteCustomerNameInput._drcDatalistBound = true;
  }
  syncQuoteCustomerSelection();
}

function syncQuoteCustomerSelection() {
  if (!refs.quoteCustomerNameInput || !refs.quoteCustomerUserIdInput) return;
  const value = (refs.quoteCustomerNameInput.value || "").trim();
  let customerId = "";
  let hint = "";
  if (value) {
    const match = state.customers.find((c) => (c.name || c.username || "").toLowerCase() === value.toLowerCase());
    if (match) {
      customerId = String(match.id);
      const extras = [];
      if (match.email) extras.push(match.email);
      if (match.phone) extras.push(match.phone);
      hint = extras.length ? `${t("messages.customerLinked", match.name || match.username)} · ${extras.join(" · ")}` : t("messages.customerLinked", match.name || match.username);
    } else {
      hint = t("messages.customerFreeText", value);
    }
  }
  refs.quoteCustomerUserIdInput.value = customerId;
  if (refs.quoteCustomerHint) {
    refs.quoteCustomerHint.textContent = hint;
  }
}

function showLogin() {
  refs.loginScreen.classList.remove("hidden");
  refs.appScreen.classList.add("hidden");
  refs.assistantWidget.classList.add("hidden");
  state.assistantMessages = [];
  state.assistantStatus = null;
  state.assistantUserId = null;
  refs.loginError.textContent = "";
  refs.loginForm.reset();
  if (refs.customerRegisterForm) {
    refs.customerRegisterForm.reset();
  }
  if (refs.customerRegisterError) {
    refs.customerRegisterError.textContent = "";
  }
  if (refs.customerRegisterSuccess) {
    refs.customerRegisterSuccess.textContent = "";
  }
  if (refs.adminMessageForm) {
    refs.adminMessageForm.reset();
  }
  if (refs.adminMessageError) {
    refs.adminMessageError.textContent = "";
  }
  if (refs.adminMessageSuccess) {
    refs.adminMessageSuccess.textContent = "";
  }
  if (refs.forgotPasswordForm) {
    refs.forgotPasswordForm.reset();
  }
  if (refs.forgotPasswordError) {
    refs.forgotPasswordError.textContent = "";
  }
  if (refs.forgotPasswordSuccess) {
    refs.forgotPasswordSuccess.textContent = "";
  }
  if (refs.resetPasswordError) {
    refs.resetPasswordError.textContent = "";
  }
  if (refs.resetPasswordSuccess) {
    refs.resetPasswordSuccess.textContent = "";
  }
  lockLoginInputs();
  clearToolScopeCookie();
  closeAssistantPanel();
  closeAuthModal();
  applyUiTranslations();
}

function bindAuthModal() {
  const modal = document.getElementById("authModal");
  if (!modal || modal._drcAuthBound) return;
  modal._drcAuthBound = true;

  document.querySelectorAll("[data-auth-open]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.preventDefault();
      const view = node.getAttribute("data-auth-open") || "login";
      openAuthModal(view);
    });
  });

  modal.querySelectorAll("[data-auth-close]").forEach((node) => {
    node.addEventListener("click", closeAuthModal);
  });

  modal.querySelectorAll("[data-auth-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      showAuthModalView(tab.getAttribute("data-auth-tab") || "login");
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hasAttribute("hidden")) {
      closeAuthModal();
    }
  });
}

function openAuthModal(view) {
  const modal = document.getElementById("authModal");
  if (!modal) return;
  modal.removeAttribute("hidden");
  showAuthModalView(view || "login");
  document.documentElement.classList.add("auth-modal-open");
}

function closeAuthModal() {
  const modal = document.getElementById("authModal");
  if (!modal) return;
  modal.setAttribute("hidden", "");
  document.documentElement.classList.remove("auth-modal-open");
  document.body.style.overflow = "";
}

function showAuthModalView(view) {
  const modal = document.getElementById("authModal");
  if (!modal) return;
  modal.querySelectorAll(".auth-modal-view").forEach((node) => {
    const target = node.getAttribute("data-auth-view") === view;
    node.classList.toggle("hidden", !target);
  });
  modal.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.getAttribute("data-auth-tab") === view);
  });
  // Focus first input
  const active = modal.querySelector(`.auth-modal-view[data-auth-view="${view}"] input:not([type="hidden"])`);
  if (active) {
    setTimeout(() => {
      try { active.focus({ preventScroll: true }); } catch (_e) { /* ignore */ }
    }, 60);
  }
}

function showApp() {
  closeAuthModal();
  refs.loginScreen.classList.add("hidden");
  refs.appScreen.classList.remove("hidden");
  refs.assistantWidget.classList.remove("hidden");
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
  setToolScopeCookie();
  refs.welcomeText.textContent = t("messages.welcome", state.user.name, isCustomerUser() && !state.user?.emailVerified);
  document.querySelectorAll(".admin-only").forEach((node) => {
    node.classList.toggle("hidden", !isAdminUser());
  });
  document.querySelectorAll(".admin-staff-only").forEach((node) => {
    node.classList.toggle("hidden", isCustomerUser());
  });
  document.querySelectorAll(".customer-only").forEach((node) => {
    node.classList.toggle("hidden", !isCustomerUser());
  });
  document.querySelectorAll(".non-admin-only").forEach((node) => {
    node.classList.toggle("hidden", isAdminUser());
  });
  syncRoleSensitiveFields();
  refs.customerVerificationBanner?.classList.toggle("hidden", !isCustomerUser() || Boolean(state.user?.emailVerified));
  if (refs.resendVerificationMessage) {
    refs.resendVerificationMessage.textContent = "";
  }

  if (state.assistantMessages.length === 0) {
    seedAssistantMessages();
  }
  applyUiTranslations();
  renderAssistantStatus();
}

function setToolScopeCookie() {
  if (!state.user?.id) {
    return;
  }
  document.cookie = `${TOOL_SCOPE_COOKIE}=${encodeURIComponent(String(state.user.id))}; Path=/; SameSite=Lax`;
}

function clearToolScopeCookie() {
  document.cookie = `${TOOL_SCOPE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function lockLoginInputs() {
  refs.loginForm.querySelectorAll("[data-login-field]").forEach((input) => {
    input.setAttribute("readonly", "readonly");
  });
}

function unlockLoginInputs() {
  refs.loginForm.querySelectorAll("[data-login-field]").forEach((input) => {
    input.removeAttribute("readonly");
  });
}

function renderAll() {
  applyUiTranslations();
  const preferredTab = isCustomerUser() ? "orders" : "quotes";
  renderStats();
  renderOverviewPanels();
  renderFilters();
  activateTab(state.activeTab || preferredTab);
  if (!isCustomerUser()) {
    renderAssistantMessages();
  }
}

function scheduleInventoryWarmup() {
  if (isCustomerUser() || state.inventoryLoadedAll || state.inventoryLoadPromise || state.inventoryWarmupScheduled) {
    return;
  }

  state.inventoryWarmupScheduled = true;
  // Start warmup immediately (no delay) so data catches up fast
  loadInventory()
    .then(() => {
      if (state.inventoryLoadedAll && state.activeTab) {
        renderTabData(state.activeTab);
      }
    })
    .finally(() => {
      state.inventoryWarmupScheduled = false;
    });
}

function renderFilters() {
  const brands = uniqueValues("brand");
  const categories = uniqueValues("category");
  populateSelect(refs.brandFilter, brands, langText("Tum Markalar", "Alle Marken"), state.filters.brand);
  populateSelect(refs.categoryFilter, categories, langText("Tum Kategoriler", "Alle Kategorien"), state.filters.category);
  populateSelect(refs.bulkBrandFilter, brands, langText("Tum Markalar", "Alle Marken"), refs.bulkBrandFilter.value || "all");
  populateSelect(refs.bulkCategoryFilter, categories, langText("Tum Kategoriler", "Alle Kategorien"), refs.bulkCategoryFilter.value || "all");
  populateSelect(refs.quoteBrandFilter, brands, langText("Tum Markalar", "Alle Marken"), state.quoteFilters.brand);
  populateSelect(refs.quoteCategoryFilter, categories, langText("Tum Kategoriler", "Alle Kategorien"), state.quoteFilters.category);

  // Sync state with fallback ("all") if old value disappeared after brand/category normalize
  if (refs.brandFilter && state.filters.brand !== refs.brandFilter.value) state.filters.brand = refs.brandFilter.value || "all";
  if (refs.categoryFilter && state.filters.category !== refs.categoryFilter.value) state.filters.category = refs.categoryFilter.value || "all";
  if (refs.quoteBrandFilter && state.quoteFilters.brand !== refs.quoteBrandFilter.value) state.quoteFilters.brand = refs.quoteBrandFilter.value || "all";
  if (refs.quoteCategoryFilter && state.quoteFilters.category !== refs.quoteCategoryFilter.value) state.quoteFilters.category = refs.quoteCategoryFilter.value || "all";

  renderItemSearchSuggestions();
}

function renderStats() {
  refs.statsGrid.innerHTML = "";
  const cards = isCustomerUser()
    ? [
        [t("stats.customerItems"), state.summary.totalItems, t("stats.customerItemsDesc")],
        [t("stats.critical"), state.summary.criticalCount, t("stats.criticalDesc")],
      ]
    : isAdminUser()
      ? [
          [t("stats.totalItems"), state.summary.totalItems, t("stats.totalItemsDesc")],
          [t("stats.stockCostValue"), currency.format(state.summary.stockCostValue ?? state.summary.stockValue ?? 0), t("stats.stockCostValueDesc")],
          [t("stats.stockSaleValue"), currency.format(state.summary.stockSaleValue || 0), t("stats.stockSaleValueDesc")],
          [t("stats.critical"), state.summary.criticalCount, t("stats.criticalDesc")],
          [t("stats.expenseTotal"), currency.format(state.summary.expenseTotal), t("stats.expenseTotalDesc")],
          [t("stats.cashBalance"), currency.format(state.summary.cashBalance), t("stats.cashBalanceDesc")],
        ]
      : [
          [t("stats.totalItems"), state.summary.totalItems, t("stats.totalItemsDesc")],
          [t("stats.stockSaleValue"), currency.format(state.summary.stockSaleValue || 0), t("stats.stockSaleValueDesc")],
          [t("stats.critical"), state.summary.criticalCount, t("stats.criticalDesc")],
          [t("stats.cashBalance"), currency.format(state.summary.cashBalance || 0), t("stats.cashBalanceDesc")],
        ];

  cards.forEach(([label, value, subtitle]) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    card.innerHTML = `<p class="eyebrow">${label}</p><strong>${value}</strong><span class="muted">${subtitle}</span>`;
    refs.statsGrid.append(card);
  });
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function normalizeInventoryText(...values) {
  return values
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function statusMeta(level) {
  if (level === "critical") {
    return { className: "status-critical", label: langText("Alarm", "Alarm") };
  }
  if (level === "progress") {
    return { className: "status-progress", label: langText("Takip", "Beobachtung") };
  }
  if (level === "pending") {
    return { className: "status-pending", label: langText("Hazirlaniyor", "Vorbereitung") };
  }
  return { className: "status-ok", label: langText("Hazir", "Online") };
}

function collectDashboardSignals() {
  const items = Array.isArray(state.items) ? state.items : [];
  const totalItems = Number(state.summary?.totalItems || items.length || 0);
  const criticalCount = Number(state.summary?.criticalCount || 0);
  const stockSaleValue = Number(state.summary?.stockSaleValue || 0);
  const cashBalance = Number(state.summary?.cashBalance || 0);
  const expenseTotal = Number(state.summary?.expenseTotal || 0);
  const pendingOrders = Array.isArray(state.orders)
    ? state.orders.filter((order) => !["completed", "cancelled"].includes(String(order.status || ""))).length
    : 0;

  let lowGwpReady = 0;
  let monitoringNodes = 0;
  let stockedItems = 0;

  items.forEach((item) => {
    const haystack = normalizeInventoryText(item.name, item.brand, item.category, item.notes, item.barcode);
    if (Number(item.currentStock || 0) > 0) {
      stockedItems += 1;
    }
    if (haystack && LOW_GWP_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
      lowGwpReady += 1;
    }
    if (haystack && MONITORING_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
      monitoringNodes += 1;
    }
  });

  const criticalRatio = totalItems > 0 ? criticalCount / totalItems : 0;
  const lowGwpShare = totalItems > 0 ? Math.round((lowGwpReady / totalItems) * 100) : 0;
  const carbonScore = clampNumber(
    Math.round(48 + lowGwpShare * 0.42 + Math.min(monitoringNodes, 36) * 0.85 - criticalRatio * 38),
    18,
    96
  );
  const iotOnlineRooms = clampNumber(2 + Math.round(monitoringNodes / 8), 2, 8);
  const iotAlarmCount = clampNumber(Math.round(criticalRatio * 10), 0, 6);
  const iotStatusLevel = iotAlarmCount >= 3 ? "critical" : iotAlarmCount >= 1 ? "progress" : "ok";
  const carbonLevel = carbonScore >= 74 ? "ok" : carbonScore >= 56 ? "progress" : "critical";

  return {
    totalItems,
    criticalCount,
    criticalRatio,
    stockedItems,
    stockSaleValue,
    cashBalance,
    expenseTotal,
    pendingOrders,
    lowGwpReady,
    lowGwpShare,
    monitoringNodes,
    carbonScore,
    carbonLevel,
    iotOnlineRooms,
    iotAlarmCount,
    iotStatusLevel,
  };
}

function buildOperationFocusLines(signals) {
  const lines = [];
  if (isCustomerUser()) {
    lines.push(signals.stockedItems > 0
      ? langText(`${numberFormat.format(signals.stockedItems)} stoklu urun siparise hazir.`, `${numberFormat.format(signals.stockedItems)} lagernde Artikel sind bestellbereit.`)
      : langText("Su anda siparise acik stok gorunmuyor.", "Aktuell ist kein lagernder Artikel fuer Bestellungen sichtbar."));
    lines.push(signals.pendingOrders > 0
      ? langText(`${numberFormat.format(signals.pendingOrders)} siparisiniz takipte.`, `${numberFormat.format(signals.pendingOrders)} Ihrer Bestellungen sind in Bearbeitung.`)
      : langText("Yeni siparis icin urunleri sepete ekleyebilirsiniz.", "Sie koennen jetzt neue Artikel in den Bestellkorb legen."));
    lines.push(langText("DRC IoT ekranindan oda, alarm ve servis ozetini gorebilirsiniz.", "Im DRC-IoT-Bereich sehen Sie Raum-, Alarm- und Serviceuebersicht."));
    return lines;
  }

  lines.push(signals.criticalCount > 0
    ? langText(`${numberFormat.format(signals.criticalCount)} kritik kart ilk sevkiyat ve servis turunu etkiliyor.`, `${numberFormat.format(signals.criticalCount)} kritische Karten beeinflussen die erste Auslieferungs- und Servicerunde.`)
    : langText("Kritik stok baskisi dusuk, sevkiyat ritmi dengeli.", "Der kritische Lagerdruck ist niedrig, die Auslieferung wirkt stabil."));
  lines.push(signals.pendingOrders > 0
    ? langText(`${numberFormat.format(signals.pendingOrders)} acik siparis hizli takip istiyor.`, `${numberFormat.format(signals.pendingOrders)} offene Bestellungen brauchen einen kompakten Fokus.`)
    : langText("Bekleyen siparis yok; bugun teklif ve saha planina odaklanabilirsiniz.", "Keine offenen Bestellungen; heute kann der Fokus auf Angebot und Feldplanung liegen."));
  lines.push(signals.cashBalance <= 0
    ? langText("Kasa girisleri sifirdan basliyor, tahsilatlari anlik yazmak iyi olur.", "Die Kasse startet bei null, Zahlungseintraege sollten direkt erfasst werden.")
    : langText(`Hamburg kasasinda ${currency.format(signals.cashBalance)} gorunuyor.`, `In der Hamburg-Kasse stehen ${currency.format(signals.cashBalance)}.`));
  return lines;
}

function buildIotSites(signals) {
  const siteBlueprints = [
    {
      key: "bornsen-plus",
      name: langText("Bornsen Pozitif Oda", "Plusraum Boernsen"),
      zone: langText("Pozitif Depo", "Pluskuehlung"),
      setpoint: 4,
      humidity: 66,
    },
    {
      key: "bornsen-shock",
      name: langText("Bornsen Sok Oda", "Schockraum Boernsen"),
      zone: langText("Negatif Hat", "Tiefkuehlstrecke"),
      setpoint: -20,
      humidity: 58,
    },
    {
      key: "hamm-control",
      name: langText("Hamm Kontrol Merkezi", "Leitzentrale Hamm"),
      zone: langText("Kontrol ve DCB Hatti", "Regelungs- und DCB-Linie"),
      setpoint: 2,
      humidity: 49,
    },
  ];

  return siteBlueprints.map((site, index) => {
    const seed = hashText(`${site.key}:${signals.totalItems}:${signals.monitoringNodes}:${signals.criticalCount}`);
    const offset = ((seed % 9) - 4) * 0.18 + (signals.criticalRatio * (index === 1 ? 1.1 : 0.45));
    const actual = site.setpoint + offset;
    const humidity = clampNumber(site.humidity + ((Math.floor(seed / 7) % 9) - 4), 38, 88);
    const compressorLoad = clampNumber(52 + (seed % 26) + signals.iotAlarmCount * 5, 44, 98);
    const delta = Math.abs(actual - site.setpoint);
    const level = delta >= 1.2 ? "critical" : delta >= 0.55 ? "progress" : "ok";
    const doorStatus = index === 0 && signals.iotAlarmCount > 0
      ? langText("Kapi trafigi yogun", "Hohe Tuerfrequenz")
      : langText("Kapi kapali", "Tuer geschlossen");

    return {
      ...site,
      actual,
      humidity,
      compressorLoad,
      level,
      doorStatus,
      note: level === "ok"
        ? langText("Defrost ve fan akisi dengede.", "Abtauung und Luftbild laufen stabil.")
        : level === "progress"
          ? langText("Isi yukunde dalgalanma izleniyor.", "Die Last zeigt leichte Schwankungen.")
          : langText("Set noktasindan sapma dikkat istiyor.", "Die Abweichung vom Sollwert braucht Aufmerksamkeit."),
    };
  });
}

function buildIotEvents(signals, sites) {
  const hottestSite = [...sites].sort((left, right) => Math.abs(right.actual - right.setpoint) - Math.abs(left.actual - left.setpoint))[0];
  return [
    {
      level: signals.iotStatusLevel,
      title: signals.iotAlarmCount > 0
        ? langText("Alarm akisinda izleme var", "Alarmstrom wird beobachtet")
        : langText("Alarm akisinda kritik durum yok", "Kein kritischer Alarm im Strom"),
      detail: signals.iotAlarmCount > 0
        ? langText(`${numberFormat.format(signals.iotAlarmCount)} saha uyarisi gorunuyor; ilk bakis ${hottestSite.name} ustunde.`, `${numberFormat.format(signals.iotAlarmCount)} Feldhinweise sichtbar; erster Blick auf ${hottestSite.name}.`)
        : langText("Kapilar, defrost ve kompresor yukleri dengeli akiyor.", "Tueren, Abtauung und Verdichterlasten wirken ruhig."),
    },
    {
      level: signals.carbonLevel,
      title: langText("Karbon odagi", "Carbon-Fokus"),
      detail: signals.carbonScore >= 74
        ? langText("Dusuk GWP ve izleme yogunlugu guclu; servis turleri daha kontrollu planlanabilir.", "Niedriger GWP und Monitoringdichte sind stark; Servicerouten koennen kontrollierter geplant werden.")
        : langText("Retrofit, sensor ve alarm yogunlugu arttikca karbon paneli daha dengeli olur.", "Mit mehr Retrofit-, Sensor- und Alarmdichte stabilisiert sich das Carbon-Panel."),
    },
    {
      level: signals.pendingOrders > 0 ? "pending" : "ok",
      title: langText("Operasyon akisi", "Operationsfluss"),
      detail: signals.pendingOrders > 0
        ? langText(`${numberFormat.format(signals.pendingOrders)} acik siparis DRC IoT panelinde saha onceligi ile eslestirilebilir.`, `${numberFormat.format(signals.pendingOrders)} offene Bestellungen koennen im DRC-IoT mit Feldprioritaeten gekoppelt werden.`)
        : langText("Bugun saha ritmi daha cok stok, teklif ve uzaktan izleme kalitesine odaklanabilir.", "Heute kann der Fokus staerker auf Lager, Angebot und Monitoringqualitaet liegen."),
    },
  ];
}

function renderOverviewPanels() {
  if (!refs.opsOverview || !refs.carbonOverview || !refs.iotOverview) {
    return;
  }

  const signals = collectDashboardSignals();
  const operationLines = buildOperationFocusLines(signals);
  const carbonBadge = statusMeta(signals.carbonLevel);
  const iotBadge = statusMeta(signals.iotStatusLevel);
  const sites = buildIotSites(signals);
  const lastSync = new Intl.DateTimeFormat(state.uiLanguage === "de" ? "de-DE" : "tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  refs.heroFocusPill.textContent = isCustomerUser()
    ? langText(`Stokta ${numberFormat.format(signals.stockedItems)} urun acik`, `${numberFormat.format(signals.stockedItems)} Artikel auf Lager`)
    : signals.criticalCount > 0
      ? langText(`${numberFormat.format(signals.criticalCount)} kritik stok takibi`, `${numberFormat.format(signals.criticalCount)} kritische Bestandskarte(n)`)
      : langText("Operasyon ritmi dengeli", "Stabiler Betriebsrhythmus");
  refs.heroIotPill.textContent = signals.iotAlarmCount > 0
    ? langText(`DRC IoT ${numberFormat.format(signals.iotAlarmCount)} alarm izliyor`, `DRC IoT beobachtet ${numberFormat.format(signals.iotAlarmCount)} Alarm(e)`)
    : langText("DRC IoT tum odalarda online", "DRC IoT in allen Raeumen online");

  refs.opsOverview.innerHTML = `
    <div class="overview-head">
      <div>
        <p class="eyebrow">${escapeHtml(langText("Bugun Once", "Heute zuerst"))}</p>
        <h2>${escapeHtml(langText("Sade operasyon akisi", "Klarer Operationsfluss"))}</h2>
      </div>
      <span class="status-pill ${signals.criticalCount > 0 ? "status-progress" : "status-ok"}">${escapeHtml(signals.criticalCount > 0 ? langText("Yakin takip", "Nahe dran") : langText("Akis temiz", "Sauber"))}</span>
    </div>
    <div class="overview-metric-row">
      <div class="overview-metric">
        <span>${escapeHtml(langText("Stokta", "Lagernd"))}</span>
        <strong>${escapeHtml(numberFormat.format(signals.stockedItems))}</strong>
      </div>
      <div class="overview-metric">
        <span>${escapeHtml(langText("Acik Siparis", "Offene Auftraege"))}</span>
        <strong>${escapeHtml(numberFormat.format(signals.pendingOrders))}</strong>
      </div>
      <div class="overview-metric">
        <span>${escapeHtml(langText("Satis Degeri", "Verkaufswert"))}</span>
        <strong>${escapeHtml(currency.format(signals.stockSaleValue || 0))}</strong>
      </div>
    </div>
    <ul class="overview-list">
      ${operationLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
    </ul>
  `;

  refs.carbonOverview.innerHTML = `
    <div class="overview-head">
      <div>
        <p class="eyebrow">${escapeHtml(langText("Karbon Ayak Izi", "Carbon Footprint"))}</p>
        <h2>${escapeHtml(langText("Azaltim ve retrofit paneli", "Reduktion und Retrofit"))}</h2>
      </div>
      <span class="status-pill ${carbonBadge.className}">${escapeHtml(carbonBadge.label)}</span>
    </div>
    <div class="overview-metric-row">
      <div class="overview-metric">
        <span>${escapeHtml(langText("Azaltim Skoru", "Reduktionsscore"))}</span>
        <strong>${escapeHtml(`${numberFormat.format(signals.carbonScore)}/100`)}</strong>
      </div>
      <div class="overview-metric">
        <span>${escapeHtml(langText("Dusuk GWP Kart", "Low-GWP Karten"))}</span>
        <strong>${escapeHtml(numberFormat.format(signals.lowGwpReady))}</strong>
      </div>
      <div class="overview-metric">
        <span>${escapeHtml(langText("Izleme Dugumu", "Monitoring-Knoten"))}</span>
        <strong>${escapeHtml(numberFormat.format(signals.monitoringNodes))}</strong>
      </div>
    </div>
    <div class="carbon-meter" aria-hidden="true">
      <span class="carbon-meter-fill" style="width: ${signals.carbonScore}%"></span>
    </div>
    <p class="overview-note">${escapeHtml(
      signals.criticalCount > 0
        ? langText(`${numberFormat.format(signals.criticalCount)} kritik kart enerji kacagi ve servis turunu buyutebilir.`, `${numberFormat.format(signals.criticalCount)} kritische Karten koennen Energieverlust und Servicerouten vergroessern.`)
        : langText("Kritik stok baskisi dusuk; karbon paneli retrofit ve izleme yogunluguna odaklanabilir.", "Der kritische Lagerdruck ist niedrig; das Carbon-Panel kann sich auf Retrofit und Monitoringdichte konzentrieren.")
    )}</p>
    <div class="overview-tag-row">
      <span>${escapeHtml(langText(`Dusuk GWP payi ${numberFormat.format(signals.lowGwpShare)}%`, `Low-GWP-Anteil ${numberFormat.format(signals.lowGwpShare)}%`))}</span>
      <span>${escapeHtml(langText(`Toplam masraf ${currency.format(signals.expenseTotal || 0)}`, `Ausgaben gesamt ${currency.format(signals.expenseTotal || 0)}`))}</span>
    </div>
  `;

  refs.iotOverview.innerHTML = `
    <div class="overview-head">
      <div>
        <p class="eyebrow">DRC IoT Pack</p>
        <h2>${escapeHtml(langText("Uzaktan izleme ozeti", "Fernmonitoring kompakt"))}</h2>
      </div>
      <span class="status-pill ${iotBadge.className}">${escapeHtml(iotBadge.label)}</span>
    </div>
    <div class="overview-metric-row">
      <div class="overview-metric">
        <span>${escapeHtml(langText("Online Oda", "Online-Raeume"))}</span>
        <strong>${escapeHtml(numberFormat.format(signals.iotOnlineRooms))}</strong>
      </div>
      <div class="overview-metric">
        <span>${escapeHtml(langText("Alarm", "Alarme"))}</span>
        <strong>${escapeHtml(numberFormat.format(signals.iotAlarmCount))}</strong>
      </div>
      <div class="overview-metric">
        <span>${escapeHtml(langText("Son Senkron", "Letzte Sync"))}</span>
        <strong>${escapeHtml(lastSync)}</strong>
      </div>
    </div>
    <div class="iot-mini-sites">
      ${sites.map((site) => {
        const badge = statusMeta(site.level);
        return `
          <div class="iot-mini-site">
            <div>
              <strong>${escapeHtml(site.name)}</strong>
              <span>${escapeHtml(site.zone)}</span>
            </div>
            <div class="iot-mini-site-status">
              <span class="status-pill ${badge.className}">${escapeHtml(`${site.actual.toFixed(1)}°C`)}</span>
            </div>
          </div>
        `;
      }).join("")}
    </div>
    <p class="overview-note">${escapeHtml(langText("Kapilar, defrost, sicaklik ve saha alarmlari DRC IoT sekmesinde detayli gorunur.", "Tueren, Abtauung, Temperaturen und Feldalarme erscheinen im DRC-IoT-Tab im Detail."))}</p>
  `;

  renderIotMonitor(signals, sites, lastSync);
}

function renderIotMonitor(signals, sites = buildIotSites(signals), lastSync = null) {
  if (!refs.iotMonitorRoot) {
    return;
  }

  const events = buildIotEvents(signals, sites);
  const syncText = lastSync || new Intl.DateTimeFormat(state.uiLanguage === "de" ? "de-DE" : "tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  const carbonBadge = statusMeta(signals.carbonLevel);
  const iotBadge = statusMeta(signals.iotStatusLevel);

  refs.iotMonitorRoot.innerHTML = `
    <div class="iot-hero-grid">
      <article class="iot-hero-card">
        <div class="overview-head">
          <div>
            <p class="eyebrow">DRC IoT Pack</p>
            <h3>${escapeHtml(langText("Uzaktan izleme komuta ekrani", "Fernmonitoring-Kommandoansicht"))}</h3>
          </div>
          <span class="status-pill ${iotBadge.className}">${escapeHtml(iotBadge.label)}</span>
        </div>
        <div class="iot-kpi-grid">
          <div class="overview-metric">
            <span>${escapeHtml(langText("Online Oda", "Online-Raeume"))}</span>
            <strong>${escapeHtml(numberFormat.format(signals.iotOnlineRooms))}</strong>
          </div>
          <div class="overview-metric">
            <span>${escapeHtml(langText("Alarm Sayisi", "Alarmanzahl"))}</span>
            <strong>${escapeHtml(numberFormat.format(signals.iotAlarmCount))}</strong>
          </div>
          <div class="overview-metric">
            <span>${escapeHtml(langText("Senkron", "Sync"))}</span>
            <strong>${escapeHtml(syncText)}</strong>
          </div>
        </div>
        <div class="iot-event-list">
          ${events.map((event) => {
            const badge = statusMeta(event.level);
            return `
              <article class="iot-event">
                <div class="iot-event-head">
                  <strong>${escapeHtml(event.title)}</strong>
                  <span class="status-pill ${badge.className}">${escapeHtml(badge.label)}</span>
                </div>
                <p>${escapeHtml(event.detail)}</p>
              </article>
            `;
          }).join("")}
        </div>
      </article>
      <article class="iot-carbon-card">
        <div class="overview-head">
          <div>
            <p class="eyebrow">${escapeHtml(langText("Karbon Paneli", "Carbon-Panel"))}</p>
            <h3>${escapeHtml(langText("Enerji ve retrofit odagi", "Energie- und Retrofitfokus"))}</h3>
          </div>
          <span class="status-pill ${carbonBadge.className}">${escapeHtml(`${numberFormat.format(signals.carbonScore)}/100`)}</span>
        </div>
        <p class="iot-card-copy">${escapeHtml(langText("Bu ekran, stok ve kontrol yogunlugundan uretilen hizli bir karbon azaltilim gorunumu sunar.", "Dieser Bildschirm zeigt eine schnelle Carbon-Reduktionssicht aus Lager- und Regelungsdichte."))}</p>
        <div class="carbon-meter" aria-hidden="true">
          <span class="carbon-meter-fill" style="width: ${signals.carbonScore}%"></span>
        </div>
        <div class="iot-carbon-points">
          <div><span>${escapeHtml(langText("Dusuk GWP kart", "Low-GWP Karten"))}</span><strong>${escapeHtml(numberFormat.format(signals.lowGwpReady))}</strong></div>
          <div><span>${escapeHtml(langText("Izleme dugumu", "Monitoring-Knoten"))}</span><strong>${escapeHtml(numberFormat.format(signals.monitoringNodes))}</strong></div>
          <div><span>${escapeHtml(langText("Kritik risk", "Kritisches Risiko"))}</span><strong>${escapeHtml(numberFormat.format(signals.criticalCount))}</strong></div>
        </div>
      </article>
    </div>
    <div class="iot-site-grid">
      ${sites.map((site) => {
        const badge = statusMeta(site.level);
        return `
          <article class="iot-site-card">
            <header>
              <div>
                <strong>${escapeHtml(site.name)}</strong>
                <span>${escapeHtml(site.zone)}</span>
              </div>
              <span class="status-pill ${badge.className}">${escapeHtml(badge.label)}</span>
            </header>
            <div class="iot-site-stats">
              <div class="iot-site-stat">
                <span>${escapeHtml(langText("Anlik Sicaklik", "Ist-Temperatur"))}</span>
                <strong>${escapeHtml(`${site.actual.toFixed(1)}°C`)}</strong>
              </div>
              <div class="iot-site-stat">
                <span>${escapeHtml(langText("Set", "Soll"))}</span>
                <strong>${escapeHtml(`${site.setpoint.toFixed(1)}°C`)}</strong>
              </div>
              <div class="iot-site-stat">
                <span>${escapeHtml(langText("Nem", "Feuchte"))}</span>
                <strong>${escapeHtml(`${numberFormat.format(site.humidity)}%`)}</strong>
              </div>
              <div class="iot-site-stat">
                <span>${escapeHtml(langText("Kompresor Yuk", "Verdichterlast"))}</span>
                <strong>${escapeHtml(`${numberFormat.format(site.compressorLoad)}%`)}</strong>
              </div>
            </div>
            <p>${escapeHtml(site.note)}</p>
            <div class="overview-tag-row">
              <span>${escapeHtml(site.doorStatus)}</span>
              <span>${escapeHtml(langText(`Son sync ${syncText}`, `Letzte Sync ${syncText}`))}</span>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderItems() {
  // Full-blank loading only if we have NO items yet
  const hasAnyItems = Array.isArray(state.items) && state.items.length > 0;
  if (!state.inventoryLoadedAll && !isCustomerUser() && !hasAnyItems) {
    renderInventoryLoading("items");
    return;
  }

  refs.itemsTableBody.innerHTML = "";
  const filteredItems = getFilteredItems();
  const visibleItems = filteredItems.slice(0, MAX_ITEMS_TABLE_ROWS);
  refs.itemsSummary.textContent = filteredItems.length > MAX_ITEMS_TABLE_ROWS
    ? t("messages.itemsSummaryLong", filteredItems.length, state.items.length, MAX_ITEMS_TABLE_ROWS)
    : t("messages.itemsSummaryShort", filteredItems.length, state.items.length);
  renderStockedItems(filteredItems);
  visibleItems.forEach((item) => {
    const tr = document.createElement("tr");
    const critical = isCriticalStockItem(item);
    const purchasePrice = item.lastPurchasePrice || item.defaultPrice || 0;
    const listPrice = visibleListPrice(item);
    const salePrice = visibleSalePrice(item);
    const actionMarkup = isAdminUser()
      ? `
        <div class="action-row">
          <button class="mini-button secondary-button" type="button" data-action="edit-item" data-id="${item.id}" data-help="TR: Malzeme kartini duzenler. DE: Bearbeitet die Artikelkarte.">${t("common.edit")}</button>
          <button class="mini-button secondary-button" type="button" data-action="archive-item" data-id="${item.id}" data-help="TR: Urunu aktif listeden arsive alir. DE: Verschiebt den Artikel ins Archiv.">${t("common.archive")}</button>
          <button class="mini-button danger-button" type="button" data-action="delete-item" data-id="${item.id}" data-help="TR: Hareketsiz urunu kalici siler. DE: Loescht einen Artikel ohne Bewegungen dauerhaft.">${t("common.delete")}</button>
        </div>
      `
      : `<span class="muted">${t("common.viewOnly")}</span>`;
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.brand || "-"}</td>
      <td>${getDisplayCategory(item.category)}</td>
      <td>${formatItemStock(item.currentStock, item.unit)}</td>
      ${canViewPurchasePrices() ? `<td>${purchasePrice ? currency.format(purchasePrice) : "-"}</td>` : ""}
      <td>${listPrice ? currency.format(listPrice) : "-"}</td>
      <td>${salePrice ? currency.format(salePrice) : "-"}</td>
      <td><span class="status-pill ${critical ? "status-critical" : "status-ok"}">${numberFormat.format(item.minStock)} ${getDisplayUnit(item.unit)}</span></td>
      <td>${item.barcode}</td>
      <td>${actionMarkup}</td>
    `;
    refs.itemsTableBody.append(tr);
  });

  if (isAdminUser()) {
    refs.itemsTableBody.querySelectorAll("[data-action='edit-item']").forEach((button) => {
      button.addEventListener("click", () => startItemEdit(Number(button.dataset.id)));
    });
    refs.itemsTableBody.querySelectorAll("[data-action='delete-item']").forEach((button) => {
      button.addEventListener("click", () => deleteItem(Number(button.dataset.id)));
    });
    refs.itemsTableBody.querySelectorAll("[data-action='archive-item']").forEach((button) => {
      button.addEventListener("click", () => archiveItem(Number(button.dataset.id)));
    });
  }
}

function renderStockedItems(filteredItems) {
  if (!refs.stockedItemsList || !refs.stockedItemsSummary) {
    return;
  }

  const stockedItems = filteredItems.filter((item) => Number(item.currentStock) > 0);
  const loading = !state.inventoryLoadedAll && !isCustomerUser();

  // If no items at all yet AND still loading, show full spinner
  if (loading && stockedItems.length === 0) {
    const spinnerHtml = `
      <div class="loading-box">
        <div class="loading-spinner" aria-hidden="true"></div>
        <div class="loading-text">
          <strong>${langText("Stok yükleniyor", "Bestand wird geladen")}</strong>
          <span class="muted">${langText("Binlerce ürünün listesi hazırlanıyor, lütfen bekleyin.", "Tausende Artikel werden geladen, bitte warten.")}</span>
        </div>
      </div>`;
    refs.stockedItemsSummary.textContent = langText("Yükleniyor...", "Wird geladen...");
    refs.stockedItemsList.innerHTML = spinnerHtml;
    return;
  }
  const summaryText = t("messages.stockedSummary", stockedItems.length);
  refs.stockedItemsSummary.innerHTML = loading
    ? `${escapeHtml(summaryText)} <span class="loading-pill"><span class="loading-spinner mini" aria-hidden="true"></span>${langText("kalan ürünler güncelleniyor...", "weitere Artikel werden geladen...")}</span>`
    : escapeHtml(summaryText);
  refs.stockedItemsList.innerHTML = "";

  if (stockedItems.length === 0) {
    const hasFilter = Boolean(state.filters?.search || (state.filters?.brand && state.filters.brand !== "all") || (state.filters?.category && state.filters.category !== "all"));
    const msg = hasFilter
      ? langText("Filtreye uyan stokta ürün bulunamadı.", "Kein Artikel auf Lager entspricht dem Filter.")
      : t("messages.noStockedItems");
    refs.stockedItemsList.innerHTML = `<div class="empty-state">
      <strong>${msg}</strong>
      ${hasFilter ? `<button type="button" class="secondary-button small-button" id="clearItemsFilterBtn" style="margin-top:10px;">${langText("Filtreleri Temizle", "Filter zurücksetzen")}</button>` : ""}
    </div>`;
    if (hasFilter) {
      const btn = document.getElementById("clearItemsFilterBtn");
      btn?.addEventListener("click", () => {
        state.filters.search = "";
        state.filters.brand = "all";
        state.filters.category = "all";
        if (refs.itemSearch) refs.itemSearch.value = "";
        if (refs.brandFilter) refs.brandFilter.value = "all";
        if (refs.categoryFilter) refs.categoryFilter.value = "all";
        renderItems();
      });
    }
    return;
  }

  stockedItems.slice(0, 80).forEach((item) => {
    const listPrice = visibleListPrice(item);
    const price = cartSalePrice(item);
    const itemDetail = getPublicItemDetail(item);
    const card = document.createElement("article");
    card.className = "stocked-card";
    card.innerHTML = `
      <strong>${item.name}</strong>
      <span>${item.brand || "-"} | ${getDisplayCategory(item.category)}</span>
      ${itemDetail ? `<span>${langText("Detay", "Detail")}: ${itemDetail}</span>` : ""}
      <span>${langText("Stok", "Bestand")}: ${formatItemStock(item.currentStock, item.unit)}</span>
      <span>${item.barcode || "-"}</span>
      <b>${price ? `${currency.format(price)} ${langText("net", "netto")}` : "-"}</b>
      ${listPrice ? `<span>${langText("1 adet liste", "Listenpreis 1 Stk.")}: ${currency.format(listPrice)}</span>` : ""}
    `;
    refs.stockedItemsList.append(card);
  });
}

function renderArchive() {
  if (!refs.archiveTableBody || !refs.archiveSummary) {
    return;
  }
  if (!state.archiveLoaded && !isCustomerUser()) {
    renderInventoryLoading("archive");
    return;
  }

  refs.archiveTableBody.innerHTML = "";
  refs.archiveSummary.textContent = t("messages.archiveSummary", state.archivedItems.length);

  if (state.archivedItems.length === 0) {
    refs.archiveTableBody.innerHTML = `<tr><td colspan="8"><div class="empty-state">${t("messages.noArchive")}</div></td></tr>`;
    return;
  }

  state.archivedItems.forEach((item) => {
    const listPrice = visibleListPrice(item);
    const salePrice = visibleSalePrice(item);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${item.brand || "-"}</td>
      <td>${item.category}</td>
      ${canViewPurchasePrices() ? `<td>${item.defaultPrice ? currency.format(item.defaultPrice) : "-"}</td>` : ""}
      <td>${listPrice ? currency.format(listPrice) : "-"}</td>
      <td>${salePrice ? currency.format(salePrice) : "-"}</td>
      <td>${item.barcode}</td>
      <td><button class="mini-button secondary-button" type="button" data-action="restore-item" data-id="${item.id}" data-help="TR: Arsivdeki urunu tekrar aktif listeye alir. DE: Holt den archivierten Artikel in die aktive Liste zurueck.">${t("common.restore")}</button></td>
    `;
    refs.archiveTableBody.append(tr);
  });

  refs.archiveTableBody.querySelectorAll("[data-action='restore-item']").forEach((button) => {
    button.addEventListener("click", () => restoreItem(Number(button.dataset.id)));
  });
}

function renderMovements() {
  if (!state.inventoryLoadedAll && !isCustomerUser()) {
    renderInventoryLoading("movements");
    return;
  }

  refs.movementsTableBody.innerHTML = "";
  state.movements.slice(0, 20).forEach((movement) => {
    const tr = document.createElement("tr");
    const movementTypeLabel = movement.type === "entry" ? t("common.in") : t("common.out");
    let actionMarkup = `<button class="mini-button secondary-button" type="button" data-reverse-movement="${movement.id}" data-help="TR: Hareketi ters kayitla geri alir. DE: Storniert die Bewegung mit einer Gegenbuchung.">${t("common.reverse")}</button>`;

    if (movement.reversalOf) {
      actionMarkup = `<span class="muted">${t("common.reverseRecord")}</span>`;
    } else if (movement.reversedById) {
      actionMarkup = `<span class="muted">${t("common.reversed")}</span>`;
    }

    const quantityMarkup = canViewPurchasePrices()
      ? `${numberFormat.format(movement.quantity)} / ${currency.format(movement.unitPrice)}`
      : numberFormat.format(movement.quantity);

    tr.innerHTML = `
      <td>${movement.date}</td>
      <td>${movement.itemName}</td>
      <td>${movementTypeLabel}</td>
      <td>${quantityMarkup}</td>
      <td>${movement.note || "-"}</td>
      <td>${movement.userName || "-"}</td>
      <td class="table-action-cell">${actionMarkup}</td>
    `;
    refs.movementsTableBody.append(tr);
  });

  refs.movementsTableBody.querySelectorAll("[data-reverse-movement]").forEach((button) => {
    button.addEventListener("click", () => reverseMovement(Number(button.dataset.reverseMovement)));
  });
}

function renderExpenses() {
  refs.expensesTableBody.innerHTML = "";
  state.expenses.slice(0, 20).forEach((expense) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${expense.date}</td>
      <td>${expense.title}</td>
      <td>${expense.category}</td>
      <td>${getPaymentTypeLabel(expense.paymentType)}</td>
      <td>${expense.note || "-"}</td>
      <td>${currency.format(expense.amount)}</td>
      <td>${expense.userName || "-"}</td>
      <td class="table-action-cell"><button class="mini-button table-delete-button" type="button" data-delete-expense="${expense.id}" data-help="TR: Gider kaydini siler. DE: Loescht den Ausgabeneintrag.">${langText("Masraf Sil", "Ausgabe loeschen")}</button></td>
    `;
    refs.expensesTableBody.append(tr);
  });

  refs.expensesTableBody.querySelectorAll("[data-delete-expense]").forEach((button) => {
    button.addEventListener("click", () => deleteExpense(Number(button.dataset.deleteExpense)));
  });
}

function renderCashbook() {
  refs.cashbookTableBody.innerHTML = "";
  state.cashbook.slice(0, 20).forEach((entry) => {
    const isUnbilledSale = /faturasiz satis/i.test(String(entry.note || "")) || /faturasiz satis/i.test(String(entry.title || ""));
    const actionMarkup = canManageCashbook()
      ? `<button class="mini-button table-delete-button" type="button" data-delete-cash="${entry.id}" data-help="TR: Kasa kaydini siler. DE: Loescht den Kasseneintrag.">${langText("Kaydi Sil", "Eintrag loeschen")}</button>`
      : `<span class="muted">-</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${entry.date}</td>
      <td>${isUnbilledSale ? t("common.unbilledSale") : entry.type === "in" ? t("common.in") : t("common.out")}</td>
      <td>${entry.title}</td>
      <td>${entry.reference || "-"}</td>
      <td>${entry.note || "-"}</td>
      <td>${currency.format(entry.amount)}</td>
      <td>${entry.userName || "-"}</td>
      <td class="table-action-cell">${actionMarkup}</td>
    `;
    refs.cashbookTableBody.append(tr);
  });

  if (canManageCashbook()) {
    refs.cashbookTableBody.querySelectorAll("[data-delete-cash]").forEach((button) => {
      button.addEventListener("click", () => deleteCashEntry(Number(button.dataset.deleteCash)));
    });
  }
}

function renderUsers() {
  if (!refs.usersTableBody) {
    return;
  }
  refs.usersTableBody.innerHTML = "";
  const currentId = Number(state.user?.id || 0);
  state.users.forEach((user) => {
    const tr = document.createElement("tr");
    const roleText = user.role === "admin"
      ? "Admin"
      : user.role === "customer"
        ? langText("Musteri", "Kunde")
        : user.role === "operator"
          ? "Operator"
          : langText("Personel", "Personal");
    const isSelf = Number(user.id) === currentId;
    const delLabel = langText("Sil", "Löschen");
    const editLabel = langText("Duzenle", "Bearbeiten");
    const deleteBtn = isSelf
      ? `<span class="muted" title="${langText("Kendinizi silemezsiniz", "Eigenes Konto nicht löschbar")}">—</span>`
      : `<button class="secondary-button small-button" data-delete-user="${user.id}">${delLabel}</button>`;
    tr.innerHTML = `
      <td>${escapeHtml(user.name || "")}</td>
      <td>${escapeHtml(user.username || "")}</td>
      <td>${user.email ? escapeHtml(user.email) : "-"}</td>
      <td>${user.phone ? escapeHtml(user.phone) : "-"}</td>
      <td>${roleText}</td>
      <td class="action-cell">
        <button class="secondary-button small-button" data-edit-user="${user.id}">${editLabel}</button>
        ${deleteBtn}
      </td>
    `;
    refs.usersTableBody.append(tr);
  });
  // Bind edit/delete buttons
  refs.usersTableBody.querySelectorAll("[data-edit-user]").forEach((btn) => {
    btn.addEventListener("click", () => startEditUser(Number(btn.dataset.editUser)));
  });
  refs.usersTableBody.querySelectorAll("[data-delete-user]").forEach((btn) => {
    btn.addEventListener("click", () => handleDeleteUser(Number(btn.dataset.deleteUser)));
  });
}

function startEditUser(userId) {
  const user = state.users.find((u) => Number(u.id) === Number(userId));
  if (!user || !refs.userForm) return;
  const form = refs.userForm;
  form.elements.id.value = user.id;
  form.elements.name.value = user.name || "";
  form.elements.username.value = user.username || "";
  form.elements.email.value = user.email || "";
  form.elements.phone.value = user.phone || "";
  form.elements.password.value = "";
  form.elements.password.required = false;
  form.elements.role.value = user.role || "staff";
  const title = document.getElementById("userFormTitle");
  if (title) title.textContent = langText(`Kullanici Duzenle: ${user.name || user.username}`, `Benutzer bearbeiten: ${user.name || user.username}`);
  const submitBtn = document.getElementById("userFormSubmit");
  if (submitBtn) submitBtn.textContent = langText("Kaydet", "Speichern");
  const cancelBtn = document.getElementById("userFormCancel");
  if (cancelBtn) cancelBtn.classList.remove("hidden");
  const hint = document.getElementById("userFormHint");
  if (hint) hint.textContent = langText(
    "Sifre alani bos birakilirsa mevcut sifre korunur.",
    "Leere Passwort: aktuelles Passwort bleibt erhalten."
  );
  const pwLabel = document.getElementById("userPasswordLabel");
  if (pwLabel) pwLabel.firstChild.textContent = langText("Yeni Sifre (opsiyonel)", "Neues Passwort (optional)");
  if (typeof form.scrollIntoView === "function") form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function resetUserForm() {
  if (!refs.userForm) return;
  refs.userForm.reset();
  refs.userForm.elements.id.value = "";
  refs.userForm.elements.password.required = true;
  const title = document.getElementById("userFormTitle");
  if (title) title.textContent = langText("Kullanici Ekle", "Benutzer anlegen");
  const submitBtn = document.getElementById("userFormSubmit");
  if (submitBtn) submitBtn.textContent = langText("Kullanici Ekle", "Benutzer anlegen");
  const cancelBtn = document.getElementById("userFormCancel");
  if (cancelBtn) cancelBtn.classList.add("hidden");
  const hint = document.getElementById("userFormHint");
  if (hint) hint.textContent = "";
  const pwLabel = document.getElementById("userPasswordLabel");
  if (pwLabel) pwLabel.firstChild.textContent = langText("Sifre", "Passwort");
}

async function handleDeleteUser(userId) {
  const user = state.users.find((u) => Number(u.id) === Number(userId));
  if (!user) return;
  const confirmMsg = langText(
    `"${user.name || user.username}" adli kullaniciyi silmek istediginizden emin misiniz?`,
    `Benutzer "${user.name || user.username}" wirklich löschen?`
  );
  if (!window.confirm(confirmMsg)) return;
  const res = await request(`/api/users/${userId}`, { method: "DELETE" });
  if (res.error) {
    window.alert(res.error);
    return;
  }
  await refreshData();
}

async function handleUserFormSubmit(event) {
  event.preventDefault();
  const form = refs.userForm;
  const payload = formToObject(form);
  const editId = Number(payload.id || 0);
  // Remove id from body
  delete payload.id;
  if (!payload.password) delete payload.password;

  const endpoint = editId ? `/api/users/${editId}` : "/api/users";
  const method = editId ? "PUT" : "POST";
  const res = await request(endpoint, { method, body: JSON.stringify(payload) });
  if (res.error) {
    window.alert(res.error);
    return;
  }
  resetUserForm();
  await refreshData();
}

function adminMessageCategoryLabel(value) {
  if (value === "complaint") {
    return langText("Sikayet", "Beschwerde");
  }
  if (value === "suggestion") {
    return langText("Oneri", "Vorschlag");
  }
  return langText("Istek", "Wunsch");
}

function adminMessageStatusLabel(value) {
  if (value === "read") {
    return langText("Okundu", "Gelesen");
  }
  if (value === "closed") {
    return langText("Kapandi", "Geschlossen");
  }
  return langText("Yeni", "Neu");
}

function adminMessageStatusClass(value) {
  if (value === "closed") {
    return "status-ok";
  }
  if (value === "read") {
    return "status-progress";
  }
  return "status-pending";
}

function renderAdminMessages() {
  const messages = Array.isArray(state.adminMessages) ? state.adminMessages : [];
  const newCount = messages.filter((entry) => entry.status === "new").length;
  const openCount = messages.filter((entry) => entry.status !== "closed").length;

  if (isAdminUser()) {
    if (refs.adminMessagesSummary) {
      refs.adminMessagesSummary.textContent = t("messages.adminMessagesSummary", messages.length, newCount);
    }
    if (!refs.adminMessagesTableBody) {
      return;
    }

    refs.adminMessagesTableBody.innerHTML = "";
    if (messages.length === 0) {
      refs.adminMessagesTableBody.innerHTML = `<tr><td colspan="7"><div class="empty-state">${t("messages.noAdminMessages")}</div></td></tr>`;
      return;
    }

    messages.forEach((entry) => {
      const tr = document.createElement("tr");
      const sender = entry.senderUsername
        ? `${entry.senderName} (${entry.senderUsername})`
        : entry.senderName || "-";
      const actions = entry.status === "closed"
        ? `<span class="muted">${langText("Kapali", "Geschlossen")}</span>`
        : `
            <div class="action-row">
              ${entry.status === "new" ? `<button class="mini-button secondary-button" type="button" data-admin-message-status="${entry.id}" data-status="read">${t("common.markRead")}</button>` : ""}
              <button class="mini-button danger-button" type="button" data-admin-message-status="${entry.id}" data-status="closed">${t("common.close")}</button>
            </div>
          `;
      tr.innerHTML = `
        <td>${escapeHtml(formatDateTime(entry.createdAt))}</td>
        <td>${escapeHtml(sender)}</td>
        <td>${escapeHtml(adminMessageCategoryLabel(entry.category))}</td>
        <td>${escapeHtml(entry.subject || "-")}</td>
        <td>${escapeHtml(entry.message || "-")}</td>
        <td><span class="status-pill ${adminMessageStatusClass(entry.status)}">${escapeHtml(adminMessageStatusLabel(entry.status))}</span></td>
        <td class="table-action-cell">${actions}</td>
      `;
      refs.adminMessagesTableBody.append(tr);
    });

    refs.adminMessagesTableBody.querySelectorAll("[data-admin-message-status]").forEach((button) => {
      button.addEventListener("click", () => updateAdminMessageStatus(Number(button.dataset.adminMessageStatus), button.dataset.status));
    });
    return;
  }

  if (refs.adminMessageHistorySummary) {
    refs.adminMessageHistorySummary.textContent = t("messages.adminMessageHistorySummary", messages.length, openCount);
  }
  if (!refs.adminMessageList) {
    return;
  }

  refs.adminMessageList.innerHTML = "";
  if (messages.length === 0) {
    refs.adminMessageList.innerHTML = `<div class="empty-state">${t("messages.noOwnAdminMessages")}</div>`;
    return;
  }

  messages.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "feed-item";
    card.innerHTML = `
      <strong>${escapeHtml(entry.subject || "-")}</strong>
      <span>${escapeHtml(formatDateTime(entry.createdAt))} | ${escapeHtml(adminMessageCategoryLabel(entry.category))}</span>
      <span><span class="status-pill ${adminMessageStatusClass(entry.status)}">${escapeHtml(adminMessageStatusLabel(entry.status))}</span></span>
      <span>${escapeHtml(entry.message || "-")}</span>
    `;
    refs.adminMessageList.append(card);
  });
}

function securitySeverityLabel(value) {
  if (value === "critical") {
    return langText("Kritik", "Kritisch");
  }
  if (value === "warn") {
    return langText("Uyari", "Warnung");
  }
  return langText("Bilgi", "Info");
}

function securityEventLabel(eventType) {
  const labels = {
    login_success: langText("Giris basarili", "Login erfolgreich"),
    login_failed: langText("Hatali giris", "Fehlgeschlagener Login"),
    logout: langText("Cikis yapildi", "Abmeldung"),
    access_denied: langText("Yetki reddedildi", "Zugriff verweigert"),
    password_reset_requested: langText("Sifre yenileme istendi", "Passwort-Reset angefordert"),
    password_reset_completed: langText("Sifre yenilendi", "Passwort zurueckgesetzt"),
    email_verified: langText("E-posta dogrulandi", "E-Mail bestaetigt"),
    email_verification_resent: langText("Dogrulama maili tekrar gonderildi", "Bestaetigungs-E-Mail erneut gesendet"),
    customer_registered: langText("Musteri kaydi", "Kundenregistrierung"),
    item_created: langText("Urun olusturuldu", "Artikel erstellt"),
    item_updated: langText("Urun guncellendi", "Artikel aktualisiert"),
    item_deleted: langText("Urun silindi", "Artikel geloescht"),
    item_archived: langText("Urun arsive alindi", "Artikel archiviert"),
    item_restored: langText("Urun geri alindi", "Artikel wieder aktiviert"),
    item_intake_created: langText("Yeni urun ve ilk stok", "Neuer Artikel mit Erstbestand"),
    movement_entry_created: langText("Stok girisi", "Lagerzugang"),
    movement_exit_created: langText("Stok cikisi", "Lagerausgang"),
    movement_reversed: langText("Hareket iptal edildi", "Bewegung storniert"),
    expense_created: langText("Masraf eklendi", "Ausgabe erfasst"),
    expense_deleted: langText("Masraf silindi", "Ausgabe geloescht"),
    cashbook_created: langText("Kasa kaydi eklendi", "Kasseneintrag erstellt"),
    cashbook_deleted: langText("Kasa kaydi silindi", "Kasseneintrag geloescht"),
    bulk_pricing_updated: langText("Toplu fiyat guncellendi", "Sammelpreise aktualisiert"),
    quote_created: langText("Teklif kaydedildi", "Angebot gespeichert"),
    sale_completed: langText("Direkt satis tamamlandi", "Direktverkauf abgeschlossen"),
    unbilled_sale_completed: langText("Faturasiz satis tamamlandi", "Verkauf ohne Rechnung abgeschlossen"),
    order_created: langText("Siparis olusturuldu", "Bestellung erstellt"),
    order_status_updated: langText("Siparis durumu guncellendi", "Bestellstatus aktualisiert"),
    admin_message_created: langText("Admin mesaji gonderildi", "Admin-Nachricht gesendet"),
    admin_message_status_updated: langText("Admin mesaji durumu guncellendi", "Admin-Nachricht aktualisiert"),
    user_created: langText("Kullanici olusturuldu", "Benutzer erstellt"),
    training_created: langText("DRC MAN egitimi eklendi", "DRC-MAN-Training erstellt"),
    training_updated: langText("DRC MAN egitimi guncellendi", "DRC-MAN-Training aktualisiert"),
    training_deleted: langText("DRC MAN egitimi silindi", "DRC-MAN-Training geloescht"),
    origin_blocked: langText("Cross-site istek engellendi", "Cross-Site-Anfrage blockiert"),
    rate_limit_hit: langText("Istek limiti asildi", "Ratenlimit erreicht"),
    ip_blocked: langText("IP bloke edildi", "IP blockiert"),
    ip_unblocked: langText("IP blokesi kaldirildi", "IP freigegeben"),
  };
  return labels[eventType] || eventType;
}

function securityRoleLabel(role) {
  if (role === "admin") {
    return "Admin";
  }
  if (role === "staff") {
    return langText("Personel", "Personal");
  }
  if (role === "customer") {
    return langText("Musteri", "Kunde");
  }
  return role || "-";
}

function summarizeSecurityDetails(details) {
  if (!details || typeof details !== "object") {
    return "-";
  }
  return Object.entries(details)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ") || "-";
}

function renderSecurity() {
  if (!refs.securityEventsTableBody || !isAdminUser()) {
    return;
  }

  const events = Array.isArray(state.securityEvents) ? state.securityEvents : [];
  const blocks = Array.isArray(state.securityBlocks) ? state.securityBlocks : [];
  const activeBlocks = blocks.filter((entry) => entry.isActive).length;
  if (refs.securitySummary) {
    refs.securitySummary.textContent = t("messages.securitySummary", events.length, blocks.length, activeBlocks);
  }

  refs.securityEventsTableBody.innerHTML = "";
  if (events.length === 0) {
    refs.securityEventsTableBody.innerHTML = `<tr><td colspan="7"><div class="empty-state">${t("messages.noSecurityEvents")}</div></td></tr>`;
  } else {
    events.forEach((entry) => {
      const tr = document.createElement("tr");
      const severityClass = entry.severity === "critical" ? "status-critical" : entry.severity === "warn" ? "status-pending" : "status-ok";
      tr.innerHTML = `
        <td>${escapeHtml(formatDateTime(entry.createdAt))}</td>
        <td><span class="status-pill ${severityClass}">${escapeHtml(securitySeverityLabel(entry.severity))}</span></td>
        <td>${escapeHtml(securityEventLabel(entry.eventType))}</td>
        <td>${escapeHtml(entry.userName || "-")}</td>
        <td>${escapeHtml(securityRoleLabel(entry.userRole))}</td>
        <td>${escapeHtml(entry.ipAddress || "-")}</td>
        <td>${escapeHtml(summarizeSecurityDetails(entry.details))}</td>
      `;
      refs.securityEventsTableBody.append(tr);
    });
  }

  refs.securityBlocksTableBody.innerHTML = "";
  if (blocks.length === 0) {
    refs.securityBlocksTableBody.innerHTML = `<tr><td colspan="5"><div class="empty-state">${t("messages.noSecurityBlocks")}</div></td></tr>`;
    return;
  }

  blocks.forEach((entry) => {
    const tr = document.createElement("tr");
    const actionMarkup = entry.isActive
      ? `<button class="mini-button danger-button" type="button" data-release-block="${entry.id}" data-help="TR: IP blogunu kaldirir. DE: Hebt die IP-Sperre auf.">${t("common.release")}</button>`
      : `<span class="muted">${langText("Kapali", "Inaktiv")}</span>`;
    tr.innerHTML = `
      <td>${escapeHtml(entry.ipAddress || "-")}</td>
      <td>${escapeHtml(entry.reason || "-")}</td>
      <td>${escapeHtml(formatDateTime(entry.blockUntil))}</td>
      <td><span class="status-pill ${entry.isActive ? "status-critical" : "status-ok"}">${entry.isActive ? langText("Aktif Blok", "Aktive Sperre") : langText("Sure Doldu", "Abgelaufen")}</span></td>
      <td class="table-action-cell">${actionMarkup}</td>
    `;
    refs.securityBlocksTableBody.append(tr);
  });

  refs.securityBlocksTableBody.querySelectorAll("[data-release-block]").forEach((button) => {
    button.addEventListener("click", () => releaseSecurityBlock(Number(button.dataset.releaseBlock)));
  });
}

function trainingAudienceLabel(audience) {
  if (audience === "admin") {
    return langText("Sadece Admin", "Nur Admin");
  }
  if (audience === "staff") {
    return langText("Admin + Personel", "Admin + Personal");
  }
  if (audience === "customer") {
    return langText("Sadece Musteri", "Nur Kunde");
  }
  return langText("Tum Kullanicilar", "Alle Benutzer");
}

function renderAssistantTraining() {
  if (!refs.assistantTrainingTableBody || !isAdminUser()) {
    return;
  }

  refs.assistantTrainingTableBody.innerHTML = "";
  if (!state.agentTrainingLoaded) {
    refs.assistantTrainingSummary.textContent = langText("Egitim kayitlari yukleniyor...", "Trainingseintraege werden geladen...");
    refs.assistantTrainingTableBody.innerHTML = `<tr><td colspan="7"><div class="empty-state">${langText("Yukleniyor...", "Wird geladen...")}</div></td></tr>`;
    return;
  }

  const entries = state.agentTraining || [];
  refs.assistantTrainingSummary.textContent = t("messages.trainingSummary", entries.length);

  if (entries.length === 0) {
    refs.assistantTrainingTableBody.innerHTML = `<tr><td colspan="7"><div class="empty-state">${t("messages.noTraining")}</div></td></tr>`;
    return;
  }

  entries.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(entry.topic || "-")}</td>
      <td>${trainingAudienceLabel(entry.audience)}</td>
      <td>${escapeHtml(entry.trQuestion)}</td>
      <td>${escapeHtml(entry.deQuestion || "-")}</td>
      <td><span class="status-pill ${entry.isActive ? "status-ok" : "status-pending"}">${entry.isActive ? t("common.active") : t("common.passive")}</span></td>
      <td>${escapeHtml(entry.createdByName || "-")}</td>
      <td class="table-action-cell">
        <div class="action-row">
          <button class="mini-button secondary-button" type="button" data-edit-training="${entry.id}" data-help="TR: Egitim kaydini duzenler. DE: Bearbeitet den Trainingseintrag.">${t("common.edit")}</button>
          <button class="mini-button danger-button" type="button" data-delete-training="${entry.id}" data-help="TR: Egitim kaydini siler. DE: Loescht den Trainingseintrag.">${t("common.delete")}</button>
        </div>
      </td>
    `;
    refs.assistantTrainingTableBody.append(tr);
  });

  refs.assistantTrainingTableBody.querySelectorAll("[data-edit-training]").forEach((button) => {
    button.addEventListener("click", () => populateAssistantTrainingForm(Number(button.dataset.editTraining)));
  });

  refs.assistantTrainingTableBody.querySelectorAll("[data-delete-training]").forEach((button) => {
    button.addEventListener("click", () => deleteAssistantTraining(Number(button.dataset.deleteTraining)));
  });
}

async function loadAssistantTraining(force = false) {
  if (!isAdminUser() || (!force && state.agentTrainingLoaded)) {
    renderAssistantTraining();
    return;
  }

  renderAssistantTraining();
  const result = await request("/api/assistant/trainings");
  if (result.error) {
    window.alert(result.error);
    return;
  }

  state.agentTraining = Array.isArray(result.entries) ? result.entries : [];
  state.agentTrainingLoaded = true;
  renderAssistantTraining();
}

function populateAssistantTrainingForm(trainingId) {
  const entry = state.agentTraining.find((item) => Number(item.id) === trainingId);
  if (!entry || !refs.assistantTrainingForm) {
    return;
  }

  refs.assistantTrainingForm.elements.id.value = entry.id;
  refs.assistantTrainingForm.elements.topic.value = entry.topic || "";
  refs.assistantTrainingForm.elements.audience.value = entry.audience || "all";
  refs.assistantTrainingForm.elements.keywords.value = entry.keywords || "";
  refs.assistantTrainingForm.elements.trQuestion.value = entry.trQuestion || "";
  refs.assistantTrainingForm.elements.trAnswer.value = entry.trAnswer || "";
  refs.assistantTrainingForm.elements.deQuestion.value = entry.deQuestion || "";
  refs.assistantTrainingForm.elements.deAnswer.value = entry.deAnswer || "";
  refs.assistantTrainingForm.elements.suggestions.value = Array.isArray(entry.suggestions) ? entry.suggestions.join(", ") : "";
  refs.assistantTrainingForm.elements.isActive.value = entry.isActive ? "true" : "false";
  refs.assistantTrainingSubmitButton.textContent = t("messages.trainingUpdated");
  refs.assistantTrainingCancelButton.classList.remove("hidden");
  activateTab("training");
  refs.assistantTrainingForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetAssistantTrainingForm() {
  if (!refs.assistantTrainingForm) {
    return;
  }

  refs.assistantTrainingForm.reset();
  refs.assistantTrainingForm.elements.id.value = "";
  refs.assistantTrainingForm.elements.audience.value = "all";
  refs.assistantTrainingForm.elements.isActive.value = "true";
  refs.assistantTrainingSubmitButton.textContent = t("messages.trainingSaved");
  refs.assistantTrainingCancelButton.classList.add("hidden");
}

function retrofitGasLabel(value) {
  const map = {
    r404a: "R404A",
    r134a: "R134a",
    r448a: "R448A",
    r449a: "R449A",
    r452a: "R452A",
    r290: "R290",
    r744: "R744 / CO2",
    r717: "R717 / NH3",
  };
  return map[value] || value || langText("Belirtilmedi", "Nicht angegeben");
}

function retrofitSelectLabel(fieldName, value) {
  const option = refs.retrofitChecklistForm?.elements?.[fieldName]?.querySelector(`option[value="${value}"]`);
  return option?.textContent || value || "-";
}

function buildRetrofitChecklist(input) {
  const currentGas = retrofitGasLabel(input.currentGas);
  const targetGas = input.targetGas ? retrofitGasLabel(input.targetGas) : langText("henuz net degil", "noch offen");
  const summaryBits = [
    langText(`Kaynak gaz: ${currentGas}`, `Bestandskaeltemittel: ${currentGas}`),
    langText(`Planlanan gaz: ${targetGas}`, `Zielkaeltemittel: ${targetGas}`),
    langText(`Uygulama: ${retrofitSelectLabel("applicationType", input.applicationType)}`, `Anwendung: ${retrofitSelectLabel("applicationType", input.applicationType)}`),
    langText(`Sistem tipi: ${retrofitSelectLabel("systemType", input.systemType)}`, `Anlagentyp: ${retrofitSelectLabel("systemType", input.systemType)}`),
  ];

  const decisionLines = [
    langText(
      "1. Once bunun gercekten drop-in mi yoksa kismi redesign mi olduguna karar ver.",
      "1. Zuerst klaeren, ob das ein echtes Drop-in oder bereits ein Teil-Redesign ist."
    ),
    langText(
      `2. ${currentGas} -> ${targetGas} gecisinde kompresor ve yag tarafini katalog onayi olmadan kesinlestirme.`,
      `2. Den Schritt ${currentGas} -> ${targetGas} nicht ohne Verdichter- und Oelfreigabe festlegen.`
    ),
  ];

  if (input.currentGas === "r404a") {
    decisionLines.push(
      langText(
        "3. R404A tarafinda valf, glide ve etiket guncellemesi neredeyse her zaman ayri kontrol ister.",
        "3. Bei R404A-Retrofit muessen Ventil, Glide-Logik und Kennzeichnung fast immer separat geprueft werden."
      )
    );
  }
  if (["r290", "r744", "r717"].includes(input.targetGas || input.currentGas)) {
    decisionLines.push(
      langText(
        "4. Yanicilik / yuksek basinc / toksisite tarafini normal gaz degisimi gibi degil, proje guvenligi gibi ele al.",
        "4. Brennbarkeit / Hochdruck / Toxizitaet nicht wie einen normalen Kaeltemittelwechsel, sondern wie ein Sicherheitsprojekt behandeln."
      )
    );
  }

  const mechanicalLines = [
    langText(
      `Kompresor onayi: ${retrofitSelectLabel("compressorApproval", input.compressorApproval)}. Datasheet ve servis bulteni gorulmeden nihai gecis yapma.`,
      `Verdichterfreigabe: ${retrofitSelectLabel("compressorApproval", input.compressorApproval)}. Ohne Datenblatt und Servicebulletin keine finale Freigabe.`
    ),
    langText(
      `Yag durumu: ${retrofitSelectLabel("oilType", input.oilType)}. Gerekirse flushing, kademeli yag degisimi ve geri donus kontrolu planla.`,
      `Oelzustand: ${retrofitSelectLabel("oilType", input.oilType)}. Falls noetig Spuelung, stufenweisen Oelwechsel und Ruecklaufkontrolle einplanen.`
    ),
    langText(
      `Valf/orifis durumu: ${retrofitSelectLabel("valveState", input.valveState)}. TXV/EEV, nozzle ve equalizer tarafi yeni gaza gore yeniden kontrol edilmeli.`,
      `Ventil/Duese: ${retrofitSelectLabel("valveState", input.valveState)}. TXV/EEV, Duesen und Equalizer auf das neue Kaeltemittel abstimmen.`
    ),
    langText(
      "Filtre drier, sight glass, servis vanalari ve likit hattinda daralma ihtimalini mekanik kontrolde ayri not et.",
      "Filtertrockner, Schauglas, Serviceventile und moegliche Verengungen in der Fluessigkeitsleitung separat pruefen."
    ),
  ];

  const controlsLines = [
    langText(
      `Kontrol ve emniyet: ${retrofitSelectLabel("controlsState", input.controlsState)}. Presostat, termostat, alarm ve defrost mantigi yeni basinc tablosuna gore bakilmali.`,
      `Regelung und Sicherheit: ${retrofitSelectLabel("controlsState", input.controlsState)}. Druckschalter, Regler, Alarm und Abtauung auf die neue Drucklogik anpassen.`
    ),
    langText(
      `Etiket ve evrak: ${retrofitSelectLabel("labelState", input.labelState)}. Gaz etiketi, sarj miktari, servis kaydi ve musteri bilgilendirmesi guncellenmeli.`,
      `Kennzeichnung und Unterlagen: ${retrofitSelectLabel("labelState", input.labelState)}. Kaeltemitteletikett, Fuellmenge, Serviceprotokoll und Kundeninfo aktualisieren.`
    ),
  ];

  if (input.applicationType === "negative" || input.applicationType === "shock") {
    controlsLines.push(
      langText(
        "Negatif / sok odada defrost sirasi, likit geri donusu ve basma sicakligi ekstra yakindan takip edilmeli.",
        "Bei Tiefkuehl- oder Schockanwendungen muessen Abtaulogik, Fluessigkeitsrueckkehr und Druckgastemperatur besonders eng beobachtet werden."
      )
    );
  }

  const commissioningLines = [
    langText(
      "Vakum, sizdirmazlik, dogru sarj sirasi ve ilk devreye alma olculeri yazili kayda alinmali.",
      "Vakuum, Dichtheit, Fuellreihenfolge und die ersten Inbetriebnahme-Messwerte schriftlich festhalten."
    ),
    langText(
      "Ilk calismada PT tablo, superheat ve subcool birlikte okunmali; sadece manometreye bakip karar verilmemeli.",
      "Bei der Erstinbetriebnahme muessen PT-Logik, Superheat und Subcooling gemeinsam gelesen werden; ein Blick auf den Druck allein reicht nicht."
    ),
    langText(
      "Yuk altinda ikinci kontrol yapilmali: bos calisma ve yuklu calisma ayni tabloyu vermez.",
      "Eine zweite Kontrolle unter Last ist Pflicht; Leerlauf und Lastbetrieb zeigen oft unterschiedliche Bilder."
    ),
  ];

  if (input.notes) {
    commissioningLines.push(
      langText(`Saha notu: ${input.notes}`, `Feldnotiz: ${input.notes}`)
    );
  }

  return {
    summary: summaryBits.join(" | "),
    sections: [
      { title: langText("Karar Mantigi", "Entscheidungslogik"), items: decisionLines },
      { title: langText("Mekanik ve Yag Tarafi", "Mechanik und Oelseite"), items: mechanicalLines },
      { title: langText("Kontrol ve Emniyet", "Regelung und Sicherheit"), items: controlsLines },
      { title: langText("Devreye Alma ve Son Kontrol", "Inbetriebnahme und Endkontrolle"), items: commissioningLines },
    ],
  };
}

function renderRetrofitChecklist() {
  if (!refs.retrofitChecklistOutput) {
    return;
  }

  if (!state.retrofitChecklist) {
    refs.retrofitChecklistOutput.innerHTML = `<div class="empty-state">${langText("Henuz checklist uretilmedi.", "Es wurde noch keine Checkliste erzeugt.")}</div>`;
    return;
  }

  const checklist = buildRetrofitChecklist(state.retrofitChecklist);
  refs.retrofitChecklistOutput.innerHTML = `
    <article class="retrofit-checklist-summary">
      <strong>${langText("Ozet", "Zusammenfassung")}</strong>
      <p>${escapeHtml(checklist.summary)}</p>
    </article>
    ${checklist.sections
      .map(
        (section) => `
          <section class="retrofit-checklist-section">
            <h4>${escapeHtml(section.title)}</h4>
            <ul>
              ${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </section>
        `
      )
      .join("")}
  `;
}

function readRetrofitChecklistForm() {
  if (!refs.retrofitChecklistForm) {
    return null;
  }
  const formData = new FormData(refs.retrofitChecklistForm);
  return {
    currentGas: String(formData.get("currentGas") || ""),
    targetGas: String(formData.get("targetGas") || ""),
    applicationType: String(formData.get("applicationType") || ""),
    systemType: String(formData.get("systemType") || ""),
    oilType: String(formData.get("oilType") || ""),
    compressorApproval: String(formData.get("compressorApproval") || ""),
    valveState: String(formData.get("valveState") || ""),
    controlsState: String(formData.get("controlsState") || ""),
    labelState: String(formData.get("labelState") || ""),
    notes: String(formData.get("notes") || "").trim(),
  };
}

function handleRetrofitChecklistGenerate(event) {
  event.preventDefault();
  state.retrofitChecklist = readRetrofitChecklistForm();
  renderRetrofitChecklist();
}

async function copyRetrofitChecklist() {
  if (!state.retrofitChecklist) {
    alert(langText("Once checklist uretin.", "Bitte zuerst eine Checkliste erzeugen."));
    return;
  }

  const checklist = buildRetrofitChecklist(state.retrofitChecklist);
  const text = [
    langText("Retrofit Checklist", "Retrofit-Checkliste"),
    checklist.summary,
    ...checklist.sections.flatMap((section) => [
      "",
      section.title,
      ...section.items.map((item, index) => `${index + 1}. ${item}`),
    ]),
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
    refs.retrofitChecklistCopyButton.textContent = langText("Kopyalandi", "Kopiert");
    window.setTimeout(() => {
      refs.retrofitChecklistCopyButton.textContent = langText("Checklist Kopyala", "Checkliste kopieren");
    }, 1500);
  } catch (_error) {
    alert(langText("Checklist kopyalanamadi.", "Die Checkliste konnte nicht kopiert werden."));
  }
}

function renderQuotes() {
  if (isCustomerUser()) {
    return;
  }

  renderPosCatalog();

  refs.quotesList.innerHTML = "";
  if (!state.quotes || state.quotes.length === 0) {
    refs.quotesList.innerHTML = `<div class="empty-state">${t("messages.noQuotes")}</div>`;
  } else {
    state.quotes.forEach((quote) => {
      const div = document.createElement("div");
      div.className = "feed-item";
      div.innerHTML = `
        <strong>${quote.title} - ${quote.customerName}</strong>
        <span>${quote.quoteNo || `#${quote.id}`} | ${quote.date} | ${langText("Net", "Netto")} ${currency.format(quote.netTotal || quote.total)} | ${langText("Brut", "Brutto")} ${currency.format(quote.grossTotal || quote.total)}</span>
        <span>${quote.userName || "-"} | ${quote.language === "tr" ? "TR" : "DE"} | ${quote.isExport ? t("common.export") : t("common.inland")}</span>
        <span>${quote.items.map((item) => `${item.itemName} x ${numberFormat.format(item.quantity)}`).join(", ")}</span>
        ${quote.note ? `<span>${quote.note}</span>` : ""}
        <div class="action-row">
          <button class="mini-button secondary-button" type="button" data-quote-preview="${quote.id}" data-lang="auto" data-help="TR: Teklif PDF onizlemesini yeni sekmede acar. DE: Oeffnet die PDF-Vorschau des Angebots in einem neuen Tab.">${langText("Onizle", "Vorschau")}</button>
          <button class="mini-button secondary-button" type="button" data-quote-pdf="${quote.id}" data-lang="auto" data-help="TR: Teklifi panel dilinde PDF olarak indirir. DE: Laedt das Angebot in der aktuellen Oberflaechensprache als PDF herunter.">${langText("Indir", "Download")} PDF ${state.uiLanguage.toUpperCase()}</button>
        </div>
      `;
      refs.quotesList.append(div);
    });
  }

  refs.quotesList.querySelectorAll("[data-quote-preview]").forEach((button) => {
    button.addEventListener("click", () => {
      const quoteId = button.dataset.quotePreview;
      const lang = button.dataset.lang;
      openQuotePdfPreview(quoteId, lang);
    });
  });

  refs.quotesList.querySelectorAll("[data-quote-pdf]").forEach((button) => {
    button.addEventListener("click", async () => {
      const quoteId = button.dataset.quotePdf;
      const lang = button.dataset.lang;
      await downloadQuotePdf(quoteId, lang);
    });
  });

  refs.quoteDraftBody.innerHTML = "";
  if (state.quoteDraft.length === 0) {
    refs.quoteDraftBody.innerHTML = `<div class="empty-state">${t("messages.emptyQuoteDraft")}</div>`;
  } else {
    state.quoteDraft.forEach((entry, index) => {
      const row = document.createElement("article");
      row.className = "cart-item";
      const priceLabel = entry.quantity <= 1 && Number(entry.listPrice || 0) > 0
        ? langText("liste", "Liste")
        : langText("net", "netto");
      row.innerHTML = `
        <div class="cart-item-main">
          <strong>${entry.itemName}</strong>
          <span>${entry.unit} | ${currency.format(entry.unitPrice)} / ${langText("birim", "Einheit")} (${priceLabel})</span>
        </div>
        <div class="cart-item-controls">
          <button class="mini-button secondary-button" type="button" data-quote-qty="${index}" data-delta="-1">-</button>
          <span>${numberFormat.format(entry.quantity)}</span>
          <button class="mini-button secondary-button" type="button" data-quote-qty="${index}" data-delta="1">+</button>
        </div>
        <div class="cart-item-total">
          <strong>${currency.format(entry.quantity * entry.unitPrice)}</strong>
          <button class="mini-button danger-button" type="button" data-remove-quote-line="${index}">${t("common.delete")}</button>
        </div>
      `;
      refs.quoteDraftBody.append(row);
    });
  }

  refs.quoteDraftBody.querySelectorAll("[data-remove-quote-line]").forEach((button) => {
    button.addEventListener("click", () => {
      state.quoteDraft.splice(Number(button.dataset.removeQuoteLine), 1);
      renderQuotes();
    });
  });
  refs.quoteDraftBody.querySelectorAll("[data-quote-qty]").forEach((button) => {
    button.addEventListener("click", () => changeQuoteQuantity(Number(button.dataset.quoteQty), Number(button.dataset.delta)));
  });

  const subtotal = state.quoteDraft.reduce((sum, entry) => sum + entry.quantity * entry.unitPrice, 0);
  const discount = Number(refs.quoteForm.elements.discount.value || 0);
  const isExport = refs.quoteForm.elements.isExport?.value !== "false";
  const netTotal = Math.max(subtotal - discount, 0);
  const vatAmount = isExport ? 0 : netTotal * 0.19;
  const grossTotal = netTotal + vatAmount;
  const collectedAmount = Math.max(Number(refs.quoteForm.elements.collectedAmount?.value || 0), 0);
  const remaining = Math.max(grossTotal - collectedAmount, 0);
  const unbilledTotal = netTotal;
  const unbilledRemaining = Math.max(unbilledTotal - collectedAmount, 0);
  refs.quoteDraftSummary.textContent = t(
    "messages.quoteSummary",
    currency.format(subtotal),
    currency.format(discount),
    currency.format(netTotal),
    currency.format(vatAmount),
    currency.format(grossTotal),
    currency.format(collectedAmount),
    currency.format(remaining),
    currency.format(unbilledTotal),
    currency.format(unbilledRemaining)
  );
}

function renderPosCatalog() {
  if (!refs.posCatalogGrid || isCustomerUser()) {
    return;
  }

  const items = getFilteredQuoteItems().filter((item) => Number(item.currentStock) > 0);
  refs.posCatalogGrid.innerHTML = "";

  if (items.length === 0) {
    refs.posCatalogGrid.innerHTML = `<div class="empty-state">${t("messages.noPosItems")}</div>`;
    return;
  }

  items.slice(0, 60).forEach((item) => {
    const card = document.createElement("article");
    card.className = "pos-card";
    const listPrice = visibleListPrice(item);
    const netPrice = visibleSalePrice(item);
    const itemDetail = getPublicItemDetail(item);
    const canSell = cartSalePrice(item, 1) > 0;
    if (!canSell) {
      card.classList.add("is-disabled");
    }
    card.innerHTML = `
      <div class="pos-card-head">
        <strong>${item.name}</strong>
        <span>${item.brand || "-"}</span>
      </div>
      <div class="pos-card-meta">
        <span>${getDisplayCategory(item.category)}</span>
        <span>${langText("Stok", "Bestand")}: ${formatItemStock(item.currentStock, item.unit)}</span>
        ${itemDetail ? `<span>${langText("Detay", "Detail")}: ${itemDetail}</span>` : ""}
      </div>
      <div class="pos-card-price">${netPrice ? `${currency.format(netPrice)} ${langText("net", "netto")}` : "-"}</div>
      ${listPrice ? `<div class="pos-card-meta"><span>${langText("1 adet liste", "Listenpreis 1 Stk.")}: ${currency.format(listPrice)}</span></div>` : ""}
      <button class="primary-button" type="button" data-add-quote-item="${item.id}" ${canSell ? "" : "disabled"} data-help="TR: Urunu satis sepetine ekler. DE: Legt den Artikel in den Verkaufswarenkorb.">${canSell ? t("common.addToCart") : langText("Fiyat Eksik", "Preis fehlt")}</button>
    `;
    refs.posCatalogGrid.append(card);
  });

  refs.posCatalogGrid.querySelectorAll("[data-add-quote-item]").forEach((button) => {
    button.addEventListener("click", () => addItemToQuote(Number(button.dataset.addQuoteItem)));
  });
}

function renderOrders() {
  renderAdminOrders();
  renderCustomerCatalog();
  renderCustomerOrderDraft();
  renderCustomerOrders();
}

function renderAdminOrders() {
  if (!refs.ordersTableBody || isCustomerUser()) {
    return;
  }

  refs.ordersTableBody.innerHTML = "";
  if (!state.orders || state.orders.length === 0) {
    refs.ordersTableBody.innerHTML = `<tr><td colspan="6"><div class="empty-state">${t("messages.noAdminOrders")}</div></td></tr>`;
    return;
  }

  state.orders.forEach((order) => {
    const tr = document.createElement("tr");
    const statusClass = order.status === "completed" || order.status === "approved"
      ? "status-ok"
      : order.status === "cancelled"
        ? "status-critical"
        : order.status === "preparing"
          ? "status-progress"
          : "status-pending";
    tr.innerHTML = `
      <td>${order.date}</td>
      <td>${order.customerName}</td>
      <td>${order.items.map((item) => `${item.itemName} x ${numberFormat.format(item.quantity)}`).join(", ")}</td>
      <td><span class="status-pill ${statusClass}">${getOrderStatusLabel(order.status)}</span></td>
      <td>${order.note || "-"}</td>
      <td class="table-action-cell">
        <div class="action-row">
          <button class="mini-button secondary-button" type="button" data-order-status="${order.id}" data-status="approved" data-help="TR: Siparisi onaylar. DE: Bestaetigt die Bestellung.">${langText("Onayla", "Bestaetigen")}</button>
          <button class="mini-button secondary-button" type="button" data-order-status="${order.id}" data-status="preparing" data-help="TR: Siparisi hazirlaniyor durumuna alir. DE: Setzt die Bestellung auf in Vorbereitung.">${langText("Hazirla", "Vorbereiten")}</button>
          <button class="mini-button secondary-button" type="button" data-order-status="${order.id}" data-status="completed" data-help="TR: Siparisi tamamlanmis yapar. DE: Markiert die Bestellung als abgeschlossen.">${langText("Tamamla", "Abschliessen")}</button>
          <button class="mini-button danger-button" type="button" data-order-status="${order.id}" data-status="cancelled" data-help="TR: Siparisi iptal eder. DE: Storniert die Bestellung.">${t("common.cancelled")}</button>
          ${order.phone ? `<button class="mini-button secondary-button" type="button" data-order-whatsapp="${order.id}" data-help="TR: Musteriye hazir WhatsApp mesaji acar. DE: Oeffnet eine vorbereitete WhatsApp-Nachricht.">WhatsApp</button>` : ""}
        </div>
      </td>
    `;
    refs.ordersTableBody.append(tr);
  });

  refs.ordersTableBody.querySelectorAll("[data-order-status]").forEach((button) => {
    button.addEventListener("click", () => updateOrderStatus(Number(button.dataset.orderStatus), button.dataset.status));
  });

  refs.ordersTableBody.querySelectorAll("[data-order-whatsapp]").forEach((button) => {
    button.addEventListener("click", () => openOrderWhatsapp(Number(button.dataset.orderWhatsapp)));
  });
}

function populateCustomerCatalogFilters() {
  if (!refs.customerCatalogCategory || !refs.customerCatalogBrand) return;
  const stockItems = state.items.filter((item) => Number(item.currentStock) > 0);
  const categories = Array.from(new Set(stockItems.map(i => (i.category || "").trim()).filter(Boolean))).sort((a,b) => a.localeCompare(b, "tr"));
  const brands = Array.from(new Set(stockItems.map(i => (i.brand || "").trim()).filter(Boolean))).sort((a,b) => a.localeCompare(b, "tr"));
  const prevCategory = refs.customerCatalogCategory.value || "all";
  const prevBrand = refs.customerCatalogBrand.value || "all";
  refs.customerCatalogCategory.innerHTML = `<option value="all">${langText("Tümü","Alle")}</option>` + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  refs.customerCatalogBrand.innerHTML = `<option value="all">${langText("Tümü","Alle")}</option>` + brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
  if (categories.includes(prevCategory)) refs.customerCatalogCategory.value = prevCategory;
  if (brands.includes(prevBrand)) refs.customerCatalogBrand.value = prevBrand;
}

function getFilteredCustomerItems() {
  const filters = state.customerCatalogFilters;
  const term = (filters.search || "").toLowerCase().trim();
  let items = state.items.filter((item) => Number(item.currentStock) > 0);

  if (filters.category && filters.category !== "all") {
    items = items.filter((i) => (i.category || "").trim() === filters.category);
  }
  if (filters.brand && filters.brand !== "all") {
    items = items.filter((i) => (i.brand || "").trim() === filters.brand);
  }
  if (term) {
    items = items.filter((i) => {
      const name = (i.name || "").toLowerCase();
      const brand = (i.brand || "").toLowerCase();
      const code = (i.barcode || "").toLowerCase();
      const sku = (i.productCode || "").toLowerCase();
      return name.includes(term) || brand.includes(term) || code.includes(term) || sku.includes(term);
    });
  }

  items.sort((a, b) => {
    switch (filters.sort) {
      case "price-asc":  return Number(visibleSalePrice(a) || 0) - Number(visibleSalePrice(b) || 0);
      case "price-desc": return Number(visibleSalePrice(b) || 0) - Number(visibleSalePrice(a) || 0);
      case "stock-desc": return Number(b.currentStock || 0) - Number(a.currentStock || 0);
      default:           return (a.name || "").localeCompare(b.name || "", "tr");
    }
  });

  return items;
}

function renderCustomerCatalog() {
  if (!refs.customerCatalogGrid || !isCustomerUser()) {
    return;
  }

  populateCustomerCatalogFilters();
  const allFiltered = getFilteredCustomerItems();
  const MAX_SHOW = 120;
  const items = allFiltered.slice(0, MAX_SHOW);
  refs.customerCatalogGrid.innerHTML = "";

  if (refs.customerCatalogSummary) {
    refs.customerCatalogSummary.textContent = allFiltered.length > MAX_SHOW
      ? langText(`${allFiltered.length} ürün bulundu · ilk ${MAX_SHOW} gösteriliyor`, `${allFiltered.length} Artikel · erste ${MAX_SHOW} angezeigt`)
      : langText(`${allFiltered.length} ürün bulundu`, `${allFiltered.length} Artikel gefunden`);
  }

  if (items.length === 0) {
    refs.customerCatalogGrid.innerHTML = `<div class="empty-state">${t("messages.noCustomerCatalog")}</div>`;
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "pos-card";
    const listPrice = visibleListPrice(item);
    const netPrice = visibleSalePrice(item);
    const itemDetail = getPublicItemDetail(item);
    card.innerHTML = `
      <div class="pos-card-head">
        <strong>${item.name}</strong>
        <span>${item.brand || "-"}</span>
      </div>
      <div class="pos-card-meta">
        <span>${getDisplayCategory(item.category)}</span>
        <span>${langText("Stok", "Bestand")}: ${formatItemStock(item.currentStock, item.unit)}</span>
        ${itemDetail ? `<span>${langText("Detay", "Detail")}: ${itemDetail}</span>` : ""}
        <span>${langText("Stok Kodu", "Lagercode")}: ${item.barcode || "-"}</span>
      </div>
      <div class="pos-card-price">${netPrice ? `${currency.format(netPrice)} ${langText("net", "netto")}` : langText("Fiyat sorunuz", "Preis auf Anfrage")}</div>
      ${listPrice ? `<div class="pos-card-meta"><span>${langText("1 adet liste", "Listenpreis 1 Stk.")}: ${currency.format(listPrice)}</span></div>` : ""}
      <button class="primary-button" type="button" data-add-order-item="${item.id}" data-help="TR: Urunu musteri siparis sepetine ekler. DE: Fuegt den Artikel dem Kundenwarenkorb hinzu.">${t("common.addToOrder")}</button>
    `;
    refs.customerCatalogGrid.append(card);
  });

  refs.customerCatalogGrid.querySelectorAll("[data-add-order-item]").forEach((button) => {
    button.addEventListener("click", () => addItemToCustomerOrder(Number(button.dataset.addOrderItem)));
  });
}

function renderCustomerOrderDraft() {
  if (!refs.customerOrderBody || !refs.customerOrderSummary || !isCustomerUser()) {
    return;
  }

  refs.customerOrderBody.innerHTML = "";
  if (state.customerOrderDraft.length === 0) {
    refs.customerOrderBody.innerHTML = `<div class="empty-state">${t("messages.emptyCustomerCart")}</div>`;
    refs.customerOrderSummary.textContent = t("messages.noCustomerOrderLines");
    refs.customerCartTotals?.classList.add("hidden");
    return;
  }

  state.customerOrderDraft.forEach((entry, index) => {
    const row = document.createElement("article");
    row.className = "cart-item";
    row.innerHTML = `
        <div class="cart-item-main">
          <strong>${entry.itemName}</strong>
          <span>${entry.unit} | ${langText("Stok", "Bestand")}: ${numberFormat.format(entry.maxQuantity)} ${entry.unit} | ${langText("Birim", "Einzel")}: ${currency.format(entry.unitPrice || 0)}</span>
        </div>
      <div class="cart-item-controls">
        <button class="mini-button secondary-button" type="button" data-order-qty="${index}" data-delta="-1">-</button>
        <span>${numberFormat.format(entry.quantity)}</span>
        <button class="mini-button secondary-button" type="button" data-order-qty="${index}" data-delta="1">+</button>
      </div>
        <div class="cart-item-total">
          <strong>${currency.format(Number(entry.quantity) * Number(entry.unitPrice || 0))}</strong>
          <button class="mini-button danger-button" type="button" data-remove-order-line="${index}">${t("common.delete")}</button>
        </div>
    `;
    refs.customerOrderBody.append(row);
  });

  refs.customerOrderBody.querySelectorAll("[data-remove-order-line]").forEach((button) => {
    button.addEventListener("click", () => {
      state.customerOrderDraft.splice(Number(button.dataset.removeOrderLine), 1);
      renderOrders();
    });
  });

  refs.customerOrderBody.querySelectorAll("[data-order-qty]").forEach((button) => {
    button.addEventListener("click", () => changeCustomerOrderQuantity(Number(button.dataset.orderQty), Number(button.dataset.delta)));
  });

  const totalLines = state.customerOrderDraft.length;
  const totalUnits = state.customerOrderDraft.reduce((sum, entry) => sum + Number(entry.quantity), 0);
  const totalPrice = state.customerOrderDraft.reduce((sum, entry) => sum + (Number(entry.quantity) * Number(entry.unitPrice || 0)), 0);
  refs.customerOrderSummary.textContent = t("messages.customerOrderSummary", totalLines, numberFormat.format(totalUnits), currency.format(totalPrice));

  // KDV totals (net + %19 KDV + brüt)
  const VAT_RATE = 0.19;
  const net = totalPrice;
  const vat = +(net * VAT_RATE).toFixed(2);
  const gross = +(net + vat).toFixed(2);
  if (refs.customerCartTotals) refs.customerCartTotals.classList.remove("hidden");
  if (refs.cartTotalNet)   refs.cartTotalNet.textContent = currency.format(net);
  if (refs.cartTotalVat)   refs.cartTotalVat.textContent = currency.format(vat);
  if (refs.cartTotalGross) refs.cartTotalGross.textContent = currency.format(gross);
}

function openCustomerOrderReview() {
  if (!refs.customerOrderReviewModal) return;
  if (state.customerOrderDraft.length === 0) {
    window.alert(t("messages.addQuoteFirst") || langText("Önce sepete ürün ekleyin.", "Zuerst Artikel in den Warenkorb legen."));
    return;
  }
  const VAT_RATE = 0.19;
  const net = state.customerOrderDraft.reduce((s, e) => s + Number(e.quantity) * Number(e.unitPrice || 0), 0);
  const vat = +(net * VAT_RATE).toFixed(2);
  const gross = +(net + vat).toFixed(2);

  if (refs.orderReviewList) {
    refs.orderReviewList.innerHTML = state.customerOrderDraft.map((e) => `
      <div class="order-review-row">
        <div>
          <strong>${escapeHtml(e.itemName)}</strong>
          <span class="muted"> · ${numberFormat.format(e.quantity)} ${escapeHtml(e.unit || "")} × ${currency.format(e.unitPrice || 0)}</span>
        </div>
        <strong>${currency.format(Number(e.quantity) * Number(e.unitPrice || 0))}</strong>
      </div>
    `).join("");
  }
  if (refs.orderReviewNet)   refs.orderReviewNet.textContent = currency.format(net);
  if (refs.orderReviewVat)   refs.orderReviewVat.textContent = currency.format(vat);
  if (refs.orderReviewGross) refs.orderReviewGross.textContent = currency.format(gross);

  const notePayload = formToObject(refs.customerOrderForm);
  if (refs.orderReviewNote) {
    const parts = [];
    if (notePayload.date) parts.push(langText(`Tarih: ${notePayload.date}`, `Datum: ${notePayload.date}`));
    if (notePayload.note) parts.push(langText(`Not: ${notePayload.note}`, `Notiz: ${notePayload.note}`));
    refs.orderReviewNote.textContent = parts.join(" · ");
  }

  refs.customerOrderReviewModal.removeAttribute("hidden");
  document.documentElement.classList.add("auth-modal-open");
}

function closeCustomerOrderReview() {
  if (!refs.customerOrderReviewModal) return;
  refs.customerOrderReviewModal.setAttribute("hidden", "");
  document.documentElement.classList.remove("auth-modal-open");
}

async function handleCustomerOrderConfirm() {
  // Actual submission logic — reuses existing submit function
  closeCustomerOrderReview();
  await handleCustomerOrderSubmit();
}

function renderCustomerOrders() {
  if (!refs.customerOrdersList || !isCustomerUser()) {
    return;
  }

  refs.customerOrdersList.innerHTML = "";
  if (!state.orders || state.orders.length === 0) {
    refs.customerOrdersList.innerHTML = `<div class="empty-state">${t("messages.noCustomerOrders")}</div>`;
    return;
  }

  state.orders.forEach((order) => {
    const div = document.createElement("div");
    div.className = "feed-item";
    div.innerHTML = `
      <strong>${langText("Siparis", "Bestellung")} #${order.id}</strong>
      <span>${order.date} | ${langText("Durum", "Status")}: ${getOrderStatusLabel(order.status)}</span>
      <span>${order.items.map((item) => `${item.itemName} x ${numberFormat.format(item.quantity)}`).join(", ")}</span>
      <span>${order.note || "-"}</span>
    `;
    refs.customerOrdersList.append(div);
  });
}

function renderItemSelects() {
  if (!state.inventoryLoadedAll && !isCustomerUser()) {
    return;
  }

  const signature = buildItemSelectSignature();
  if (state.itemSelectSignature === signature) {
    populateMovementItemSelect();
    renderMovementItemSuggestions();
    return;
  }
  state.itemSelectSignature = signature;

  populateMovementItemSelect();
  renderMovementItemSuggestions();

  if (isAdminUser() && refs.barcodeItemSelect) {
    const previous = refs.barcodeItemSelect.value;
    const fragment = document.createDocumentFragment();
    refs.barcodeItemSelect.innerHTML = "";
    getMovementSelectableItems().forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = getMovementOptionLabel(item);
      fragment.append(option);
    });
    refs.barcodeItemSelect.append(fragment);
    if ([...refs.barcodeItemSelect.options].some((option) => option.value === previous)) {
      refs.barcodeItemSelect.value = previous;
    }
  }
}

function renderInventoryLoading(target) {
  const message = langText("Stok yukleniyor", "Bestand wird geladen");
  const spinnerHtml = `
    <div class="loading-box">
      <div class="loading-spinner" aria-hidden="true"></div>
      <div class="loading-text">
        <strong>${message}</strong>
        <span class="muted">${langText("Binlerce urunun listesi hazirlaniyor, lutfen bekleyin.", "Tausende Artikel werden geladen, bitte warten.")}</span>
      </div>
    </div>`;
  if (target === "items") {
    refs.itemsSummary.textContent = message + " · " + langText("lütfen bekleyin", "bitte warten");
    refs.stockedItemsSummary.textContent = "";
    refs.stockedItemsList.innerHTML = spinnerHtml;
    refs.itemsTableBody.innerHTML = `<tr><td colspan="10">${spinnerHtml}</td></tr>`;
    return;
  }
  if (target === "archive") {
    refs.archiveSummary.textContent = message;
    refs.archiveTableBody.innerHTML = `<tr><td colspan="8">${spinnerHtml}</td></tr>`;
    return;
  }
  if (target === "movements") {
    refs.movementsTableBody.innerHTML = `<tr><td colspan="7">${spinnerHtml}</td></tr>`;
  }
}

async function loadInventory(force = false, includeArchive = false) {
  if (isCustomerUser()) {
    return;
  }
  if (!force && state.inventoryLoadPromise) {
    await state.inventoryLoadPromise;
  }
  if (!force && state.inventoryLoadedAll && (!includeArchive || state.archiveLoaded)) {
    return;
  }

  const route = includeArchive ? "/api/inventory?includeArchive=1" : "/api/inventory";
  state.inventoryLoadPromise = request(route)
    .then((result) => {
      if (result.error) {
        throw new Error(result.error);
      }
      state.items = Array.isArray(result.items) ? result.items : [];
      if (includeArchive) {
        state.archivedItems = Array.isArray(result.archivedItems) ? result.archivedItems : [];
        state.archiveLoaded = true;
      } else if (!state.archiveLoaded) {
        state.archivedItems = [];
      }
      state.inventoryLoadedAll = true;
      invalidateInventoryUiCaches();
      renderFilters();
    })
    .catch((error) => {
      window.alert(error.message || langText("Urun listesi yuklenemedi.", "Artikelliste konnte nicht geladen werden."));
    })
    .finally(() => {
      state.inventoryLoadPromise = null;
    });

  await state.inventoryLoadPromise;
}

function buildItemSelectSignature() {
  return [
    state.uiLanguage,
    state.itemsVersion,
    isAdminUser() ? "admin" : "staff",
  ].join(":");
}

function updateBarcodePreview() {
  const itemId = refs.barcodeItemSelect.value;
  if (!itemId) {
    refs.barcodeImage.removeAttribute("src");
    return;
  }
  refs.barcodeImage.src = `/api/barcodes/${itemId}?t=${Date.now()}`;
}

function syncMovementPrice() {
  if (!canViewPurchasePrices()) {
    return;
  }
  const unitPriceField = refs.movementForm.elements.unitPrice;
  const itemId = Number(refs.movementForm.elements.itemId.value);
  const item = state.items.find((entry) => Number(entry.id) === itemId);
  if (!item) {
    if (unitPriceField?.dataset.autoFilled === "true") {
      unitPriceField.value = "";
      unitPriceField.dataset.autoItemId = "";
      unitPriceField.dataset.autoValue = "";
    }
    return;
  }

  const price = item.lastPurchasePrice || item.defaultPrice || "";
  const previousAutoItemId = Number(unitPriceField?.dataset.autoItemId || 0);
  const previousAutoValue = String(unitPriceField?.dataset.autoValue || "");
  const currentValue = String(unitPriceField?.value || "");
  const shouldApplyAutoPrice = !currentValue
    || unitPriceField?.dataset.autoFilled === "true"
    || previousAutoItemId !== itemId
    || currentValue === previousAutoValue;

  if (price && shouldApplyAutoPrice && unitPriceField) {
    unitPriceField.value = price;
    unitPriceField.dataset.autoFilled = "true";
    unitPriceField.dataset.autoItemId = String(itemId);
    unitPriceField.dataset.autoValue = String(price);
  }
}

function activateTab(tab) {
  const visibleButtons = [...document.querySelectorAll("[data-tab]")].filter(isTabButtonVisible);
  const requestedVisible = visibleButtons.some((button) => button.dataset.tab === tab);
  const nextTab = requestedVisible ? tab : (visibleButtons[0]?.dataset.tab || tab);
  state.activeTab = nextTab;
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", isTabButtonVisible(button) && button.dataset.tab === nextTab);
  });
  document.querySelectorAll(".tab-more").forEach((details) => {
    if (details.querySelector(`[data-tab="${nextTab}"]`)) {
      details.open = true;
    }
  });
  document.querySelectorAll("[data-tab-content]").forEach((panel) => {
    panel.classList.toggle("active", !panel.classList.contains("hidden") && panel.dataset.tabContent === nextTab);
  });
  renderTabData(nextTab);
}

function isTabButtonVisible(button) {
  return Boolean(button) && !button.classList.contains("hidden") && !button.closest(".hidden");
}

function renderTabData(tab) {
  if (tab === "iot") {
    renderOverviewPanels();
    return;
  }
  if (tab === "items") {
    if (!state.inventoryLoadedAll && !isCustomerUser()) {
      renderItems();
      loadInventory().then(() => {
        if (state.inventoryLoadedAll) {
          renderTabData("items");
        }
      });
      return;
    }
    renderItems();
    renderItemSelects();
    updateBarcodePreview();
    return;
  }
  if (tab === "archive") {
    if (!state.archiveLoaded && !isCustomerUser()) {
      renderArchive();
      loadInventory(false, true).then(() => {
        if (state.archiveLoaded) {
          renderTabData("archive");
        }
      });
      return;
    }
    renderArchive();
    return;
  }
  if (tab === "movements") {
    if (!state.inventoryLoadedAll && !isCustomerUser()) {
      renderMovements();
      loadInventory().then(() => {
        if (state.inventoryLoadedAll) {
          renderTabData("movements");
        }
      });
      return;
    }
    renderItemSelects();
    renderMovements();
    return;
  }
  if (tab === "expenses") {
    renderExpenses();
    return;
  }
  if (tab === "cashbook") {
    renderCashbook();
    return;
  }
  if (tab === "orders") {
    renderOrders();
    return;
  }
  if (tab === "projects") {
    renderProjects();
    return;
  }
  if (tab === "messages") {
    renderAdminMessages();
    return;
  }
  if (tab === "users") {
    renderUsers();
    return;
  }
  if (tab === "security") {
    renderSecurity();
    return;
  }
  if (tab === "tools") {
    return;
  }
  if (tab === "training") {
    loadAssistantTraining();
    renderRetrofitChecklist();
    return;
  }
  renderQuotes();
}

function handleFilterChange() {
  window.clearTimeout(filterDebounceTimer);
  filterDebounceTimer = window.setTimeout(() => {
    state.filters.search = refs.itemSearch.value.trim().toLowerCase();
    state.filters.brand = refs.brandFilter.value;
    state.filters.category = refs.categoryFilter.value;
    renderItems();
    renderSearchDropdown();
  }, SEARCH_DEBOUNCE_MS);
}

function handleQuoteFilterChange() {
  window.clearTimeout(quoteFilterDebounceTimer);
  quoteFilterDebounceTimer = window.setTimeout(() => {
    state.quoteFilters.search = refs.quoteItemSearch.value.trim().toLowerCase();
    state.quoteFilters.brand = refs.quoteBrandFilter.value;
    state.quoteFilters.category = refs.quoteCategoryFilter.value;
    renderQuotes();
  }, SEARCH_DEBOUNCE_MS);
}

function toggleAssistantPanel() {
  const isHidden = refs.assistantPanel.classList.contains("hidden");
  refs.assistantPanel.classList.toggle("hidden", !isHidden);
  refs.assistantToggle.setAttribute("aria-expanded", String(isHidden));
  if (isHidden) {
    refs.assistantInput.focus();
  }
}

function closeAssistantPanel() {
  refs.assistantPanel.classList.add("hidden");
  refs.assistantToggle.setAttribute("aria-expanded", "false");
}

function seedAssistantMessages() {
  state.assistantMessages = [
    {
      role: "assistant",
      text: getAssistantWelcomeMessage(),
    },
  ];
}

function renderAssistantStatus() {
  if (!refs.assistantStatus) {
    return;
  }

  if (state.assistantLanguage === "de") {
    refs.assistantStatus.textContent = state.assistantStatus?.mode === "local_drc_man"
      ? "DRC MAN ist lokal verbunden"
      : "DRC MAN Wissensbasis aktiv";
    return;
  }

  refs.assistantStatus.textContent = state.assistantStatus?.mode === "local_drc_man"
    ? "DRC MAN yerel ajan bagli"
    : "DRC MAN bilgi tabani aktif";
}

function renderAssistantMessages() {
  if (!refs.assistantMessages) {
    return;
  }

  refs.assistantMessages.innerHTML = "";
  state.assistantMessages.forEach((message) => {
    const article = document.createElement("article");
    article.className = `assistant-message assistant-${message.role}`;
    article.innerHTML = `
      <strong>${message.role === "assistant" ? assistantLabel("assistant") : assistantLabel("user")}</strong>
      <p>${escapeHtml(message.text)}</p>
    `;
    refs.assistantMessages.append(article);
  });
  refs.assistantMessages.scrollTop = refs.assistantMessages.scrollHeight;
}

function handleAssistantLanguageChange() {
  state.assistantLanguage = refs.assistantLanguage.value || "tr";
  if (state.assistantMessages.length <= 1) {
    seedAssistantMessages();
  }
  renderAssistantStatus();
  renderAssistantMessages();
}

async function handleAssistantSubmit(event) {
  event.preventDefault();
  const message = refs.assistantInput.value.trim();
  if (!message) {
    return;
  }

  state.assistantMessages.push({ role: "user", text: message });
  refs.assistantInput.value = "";
  renderAssistantMessages();

  const result = await request("/api/assistant/query", {
    method: "POST",
    body: JSON.stringify({
      message,
      language: state.assistantLanguage,
      history: state.assistantMessages.slice(-8),
    }),
  });

  state.assistantMessages.push({
    role: "assistant",
    text: result.error || result.answer || langText("Bu soru icin net bir sonuc bulamadim.", "Ich konnte fuer diese Frage kein klares Ergebnis finden."),
  });
  renderAssistantMessages();
}

function assistantLabel(role) {
  if (state.assistantLanguage === "de") {
    return role === "assistant" ? "DRC MAN" : "Sie";
  }
  return role === "assistant" ? "DRC MAN" : "Siz";
}

function getAssistantWelcomeMessage() {
  const hasLocalAgent = state.assistantStatus?.mode === "local_drc_man";
  if (state.assistantLanguage === "de") {
    return hasLocalAgent
      ? "DRC MAN ist lokal verbunden. Sie koennen jetzt detaillierte Fragen zu Material, Projekt, Hamburg-Bestand und Kaltetechnik stellen."
      : "DRC MAN Wissensbasis ist aktiv. Sie koennen nach Lagerbestand, Verkaufspreis, Kategorie, kritischen Artikeln oder Verkaufsablauf fragen.";
  }
  return hasLocalAgent
    ? "DRC MAN yerel ajan baglandi. Artik malzeme, proje, Hamburg stok ve soguk oda teknik sorularini daha detayli sorabilirsiniz."
    : "DRC MAN bilgi tabani aktif. Stok, satis fiyati, kategori, kritik urun ve satis akisi ile ilgili soru sorabilirsiniz.";
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getItemSearchIndex(item) {
  const source = [
    item.name,
    item.brand,
    item.category,
    item.barcode,
    item.notes,
  ].filter(Boolean).join(" ");
  const extras = [];
  const raw = [item.name, item.category, item.notes].filter(Boolean).join(" ");
  const refrigerantCodes = raw.match(/\br[\s-]?\d{2,4}[a-z]?\b/gi) || [];
  refrigerantCodes.forEach((code) => {
    const compact = code.replace(/[\s-]+/g, "").toLowerCase();
    extras.push(compact);
  });

  if (/r290/i.test(raw)) {
    extras.push("propan", "propane", "gaz", "gazi", "sogutucu gaz", "refrigerant gas");
  }

  if (/soğutucu akışkan|sogutucu akiskan|gaz|gas|refrigerant/i.test(raw)) {
    extras.push("gaz", "gazi", "gas", "refrigerant", "sogutucu akiskan");
  }

  return normalizeSearchText([source, ...extras].join(" "));
}

function getDisplayCategory(category) {
  if (state.uiLanguage !== "de") {
    return category || "-";
  }

  const normalized = normalizeSearchText(category);
  const categoryMap = {
    "sogutma yaglari": "Kuehloele",
    "kompresorler": "Verdichter",
    "kondenserler": "Verfluessiger",
    "vrf sistemleri": "VRF-Systeme",
    "vrf ic uniteleri": "VRF-Innengeraete",
    "kontrol panelleri": "Steuerungen",
    "fan motorlari": "Ventilatormotoren",
    "filtre drier": "Filtertrockner",
    "filtreler kurutucular": "Filter & Trockner",
    "servis valfi": "Serviceventile",
    "genlesme valfleri": "Expansionsventile",
    "izolasyon": "Isolierung",
    "montaj sarf": "Montagebedarf",
    "sogutucu akiskanlar": "Kaeltemittel",
    "sogutucu gaz": "Kaeltemittel",
    "dikey tip buzdolaplari": "Vertikale Kuehlschraenke",
    "termostat": "Thermostate",
    "sogutma malzemeleri": "Kuehltechnik-Zubehoer",
    "valfler genlesme valfleri": "Ventile & Expansionsventile",
    "drenaj pompasi": "Kondensatpumpen",
  };

  return categoryMap[normalized] || category || "-";
}

function getDisplayUnit(unit) {
  if (state.uiLanguage !== "de") {
    return unit || "";
  }

  const normalized = normalizeSearchText(unit);
  const unitMap = {
    "adet": "Stk.",
    "koli": "Karton",
    "top": "Rolle",
    "metre": "m",
    "mt": "m",
    "paket": "Paket",
    "set": "Set",
    "takim": "Set",
  };

  return unitMap[normalized] || unit || "";
}

function getPaymentTypeLabel(type) {
  switch (String(type || "").toLowerCase()) {
    case "cash":
      return langText("Nakit", "Bar");
    case "bank":
      return langText("Banka", "Bank");
    case "card":
      return langText("Kart", "Karte");
    default:
      return type || "-";
  }
}

function localizeItemDetail(detail) {
  let text = String(detail || "").trim();
  if (!text) {
    return "";
  }

  if (state.uiLanguage !== "de") {
    return text;
  }

  const replacements = [
    [/\b(\d+)\s*x\s*(\d+)\s*l\b/gi, "$1x$2 L"],
    [/\b(\d+)\s*l(?:t)?\s*bidon\b/gi, "$1 L Gebinde"],
    [/\b(\d+)\s*l(?:t)?\s*endustriyel bidon\b/gi, "$1 L Industriegebinde"],
    [/\b(\d+)\s*x\s*(\d+)\s*l\s*koli adet\b/gi, "$1x$2 L Karton"],
    [/\b(\d+)\s*x\s*(\d+)\s*l\s*koli\b/gi, "$1x$2 L Karton"],
    [/\b(\d+)\s*l(?:t)?\s*teneke\b/gi, "$1 L Kanister"],
    [/\b(\d+)\s*l(?:t)?\b/gi, "$1 L"],
    [/\bendustriyel yag bidonu\b/gi, "Industrieoel-Gebinde"],
    [/\bmotorsuz\b/gi, "Ohne Motor"],
    [/\bdikey tip\b/gi, "Vertikal"],
    [/\byatay tip\b/gi, "Horizontal"],
    [/\bizoleli bakir boru\b/gi, "Isoliertes Kupferrohr"],
    [/\bhazir kumanda panosu\b/gi, "Fertiger Schaltschrank"],
  ];

  replacements.forEach(([pattern, value]) => {
    text = text.replace(pattern, value);
  });

  return text;
}

function extractPackagingDetail(item) {
  const raw = [item?.name, item?.notes].filter(Boolean).join(" ");
  if (!raw) {
    return "";
  }

  const normalized = normalizeSearchText(raw);
  const packMatch = raw.match(/(\d+)\s*[x×]\s*(\d+)\s*l/iu);
  if (packMatch) {
    const left = Number(packMatch[1]);
    const right = Number(packMatch[2]);
    if (left > 0 && right > 0) {
      return state.uiLanguage === "de"
        ? `${left}x${right} L Karton`
        : `${left}x${right}L koli`;
    }
  }

  const literMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*l(?:t)?/iu);
  if (!literMatch) {
    return "";
  }

  const liters = literMatch[1].replace(".", ",");
  const literValue = Number(literMatch[1].replace(",", "."));
  const isIndustrial = /\bendustriyel\b/.test(normalized);
  const isDrum = /\bbidon\b/.test(normalized) || isIndustrial;
  const isTin = /\bteneke\b/.test(normalized) || (/\byag\b/.test(normalized) && literValue === 5);

  if (state.uiLanguage === "de") {
    if (isDrum) {
      return `${liters} L Industriegebinde`;
    }
    if (isTin) {
      return `${liters} L Kanister`;
    }
    return `${liters} L`;
  }

  if (isDrum) {
    return `${liters} Lt endustriyel bidon`;
  }
  if (isTin) {
    return `${liters} Lt teneke`;
  }
  return `${liters} Lt`;
}

function getPublicItemDetail(item) {
  const note = String(item?.notes || "").trim();
  const noteParts = note
    .split("|")
    .map(cleanPublicDetailPart)
    .filter(Boolean)
    .filter((part) => {
      const normalized = normalizeSearchText(part);
      return normalized
        && !normalized.startsWith("kaynak")
        && !normalized.startsWith("urun kodu")
        && !normalized.startsWith("daha once belirlenen fiyat")
        && !normalized.startsWith("daha once belirlenen")
        && !normalized.startsWith("ithalat klasoru gecmis kaydi")
        && !normalized.startsWith("tedarikci")
        && !normalized.startsWith("kaynak dosya")
        && !normalized.startsWith("eslesen aktif kart")
        && !normalized.startsWith("id")
        && !normalized.startsWith("kod")
        && !normalized.startsWith("ad")
        && !normalized.startsWith("arsiv")
        && !normalized.startsWith("fiyat kaynagi")
        && !normalized.startsWith("tahmini alis maliyeti");
    })
    .filter((part) => !/^\d+\s*[x×]\s*\d+\s*l\s*koli$/iu.test(part));

  const packagingDetail = extractPackagingDetail(item);
  const detailParts = packagingDetail ? [packagingDetail, ...noteParts] : noteParts;
  const uniqueDetails = [...new Set(detailParts.filter(Boolean))];
  return localizeItemDetail(uniqueDetails.join(" | "));
}

function cleanPublicDetailPart(part) {
  let text = String(part || "").trim();
  if (!text) {
    return "";
  }

  text = text.replace(/^(Detay|Detail)\s*:\s*/iu, "");
  text = text.replace(/^(Detay|Detail)\s*:\s*/iu, "");
  text = text.replace(/^(Model)\s*:\s*/iu, "");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function formatItemStock(stock, unit) {
  const displayUnit = getDisplayUnit(unit);
  return `${numberFormat.format(stock)} ${displayUnit}`.trim();
}

function itemMatchesSearch(item, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const haystack = getItemSearchIndex(item);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

function getFilteredItems(applySearch = true) {
  return state.items.filter((item) => {
    if (state.filters.brand !== "all" && item.brand !== state.filters.brand) {
      return false;
    }

    if (state.filters.category !== "all" && item.category !== state.filters.category) {
      return false;
    }

    if (!applySearch || !state.filters.search) {
      return true;
    }
    return itemMatchesSearch(item, state.filters.search);
  });
}

function uniqueValues(field) {
  const signature = buildFilterOptionsSignature();
  if (state.filterOptionsSignature !== signature) {
    state.filterOptionsSignature = signature;
    state.filterOptions = {
      brand: [...new Set(state.items.map((item) => item.brand).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, state.uiLanguage === "de" ? "de" : "tr")),
      category: [...new Set(state.items.map((item) => item.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, state.uiLanguage === "de" ? "de" : "tr")),
    };
  }
  return state.filterOptions[field] || [];
}

function buildFilterOptionsSignature() {
  return [
    state.uiLanguage,
    state.itemsVersion,
  ].join(":");
}

function populateSelect(select, values, placeholder, selectedValue) {
  const previous = selectedValue || "all";
  const signature = `${placeholder}|${previous}|${values.join("\u001f")}`;
  if (select.dataset.optionsSignature === signature) {
    return;
  }
  select.dataset.optionsSignature = signature;
  const fragment = document.createDocumentFragment();
  const defaultOption = document.createElement("option");
  defaultOption.value = "all";
  defaultOption.textContent = placeholder;
  fragment.append(defaultOption);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    fragment.append(option);
  });
  select.innerHTML = "";
  select.append(fragment);
  select.value = values.includes(previous) || previous === "all" ? previous : "all";
}

function renderItemSearchSuggestions() {
  if (!refs.itemSearchSuggestions) {
    return;
  }
  const signature = [
    state.uiLanguage,
    state.itemsVersion,
  ].join(":");
  if (state.itemSearchSuggestionSignature === signature) {
    return;
  }
  state.itemSearchSuggestionSignature = signature;

  const suggestions = new Set();
  state.items.forEach((item) => {
    [item.name, item.brand, item.barcode, item.category].filter(Boolean).forEach((value) => suggestions.add(value));
    const codes = String([item.name, item.notes].filter(Boolean).join(" ").match(/\br[\s-]?\d{2,4}[a-z]?\b/gi) || "")
      .split(",")
      .map((value) => value.replace(/[\s-]+/g, "").trim().toUpperCase())
      .filter(Boolean);
    codes.forEach((value) => suggestions.add(value));
  });

  refs.itemSearchSuggestions.innerHTML = "";
  const fragment = document.createDocumentFragment();
  [...suggestions]
    .sort((a, b) => a.localeCompare(b, state.uiLanguage === "de" ? "de" : "tr"))
    .slice(0, 250)
    .forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      fragment.append(option);
    });
  refs.itemSearchSuggestions.append(fragment);
}

function getMovementSelectableItems() {
  if (state.movementSelectableItems) {
    return state.movementSelectableItems;
  }

  state.movementSelectableItems = [...state.items].sort((left, right) => {
    const byName = String(left.name || "").localeCompare(String(right.name || ""), state.uiLanguage === "de" ? "de" : "tr");
    if (byName !== 0) {
      return byName;
    }
    return String(left.brand || "").localeCompare(String(right.brand || ""), state.uiLanguage === "de" ? "de" : "tr");
  });
  return state.movementSelectableItems;
}

function getMovementOptionLabel(item) {
  return `${item.name}${item.brand ? ` / ${item.brand}` : ""} (${formatItemStock(item.currentStock, item.unit)})`;
}

function getMovementSearchMatches(term) {
  const items = getMovementSelectableItems();
  const searchTerm = String(term || "").trim();
  if (!searchTerm) {
    return items;
  }
  return items.filter((item) => itemMatchesSearch(item, searchTerm));
}

function renderMovementItemSuggestions() {
  if (!refs.movementItemSuggestions) {
    return;
  }

  const suggestions = new Set();
  getMovementSelectableItems().forEach((item) => {
    [item.name, item.brand, item.barcode, item.category, item.productCode].filter(Boolean).forEach((value) => suggestions.add(value));
  });

  refs.movementItemSuggestions.innerHTML = "";
  const fragment = document.createDocumentFragment();
  [...suggestions]
    .sort((a, b) => a.localeCompare(b, state.uiLanguage === "de" ? "de" : "tr"))
    .slice(0, 250)
    .forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      fragment.append(option);
    });
  refs.movementItemSuggestions.append(fragment);
}

function populateMovementItemSelect(options = {}) {
  const select = refs.movementForm?.elements?.itemId;
  if (!select) {
    return;
  }

  const { preferFirstMatch = false } = options;
  const previous = String(select.value || "");
  const matches = getMovementSearchMatches(refs.movementItemSearch?.value || "");
  const fragment = document.createDocumentFragment();

  select.innerHTML = "";
  if (matches.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = langText("Eslesen urun bulunamadi", "Kein passender Artikel gefunden");
    select.append(option);
    select.value = "";
    syncMovementPrice();
    return;
  }

  matches.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = getMovementOptionLabel(item);
    fragment.append(option);
  });
  select.append(fragment);

  const nextValue = preferFirstMatch
    ? String(matches[0].id)
    : ([...select.options].some((option) => option.value === previous) ? previous : String(matches[0].id));
  select.value = nextValue;
  syncMovementPrice();
}

function renderMovementItemDropdown() {
  if (!refs.movementItemDropdown) {
    return;
  }

  const term = refs.movementItemSearch?.value.trim();
  if (!term) {
    refs.movementItemDropdown.classList.add("hidden");
    refs.movementItemDropdown.innerHTML = "";
    return;
  }

  const matches = getMovementSearchMatches(term).slice(0, 8);
  if (matches.length === 0) {
    refs.movementItemDropdown.classList.add("hidden");
    refs.movementItemDropdown.innerHTML = "";
    return;
  }

  refs.movementItemDropdown.innerHTML = matches.map((item) => `
    <button class="search-suggestion" type="button" data-movement-item-id="${escapeHtml(item.id)}" data-movement-item-name="${escapeHtml(item.name)}">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.brand || "-")} | ${escapeHtml(getDisplayCategory(item.category))} | ${escapeHtml(item.barcode || "-")}</span>
    </button>
  `).join("");
  refs.movementItemDropdown.classList.remove("hidden");
  refs.movementItemDropdown.querySelectorAll("[data-movement-item-id]").forEach((button) => {
    button.addEventListener("click", () => {
      refs.movementItemSearch.value = button.dataset.movementItemName || "";
      populateMovementItemSelect({ preferFirstMatch: true });
      refs.movementItemDropdown.classList.add("hidden");
    });
  });
}

function handleMovementItemSearchInput() {
  populateMovementItemSelect({ preferFirstMatch: true });
  renderMovementItemDropdown();
}

function handleMovementItemSelectionChange() {
  syncMovementPrice();
}

function hashText(value) {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 31) + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString(state.uiLanguage === "de" ? "de-DE" : "tr-TR");
}

function renderSearchDropdown() {
  if (!refs.itemSearchDropdown) {
    return;
  }

  const term = refs.itemSearch.value.trim();
  if (!term) {
    refs.itemSearchDropdown.classList.add("hidden");
    refs.itemSearchDropdown.innerHTML = "";
    return;
  }

  const matches = state.items
    .filter((item) => itemMatchesSearch(item, term))
    .slice(0, 10);

  if (matches.length === 0) {
    refs.itemSearchDropdown.classList.add("hidden");
    refs.itemSearchDropdown.innerHTML = "";
    return;
  }

  refs.itemSearchDropdown.innerHTML = matches.map((item) => `
    <button class="search-suggestion" type="button" data-search-value="${escapeHtml(item.name)}">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.brand || "-")} | ${escapeHtml(item.category)} | ${escapeHtml(item.barcode)}</span>
    </button>
  `).join("");
  refs.itemSearchDropdown.classList.remove("hidden");
  refs.itemSearchDropdown.querySelectorAll("[data-search-value]").forEach((button) => {
    button.addEventListener("click", () => {
      refs.itemSearch.value = button.dataset.searchValue;
      handleFilterChange();
      refs.itemSearchDropdown.classList.add("hidden");
    });
  });
}

function getFilteredQuoteItems() {
  return state.items.filter((item) => {
    if (state.quoteFilters.brand !== "all" && item.brand !== state.quoteFilters.brand) {
      return false;
    }
    if (state.quoteFilters.category !== "all" && item.category !== state.quoteFilters.category) {
      return false;
    }
    if (!state.quoteFilters.search) {
      return true;
    }
    return itemMatchesSearch(item, state.quoteFilters.search);
  });
}

function startItemEdit(itemId) {
  const item = state.items.find((entry) => Number(entry.id) === itemId);
  if (!item) {
    return;
  }
  refs.itemForm.elements.id.value = item.id;
  refs.itemForm.elements.name.value = item.name;
  refs.itemForm.elements.brand.value = item.brand || "";
  refs.itemForm.elements.category.value = item.category;
  refs.itemForm.elements.unit.value = item.unit;
  refs.itemForm.elements.minStock.value = item.minStock;
  refs.itemForm.elements.defaultPrice.value = item.defaultPrice || item.lastPurchasePrice || "";
  refs.itemForm.elements.listPrice.value = item.listPrice || "";
  refs.itemForm.elements.salePrice.value = item.salePrice || "";
  refs.itemForm.elements.barcode.value = item.barcode.startsWith("ITEM-") ? "" : item.barcode;
  refs.itemForm.elements.notes.value = item.notes || "";
  refs.itemSubmitButton.textContent = langText("Malzemeyi Guncelle", "Artikel aktualisieren");
  refs.itemCancelEdit.classList.remove("hidden");
  activateTab("items");
}

async function deleteItem(itemId) {
  const approved = window.confirm(t("messages.deleteItemConfirm"));
  if (!approved) {
    return;
  }
  const result = await request(`/api/items/${itemId}`, { method: "DELETE" });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
}

async function archiveItem(itemId) {
  const approved = window.confirm(t("messages.archiveItemConfirm"));
  if (!approved) {
    return;
  }
  const result = await request(`/api/items/${itemId}/archive`, { method: "POST" });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
}

async function restoreItem(itemId) {
  const result = await request(`/api/items/${itemId}/restore`, { method: "POST" });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
}

async function deleteExpense(expenseId) {
  const approved = window.confirm(t("messages.deleteExpenseConfirm"));
  if (!approved) {
    return;
  }

  const result = await request(`/api/expenses/${expenseId}`, { method: "DELETE" });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
}

async function deleteCashEntry(entryId) {
  const approved = window.confirm(t("messages.deleteCashConfirm"));
  if (!approved) {
    return;
  }

  const result = await request(`/api/cashbook/${entryId}`, { method: "DELETE" });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
}

async function releaseSecurityBlock(blockId) {
  const result = await request(`/api/security/blocks/${blockId}/release`, { method: "POST" });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
  activateTab("security");
}

async function handleAdminMessageSubmit(event) {
  event.preventDefault();
  if (refs.adminMessageError) {
    refs.adminMessageError.textContent = "";
  }
  if (refs.adminMessageSuccess) {
    refs.adminMessageSuccess.textContent = "";
  }

  const payload = formToObject(refs.adminMessageForm);
  const result = await request("/api/admin-messages", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (result.error) {
    if (refs.adminMessageError) {
      refs.adminMessageError.textContent = result.error;
    }
    return;
  }

  if (refs.adminMessageForm) {
    refs.adminMessageForm.reset();
  }
  if (refs.adminMessageSuccess) {
    refs.adminMessageSuccess.textContent = t("messages.adminMessageSent");
  }
  await refreshData();
  activateTab("messages");
}

async function updateAdminMessageStatus(messageId, status) {
  const result = await request(`/api/admin-messages/${messageId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
  activateTab("messages");
}

async function reverseMovement(movementId) {
  const approved = window.confirm(t("messages.reverseMovementConfirm"));
  if (!approved) {
    return;
  }

  const result = await request(`/api/movements/${movementId}/reverse`, { method: "POST" });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  await refreshData();
}

function addItemToQuote(itemId) {
  const item = state.items.find((entry) => Number(entry.id) === Number(itemId));
  if (!item) {
    return;
  }
  if (Number(item.currentStock) <= 0) {
    window.alert(langText("Bu urun stokta yok, sepete eklenemez.", "Dieser Artikel ist nicht auf Lager und kann nicht in den Warenkorb gelegt werden."));
    return;
  }

  const price = cartSalePrice(item, 1);
  if (price <= 0) {
    window.alert(langText("Bu urunun satis fiyati yok. Once admin fiyat girmeli.", "Dieser Artikel hat keinen Verkaufspreis. Bitte zuerst durch Admin eintragen."));
    return;
  }

  const existing = state.quoteDraft.find((entry) => Number(entry.itemId) === Number(item.id));
  if (existing) {
    if (Number(existing.quantity) >= Number(item.currentStock)) {
      window.alert(langText("Sepetteki miktar mevcut stogu gecemez.", "Die Warenkorbmenge darf den aktuellen Bestand nicht ueberschreiten."));
      return;
    }
    existing.quantity += 1;
    updateQuoteLinePrice(existing);
  } else {
    state.quoteDraft.push({
      itemId: Number(item.id),
      itemName: item.name,
      quantity: 1,
      unitPrice: price,
      listPrice: Number(item.listPrice || 0),
      salePrice: Number(item.salePrice || 0),
      unit: item.unit,
      maxQuantity: Number(item.currentStock),
    });
  }
  renderQuotes();
}

function addItemToCustomerOrder(itemId) {
  const item = state.items.find((entry) => Number(entry.id) === Number(itemId));
  if (!item) {
    return;
  }

  const price = cartSalePrice(item, 1);
  const existing = state.customerOrderDraft.find((entry) => Number(entry.itemId) === Number(item.id));
  if (existing) {
    existing.quantity = Math.min(Number(existing.quantity) + 1, Number(existing.maxQuantity));
    existing.unitPrice = cartSalePrice(item, existing.quantity);
  } else {
    state.customerOrderDraft.push({
      itemId: Number(item.id),
      itemName: item.name,
      quantity: 1,
      unitPrice: price,
      listPrice: Number(item.listPrice || 0),
      salePrice: Number(item.salePrice || 0),
      unit: item.unit,
      maxQuantity: Number(item.currentStock),
    });
  }

  renderOrders();
}

function changeQuoteQuantity(index, delta) {
  const line = state.quoteDraft[index];
  if (!line) {
    return;
  }

  const nextValue = Math.max(1, Number(line.quantity) + delta);
  line.quantity = Math.min(nextValue, Number(line.maxQuantity) || nextValue);
  updateQuoteLinePrice(line);
  renderQuotes();
}

function changeCustomerOrderQuantity(index, delta) {
  const line = state.customerOrderDraft[index];
  if (!line) {
    return;
  }

  const nextValue = Math.max(1, Number(line.quantity) + delta);
  line.quantity = Math.min(nextValue, Number(line.maxQuantity) || nextValue);
  const item = state.items.find((entry) => Number(entry.id) === Number(line.itemId));
  if (item) {
    line.unitPrice = cartSalePrice(item, line.quantity);
  }
  renderOrders();
}

async function handleCustomerOrderSubmit() {
  if (!isCustomerUser()) {
    return;
  }

  if (state.customerOrderDraft.length === 0) {
    window.alert(t("messages.addOrderFirst"));
    return;
  }

  const payload = formToObject(refs.customerOrderForm);
  payload.items = state.customerOrderDraft.map((entry) => ({
    itemId: entry.itemId,
    quantity: entry.quantity,
    unit: entry.unit,
  }));

  const result = await request("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    window.alert(result.error);
    return;
  }

  state.customerOrderDraft = [];
  refs.customerOrderForm.reset();
  refs.customerOrderForm.elements.date.value = today;
  await refreshData();
  window.alert(t("messages.orderSent"));
}

async function handleResendVerification() {
  if (!isCustomerUser()) {
    return;
  }

  refs.resendVerificationMessage.textContent = "";
  const result = await request("/api/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({}),
  });

  if (result.error) {
    refs.resendVerificationMessage.textContent = result.error;
    refs.resendVerificationMessage.classList.remove("success-text");
    refs.resendVerificationMessage.classList.add("error-text");
    return;
  }

  refs.resendVerificationMessage.classList.remove("error-text");
  refs.resendVerificationMessage.classList.add(result.mailSent ? "success-text" : "error-text");
  refs.resendVerificationMessage.textContent = result.message || t("messages.operationDone");
}

async function updateOrderStatus(orderId, status) {
  const result = await request(`/api/orders/${orderId}/status`, {
    method: "POST",
    body: JSON.stringify({ status, language: state.uiLanguage }),
  });

  if (result.error) {
    window.alert(result.error);
    return;
  }

  await refreshData();
}

function getOrderStatusLabel(status) {
  switch (status) {
    case "approved":
      return t("common.approved");
    case "preparing":
      return t("common.preparing");
    case "completed":
      return t("common.completed");
    case "cancelled":
      return t("common.cancelled");
    default:
      return t("common.pending");
  }
}

function openOrderWhatsapp(orderId) {
  const order = state.orders.find((entry) => Number(entry.id) === Number(orderId));
  if (!order?.phone) {
    window.alert(t("messages.noOrderPhone"));
    return;
  }

  const phone = formatWhatsappNumber(order.phone);
  if (!phone) {
    window.alert(t("messages.invalidWhatsappPhone"));
    return;
  }

  const statusText = getOrderStatusLabel(order.status);
  const itemSummary = order.items.map((item) => `${item.itemName} x ${numberFormat.format(item.quantity)}`).join(", ");
  const message = [
    `Merhaba ${order.customerName},`,
    langText(`DRC siparis bilgilendirmesi: #${order.id}`, `DRC Bestellinformation: #${order.id}`),
    `${langText("Durum", "Status")}: ${statusText}`,
    `${langText("Tarih", "Datum")}: ${order.date}`,
    itemSummary ? `${langText("Kalemler", "Positionen")}: ${itemSummary}` : "",
  ].filter(Boolean).join("\n");

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}

function formatWhatsappNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : "";
}

async function handleQuoteSave() {
  if (state.quoteDraft.length === 0) {
    window.alert(t("messages.addQuoteFirst"));
    return;
  }
  const payload = {
    ...formToObject(refs.quoteForm),
    items: state.quoteDraft,
  };
  const result = await request("/api/quotes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (result.error) {
    window.alert(result.error);
    return;
  }
  refs.quoteForm.reset();
  refs.quoteForm.elements.date.value = today;
  refs.quoteForm.elements.discount.value = 0;
  refs.quoteForm.elements.language.value = state.uiLanguage;
  refs.quoteForm.elements.isExport.value = "true";
  refs.quoteForm.elements.collectedAmount.value = 0;
  state.quoteDraft = [];
  await refreshData();
  window.alert(t("messages.quoteSaved", result.id || 0));
}

async function handleDirectSale() {
  if (state.quoteDraft.length === 0) {
    window.alert(t("messages.addCartFirst"));
    return;
  }

  const payload = {
    ...formToObject(refs.quoteForm),
    items: state.quoteDraft,
  };
  const result = await request("/api/sales/checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    window.alert(result.error);
    return;
  }

  refs.quoteForm.reset();
  refs.quoteForm.elements.date.value = today;
  refs.quoteForm.elements.discount.value = 0;
  refs.quoteForm.elements.language.value = state.uiLanguage;
  refs.quoteForm.elements.isExport.value = "true";
  refs.quoteForm.elements.collectedAmount.value = 0;
  refs.quoteForm.elements.paymentType.value = "cash";
  state.quoteDraft = [];
  await refreshData();
  window.alert(t("messages.directSaleDone", result.id || 0, currency.format(result.paid || 0), currency.format(result.remaining || 0), Number(result.paid || 0) > 0));
}

async function handleUnbilledSale() {
  if (state.quoteDraft.length === 0) {
    window.alert(t("messages.addCartFirst"));
    return;
  }

  const payload = {
    ...formToObject(refs.quoteForm),
    items: state.quoteDraft,
  };
  const result = await request("/api/sales/unbilled-checkout", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (result.error) {
    window.alert(result.error);
    return;
  }

  refs.quoteForm.reset();
  refs.quoteForm.elements.date.value = today;
  refs.quoteForm.elements.discount.value = 0;
  refs.quoteForm.elements.language.value = state.uiLanguage;
  refs.quoteForm.elements.isExport.value = "true";
  refs.quoteForm.elements.collectedAmount.value = 0;
  refs.quoteForm.elements.paymentType.value = "cash";
  state.quoteDraft = [];
  await refreshData();
  window.alert(t("messages.unbilledDone", currency.format(result.total || 0), currency.format(result.paid || 0), currency.format(result.remaining || 0), Number(result.paid || 0) > 0, result.cashEntryId || 0));
}

function buildQuotePdfUrl(quoteId, lang, mode = "download") {
  const resolvedLang = lang === "auto" ? state.uiLanguage : (lang === "de" ? "de" : "tr");
  const searchParams = new URLSearchParams({ lang: resolvedLang });
  if (mode === "preview") {
    searchParams.set("disposition", "inline");
  }
  return {
    resolvedLang,
    url: `/api/quotes/${quoteId}/pdf?${searchParams.toString()}`,
  };
}

function openQuotePdfPreview(quoteId, lang) {
  const { url } = buildQuotePdfUrl(quoteId, lang, "preview");
  const previewWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (!previewWindow) {
    window.alert(langText("PDF onizleme acilamadi. Tarayici acilir pencereyi engellemis olabilir.", "PDF-Vorschau konnte nicht geoeffnet werden. Der Browser blockiert moeglicherweise das Popup."));
  }
}

async function downloadQuotePdf(quoteId, lang) {
  const { resolvedLang, url } = buildQuotePdfUrl(quoteId, lang, "download");
  const response = await fetch(url, {
    credentials: "include",
  });

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || contentType.includes("application/json")) {
    let errorMessage = langText("PDF indirilemedi.", "PDF konnte nicht heruntergeladen werden.");
    try {
      const errorPayload = await response.json();
      errorMessage = errorPayload.error || errorMessage;
    } catch {
      // no-op
    }
    window.alert(errorMessage);
    return;
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  const disposition = response.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/i);
  anchor.download = filenameMatch?.[1] || `${resolvedLang === "tr" ? "teklif" : "angebot"}-${quoteId}.pdf`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

function formToObject(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "include",
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  return response.json();
}

/* ==============================================================
   Proje modülü (Faz 4) — UI render ve event handlers
   ============================================================== */
const PROJECT_STATUS_LABELS = {
  draft: ["Taslak", "Entwurf"],
  calculating: ["Hesaplanıyor", "Wird berechnet"],
  priced: ["Fiyatlandı", "Preisliste"],
  quoted: ["Teklif verildi", "Angebot erstellt"],
  ordered: ["Sipariş edildi", "Bestellt"],
  done: ["Tamamlandı", "Abgeschlossen"],
  cancelled: ["İptal", "Abgebrochen"],
};
const PROJECT_TYPE_LABELS = {
  cold_room: ["Soğuk Oda", "Kühlraum"],
  freezer_room: ["Donuk Oda", "Tiefkühlraum"],
  panel: ["Panel", "Panel"],
  custom: ["Özel", "Individuell"],
};

function projectStatusLabel(status) {
  const pair = PROJECT_STATUS_LABELS[status];
  return pair ? langText(pair[0], pair[1]) : status;
}
function projectTypeLabel(type) {
  const pair = PROJECT_TYPE_LABELS[type];
  return pair ? langText(pair[0], pair[1]) : (type || "");
}

function renderProjects() {
  if (!refs.projectsList) return;
  const filters = state.projectsFilters;
  const term = (filters.search || "").toLowerCase().trim();
  let projects = (state.projects || []).filter(p => {
    if (filters.status !== "all" && p.status !== filters.status) return false;
    if (term) {
      const txt = `${p.title || ""} ${p.customerName || ""} ${p.ownerName || ""}`.toLowerCase();
      if (!txt.includes(term)) return false;
    }
    return true;
  });

  refs.projectsListSummary.textContent = langText(
    `${projects.length} proje`,
    `${projects.length} Projekte`
  );

  refs.projectsList.innerHTML = "";
  if (projects.length === 0) {
    refs.projectsList.innerHTML = `<div class="empty-state">${langText("Henüz proje yok.", "Noch keine Projekte.")}</div>`;
    return;
  }

  projects.forEach((p) => {
    const card = document.createElement("article");
    card.className = "project-card";
    card.dataset.projectId = p.id;
    const total = Number(p.totalValue || 0);
    card.innerHTML = `
      <div class="project-card-head">
        <strong>${escapeHtml(p.title || "—")}</strong>
        <span class="status-pill status-${p.status || "draft"}">${escapeHtml(projectStatusLabel(p.status))}</span>
      </div>
      <div class="project-card-meta">
        <span>${langText("Müşteri", "Kunde")}: <strong>${escapeHtml(p.customerName || "—")}</strong></span>
        <span>${langText("Tip", "Typ")}: <strong>${escapeHtml(projectTypeLabel(p.projectType))}</strong></span>
      </div>
      <div class="project-card-meta">
        <span>${p.itemCount || 0} ${langText("kalem", "Position")}</span>
        ${p.quoteId ? `<span class="muted">• ${langText("Teklif", "Angebot")} #${p.quoteId}</span>` : ""}
        ${p.orderId ? `<span class="muted">• ${langText("Sipariş", "Bestellung")} #${p.orderId}</span>` : ""}
      </div>
      <div class="project-card-footer">
        <span class="muted">${p.updatedAt ? new Date(p.updatedAt).toLocaleDateString(state.uiLanguage) : ""}</span>
        <span class="project-card-total">${total > 0 ? currency.format(total) : ""}</span>
      </div>
    `;
    card.addEventListener("click", () => openProjectDetail(Number(p.id)));
    refs.projectsList.append(card);
  });
}

function openProjectForm(existing) {
  if (!refs.projectFormModal || !refs.projectForm) return;
  refs.projectForm.reset();
  refs.projectForm.elements.id.value = existing ? existing.id : "";
  if (existing) {
    refs.projectForm.elements.title.value = existing.title || "";
    refs.projectForm.elements.projectType.value = existing.projectType || existing.project_type || "cold_room";
    refs.projectForm.elements.status.value = existing.status || "draft";
    refs.projectForm.elements.note.value = existing.note || "";
    if (refs.projectCustomerNameInput) {
      refs.projectCustomerNameInput.value = existing.customerName || existing.customer_name || "";
    }
    if (refs.projectCustomerUserIdInput) {
      refs.projectCustomerUserIdInput.value = existing.customerUserId || existing.customer_user_id || "";
    }
    refs.projectFormTitle.textContent = langText("Proje Düzenle", "Projekt bearbeiten");
  } else {
    refs.projectFormTitle.textContent = langText("Yeni Proje", "Neues Projekt");
    refs.projectForm.elements.projectType.value = "cold_room";
    refs.projectForm.elements.status.value = "draft";
  }
  // Populate customer datalist
  if (refs.projectCustomerDatalist) {
    refs.projectCustomerDatalist.innerHTML = (state.customers || []).map(c =>
      `<option value="${escapeHtml(c.name || c.username)}" data-customer-id="${c.id}"></option>`
    ).join("");
  }
  refs.projectFormModal.removeAttribute("hidden");
  document.documentElement.classList.add("auth-modal-open");
}

function closeProjectForm() {
  refs.projectFormModal?.setAttribute("hidden", "");
  document.documentElement.classList.remove("auth-modal-open");
}

async function handleProjectFormSubmit() {
  const form = refs.projectForm;
  if (!form) return;
  const data = formToObject(form);
  const editId = Number(data.id || 0);
  const payload = {
    title: data.title,
    projectType: data.projectType,
    status: data.status,
    note: data.note,
    customerUserId: data.customerUserId || null,
  };
  if (!payload.title || !payload.title.trim()) {
    window.alert(langText("Proje başlığı gerekli.", "Projekttitel ist erforderlich."));
    return;
  }
  const url = editId ? `/api/projects/${editId}` : "/api/projects";
  const method = editId ? "PUT" : "POST";
  const res = await request(url, { method, body: JSON.stringify(payload) });
  if (res.error) {
    window.alert(res.error);
    return;
  }
  closeProjectForm();
  await refreshData();
  if (!editId && res.id) {
    openProjectDetail(Number(res.id));
  } else if (editId) {
    openProjectDetail(editId);
  }
}

async function openProjectDetail(projectId) {
  const res = await request(`/api/projects/${projectId}`);
  if (res.error) {
    window.alert(res.error);
    return;
  }
  state.activeProject = { project: res.project, items: res.items || [] };
  renderProjectDetail();
  refs.projectDetailModal?.removeAttribute("hidden");
  document.documentElement.classList.add("auth-modal-open");
}

function closeProjectDetail() {
  refs.projectDetailModal?.setAttribute("hidden", "");
  document.documentElement.classList.remove("auth-modal-open");
  state.activeProject = null;
}

function renderProjectDetail() {
  if (!state.activeProject) return;
  const { project, items } = state.activeProject;
  refs.projectDetailTitle.textContent = project.title || "";
  refs.projectDetailStatus.className = `status-pill status-${project.status || "draft"}`;
  refs.projectDetailStatus.textContent = projectStatusLabel(project.status);
  refs.projectDetailCustomer.textContent = project.customer_name
    ? `${langText("Müşteri", "Kunde")}: ${project.customer_name}`
    : langText("Müşteri atanmamış", "Kein Kunde zugeordnet");
  refs.projectDetailItemCount.textContent = items.length;
  refs.projectDetailType.textContent = projectTypeLabel(project.project_type);

  const total = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_price || 0), 0);
  refs.projectDetailTotal.textContent = currency.format(total);

  // Items
  refs.projectItemsList.innerHTML = items.length === 0
    ? `<div class="empty-state">${langText("Bu projede henüz kalem yok.", "Noch keine Positionen.")}</div>`
    : items.map(it => {
        const lineTotal = Number(it.quantity) * Number(it.unit_price || 0);
        const canEdit = isAdminUser() || isStaffUser() || (isCustomerUser() && Number(project.customer_user_id) === Number(state.user?.id));
        return `
          <div class="project-item-row">
            <div>
              <strong>${escapeHtml(it.item_name || "")}</strong>
              ${it.brand ? `<span class="muted"> · ${escapeHtml(it.brand)}</span>` : ""}
            </div>
            <span class="muted">${numberFormat.format(it.quantity)} ${escapeHtml(it.unit || "")}</span>
            <span>${currency.format(it.unit_price || 0)}</span>
            <div style="display:flex;gap:6px;align-items:center;">
              <strong>${currency.format(lineTotal)}</strong>
              ${canEdit ? `<button class="mini-button danger-button" type="button" data-del-project-item="${it.id}">×</button>` : ""}
            </div>
          </div>`;
      }).join("");

  refs.projectItemsList.querySelectorAll("[data-del-project-item]").forEach(btn => {
    btn.addEventListener("click", () => handleProjectItemDelete(Number(btn.dataset.delProjectItem)));
  });

  // Note
  refs.projectDetailNote.textContent = project.note || langText("(boş)", "(leer)");

  // Item search datalist (stock only)
  if (refs.projectItemSuggestions) {
    refs.projectItemSuggestions.innerHTML = (state.items || [])
      .filter(i => Number(i.currentStock) > 0)
      .slice(0, 250)
      .map(i => `<option value="${escapeHtml(i.name)}" data-item-id="${i.id}" data-price="${i.salePrice || i.defaultPrice || 0}" data-unit="${escapeHtml(i.unit || "adet")}"></option>`)
      .join("");
  }

  // Button visibility
  if (refs.projectConvertQuoteButton) {
    refs.projectConvertQuoteButton.disabled = !!project.quote_id || items.length === 0;
    refs.projectConvertQuoteButton.textContent = project.quote_id
      ? langText(`Teklif #${project.quote_id}`, `Angebot #${project.quote_id}`)
      : langText("→ Teklife Çevir", "→ Zum Angebot");
  }
}

async function handleProjectItemDelete(itemId) {
  if (!state.activeProject) return;
  const projectId = state.activeProject.project.id;
  if (!window.confirm(langText("Kalemi silmek istediğinize emin misiniz?", "Position wirklich löschen?"))) return;
  const res = await request(`/api/projects/${projectId}/items/${itemId}`, { method: "DELETE" });
  if (res.error) { window.alert(res.error); return; }
  await openProjectDetail(projectId);
  await refreshData();
}

async function handleProjectAddItem() {
  if (!state.activeProject || !refs.projectAddItemForm) return;
  const projectId = state.activeProject.project.id;
  const form = refs.projectAddItemForm;
  const data = formToObject(form);
  const payload = {
    itemId: data.itemId ? Number(data.itemId) : null,
    itemName: data.itemName || null,
    quantity: Number(data.quantity || 0),
    unit: data.unit || "adet",
    unitPrice: Number(data.unitPrice || 0),
  };
  if (!payload.itemId && !payload.itemName) {
    window.alert(langText("Stoktan ürün seçin veya manuel kalem adı yazın.", "Artikel auswählen oder Positionsname eingeben."));
    return;
  }
  if (payload.quantity <= 0) {
    window.alert(langText("Miktar sıfırdan büyük olmalı.", "Menge muss größer als null sein."));
    return;
  }
  const res = await request(`/api/projects/${projectId}/items`, { method: "POST", body: JSON.stringify(payload) });
  if (res.error) { window.alert(res.error); return; }
  form.reset();
  form.elements.quantity.value = 1;
  form.elements.unit.value = "adet";
  form.elements.unitPrice.value = 0;
  if (refs.projectItemIdInput) refs.projectItemIdInput.value = "";
  await openProjectDetail(projectId);
  await refreshData();
}

async function handleProjectDelete() {
  if (!state.activeProject) return;
  const project = state.activeProject.project;
  if (!window.confirm(langText(`"${project.title}" projesini silmek istediğinize emin misiniz?`, `Projekt "${project.title}" wirklich löschen?`))) return;
  const res = await request(`/api/projects/${project.id}`, { method: "DELETE" });
  if (res.error) { window.alert(res.error); return; }
  closeProjectDetail();
  await refreshData();
}

async function handleProjectConvertToQuote() {
  if (!state.activeProject) return;
  const project = state.activeProject.project;
  if (!window.confirm(langText(`Bu projeyi teklife çevirmek istediğinize emin misiniz? (Teklif #${project.id ? "yeni" : ""})`, "Projekt in Angebot umwandeln?"))) return;
  const res = await request(`/api/projects/${project.id}/convert-to-quote`, {
    method: "POST",
    body: JSON.stringify({ language: state.uiLanguage, isExport: true, discount: 0 }),
  });
  if (res.error) { window.alert(res.error); return; }
  window.alert(langText(`Teklif oluşturuldu: #${res.quoteId}. Son Teklifler ekranında görebilirsiniz.`, `Angebot erstellt: #${res.quoteId}.`));
  await refreshData();
  await openProjectDetail(project.id);
}

function handleProjectCustomerInput() {
  if (!refs.projectCustomerNameInput || !refs.projectCustomerUserIdInput) return;
  const value = (refs.projectCustomerNameInput.value || "").trim();
  let customerId = "";
  if (value) {
    const match = (state.customers || []).find(c => (c.name || c.username || "").toLowerCase() === value.toLowerCase());
    if (match) customerId = String(match.id);
  }
  refs.projectCustomerUserIdInput.value = customerId;
}

function handleProjectItemSearchInput() {
  if (!refs.projectItemSearch || !refs.projectItemIdInput || !refs.projectAddItemForm) return;
  const value = (refs.projectItemSearch.value || "").trim();
  let itemId = "";
  let unit = "adet";
  let price = 0;
  if (value && refs.projectItemSuggestions) {
    const opt = Array.from(refs.projectItemSuggestions.options).find(o => o.value === value);
    if (opt) {
      itemId = opt.dataset.itemId || "";
      unit = opt.dataset.unit || "adet";
      price = Number(opt.dataset.price || 0);
    }
  }
  refs.projectItemIdInput.value = itemId;
  if (itemId) {
    refs.projectAddItemForm.elements.unit.value = unit;
    if (Number(refs.projectAddItemForm.elements.unitPrice.value) === 0) {
      refs.projectAddItemForm.elements.unitPrice.value = price;
    }
    refs.projectAddItemForm.elements.itemName.value = "";
  }
}

function bindProjectsEvents() {
  if (refs.newProjectButton?._bound) return;
  if (refs.newProjectButton) {
    refs.newProjectButton.addEventListener("click", () => openProjectForm(null));
    refs.newProjectButton._bound = true;
  }
  refs.projectFormModal?.querySelectorAll("[data-project-form-close]").forEach(el => {
    el.addEventListener("click", closeProjectForm);
  });
  refs.projectDetailModal?.querySelectorAll("[data-project-detail-close]").forEach(el => {
    el.addEventListener("click", closeProjectDetail);
  });
  refs.projectFormSubmitButton?.addEventListener("click", handleProjectFormSubmit);
  refs.projectAddItemButton?.addEventListener("click", handleProjectAddItem);
  refs.projectDeleteButton?.addEventListener("click", handleProjectDelete);
  refs.projectConvertQuoteButton?.addEventListener("click", handleProjectConvertToQuote);
  refs.projectEditButton?.addEventListener("click", () => {
    if (!state.activeProject) return;
    closeProjectDetail();
    openProjectForm(state.activeProject.project);
  });

  refs.projectSearch?.addEventListener("input", (e) => {
    state.projectsFilters.search = e.target.value;
    renderProjects();
  });
  refs.projectStatusFilter?.addEventListener("change", (e) => {
    state.projectsFilters.status = e.target.value;
    renderProjects();
  });
  refs.projectCustomerNameInput?.addEventListener("input", handleProjectCustomerInput);
  refs.projectItemSearch?.addEventListener("input", handleProjectItemSearchInput);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (refs.projectFormModal && !refs.projectFormModal.hasAttribute("hidden")) closeProjectForm();
      if (refs.projectDetailModal && !refs.projectDetailModal.hasAttribute("hidden")) closeProjectDetail();
    }
  });
}

async function handleAuthUrlActions() {
  const params = new URLSearchParams(window.location.search);
  const verifyToken = params.get("verifyEmailToken");
  const resetToken = params.get("resetToken");

  if (verifyToken) {
    const result = await request("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: verifyToken }),
    });

    if (result.error) {
      refs.loginError.textContent = result.error;
    } else {
      refs.customerRegisterSuccess.textContent = result.message || langText("E-posta adresiniz dogrulandi.", "Ihre E-Mail-Adresse wurde bestaetigt.");
      state.user = result.user || null;
      if (state.user) {
        await refreshData();
      }
    }

    clearAuthQueryParams(["verifyEmailToken"]);
  }

  if (resetToken && refs.resetPasswordForm) {
    refs.resetPasswordPanel?.classList.remove("hidden");
    refs.resetPasswordForm.elements.token.value = resetToken;
    openAuthModal("reset");
    clearAuthQueryParams(["resetToken"]);
  } else {
    refs.resetPasswordPanel?.classList.add("hidden");
  }
}

function clearAuthQueryParams(keys, replace = true) {
  const url = new URL(window.location.href);
  keys.forEach((key) => url.searchParams.delete(key));
  const next = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""}${url.hash}`;
  if (replace) {
    window.history.replaceState({}, "", next);
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
