const fs = require("fs");
const path = require("path");

const TOPIC_PREFIX = "DRC MAN Almanca satis konusmalari";
const EXPORT_DIR = path.join(process.cwd(), ".codex_tmp", "drc_man_german_sales_dialogues");
const PREVIEW_MD = path.join(EXPORT_DIR, "preview.md");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[ç]/g, "c")
    .replace(/[ğ]/g, "g")
    .replace(/[ıİ]/g, "i")
    .replace(/[ö]/g, "o")
    .replace(/[ş]/g, "s")
    .replace(/[ü]/g, "u")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeDialogue(title, lines) {
  return [title, ...lines].map((line) => cleanText(line)).filter(Boolean).join(" ");
}

function entry({
  module,
  keywords,
  trQuestion,
  deQuestion,
  trTitle,
  deTitle,
  trLines,
  deLines,
  suggestions = [],
}) {
  return {
    topic: `${TOPIC_PREFIX} - ${module}`,
    audience: "all",
    keywords: [
      ...keywords,
      trQuestion,
      deQuestion,
      trTitle,
      deTitle,
      module,
      TOPIC_PREFIX,
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean)
      .filter((value, index, items) => items.indexOf(value) === index)
      .join(" "),
    trQuestion,
    deQuestion,
    trAnswer: makeDialogue(trTitle, trLines),
    deAnswer: makeDialogue(deTitle, deLines),
    suggestions,
  };
}

function buildEntries() {
  return [
    entry({
      module: "karsilama",
      keywords: ["greeting", "customer welcome", "kundengespraech", "begruessung"],
      trQuestion: "Almanca musteriyi profesyonel nasil karsilarim?",
      deQuestion: "Wie begruesse ich einen Kunden auf Deutsch professionell?",
      trTitle: "Almanca karsilama role-play:",
      deTitle: "Deutsches Begruessungs-Rollenspiel:",
      trLines: [
        "Musteri: Merhaba, soguk oda urunleri icin bakiyorum.",
        "Satis: Hos geldiniz. Hangi urun grubu ilgilendiriyor: soguk oda, kondenser, evaporator, kontrol veya kapi?",
        "Satis: Isterseniz stok, fiyat ve uygun alternatifleri birlikte hizlica cikarayim.",
      ],
      deLines: [
        "Kunde: Guten Tag, ich schaue nach Produkten fuer Kaeltetechnik.",
        "Vertrieb: Herzlich willkommen. Welche Produktgruppe interessiert Sie: Kuehlraum, Verfluessiger, Verdampfer, Regelung oder Tuer?",
        "Vertrieb: Wenn Sie moechten, pruefe ich sofort Bestand, Preis und passende Alternativen fuer Sie.",
      ],
      suggestions: ["almanca fiyat konusmasi", "almanca stok sorma", "almanca teklif isteme"],
    }),
    entry({
      module: "stok sorgusu",
      keywords: ["stock", "bestand", "available", "lager"],
      trQuestion: "Almanca stok var mi sorusuna nasil cevap verilir?",
      deQuestion: "Wie antwortet man auf Deutsch auf die Frage nach Bestand?",
      trTitle: "Almanca stok role-play:",
      deTitle: "Deutsches Bestands-Rollenspiel:",
      trLines: [
        "Musteri: Bu urun stokta var mi?",
        "Satis: Evet, su an depoda mevcut. Dilerseniz adet teyidini ve sevke hazir durumunu da netlestireyim.",
        "Satis: Eger adet yuksekse size parca parcadan degil, toplu teslim plani da sunabilirim.",
      ],
      deLines: [
        "Kunde: Ist dieser Artikel auf Lager?",
        "Vertrieb: Ja, der Artikel ist aktuell im Lager verfuegbar. Ich kann Ihnen gerne sofort die genaue Menge und den Versandstatus bestaetigen.",
        "Vertrieb: Bei groesseren Mengen kann ich Ihnen auf Wunsch auch einen abgestimmten Lieferplan anbieten.",
      ],
      suggestions: ["almanca teslimat suresi", "almanca fiyat konusmasi", "almanca alternatif urun"],
    }),
    entry({
      module: "fiyat net liste",
      keywords: ["price", "net", "list price", "preis"],
      trQuestion: "Almanca net fiyat ve liste fiyati nasil anlatilir?",
      deQuestion: "Wie erklaert man auf Deutsch Netto- und Listenpreis?",
      trTitle: "Almanca fiyat role-play:",
      deTitle: "Deutsches Preis-Rollenspiel:",
      trLines: [
        "Musteri: Fiyat nedir?",
        "Satis: Size net musteri fiyatini ve tekil alim icin liste fiyatini ayri ayri sunabilirim.",
        "Satis: Adet, stok ve sevk planina gore size en dogru fiyat yapisini netlestirelim.",
      ],
      deLines: [
        "Kunde: Wie ist der Preis?",
        "Vertrieb: Ich kann Ihnen den Netto-Kundenpreis und den Listenpreis fuer Einzelabnahme getrennt nennen.",
        "Vertrieb: Je nach Menge, Lagerbestand und Lieferplanung stimmen wir fuer Sie die passende Preisstruktur ab.",
      ],
      suggestions: ["almanca itiraz yonetimi", "almanca siparis alma", "almanca stok sorgusu"],
    }),
    entry({
      module: "teklif isteme",
      keywords: ["offer", "quote", "angebot", "pdf"],
      trQuestion: "Almanca teklif isteyen musteriyi nasil yonlendiririm?",
      deQuestion: "Wie fuehrt man einen Kunden auf Deutsch zur Angebotsanfrage?",
      trTitle: "Almanca teklif role-play:",
      deTitle: "Deutsches Angebots-Rollenspiel:",
      trLines: [
        "Musteri: Bana teklif hazirlar misiniz?",
        "Satis: Elbette. Urun kodu, adet ve teslimat lokasyonunu paylasirsaniz teklifinizi bugun hazirlayabilirim.",
        "Satis: Isterseniz PDF teklif ve siparis ozeti ayni akista size gonderilebilir.",
      ],
      deLines: [
        "Kunde: Koennen Sie mir ein Angebot erstellen?",
        "Vertrieb: Sehr gern. Wenn Sie mir Artikel, Menge und Lieferort nennen, kann ich Ihr Angebot noch heute vorbereiten.",
        "Vertrieb: Auf Wunsch erhalten Sie das PDF-Angebot und eine kurze Bestelluebersicht direkt im gleichen Ablauf.",
      ],
      suggestions: ["almanca siparis alma", "almanca teslimat suresi", "almanca teknik aciklama"],
    }),
    entry({
      module: "alternatif urun",
      keywords: ["alternative", "substitute", "muadil", "ersatz"],
      trQuestion: "Stokta olmayan urune Almanca alternatif nasil sunulur?",
      deQuestion: "Wie bietet man auf Deutsch eine Alternative an, wenn ein Artikel fehlt?",
      trTitle: "Almanca alternatif role-play:",
      deTitle: "Deutsches Alternativprodukt-Rollenspiel:",
      trLines: [
        "Musteri: Bu model yoksa ne onerirsiniz?",
        "Satis: Ayni uygulamaya uygun iki alternatif cikarabilirim. Teknik uyum, fiyat ve teslim avantajini birlikte anlatayim.",
        "Satis: Dilerseniz muadil marka ile orijinal marka arasindaki farki da kisa ve net aciklarim.",
      ],
      deLines: [
        "Kunde: Was empfehlen Sie, wenn dieses Modell nicht verfuegbar ist?",
        "Vertrieb: Ich kann Ihnen zwei technisch passende Alternativen anbieten und dabei Preis sowie Lieferzeit direkt miterklaeren.",
        "Vertrieb: Wenn Sie moechten, erklaere ich Ihnen auch kurz den Unterschied zwischen Originalmarke und passender Alternative.",
      ],
      suggestions: ["almanca teknik aciklama", "almanca fiyat konusmasi", "almanca teslimat suresi"],
    }),
    entry({
      module: "teslimat suresi",
      keywords: ["delivery", "lieferzeit", "shipment", "dispatch"],
      trQuestion: "Almanca teslimat suresini nasil anlatayim?",
      deQuestion: "Wie kommuniziert man die Lieferzeit auf Deutsch sauber?",
      trTitle: "Almanca teslimat role-play:",
      deTitle: "Deutsches Lieferzeit-Rollenspiel:",
      trLines: [
        "Musteri: Ne zaman teslim edilir?",
        "Satis: Stoktan cikacak urunlerde cikis tarihini net teyit ederim; siparis urunlerinde ise tahmini termin ve guncelleme plani veririm.",
        "Satis: Musteriye belirsiz soz vermek yerine kontrollu termin sunmak daha profesyoneldir.",
      ],
      deLines: [
        "Kunde: Wann kann geliefert werden?",
        "Vertrieb: Bei Lagerware bestaetige ich Ihnen den konkreten Versandtermin. Bei Bestellware nenne ich Ihnen einen realistischen Termin mit klarer Rueckmeldung.",
        "Vertrieb: Professioneller ist eine belastbare Aussage statt eines unsicheren Versprechens.",
      ],
      suggestions: ["almanca siparis alma", "almanca kapora", "almanca stok sorgusu"],
    }),
    entry({
      module: "siparis alma",
      keywords: ["order", "bestellung", "purchase", "auftrag"],
      trQuestion: "Almanca siparis nasil kapatilir?",
      deQuestion: "Wie schliesst man eine Bestellung auf Deutsch sauber ab?",
      trTitle: "Almanca siparis role-play:",
      deTitle: "Deutsches Bestell-Rollenspiel:",
      trLines: [
        "Musteri: Tamam, siparis verelim.",
        "Satis: Memnuniyetle. Siparisi acmam icin firma adi, teslimat adresi ve istenen adetleri teyit edelim.",
        "Satis: Sonrasinda size kisa bir siparis ozeti ve durum takibi sunarim.",
      ],
      deLines: [
        "Kunde: Gut, dann bestellen wir.",
        "Vertrieb: Sehr gern. Damit ich die Bestellung anlege, bestaetigen wir bitte Firmenname, Lieferadresse und die benoetigten Mengen.",
        "Vertrieb: Danach erhalten Sie von mir eine kurze Bestelluebersicht und eine klare Statusrueckmeldung.",
      ],
      suggestions: ["almanca kapora", "almanca teslimat suresi", "almanca teklif isteme"],
    }),
    entry({
      module: "kapora on odeme",
      keywords: ["deposit", "advance payment", "kapora", "anzahlung"],
      trQuestion: "Almanca kapora veya on odeme nasil istenir?",
      deQuestion: "Wie bittet man auf Deutsch um Anzahlung oder Vorkasse?",
      trTitle: "Almanca kapora role-play:",
      deTitle: "Deutsches Anzahlungs-Rollenspiel:",
      trLines: [
        "Musteri: Siparis icin ne gerekiyor?",
        "Satis: Siparisin devreye alinmasi icin gerekli ise on odeme bilgisini acik ve kibar bir dille iletirim.",
        "Satis: Talebi sebebiyle anlatmak gerekir: rezervasyon, tedarik ve termin sabitlemesi.",
      ],
      deLines: [
        "Kunde: Was wird fuer die Bestellung benoetigt?",
        "Vertrieb: Falls fuer den Auftrag erforderlich, teile ich Ihnen die Anzahlung oder Vorkasse klar und freundlich mit.",
        "Vertrieb: Wichtig ist die Begruendung: Reservierung der Ware, Beschaffung und verbindliche Terminplanung.",
      ],
      suggestions: ["almanca siparis alma", "almanca itiraz yonetimi", "almanca teslimat suresi"],
    }),
    entry({
      module: "itiraz fiyat yuksek",
      keywords: ["objection", "expensive", "teuer", "price objection"],
      trQuestion: "Musteri fiyat yuksek derse Almanca nasil cevap verilir?",
      deQuestion: "Wie antwortet man auf Deutsch, wenn der Kunde den Preis zu hoch findet?",
      trTitle: "Almanca fiyat itirazi role-play:",
      deTitle: "Deutsches Preiseinwand-Rollenspiel:",
      trLines: [
        "Musteri: Fiyat yuksek geldi.",
        "Satis: Savunmaya gecmeden once neyi kiyasladigini sorariz; sonra stok, kalite, teknik uyum ve teslim hizini deger olarak konumlariz.",
        "Satis: Gerekirse daha uygun bir alternatif de masaya koyariz.",
      ],
      deLines: [
        "Kunde: Der Preis ist zu hoch.",
        "Vertrieb: Ich verstehe Ihren Punkt. Darf ich kurz fragen, womit Sie vergleichen? Dann kann ich Ihnen den Unterschied bei Verfuegbarkeit, technischer Passung und Liefergeschwindigkeit sauber zeigen.",
        "Vertrieb: Falls gewuenscht, stelle ich Ihnen auch eine preislich passendere Alternative gegenueber.",
      ],
      suggestions: ["almanca alternatif urun", "almanca net fiyat liste", "almanca teknik aciklama"],
    }),
    entry({
      module: "itiraz rakip daha ucuz",
      keywords: ["competitor", "cheaper", "rakip", "guenstiger"],
      trQuestion: "Rakip daha ucuz derse Almanca nasil cevap verilir?",
      deQuestion: "Wie reagiert man auf Deutsch, wenn der Wettbewerber guenstiger ist?",
      trTitle: "Almanca rakip itirazi role-play:",
      deTitle: "Deutsches Wettbewerbs-Einwand-Rollenspiel:",
      trLines: [
        "Musteri: Baska yerde daha ucuz buldum.",
        "Satis: Direkt karsilik vermek yerine urunun bire bir ayni olup olmadigini, stok durumunu ve teslim sartlarini teyit etmek gerekir.",
        "Satis: Ayni urunse netlestirir, fark varsa bunu teknik ve ticari olarak sakin bir dille anlatiriz.",
      ],
      deLines: [
        "Kunde: Ich habe es woanders guenstiger gefunden.",
        "Vertrieb: Verstanden. Dann schauen wir am besten kurz, ob es wirklich derselbe Artikel, dieselbe Ausfuehrung und dieselbe Lieferbedingung ist.",
        "Vertrieb: Wenn es identisch ist, pruefen wir das sauber. Falls nicht, erklaere ich Ihnen den technischen und kaufmaennischen Unterschied ruhig und transparent.",
      ],
      suggestions: ["almanca fiyat itirazi", "almanca alternatif urun", "almanca teslimat suresi"],
    }),
    entry({
      module: "teknik sade anlatim",
      keywords: ["technical simple", "einfach erklaeren", "sade anlatim", "non technical"],
      trQuestion: "Teknik bilmeyen musteriyi Almanca nasil yormadan bilgilendiririm?",
      deQuestion: "Wie erklaert man einem nicht technischen Kunden die Technik auf Deutsch einfach?",
      trTitle: "Almanca sade teknik anlatim role-play:",
      deTitle: "Deutsches einfaches Technik-Rollenspiel:",
      trLines: [
        "Musteri: Teknik tarafi cok bilmiyorum.",
        "Satis: Sorun degil. Teknik jargonu azaltip urunun ne yaptigini, neye uygun oldugunu ve neden o modeli onerdigimizi sade anlatiriz.",
        "Satis: Musteriyi etkilemek degil, anlastirmak hedef olur.",
      ],
      deLines: [
        "Kunde: Ich kenne mich technisch nicht so gut aus.",
        "Vertrieb: Kein Problem. Ich erklaere es Ihnen einfach: wofuer das Produkt gedacht ist, wo es passt und warum genau dieses Modell sinnvoll ist.",
        "Vertrieb: Ziel ist nicht, mit Fachbegriffen zu beeindrucken, sondern Ihnen eine klare und sichere Entscheidung zu ermoeglichen.",
      ],
      suggestions: ["almanca alternatif urun", "almanca teklif isteme", "almanca fiyat konusmasi"],
    }),
    entry({
      module: "acil ihtiyac",
      keywords: ["urgent", "same day", "schnell", "dringend"],
      trQuestion: "Acil isteyen musteriyi Almanca nasil yonetiriz?",
      deQuestion: "Wie fuehrt man auf Deutsch einen Kunden mit dringendstem Bedarf?",
      trTitle: "Almanca acil ihtiyac role-play:",
      deTitle: "Deutsches Eilfall-Rollenspiel:",
      trLines: [
        "Musteri: Bugun lazim, sistem durdu.",
        "Satis: Onceligi hemen teyit eder, stokta varsa en hizli cikisi organize eder, yoksa en hizli alternatif veya gecici cozum sunariz.",
        "Satis: Burada hiz kadar netlik de onemlidir.",
      ],
      deLines: [
        "Kunde: Ich brauche es heute, die Anlage steht.",
        "Vertrieb: Dann priorisieren wir den Fall sofort. Wenn der Artikel lagernd ist, organisieren wir den schnellsten Ablauf. Falls nicht, nenne ich Ihnen direkt die schnellste Alternative oder eine uebergangsfaehige Loesung.",
        "Vertrieb: In solchen Situationen ist neben Tempo vor allem eine klare Aussage entscheidend.",
      ],
      suggestions: ["almanca stok sorgusu", "almanca alternatif urun", "almanca teslimat suresi"],
    }),
    entry({
      module: "stok yok durumu",
      keywords: ["out of stock", "nicht verfuegbar", "stok yok", "backorder"],
      trQuestion: "Stok yoksa Almanca nasil olumsuz cevap verilir ama satis kacmaz?",
      deQuestion: "Wie sagt man auf Deutsch korrekt nein, ohne den Verkauf zu verlieren?",
      trTitle: "Almanca stok yok role-play:",
      deTitle: "Deutsches Nicht-verfuegbar-Rollenspiel:",
      trLines: [
        "Musteri: Bu urun yoksa ne yapacagiz?",
        "Satis: Direkt yok demek yerine durum + alternatif + termin kombinasyonu sunmak gerekir.",
        "Satis: Musteri belirsizlige dusmeden bir sonraki secenegi hemen gormelidir.",
      ],
      deLines: [
        "Kunde: Was machen wir, wenn dieser Artikel nicht verfuegbar ist?",
        "Vertrieb: Statt nur zu sagen, dass er fehlt, gebe ich Ihnen direkt den Status, eine passende Alternative und den naechsten realistischen Termin.",
        "Vertrieb: Wichtig ist, dass Sie ohne Unsicherheit sofort die beste naechste Option sehen.",
      ],
      suggestions: ["almanca alternatif urun", "almanca teslimat suresi", "almanca teklif isteme"],
    }),
    entry({
      module: "whatsapp pdf gonderim",
      keywords: ["whatsapp", "pdf", "send", "versenden"],
      trQuestion: "Almanca PDF veya WhatsApp ozetini nasil sunariz?",
      deQuestion: "Wie bietet man auf Deutsch PDF oder WhatsApp-Zusammenfassung an?",
      trTitle: "Almanca gonderim role-play:",
      deTitle: "Deutsches Versand-Rollenspiel:",
      trLines: [
        "Musteri: Bana ozet gonderir misiniz?",
        "Satis: Evet, size PDF teklif veya kisa siparis ozetini WhatsApp ya da e-posta ile iletebilirim.",
        "Satis: Kanal secimini musteriye birakmak, hiz ve rahatlik saglar.",
      ],
      deLines: [
        "Kunde: Koennen Sie mir eine Zusammenfassung schicken?",
        "Vertrieb: Ja, ich kann Ihnen das Angebot als PDF oder eine kurze Bestelluebersicht per WhatsApp oder E-Mail senden.",
        "Vertrieb: Sie entscheiden, welcher Kanal fuer Sie am praktischsten ist.",
      ],
      suggestions: ["almanca teklif isteme", "almanca siparis alma", "almanca takip mesaji"],
    }),
    entry({
      module: "takip mesaji",
      keywords: ["follow up", "nachfassen", "takip", "reminder"],
      trQuestion: "Almanca takip mesaji nasil olur?",
      deQuestion: "Wie sieht eine gute Nachfass-Nachricht auf Deutsch aus?",
      trTitle: "Almanca takip role-play:",
      deTitle: "Deutsches Nachfass-Rollenspiel:",
      trLines: [
        "Satis: Tekliften sonra baski yapmadan, kisa ve profesyonel bir takip yapariz.",
        "Satis: Amac hatirlatmak, yardim teklif etmek ve karar icin rahat alan birakmaktir.",
      ],
      deLines: [
        "Vertrieb: Nach dem Angebot melden wir uns kurz, freundlich und ohne Druck.",
        "Vertrieb: Ziel ist eine Erinnerung, das Angebot weiterer Hilfe und gleichzeitig genug Raum fuer Ihre Entscheidung.",
        "Vertrieb: Beispiel: Wenn Sie Fragen haben oder eine Anpassung wuenschen, melde ich mich gern sofort zurueck.",
      ],
      suggestions: ["almanca teklif isteme", "almanca fiyat itirazi", "almanca siparis alma"],
    }),
    entry({
      module: "siparis durumu",
      keywords: ["order status", "bestellstatus", "tracking", "durum"],
      trQuestion: "Almanca siparis durumu sorana nasil cevap verilir?",
      deQuestion: "Wie antwortet man auf Deutsch auf eine Frage zum Bestellstatus?",
      trTitle: "Almanca siparis durumu role-play:",
      deTitle: "Deutsches Bestellstatus-Rollenspiel:",
      trLines: [
        "Musteri: Siparisimin durumu nedir?",
        "Satis: Durumu tek kelimeyle degil, hazirlaniyor, sevke verildi veya teyit bekliyor gibi acik ifade ederiz.",
        "Satis: Mumkunse bir sonraki adimi da ekleriz.",
      ],
      deLines: [
        "Kunde: Wie ist der Stand meiner Bestellung?",
        "Vertrieb: Ich nenne Ihnen den Status klar, zum Beispiel in Vorbereitung, versendet oder wartet auf Bestaetigung.",
        "Vertrieb: Wenn moeglich, sage ich Ihnen direkt auch den naechsten Schritt dazu.",
      ],
      suggestions: ["almanca takip mesaji", "almanca teslimat suresi", "almanca siparis alma"],
    }),
    entry({
      module: "hesap acma",
      keywords: ["account", "customer account", "konto", "register"],
      trQuestion: "Almanca musteri hesabi acma konusmasi nasil olur?",
      deQuestion: "Wie fuehrt man auf Deutsch ein Gespraech zur Kundenkonto-Erstellung?",
      trTitle: "Almanca hesap acma role-play:",
      deTitle: "Deutsches Kundenkonto-Rollenspiel:",
      trLines: [
        "Musteri: Hesap acmak istiyorum.",
        "Satis: Sureci basit anlatiriz: isim, e-posta veya kullanici adi, sifre ve iletisim bilgisi yeterlidir.",
        "Satis: Hesap acildiginda siparis gecmisi ve tekrar siparis kolayligi vurgulanabilir.",
      ],
      deLines: [
        "Kunde: Ich moechte ein Kundenkonto anlegen.",
        "Vertrieb: Gern. Der Ablauf ist einfach: Name, E-Mail oder Benutzername, Passwort und Ihre Kontaktdaten genuegen.",
        "Vertrieb: Mit dem Konto koennen Sie spaeter Ihre Bestellungen leichter verfolgen und wiederholen.",
      ],
      suggestions: ["almanca siparis durumu", "almanca teklif isteme", "almanca takip mesaji"],
    }),
    entry({
      module: "dil degistirme",
      keywords: ["language switch", "sprache", "turkish german", "zweisprachig"],
      trQuestion: "Musteri isterse Turkce Almanca arasinda nasil nazik gecis yapariz?",
      deQuestion: "Wie wechselt man freundlich zwischen Deutsch und Tuerkisch?",
      trTitle: "Almanca dil gecisi role-play:",
      deTitle: "Deutsches Sprachwechsel-Rollenspiel:",
      trLines: [
        "Musteri: Turkce de konusabilir miyiz?",
        "Satis: Elbette, hangi dil sizin icin daha rahat ise o dilden devam edebiliriz.",
        "Satis: Musteri rahatligi satis hizini de dogrudan artirir.",
      ],
      deLines: [
        "Kunde: Koennen wir auch Tuerkisch sprechen?",
        "Vertrieb: Selbstverstaendlich. Wir koennen in der Sprache weitermachen, die fuer Sie am angenehmsten ist.",
        "Vertrieb: Wichtig ist, dass alles klar und sicher verstanden wird.",
      ],
      suggestions: ["almanca sade teknik anlatim", "almanca karsilama", "almanca teklif isteme"],
    }),
    entry({
      module: "montaj dahil degil",
      keywords: ["installation", "service not included", "montaj", "einbau"],
      trQuestion: "Montaj dahil degil bilgisini Almanca nasil duzgun soyleriz?",
      deQuestion: "Wie kommuniziert man auf Deutsch sauber, dass Montage nicht enthalten ist?",
      trTitle: "Almanca kapsam role-play:",
      deTitle: "Deutsches Leistungsumfang-Rollenspiel:",
      trLines: [
        "Musteri: Fiyata montaj dahil mi?",
        "Satis: Hayir ise bunu net ama yumusak soylemek gerekir; ayni zamanda montaj tarafinda nasil destek olunabilecegi de eklenir.",
        "Satis: Belirsizlik yerine kapsam netligi guven verir.",
      ],
      deLines: [
        "Kunde: Ist die Montage im Preis enthalten?",
        "Vertrieb: Wenn sie nicht enthalten ist, sage ich das klar und freundlich. Gleichzeitig erklaere ich Ihnen gern, welche Unterstuetzung wir fuer die Montageplanung oder Produktauswahl bieten koennen.",
        "Vertrieb: Ein klar definierter Leistungsumfang schafft Vertrauen.",
      ],
      suggestions: ["almanca fiyat konusmasi", "almanca teklif isteme", "almanca teknik aciklama"],
    }),
    entry({
      module: "guclu kapanis",
      keywords: ["closing", "abschluss", "next step", "kapanis"],
      trQuestion: "Almanca satis gorusmesini guclu ama abartisiz nasil kapatiriz?",
      deQuestion: "Wie schliesst man ein Verkaufsgespraech auf Deutsch stark, aber unaufdringlich ab?",
      trTitle: "Almanca kapanis role-play:",
      deTitle: "Deutsches Abschluss-Rollenspiel:",
      trLines: [
        "Satis: Kapanista baski kurmadan sonraki adimi netlestiririz.",
        "Satis: Teklif gondereyim, stok teyidini kapatayim ya da siparisi acalim gibi bir secenekle ilerlemek en temiz yoldur.",
      ],
      deLines: [
        "Vertrieb: Zum Abschluss fuehre ich ohne Druck zum naechsten klaren Schritt.",
        "Vertrieb: Zum Beispiel: Ich sende Ihnen jetzt das Angebot, bestaetige sofort den Lagerbestand oder lege auf Wunsch direkt die Bestellung an.",
        "Vertrieb: So bleibt das Gespraech offen, aber trotzdem handlungsstark.",
      ],
      suggestions: ["almanca teklif isteme", "almanca siparis alma", "almanca takip mesaji"],
    }),
  ];
}

function writePreview(entries) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const lines = ["# DRC MAN German Sales Dialogues", ""];
  entries.forEach((item, index) => {
    lines.push(`## ${index + 1}. ${item.topic}`);
    lines.push(`- TR: ${item.trQuestion}`);
    lines.push(`- DE: ${item.deQuestion}`);
    lines.push("");
  });
  fs.writeFileSync(PREVIEW_MD, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env"));
  const { initDatabase, get, withTransaction } = require("../server/db");

  const entries = buildEntries();
  await initDatabase();
  const admin = await get("SELECT id FROM users WHERE role = ? ORDER BY id ASC LIMIT 1", ["admin"]);

  await withTransaction(async (tx) => {
    await tx.execute("DELETE FROM agent_training WHERE topic LIKE ?", [`${TOPIC_PREFIX}%`]);

    for (const item of entries) {
      await tx.execute(
        `
          INSERT INTO agent_training (
            topic, audience, keywords, tr_question, tr_answer, de_question, de_answer,
            suggestions, is_active, created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          item.topic,
          item.audience,
          item.keywords,
          item.trQuestion,
          item.trAnswer,
          item.deQuestion,
          item.deAnswer,
          JSON.stringify(item.suggestions || []),
          true,
          admin?.id ? Number(admin.id) : null,
        ]
      );
    }
  });

  writePreview(entries);
  console.log(JSON.stringify({
    ok: true,
    topicPrefix: TOPIC_PREFIX,
    entries: entries.length,
    exportDir: EXPORT_DIR,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
