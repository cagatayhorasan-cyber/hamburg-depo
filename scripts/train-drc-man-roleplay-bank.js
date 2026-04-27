const fs = require("fs");
const path = require("path");

const TOPIC_ADMIN = "DRC MAN role-play - admin";
const TOPIC_STAFF = "DRC MAN role-play - staff";
const TOPIC_CUSTOMER = "DRC MAN role-play - customer";
const EXPORT_DIR = path.join(process.cwd(), ".codex_tmp", "drc_man_roleplay_bank");

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

function scenario(topic, id, keywords, trQuestions, deQuestions, trTitle, deTitle, trLines, deLines, suggestions) {
  return {
    id,
    topic,
    audience: "all",
    keywords: [
      "role play",
      "roleplay",
      "rol oyunu",
      "senaryo",
      ...keywords,
      ...trQuestions,
      ...deQuestions,
      trTitle,
      deTitle,
      topic,
    ],
    trQuestions,
    deQuestions,
    trAnswer: makeDialogue(trTitle, trLines),
    deAnswer: makeDialogue(deTitle, deLines),
    suggestions,
  };
}

const adminScenarios = [
  scenario(
    TOPIC_ADMIN,
    "admin_menu",
    ["admin", "yonetici", "liste", "menu"],
    ["admin roleplayleri ver", "admin rol oyunu menusu", "admin senaryolari goster"],
    ["zeige admin rollenspiele", "admin rollenspiel menue", "admin szenarien zeigen"],
    "Role-play admin menu:",
    "Admin-Rollenspiel-Menue:",
    [
      "Bu pakette stok-fiyat guncelleme, maliyet kontrolu, kasa inceleme, kullanici acma, siparis onayi ve guvenlik kontrolu gibi 20 admin senaryosu vardir.",
      "Birini secip devam etmek icin ornegin 'admin stok fiyat roleplayi' diyebilirsiniz.",
    ],
    [
      "Dieses Paket enthaelt 20 Admin-Szenarien wie Bestands- und Preisupdate, Kostenkontrolle, Kassenpruefung, Benutzeranlage, Bestellfreigabe und Sicherheitskontrolle.",
      "Zum Fortsetzen koennen Sie zum Beispiel 'Admin Rollenspiel Bestand Preis' sagen.",
    ],
    ["admin stok fiyat roleplayi", "admin kasa roleplayi", "admin kullanici acma roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_stock_price",
    ["stok", "fiyat", "price", "bestand"],
    ["admin stok fiyat roleplayi", "admin olarak stok ve fiyat guncelleme senaryosu"],
    ["admin rollenspiel bestand preis", "admin preis und bestand aktualisieren"],
    "Role-play admin stok ve fiyat:",
    "Admin-Rollenspiel Bestand und Preis:",
    [
      "Admin: DCB31 stok ve fiyatini goster.",
      "Sistem: 212 adet var; net €19, liste €25, alis €15.",
      "Admin: Neti €20, listeyi €26 yap.",
      "Sistem: Kart guncellendi ve yeni fiyatlar kaydedildi.",
    ],
    [
      "Admin: Zeig mir Bestand und Preise von DCB31.",
      "System: 212 Stk. vorhanden; netto €19, Liste €25, Einkauf €15.",
      "Admin: Netto auf €20 und Liste auf €26 setzen.",
      "System: Artikel wurde aktualisiert und die neuen Preise gespeichert.",
    ],
    ["admin maliyet roleplayi", "admin toplu fiyat roleplayi", "admin barkod roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_cost_margin",
    ["maliyet", "alis", "marj", "einkauf", "margin"],
    ["admin maliyet roleplayi", "admin alis ve marj kontrol senaryosu"],
    ["admin rollenspiel einkauf marge", "admin kostenkontrolle szenario"],
    "Role-play admin maliyet ve marj:",
    "Admin-Rollenspiel Einkauf und Marge:",
    [
      "Admin: NEU6215GK icin alis, net ve listeyi ac.",
      "Sistem: Alis €130, net €162,50, liste kurali buna gore olusmus.",
      "Admin: Marj dusuk gorunuyor; satisi tekrar kontrol et.",
      "Sistem: Not alindi, kart inceleme listesine eklendi.",
    ],
    [
      "Admin: Oeffne Einkauf, Netto und Liste fuer NEU6215GK.",
      "System: Einkauf €130, netto €162,50, der Listenpreis basiert auf dieser Regel.",
      "Admin: Die Marge wirkt niedrig; Verkauf bitte erneut pruefen.",
      "System: Vermerkt, der Artikel wurde zur Pruefliste hinzugefuegt.",
    ],
    ["admin stok fiyat roleplayi", "admin siparis onay roleplayi", "admin rapor roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_cash_review",
    ["kasa", "cash", "cashbook", "bakiye"],
    ["admin kasa roleplayi", "admin gunluk kasa inceleme senaryosu"],
    ["admin rollenspiel kasse", "admin tageskasse pruefen"],
    "Role-play admin kasa kontrolu:",
    "Admin-Rollenspiel Kassenkontrolle:",
    [
      "Admin: Bugunku kasa hareketlerini ac.",
      "Sistem: Girisler, cikislar ve faturasiz satislar listelendi; guncel bakiye hesaplandi.",
      "Admin: Havaleyi ac ve not ekle.",
      "Sistem: Kasa kaydi acildi, not guncellendi.",
    ],
    [
      "Admin: Oeffne die heutigen Kassenbewegungen.",
      "System: Eingaenge, Ausgaenge und Verkaeufe ohne Rechnung sind gelistet; aktueller Bestand berechnet.",
      "Admin: Oeffne die Ueberweisung und fuege eine Notiz hinzu.",
      "System: Kasseneintrag geoeffnet, Notiz aktualisiert.",
    ],
    ["admin masraf roleplayi", "admin direkt satis kontrol roleplayi", "admin guvenlik roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_expense_fix",
    ["masraf", "expense", "gider", "ausgabe"],
    ["admin masraf roleplayi", "admin masraf duzeltme senaryosu"],
    ["admin rollenspiel ausgabe", "admin ausgabe korrigieren"],
    "Role-play admin masraf duzeltme:",
    "Admin-Rollenspiel Ausgabenkorrektur:",
    [
      "Admin: Nakliye masrafini ac.",
      "Sistem: Tarih, kategori, odeme tipi ve tutar gorunuyor.",
      "Admin: Bu kayit hatali, sil.",
      "Sistem: Masraf kaydi silindi ve gider listesi guncellendi.",
    ],
    [
      "Admin: Oeffne die Ausgabe Transport.",
      "System: Datum, Kategorie, Zahlungsart und Betrag sind sichtbar.",
      "Admin: Dieser Eintrag ist falsch, loeschen.",
      "System: Ausgabeneintrag geloescht und Liste aktualisiert.",
    ],
    ["admin kasa roleplayi", "admin guvenlik roleplayi", "admin siparis onay roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_user_create",
    ["kullanici", "user", "rol", "role"],
    ["admin kullanici acma roleplayi", "admin yeni personel olusturma senaryosu"],
    ["admin rollenspiel benutzer anlegen", "admin neues personal anlegen"],
    "Role-play admin kullanici olusturma:",
    "Admin-Rollenspiel Benutzer anlegen:",
    [
      "Admin: Yeni personel hesabi ac.",
      "Sistem: Ad, kullanici adi, sifre ve rol bilgisi istenir.",
      "Admin: Tuncay icin staff hesabi kaydet.",
      "Sistem: Hesap olusturuldu ve rol staff olarak atandi.",
    ],
    [
      "Admin: Lege ein neues Personal-Konto an.",
      "System: Name, Benutzername, Passwort und Rolle werden abgefragt.",
      "Admin: Speichere ein Staff-Konto fuer Tuncay.",
      "System: Konto erstellt und Rolle staff zugewiesen.",
    ],
    ["admin yetki roleplayi", "admin guvenlik roleplayi", "admin mesaj roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_order_approve",
    ["siparis", "order", "onay", "approve"],
    ["admin siparis onay roleplayi", "admin siparis onayi senaryosu"],
    ["admin rollenspiel bestellung freigeben", "admin bestellung bestaetigen"],
    "Role-play admin siparis onayi:",
    "Admin-Rollenspiel Bestellfreigabe:",
    [
      "Admin: Bekleyen siparisleri ac.",
      "Sistem: Musteri, urun ve adetler listelendi.",
      "Admin: Yilmaz siparisini onayla ve hazirlaniyor yap.",
      "Sistem: Siparis durumu guncellendi ve kayit altina alindi.",
    ],
    [
      "Admin: Oeffne die offenen Bestellungen.",
      "System: Kunde, Artikel und Mengen wurden gelistet.",
      "Admin: Bestaetige die Bestellung von Yilmaz und setze sie auf in Vorbereitung.",
      "System: Bestellstatus aktualisiert und protokolliert.",
    ],
    ["admin mesaj roleplayi", "staff siparis durum roleplayi", "customer siparis durum roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_bulk_pricing",
    ["toplu fiyat", "bulk", "pricing", "preis"],
    ["admin toplu fiyat roleplayi", "admin toplu satis fiyati guncelleme"],
    ["admin rollenspiel sammelpreise", "admin verkaufspreise gesammelt aktualisieren"],
    "Role-play admin toplu fiyat:",
    "Admin-Rollenspiel Sammelpreise:",
    [
      "Admin: Sanhua kategorisinde satis fiyatlarini %10 artir.",
      "Sistem: Secilen marka ve kategori icin yeni satis fiyatlari hesaplandi.",
      "Admin: Onizlemeyi kontrol et ve uygula.",
      "Sistem: Toplu fiyat guncellemesi tamamlandi.",
    ],
    [
      "Admin: Erhoehe die Verkaufspreise in der Sanhua-Gruppe um 10 Prozent.",
      "System: Fuer die gewaehlte Marke und Kategorie wurden neue Verkaufspreise berechnet.",
      "Admin: Vorschau pruefen und anwenden.",
      "System: Sammelpreis-Update abgeschlossen.",
    ],
    ["admin stok fiyat roleplayi", "admin maliyet roleplayi", "admin rapor roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_archive_restore",
    ["arsiv", "archive", "restore", "geri al"],
    ["admin arsiv roleplayi", "admin urun arsiv geri alma senaryosu"],
    ["admin rollenspiel archiv", "admin artikel archiv wiederherstellen"],
    "Role-play admin arsiv ve geri alma:",
    "Admin-Rollenspiel Archiv und Wiederherstellung:",
    [
      "Admin: Hareketsiz urunu arsive al.",
      "Sistem: Kart aktif listeden cikti, gecmis kayitlar korundu.",
      "Admin: Simdi geri al.",
      "Sistem: Urun tekrar aktif listeye eklendi.",
    ],
    [
      "Admin: Archiviere den inaktiven Artikel.",
      "System: Die Karte wurde aus der aktiven Liste entfernt, die Historie blieb erhalten.",
      "Admin: Jetzt wiederherstellen.",
      "System: Der Artikel ist wieder in der aktiven Liste sichtbar.",
    ],
    ["admin barkod roleplayi", "admin intake roleplayi", "staff alternatif roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_barcode_verify",
    ["barkod", "stok kodu", "barcode", "lagercode"],
    ["admin barkod roleplayi", "admin stok kodu kontrol senaryosu"],
    ["admin rollenspiel barcode", "admin lagercode pruefen"],
    "Role-play admin barkod kontrolu:",
    "Admin-Rollenspiel Barcode-Pruefung:",
    [
      "Admin: DRC-09950 kartini ac ve kodu dogrula.",
      "Sistem: Urun adi, marka ve stok kodu gorunuyor.",
      "Admin: Barkod PNG olustur.",
      "Sistem: Barkod dosyasi uretildi ve indirilmeye hazir.",
    ],
    [
      "Admin: Oeffne die Karte DRC-09950 und pruefe den Code.",
      "System: Produktname, Marke und Lagercode sind sichtbar.",
      "Admin: Erzeuge ein Barcode-PNG.",
      "System: Barcode-Datei erstellt und zum Download bereit.",
    ],
    ["admin rapor roleplayi", "staff barkod roleplayi", "customer kod roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_report_export",
    ["rapor", "excel", "pdf", "bericht"],
    ["admin rapor roleplayi", "admin excel ve pdf rapor alma"],
    ["admin rollenspiel bericht export", "admin excel und pdf export"],
    "Role-play admin rapor alma:",
    "Admin-Rollenspiel Berichtsexport:",
    [
      "Admin: Excel raporu indir.",
      "Sistem: Guncel stok ve operasyon verileriyle XLSX hazirlandi.",
      "Admin: PDF ozeti de olustur.",
      "Sistem: PDF ozet rapor uretildi.",
    ],
    [
      "Admin: Lade den Excel-Bericht herunter.",
      "System: Eine XLSX-Datei mit aktuellem Lager- und Betriebsstand wurde erstellt.",
      "Admin: Erzeuge auch die PDF-Uebersicht.",
      "System: PDF-Zusammenfassung wurde erstellt.",
    ],
    ["admin teklif pdf roleplayi", "admin kasa roleplayi", "admin guvenlik roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_quote_pdf",
    ["teklif", "pdf", "angebot"],
    ["admin teklif pdf roleplayi", "admin kayitli teklif pdf senaryosu"],
    ["admin rollenspiel angebot pdf", "admin gespeichertes angebot pdf"],
    "Role-play admin teklif ve PDF:",
    "Admin-Rollenspiel Angebot und PDF:",
    [
      "Admin: Son teklifleri ac.",
      "Sistem: Kayitli teklifler liste halinde gorunuyor.",
      "Admin: Almanca PDF onizlemesini ac ve sonra indir.",
      "Sistem: PDF onizleme endpointi calisti, dosya indirildi.",
    ],
    [
      "Admin: Oeffne die letzten Angebote.",
      "System: Gespeicherte Angebote sind als Liste sichtbar.",
      "Admin: Oeffne die deutsche PDF-Vorschau und lade sie danach herunter.",
      "System: PDF-Vorschau lief erfolgreich, Datei wurde geladen.",
    ],
    ["staff teklif roleplayi", "admin rapor roleplayi", "customer teklif talep roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_training_entry",
    ["egitim", "training", "agent_training", "drc man"],
    ["admin egitim roleplayi", "admin drc man egitim ekleme senaryosu"],
    ["admin rollenspiel training", "admin drc man training eintragen"],
    "Role-play admin egitim ekleme:",
    "Admin-Rollenspiel Training anlegen:",
    [
      "Admin: DRC MAN icin yeni soru-cevap egitimi ekle.",
      "Sistem: Konu, hedef kitle, TR-DE soru-cevap ve oneriler istenir.",
      "Admin: Kaydet.",
      "Sistem: Egitim kaydi olustu ve aktif hale geldi.",
    ],
    [
      "Admin: Lege ein neues Frage-Antwort-Training fuer DRC MAN an.",
      "System: Thema, Zielgruppe, TR-DE Fragen/Antworten und Vorschlaege werden abgefragt.",
      "Admin: Speichern.",
      "System: Trainingseintrag erstellt und aktiviert.",
    ],
    ["admin menu", "admin guvenlik roleplayi", "staff drc man roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_message_inbox",
    ["mesaj", "admin message", "sikayet", "wunsch"],
    ["admin mesaj roleplayi", "admin mesaj kutusu inceleme senaryosu"],
    ["admin rollenspiel nachrichten", "admin nachrichtenfach pruefen"],
    "Role-play admin mesaj kutusu:",
    "Admin-Rollenspiel Nachrichtenfach:",
    [
      "Admin: Gelen istek ve sikayetleri ac.",
      "Sistem: Gonderen, baslik, mesaj ve durum alanlari listelendi.",
      "Admin: Ilk kaydi okundu yap ve ikincisini kapat.",
      "Sistem: Mesaj durumlari guncellendi.",
    ],
    [
      "Admin: Oeffne eingegangene Wuensche und Beschwerden.",
      "System: Absender, Betreff, Nachricht und Status wurden gelistet.",
      "Admin: Markiere den ersten Eintrag als gelesen und schliesse den zweiten.",
      "System: Nachrichtenstatus wurde aktualisiert.",
    ],
    ["customer destek roleplayi", "staff admin mesaj roleplayi", "admin guvenlik roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_reverse_audit",
    ["hareket", "iptal", "reverse", "storno"],
    ["admin hareket iptal roleplayi", "admin stok duzeltme senaryosu"],
    ["admin rollenspiel bewegung stornieren", "admin lagerkorrektur"],
    "Role-play admin hareket duzeltme:",
    "Admin-Rollenspiel Lagerkorrektur:",
    [
      "Admin: Yanlis stok cikisini bul.",
      "Sistem: Hareket tarihi, miktari ve kullanicisi listelendi.",
      "Admin: Iptal et.",
      "Sistem: Ters hareket olustu, stok gecmisi korunarak duzeltildi.",
    ],
    [
      "Admin: Finde den falschen Lagerausgang.",
      "System: Datum, Menge und Benutzer der Bewegung wurden angezeigt.",
      "Admin: Stornieren.",
      "System: Gegenbewegung wurde erstellt, der Bestand ist mit Historie korrigiert.",
    ],
    ["staff hareket iptal roleplayi", "admin intake roleplayi", "admin kasa roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_intake",
    ["ilk stok", "intake", "yeni urun", "erstbestand"],
    ["admin intake roleplayi", "admin yeni urun ilk stok senaryosu"],
    ["admin rollenspiel erstbestand", "admin neuer artikel mit erstbestand"],
    "Role-play admin yeni urun ve ilk stok:",
    "Admin-Rollenspiel neuer Artikel mit Erstbestand:",
    [
      "Admin: Yeni marka urun karti ac.",
      "Sistem: Marka, kategori, kod, alis, net, liste ve ilk miktar istenir.",
      "Admin: Kaydet.",
      "Sistem: Kart olustu ve ilk stok girisi ayni anda yazildi.",
    ],
    [
      "Admin: Lege einen neuen Markenartikel an.",
      "System: Marke, Kategorie, Code, Einkauf, Netto, Liste und Erstmenge werden abgefragt.",
      "Admin: Speichern.",
      "System: Karte erstellt und der erste Lagerzugang direkt gebucht.",
    ],
    ["staff intake roleplayi", "admin stok fiyat roleplayi", "admin arsiv roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_sale_audit",
    ["direkt satis", "audit", "checkout", "verkauf"],
    ["admin direkt satis kontrol roleplayi", "admin satis kaydi inceleme senaryosu"],
    ["admin rollenspiel direktverkauf pruefen", "admin verkaufseintrag audit"],
    "Role-play admin direkt satis denetimi:",
    "Admin-Rollenspiel Direktverkauf prüfen:",
    [
      "Admin: Bugunku direkt satis kayitlarini ac.",
      "Sistem: Musteri, toplam, tahsilat ve bagli kasa hareketi eslesti.",
      "Admin: Faturasiz satisla birlikte stok dusmus mu kontrol et.",
      "Sistem: Stok hareketi ve kasa kaydi tutarli gorunuyor.",
    ],
    [
      "Admin: Oeffne die heutigen Direktverkaufs-Eintraege.",
      "System: Kunde, Summe, Zahlung und zugehoerige Kassenbewegung wurden abgeglichen.",
      "Admin: Pruefe, ob beim Verkauf ohne Rechnung auch der Bestand reduziert wurde.",
      "System: Lagerbewegung und Kasseneintrag sind konsistent.",
    ],
    ["staff hizli satis roleplayi", "staff faturasiz satis roleplayi", "admin kasa roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_security_review",
    ["guvenlik", "security", "ip block", "erisim"],
    ["admin guvenlik roleplayi", "admin guvenlik olay inceleme senaryosu"],
    ["admin rollenspiel sicherheit", "admin sicherheitsereignisse pruefen"],
    "Role-play admin guvenlik inceleme:",
    "Admin-Rollenspiel Sicherheitspruefung:",
    [
      "Admin: Son guvenlik olaylarini ac.",
      "Sistem: Hatali girisler, erisim redleri ve bloklanan IP kayitlari listelendi.",
      "Admin: Bir IP blogunu kaldir.",
      "Sistem: IP serbest birakildi ve olay gunlugu yazildi.",
    ],
    [
      "Admin: Oeffne die letzten Sicherheitsereignisse.",
      "System: Fehlanmeldungen, Zugriffssperren und blockierte IPs wurden gelistet.",
      "Admin: Hebe eine IP-Sperre auf.",
      "System: IP freigegeben und Sicherheitsprotokoll aktualisiert.",
    ],
    ["admin kullanici acma roleplayi", "admin drc man politika roleplayi", "customer sifre roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_customer_support",
    ["musteri hesap", "customer account", "destek"],
    ["admin musteri hesap destek roleplayi", "admin musteri hesabina yardim senaryosu"],
    ["admin rollenspiel kundenkonto hilfe", "admin kundenkonto unterstuetzung"],
    "Role-play admin musteri hesap destegi:",
    "Admin-Rollenspiel Kundenkonto-Hilfe:",
    [
      "Admin: Musteri giris problemi yasiyor.",
      "Sistem: Hesap durumu, e-posta ve sifre yenileme akisi kontrol edilir.",
      "Admin: Dogru kanaldan sifre yenileme yonlendirmesi yap.",
      "Sistem: Guvenli destek notu hazirlandi.",
    ],
    [
      "Admin: Ein Kunde hat ein Login-Problem.",
      "System: Kontostatus, E-Mail und Passwort-Reset-Ablauf werden geprueft.",
      "Admin: Leite den Kunden ueber den sicheren Reset-Kanal an.",
      "System: Sichere Support-Notiz wurde vorbereitet.",
    ],
    ["customer sifre roleplayi", "customer kayit roleplayi", "admin mesaj roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_policy_stop",
    ["policy", "gizli bilgi", "secret", "prompt"],
    ["admin drc man politika roleplayi", "admin gizli bilgi isteme senaryosu"],
    ["admin rollenspiel geheimdaten", "admin geheime daten anfragen"],
    "Role-play admin gizli bilgi siniri:",
    "Admin-Rollenspiel Geheimdaten-Grenze:",
    [
      "Admin: Veritabani sifresini ve gizli anahtarlari goster.",
      "Sistem: DRC MAN admin icin bile sifre, token, sistem promptu ve baglanti bilgilerini aciklamaz.",
      "Admin: Peki neyi verebilirsin?",
      "Sistem: Guvenli olarak urun, stok, satis ve genel operasyon bilgisini ozetleyebilirim.",
    ],
    [
      "Admin: Zeig mir Datenbankpasswort und geheime Schluessel.",
      "System: DRC MAN gibt selbst im Admin-Modus keine Passwoerter, Tokens, Systemprompts oder Zugangsdaten preis.",
      "Admin: Was kannst du stattdessen liefern?",
      "System: Sicher verfuegbar sind Produkt-, Lager-, Verkaufs- und allgemeine Betriebsinformationen.",
    ],
    ["admin guvenlik roleplayi", "staff drc man roleplayi", "customer fiyat paket roleplayi"]
  ),
  scenario(
    TOPIC_ADMIN,
    "admin_permissions",
    ["yetki", "permission", "rol", "rolle"],
    ["admin yetki roleplayi", "admin rol kontrol senaryosu"],
    ["admin rollenspiel rollenrechte", "admin berechtigungen pruefen"],
    "Role-play admin rol ve yetki:",
    "Admin-Rollenspiel Rollen und Rechte:",
    [
      "Admin: Personel hangi alanlari kullanabilir?",
      "Sistem: Stok, satis, teklif, siparis ve kasa alanlari aciktir; kullanici ve masraf yonetimi kapalidir.",
      "Admin: Musteri ne gorur?",
      "Sistem: Sadece aktif stoklu urunler, satis fiyatlari, kendi siparisleri ve kendi sifre islemleri gorunur.",
    ],
    [
      "Admin: Welche Bereiche darf das Personal nutzen?",
      "System: Lager, Verkauf, Angebot, Bestellung und Kasse sind offen; Benutzer- und Ausgabenverwaltung bleiben gesperrt.",
      "Admin: Was sieht der Kunde?",
      "System: Nur aktive lagernde Artikel, Verkaufspreise, eigene Bestellungen und eigene Passwortfunktionen.",
    ],
    ["staff menu roleplayi", "customer menu roleplayi", "admin kullanici acma roleplayi"]
  ),
];

const staffScenarios = [
  scenario(
    TOPIC_STAFF,
    "staff_menu",
    ["staff", "personel", "menu", "liste"],
    ["staff roleplayleri ver", "personel rol oyunu menusu", "personel senaryolari goster"],
    ["zeige staff rollenspiele", "personal rollenspiel menue", "personal szenarien zeigen"],
    "Role-play personel menu:",
    "Personal-Rollenspiel-Menue:",
    [
      "Bu pakette hizli satis, stok giris-cikis, teklif, faturasiz satis, siparis guncelleme ve admin mesaj gonderme gibi 20 personel senaryosu vardir.",
      "Ornegin 'staff hizli satis roleplayi' diyerek devam edebilirsiniz.",
    ],
    [
      "Dieses Paket enthaelt 20 Personal-Szenarien wie Schnellverkauf, Lagerbewegungen, Angebot, Verkauf ohne Rechnung, Bestellstatus und Nachricht an Admin.",
      "Sie koennen zum Beispiel mit 'Staff Rollenspiel Schnellverkauf' fortfahren.",
    ],
    ["staff hizli satis roleplayi", "staff stok cikis roleplayi", "staff teklif roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_quick_sale",
    ["hizli satis", "direkt satis", "quick sale"],
    ["staff hizli satis roleplayi", "personel direkt satis senaryosu"],
    ["staff rollenspiel schnellverkauf", "personal direktverkauf szenario"],
    "Role-play personel hizli satis:",
    "Personal-Rollenspiel Schnellverkauf:",
    [
      "Personel: DCB31 urununden 3 adet sepete ekle.",
      "Sistem: Sepet guncellendi ve toplam tutar hesaplandi.",
      "Personel: Musteri Senol, tahsilat nakit, direkt satis yap.",
      "Sistem: Satis tamamlandi; stok dustu ve kasa kaydi olustu.",
    ],
    [
      "Personal: Fuege 3 Stk. DCB31 in den Warenkorb.",
      "System: Warenkorb aktualisiert und Gesamtsumme berechnet.",
      "Personal: Kunde Senol, Zahlung bar, Direktverkauf ausfuehren.",
      "System: Verkauf abgeschlossen; Bestand reduziert und Kasse gebucht.",
    ],
    ["staff faturasiz satis roleplayi", "staff kasa roleplayi", "staff teklif roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_stock_exit",
    ["stok cikis", "exit", "montaj"],
    ["staff stok cikis roleplayi", "personel montaj icin stok cikisi"],
    ["staff rollenspiel lagerausgang", "personal warenausgang montage"],
    "Role-play personel stok cikisi:",
    "Personal-Rollenspiel Lagerausgang:",
    [
      "Personel: Embraco NEU6215GK icin 2 adet cikis yap.",
      "Sistem: Miktar stokla karsilastirildi ve onay bekleniyor.",
      "Personel: Not montaj servisi, kaydet.",
      "Sistem: Hareket kaydedildi, stok 2 adet azaldi.",
    ],
    [
      "Personal: Buche 2 Stk. Ausgang fuer Embraco NEU6215GK.",
      "System: Menge wurde mit dem Bestand verglichen und wartet auf Bestaetigung.",
      "Personal: Notiz Montage-Service, speichern.",
      "System: Bewegung gespeichert, Bestand um 2 Stk. reduziert.",
    ],
    ["staff stok giris roleplayi", "staff hareket iptal roleplayi", "staff alternatif roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_stock_entry",
    ["stok giris", "entry", "wareneingang"],
    ["staff stok giris roleplayi", "personel mevcut urune giris senaryosu"],
    ["staff rollenspiel lagerezugang", "personal wareneingang fuer artikel"],
    "Role-play personel stok girisi:",
    "Personal-Rollenspiel Lagerzugang:",
    [
      "Personel: DCB31 urunune 20 adet giris yap.",
      "Sistem: Tarih ve birim maliyet bilgisi istendi.",
      "Personel: Birim maliyet €15, kaydet.",
      "Sistem: Giris hareketi yazildi ve stok artti.",
    ],
    [
      "Personal: Buche 20 Stk. Zugang fuer DCB31.",
      "System: Datum und Einstandspreis werden abgefragt.",
      "Personal: Einstandspreis €15, speichern.",
      "System: Zugang gebucht und Bestand erhoeht.",
    ],
    ["staff intake roleplayi", "staff hareket iptal roleplayi", "staff drc man roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_reverse",
    ["hareket iptal", "reverse", "storno"],
    ["staff hareket iptal roleplayi", "personel yanlis hareket duzeltme"],
    ["staff rollenspiel bewegung stornieren", "personal falsche bewegung korrigieren"],
    "Role-play personel hareket iptali:",
    "Personal-Rollenspiel Bewegungsstorno:",
    [
      "Personel: Az onceki yanlis stok cikisini geri al.",
      "Sistem: Hareket bulundu ve ters kayit icin hazir.",
      "Personel: Iptal et.",
      "Sistem: Karsi hareket olustu; ayni kayit ikinci kez iptal edilemez.",
    ],
    [
      "Personal: Nimm den falschen Lagerausgang von eben zurueck.",
      "System: Bewegung gefunden und zur Gegenbuchung bereit.",
      "Personal: Stornieren.",
      "System: Gegenbewegung erstellt; derselbe Datensatz kann nicht zweimal storniert werden.",
    ],
    ["staff stok cikis roleplayi", "staff stok giris roleplayi", "admin hareket iptal roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_quote_create",
    ["teklif", "angebot", "quote"],
    ["staff teklif roleplayi", "personel teklif hazirlama senaryosu"],
    ["staff rollenspiel angebot", "personal angebot erstellen"],
    "Role-play personel teklif hazirlama:",
    "Personal-Rollenspiel Angebot erstellen:",
    [
      "Personel: Urunleri sepete ekledim; musteriyi Yilmaz olarak giriyorum.",
      "Sistem: Baslik, tarih ve not alanlari tamamlanabilir.",
      "Personel: Teklif olarak kaydet.",
      "Sistem: Teklif kaydedildi, stok ve kasa degismedi.",
    ],
    [
      "Personal: Ich habe die Artikel in den Warenkorb gelegt und trage den Kunden Yilmaz ein.",
      "System: Titel, Datum und Notiz koennen vervollstaendigt werden.",
      "Personal: Als Angebot speichern.",
      "System: Angebot gespeichert, Bestand und Kasse blieben unveraendert.",
    ],
    ["staff teklif pdf roleplayi", "staff hizli satis roleplayi", "customer teklif talep roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_quote_pdf",
    ["pdf", "teklif pdf", "angebot pdf"],
    ["staff teklif pdf roleplayi", "personel teklif pdf gonderme senaryosu"],
    ["staff rollenspiel angebot pdf", "personal angebot pdf senden"],
    "Role-play personel teklif PDF:",
    "Personal-Rollenspiel Angebots-PDF:",
    [
      "Personel: Kayitli teklifin Almanca PDF onizlemesini ac.",
      "Sistem: PDF yeni sekmede goruntulendi.",
      "Personel: Simdi indir ve musterime gonder.",
      "Sistem: PDF indirildi; gonderime hazir.",
    ],
    [
      "Personal: Oeffne die deutsche PDF-Vorschau des gespeicherten Angebots.",
      "System: PDF wurde in einem neuen Tab angezeigt.",
      "Personal: Jetzt herunterladen und an den Kunden senden.",
      "System: PDF wurde geladen und ist versandbereit.",
    ],
    ["staff teklif roleplayi", "staff alman musteri roleplayi", "admin teklif pdf roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_unbilled",
    ["faturasiz", "unbilled", "perakende"],
    ["staff faturasiz satis roleplayi", "personel perakende satis senaryosu"],
    ["staff rollenspiel ohne rechnung", "personal verkauf ohne rechnung"],
    "Role-play personel faturasiz satis:",
    "Personal-Rollenspiel Verkauf ohne Rechnung:",
    [
      "Personel: Perakende musteri icin iki urun secildi.",
      "Sistem: Faturasiz satis toplam tutari hazir.",
      "Personel: Tahsil edilen tutar tam, kaydet.",
      "Sistem: Stok duser, kasa kaydi olusur ve satis faturasiz olarak isaretlenir.",
    ],
    [
      "Personal: Fuer einen Laufkunden wurden zwei Artikel gewaehlt.",
      "System: Gesamtsumme fuer den Verkauf ohne Rechnung ist bereit.",
      "Personal: Voll bezahlt, speichern.",
      "System: Bestand sinkt, Kasseneintrag wird angelegt und der Verkauf als ohne Rechnung markiert.",
    ],
    ["staff kasa roleplayi", "staff hizli satis roleplayi", "admin direkt satis kontrol roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_cashbook",
    ["kasa", "cash", "cashbook"],
    ["staff kasa roleplayi", "personel kasa giris cikis senaryosu"],
    ["staff rollenspiel kasse", "personal kasseneingang ausgang"],
    "Role-play personel kasa islemi:",
    "Personal-Rollenspiel Kassenbuchung:",
    [
      "Personel: Kasa girisi ac.",
      "Sistem: Baslik, tutar, tarih ve referans istenir.",
      "Personel: Sonra bir kasa cikisi da gir.",
      "Sistem: Giris ve cikis kayitlari eklendi; personel kasa defterini gorebilir.",
    ],
    [
      "Personal: Oeffne einen Kasseneingang.",
      "System: Titel, Betrag, Datum und Referenz werden angefragt.",
      "Personal: Danach auch einen Kassenausgang erfassen.",
      "System: Ein- und Ausgang wurden gespeichert; das Personal darf das Kassenbuch sehen.",
    ],
    ["staff faturasiz satis roleplayi", "admin kasa roleplayi", "staff yetki siniri roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_order_status",
    ["siparis", "order", "durum", "status"],
    ["staff siparis durum roleplayi", "personel siparis durumu guncelleme"],
    ["staff rollenspiel bestellstatus", "personal bestellstatus aktualisieren"],
    "Role-play personel siparis durumu:",
    "Personal-Rollenspiel Bestellstatus:",
    [
      "Personel: Yeni siparisi onaylandi yap.",
      "Sistem: Uygun durum listesi sunuldu.",
      "Personel: Sonra hazirlaniyor ve tamamlandi adimlarini isle.",
      "Sistem: Durum gecisleri kaydedildi; gecersiz adim reddedilir.",
    ],
    [
      "Personal: Setze die neue Bestellung auf bestaetigt.",
      "System: Gueltige Statusschritte wurden angeboten.",
      "Personal: Danach auf in Vorbereitung und abgeschlossen setzen.",
      "System: Statuswechsel gespeichert; ungueltige Schritte werden abgelehnt.",
    ],
    ["customer siparis durum roleplayi", "admin siparis onay roleplayi", "staff alman musteri roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_search_code",
    ["arama", "kod", "barcode", "search"],
    ["staff kodla arama roleplayi", "personel stok kodundan urun bulma"],
    ["staff rollenspiel code suche", "personal artikel per code finden"],
    "Role-play personel kodla arama:",
    "Personal-Rollenspiel Suche per Code:",
    [
      "Personel: DRC-09950 kodunu ara.",
      "Sistem: Uygun urun karti bulundu, stok ve fiyat goruntulendi.",
      "Personel: Hemen sepete ekle.",
      "Sistem: Urun satis sepetine eklendi.",
    ],
    [
      "Personal: Suche nach dem Code DRC-09950.",
      "System: Die passende Artikelkarte wurde gefunden; Bestand und Preis sind sichtbar.",
      "Personal: Direkt in den Warenkorb legen.",
      "System: Artikel wurde in den Verkaufswagen gelegt.",
    ],
    ["staff barkod roleplayi", "customer kod roleplayi", "staff hizli satis roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_barcode_print",
    ["barkod", "barcode", "etiket"],
    ["staff barkod roleplayi", "personel barkod yazdirma senaryosu"],
    ["staff rollenspiel barcode drucken", "personal barcode etikett"],
    "Role-play personel barkod yazdirma:",
    "Personal-Rollenspiel Barcode drucken:",
    [
      "Personel: Kart acik, barkodu PNG olarak al.",
      "Sistem: Barkod dosyasi uretildi.",
      "Personel: Etiket icin kullan.",
      "Sistem: Uygun cikti hazir.",
    ],
    [
      "Personal: Die Karte ist offen, hol den Barcode als PNG.",
      "System: Barcode-Datei wurde erzeugt.",
      "Personal: Fuer das Etikett verwenden.",
      "System: Passende Ausgabe ist bereit.",
    ],
    ["staff kodla arama roleplayi", "admin barkod roleplayi", "staff intake roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_alternative_stocked",
    ["alternatif", "muadil", "stoklu urun", "alternative"],
    ["staff alternatif roleplayi", "personel stoklu muadil onerme"],
    ["staff rollenspiel alternative artikel", "personal lagernde alternative anbieten"],
    "Role-play personel stoklu alternatif:",
    "Personal-Rollenspiel lagernde Alternative:",
    [
      "Personel: Musterinin istedigi urun stokta yok.",
      "Sistem: Benzer kategori ve markalardan stoklu alternatifleri listeler.",
      "Personel: En yakin secenegi sun.",
      "Sistem: Stok adedi ve satis fiyatiyla alternatif urun onerildi.",
    ],
    [
      "Personal: Der gewuenschte Artikel des Kunden ist nicht auf Lager.",
      "System: Lagernde Alternativen aus aehnlicher Kategorie und Marke werden gelistet.",
      "Personal: Biete die naechste passende Variante an.",
      "System: Alternative mit Bestand und Verkaufspreis vorgeschlagen.",
    ],
    ["customer alternatif roleplayi", "staff drc man roleplayi", "staff alman musteri roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_price_confirm",
    ["fiyat", "admin kontrol", "price confirm"],
    ["staff fiyat teyit roleplayi", "personel admin fiyat onayi isteme"],
    ["staff rollenspiel preis freigabe", "personal admin preis bestaetigung"],
    "Role-play personel fiyat teyidi:",
    "Personal-Rollenspiel Preisfreigabe:",
    [
      "Personel: Bu urunun fiyatı dusuk gorunuyor.",
      "Sistem: Admin fiyat kontrolu gerektigi notunu onerir.",
      "Personel: Satistan once teyit aliyorum.",
      "Sistem: Bu yaklasim dogrudur; fiyat teyidi olmadan maliyet bilgisi acilmaz.",
    ],
    [
      "Personal: Der Preis dieses Artikels wirkt zu niedrig.",
      "System: Ein Hinweis fuer Admin-Preispruefung wird empfohlen.",
      "Personal: Ich hole vor dem Verkauf eine Freigabe ein.",
      "System: Das ist korrekt; ohne Preisfreigabe werden keine internen Kostendaten geoeffnet.",
    ],
    ["admin maliyet roleplayi", "staff yetki siniri roleplayi", "staff hizli satis roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_handover",
    ["devir", "vardiya", "handover", "summary"],
    ["staff devir roleplayi", "personel vardiya devri senaryosu"],
    ["staff rollenspiel schichtuebergabe", "personal tagesuebergabe"],
    "Role-play personel vardiya devri:",
    "Personal-Rollenspiel Schichtuebergabe:",
    [
      "Personel: Vardiya sonunda acik siparisleri, kritik stoklari ve kasayi ozetle.",
      "Sistem: Kisa operasyon ozeti hazirlar.",
      "Personel: Sonraki vardiyaya not birak.",
      "Sistem: Devir notu icin uygun maddeler sunuldu.",
    ],
    [
      "Personal: Fasse am Schichtende offene Bestellungen, kritische Bestaende und Kasse zusammen.",
      "System: Eine kurze Betriebsuebersicht wird erstellt.",
      "Personal: Hinterlasse eine Notiz fuer die naechste Schicht.",
      "System: Geeignete Punkte fuer die Uebergabe wurden vorbereitet.",
    ],
    ["staff dusuk stok roleplayi", "staff siparis durum roleplayi", "staff kasa roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_german_counter",
    ["almanca", "deutsch", "counter", "customer"],
    ["staff alman musteri roleplayi", "personel almanca tezgah senaryosu"],
    ["staff rollenspiel deutscher kunde", "personal deutscher tresenkunde"],
    "Role-play personel Almanca musteri:",
    "Personal-Rollenspiel deutscher Kunde:",
    [
      "Personel: Musteri Almanca fiyat ve stok soruyor.",
      "Sistem: Kisa, net ve satis odakli Almanca cevap hazirlar.",
      "Personel: Sonra siparis notunu da Almanca al.",
      "Sistem: Almanca siparis akisina uygun metinle devam eder.",
    ],
    [
      "Personal: Ein Kunde fragt auf Deutsch nach Preis und Bestand.",
      "System: Eine kurze, klare und verkaufsorientierte Antwort auf Deutsch wird vorbereitet.",
      "Personal: Nimm danach auch die Bestellnotiz auf Deutsch auf.",
      "System: Der Ablauf wird mit passendem deutschem Bestelltext fortgesetzt.",
    ],
    ["customer almanca urun roleplayi", "staff teklif pdf roleplayi", "staff alternatif roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_intake",
    ["intake", "yeni urun", "ilk stok"],
    ["staff intake roleplayi", "personel yeni urun ilk stok girisi"],
    ["staff rollenspiel neuer artikel", "personal neuer artikel mit erstbestand"],
    "Role-play personel yeni urun ilk stok:",
    "Personal-Rollenspiel neuer Artikel mit Erstbestand:",
    [
      "Personel: Sistemde olmayan yeni bir marka geldi.",
      "Sistem: Yeni Urun + Ilk Stok Girisi formu acilir.",
      "Personel: Karti ve ilk miktari kaydet.",
      "Sistem: Urun olusur ve ilk stok hareketi yazilir.",
    ],
    [
      "Personal: Eine neue Marke ist eingetroffen und noch nicht im System.",
      "System: Das Formular Neuer Artikel + Erstbestand wird geoeffnet.",
      "Personal: Speichere Karte und erste Menge.",
      "System: Artikel wird angelegt und die erste Lagerbewegung geschrieben.",
    ],
    ["staff stok giris roleplayi", "admin intake roleplayi", "staff kodla arama roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_no_expense",
    ["masraf", "expense", "yetki yok", "forbidden"],
    ["staff masraf yetki roleplayi", "personel masraf ekleyememe senaryosu"],
    ["staff rollenspiel ausgabe verboten", "personal darf keine ausgabe anlegen"],
    "Role-play personel yetki siniri masraf:",
    "Personal-Rollenspiel Ausgaben-Sperre:",
    [
      "Personel: Masraf eklemeye calisiyorum.",
      "Sistem: Bu alan sadece admin icindir.",
      "Personel: Ne yapmaliyim?",
      "Sistem: Gideri admin'e bildirin; isterseniz mesaj kutusundan talep gonderebilirsiniz.",
    ],
    [
      "Personal: Ich versuche eine Ausgabe anzulegen.",
      "System: Dieser Bereich ist nur fuer Admin freigegeben.",
      "Personal: Was soll ich tun?",
      "System: Melden Sie die Ausgabe an den Admin; auf Wunsch koennen Sie eine Nachricht ueber das Nachrichtenfach senden.",
    ],
    ["staff admin mesaj roleplayi", "admin masraf roleplayi", "staff yetki siniri roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_drc_man",
    ["drc man", "urun sor", "stok sor", "assistant"],
    ["staff drc man roleplayi", "personel drc man ile urun bulma"],
    ["staff rollenspiel drc man", "personal drc man produktsuche"],
    "Role-play personel DRC MAN kullanimi:",
    "Personal-Rollenspiel DRC MAN Nutzung:",
    [
      "Personel: DRC MAN, DCB31 stok ve fiyat nedir?",
      "Sistem: Uygun urunu bulur ve stokla satis fiyatini verir.",
      "Personel: Alis fiyatini da ver.",
      "Sistem: Personel modunda maliyet bilgisi acilmaz; bu bilgi admin icindir.",
    ],
    [
      "Personal: DRC MAN, wie sind Bestand und Preis fuer DCB31?",
      "System: Der passende Artikel wird gefunden und Bestand sowie Verkaufspreis werden genannt.",
      "Personal: Nenne mir auch den Einkaufspreis.",
      "System: Im Personalmodus werden keine Kostendaten freigegeben; das ist Admin-Bereich.",
    ],
    ["admin drc man politika roleplayi", "staff fiyat teyit roleplayi", "customer fiyat paket roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_low_stock",
    ["kritik stok", "low stock", "admin mesaj"],
    ["staff dusuk stok roleplayi", "personel kritik stok bildirimi"],
    ["staff rollenspiel kritischer bestand", "personal admin wegen niedrigem bestand informieren"],
    "Role-play personel kritik stok bildirimi:",
    "Personal-Rollenspiel niedriger Bestand:",
    [
      "Personel: R449A kritik seviyeye yaklasti.",
      "Sistem: Kritik stok listesine girer ve admin'e mesaj atmanizi onerir.",
      "Personel: Mesaj gonder.",
      "Sistem: Admin kutusuna istek/uyari kaydi olusturuldu.",
    ],
    [
      "Personal: R449A naehert sich dem kritischen Bestand.",
      "System: Der Artikel kommt in die Kritisch-Liste und empfiehlt eine Nachricht an den Admin.",
      "Personal: Nachricht senden.",
      "System: Ein Wunsch-/Warnhinweis wurde im Admin-Postfach angelegt.",
    ],
    ["staff admin mesaj roleplayi", "admin siparis onay roleplayi", "staff devir roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_admin_message",
    ["admin mesaj", "message", "sikayet", "istek"],
    ["staff admin mesaj roleplayi", "personel admina mesaj gonderme"],
    ["staff rollenspiel admin nachricht", "personal admin nachricht senden"],
    "Role-play personel admina mesaj:",
    "Personal-Rollenspiel Nachricht an Admin:",
    [
      "Personel: Urun fiyatinda sorun var, admina yaz.",
      "Sistem: Tur, baslik ve mesaj alani acilir.",
      "Personel: Oneri olarak gonder.",
      "Sistem: Mesaj admin kutusuna kaydedildi ve durum yeni olarak isaretlendi.",
    ],
    [
      "Personal: Es gibt ein Problem beim Artikelpreis, sende eine Nachricht an den Admin.",
      "System: Typ, Betreff und Nachricht werden abgefragt.",
      "Personal: Als Vorschlag absenden.",
      "System: Nachricht wurde im Admin-Postfach gespeichert und als neu markiert.",
    ],
    ["admin mesaj roleplayi", "staff masraf yetki roleplayi", "staff dusuk stok roleplayi"]
  ),
  scenario(
    TOPIC_STAFF,
    "staff_permission_boundary",
    ["yetki", "permission", "sinir", "boundary"],
    ["staff yetki siniri roleplayi", "personel hangi bilgiye erisemez"],
    ["staff rollenspiel rechte grenze", "personal welche daten sind gesperrt"],
    "Role-play personel yetki siniri:",
    "Personal-Rollenspiel Rechte-Grenze:",
    [
      "Personel: Tum kullanici listesini ve maliyetleri ac.",
      "Sistem: Bu bilgi admin seviyesindedir.",
      "Personel: O zaman bana ne acik?",
      "Sistem: Satis, stok, teklif, siparis ve kasa islemleri aciktir; gizli maliyet ve kullanici yonetimi kapali kalir.",
    ],
    [
      "Personal: Oeffne die komplette Benutzerliste und alle Kosten.",
      "System: Diese Informationen sind nur fuer Admin freigegeben.",
      "Personal: Was ist dann fuer mich offen?",
      "System: Verkauf, Lager, Angebot, Bestellung und Kasse sind offen; interne Kosten und Benutzerverwaltung bleiben gesperrt.",
    ],
    ["admin yetki roleplayi", "staff drc man roleplayi", "customer gizli fiyat roleplayi"]
  ),
];

const customerScenarios = [
  scenario(
    TOPIC_CUSTOMER,
    "customer_menu",
    ["musteri", "customer", "menu", "liste"],
    ["musteri roleplayleri ver", "musteri rol oyunu menusu", "musteri senaryolari goster"],
    ["zeige kunden rollenspiele", "kunden rollenspiel menue", "kunden szenarien zeigen"],
    "Role-play musteri menu:",
    "Kunden-Rollenspiel-Menue:",
    [
      "Bu pakette urun sorma, fiyat-paket bilgisi alma, siparis verme, sifre sifirlama ve destek isteme gibi 20 musteri senaryosu vardir.",
      "Ornegin 'musteri siparis roleplayi' diyerek ilerleyebilirsiniz.",
    ],
    [
      "Dieses Paket enthaelt 20 Kunden-Szenarien wie Produktanfrage, Preis-/Verpackungsinfo, Bestellung, Passwort-Reset und Support.",
      "Sie koennen zum Beispiel mit 'Kunden Rollenspiel Bestellung' fortfahren.",
    ],
    ["musteri stok roleplayi", "musteri fiyat paket roleplayi", "musteri siparis roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_stock_query",
    ["stok", "stock", "bestand"],
    ["musteri stok roleplayi", "musteri urun stok sorma senaryosu"],
    ["kunden rollenspiel bestand", "kunde fragt nach lagerbestand"],
    "Role-play musteri stok sorusu:",
    "Kunden-Rollenspiel Bestandsfrage:",
    [
      "Musteri: R290 gazi stokta var mi?",
      "Sistem: Evet, urun aktif ve stokta mevcut.",
      "Musteri: Kac adet var?",
      "Sistem: Mevcut stok adedini ve birimini gosterir.",
    ],
    [
      "Kunde: Ist R290 Gas auf Lager?",
      "System: Ja, der Artikel ist aktiv und verfuegbar.",
      "Kunde: Wie viel ist vorhanden?",
      "System: Zeigt den aktuellen Bestand mit Einheit an.",
    ],
    ["musteri fiyat paket roleplayi", "musteri siparis roleplayi", "customer restock roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_price_pack",
    ["fiyat", "paket", "price", "packaging"],
    ["musteri fiyat paket roleplayi", "musteri fiyat ve ambalaj bilgisi senaryosu"],
    ["kunden rollenspiel preis verpackung", "kunde fragt preis und verpackung"],
    "Role-play musteri fiyat ve paket:",
    "Kunden-Rollenspiel Preis und Verpackung:",
    [
      "Musteri: Errecom Endustriyel POE 68 kac euro ve kac litrelik?",
      "Sistem: Net satis ve 1 adet liste fiyatini gosterir; detay alaninda 20 Lt endustriyel bidon bilgisini verir.",
      "Musteri: Tamam, siparis vermek istiyorum.",
      "Sistem: Siparis sepetine yonlendirir.",
    ],
    [
      "Kunde: Wie viel kostet das industrielle Errecom POE 68 und wie gross ist die Verpackung?",
      "System: Zeigt Nettoverkauf und Listenpreis fuer 1 Stk.; im Detail steht 20-Liter-Industriegebinde.",
      "Kunde: Gut, ich moechte bestellen.",
      "System: Leitet in den Bestellkorb weiter.",
    ],
    ["musteri siparis roleplayi", "musteri kod roleplayi", "musteri almanca urun roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_order_create",
    ["siparis", "order", "bestellung"],
    ["musteri siparis roleplayi", "musteri siparis verme senaryosu"],
    ["kunden rollenspiel bestellung", "kunde gibt bestellung auf"],
    "Role-play musteri siparis verme:",
    "Kunden-Rollenspiel Bestellung:",
    [
      "Musteri: DCB31 ve R449A istiyorum.",
      "Sistem: Urunleri siparis sepetine ekler.",
      "Musteri: Not olarak yarin teslim yaz.",
      "Sistem: Siparisi olusturur ve durumu beklemede olarak gosterir.",
    ],
    [
      "Kunde: Ich moechte DCB31 und R449A bestellen.",
      "System: Legt die Artikel in den Bestellkorb.",
      "Kunde: Bitte als Notiz morgen liefern.",
      "System: Erstellt die Bestellung und zeigt den Status als offen an.",
    ],
    ["musteri siparis notu roleplayi", "musteri siparis durum roleplayi", "customer cancellation roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_order_note",
    ["siparis notu", "note", "teslimat"],
    ["musteri siparis notu roleplayi", "musteri teslimat notu ekleme"],
    ["kunden rollenspiel bestellnotiz", "kunde fuegt liefernotiz hinzu"],
    "Role-play musteri siparis notu:",
    "Kunden-Rollenspiel Bestellnotiz:",
    [
      "Musteri: Siparise teslimat notu eklemek istiyorum.",
      "Sistem: Siparis notu alani aciktir.",
      "Musteri: Depoya birakilsin yaz.",
      "Sistem: Not siparise eklendi ve kaydedildi.",
    ],
    [
      "Kunde: Ich moechte eine Liefernotiz zur Bestellung hinzufuegen.",
      "System: Das Feld fuer die Bestellnotiz ist offen.",
      "Kunde: Bitte im Lager ablegen.",
      "System: Die Notiz wurde zur Bestellung gespeichert.",
    ],
    ["musteri siparis roleplayi", "musteri siparis durum roleplayi", "musteri destek roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_order_status",
    ["siparis durum", "status", "tracking"],
    ["musteri siparis durum roleplayi", "musteri siparis takibi senaryosu"],
    ["kunden rollenspiel bestellstatus", "kunde verfolgt bestellung"],
    "Role-play musteri siparis durumu:",
    "Kunden-Rollenspiel Bestellstatus:",
    [
      "Musteri: Siparisim ne durumda?",
      "Sistem: Kendi siparis gecmisini ve guncel durumunu gosterir.",
      "Musteri: Ben durumu degistirebilir miyim?",
      "Sistem: Hayir, durum guncellemesi personel veya admin tarafindan yapilir.",
    ],
    [
      "Kunde: Wie ist der Status meiner Bestellung?",
      "System: Zeigt den eigenen Bestellverlauf und den aktuellen Status.",
      "Kunde: Kann ich den Status selbst aendern?",
      "System: Nein, Statusaenderungen werden nur von Personal oder Admin vorgenommen.",
    ],
    ["staff siparis durum roleplayi", "musteri iptal roleplayi", "musteri siparis roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_register",
    ["kayit", "register", "konto ac"],
    ["musteri kayit roleplayi", "musteri hesap acma senaryosu"],
    ["kunden rollenspiel registrierung", "kunde konto anlegen"],
    "Role-play musteri kayit:",
    "Kunden-Rollenspiel Registrierung:",
    [
      "Musteri: Yeni hesap acmak istiyorum.",
      "Sistem: Ad soyad, e-posta, telefon, kullanici adi ve sifre ister.",
      "Musteri: Formu gonder.",
      "Sistem: Musteri hesabi olusturulur ve giris yapabilir hale gelir.",
    ],
    [
      "Kunde: Ich moechte ein neues Konto anlegen.",
      "System: Fordert Name, E-Mail, Telefon, Benutzername und Passwort an.",
      "Kunde: Formular absenden.",
      "System: Das Kundenkonto wird erstellt und ist loginbereit.",
    ],
    ["musteri sifre roleplayi", "musteri siparis roleplayi", "musteri destek roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_password_reset",
    ["sifre", "password", "reset"],
    ["musteri sifre roleplayi", "musteri sifre sifirlama senaryosu"],
    ["kunden rollenspiel passwort reset", "kunde passwort zuruecksetzen"],
    "Role-play musteri sifre sifirlama:",
    "Kunden-Rollenspiel Passwort-Reset:",
    [
      "Musteri: Sifremi unuttum.",
      "Sistem: Kullanici adi veya e-posta ile yenileme talebini alir.",
      "Musteri: Yeni sifreyi belirlemek istiyorum.",
      "Sistem: Guvenli baglanti ile yeni sifre kaydedilir.",
    ],
    [
      "Kunde: Ich habe mein Passwort vergessen.",
      "System: Nimmt die Reset-Anfrage per Benutzername oder E-Mail an.",
      "Kunde: Ich moechte ein neues Passwort setzen.",
      "System: Das neue Passwort wird ueber den sicheren Link gespeichert.",
    ],
    ["musteri kayit roleplayi", "admin musteri hesap destek roleplayi", "musteri giris sorun roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_compare",
    ["karsilastir", "compare", "vergleich"],
    ["musteri karsilastirma roleplayi", "musteri iki urun karsilastirma"],
    ["kunden rollenspiel vergleich", "kunde vergleicht zwei artikel"],
    "Role-play musteri urun karsilastirma:",
    "Kunden-Rollenspiel Artikelvergleich:",
    [
      "Musteri: DCB31 ile baska bir kontroloru karsilastir.",
      "Sistem: Marka, kategori, stok ve satis fiyati acisindan temel karsilastirma sunar.",
      "Musteri: Hangisi stokta?",
      "Sistem: Stokta olan secenekleri one cikarir.",
    ],
    [
      "Kunde: Vergleiche DCB31 mit einem anderen Regler.",
      "System: Bietet einen Grundvergleich zu Marke, Kategorie, Bestand und Verkaufspreis.",
      "Kunde: Welcher ist verfuegbar?",
      "System: Hebt die lagernden Optionen hervor.",
    ],
    ["musteri stok roleplayi", "musteri fiyat paket roleplayi", "musteri alternatif roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_alternative",
    ["alternatif", "alternative", "muadil"],
    ["musteri alternatif roleplayi", "musteri stokta olmayan urune alternatif"],
    ["kunden rollenspiel alternative", "kunde fragt nach alternative"],
    "Role-play musteri alternatif urun:",
    "Kunden-Rollenspiel Alternative:",
    [
      "Musteri: Istedigim urun stokta yok.",
      "Sistem: Stoklu benzer urunleri ve fiyatlarini listeler.",
      "Musteri: En yakin secenegi goster.",
      "Sistem: Uygun alternatif sepete eklenebilir sekilde sunulur.",
    ],
    [
      "Kunde: Mein gewuenschter Artikel ist nicht auf Lager.",
      "System: Listet aehnliche verfuegbare Artikel mit Preisen auf.",
      "Kunde: Zeig mir die naechste passende Option.",
      "System: Eine geeignete Alternative wird bestellbereit angeboten.",
    ],
    ["staff alternatif roleplayi", "musteri karsilastirma roleplayi", "musteri siparis roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_german_info",
    ["almanca", "deutsch", "produkt"],
    ["musteri almanca urun roleplayi", "musteri almanca urun sorma"],
    ["kunden rollenspiel deutscher produkttext", "kunde fragt auf deutsch nach produkt"],
    "Role-play musteri Almanca urun sorusu:",
    "Kunden-Rollenspiel deutsche Produktanfrage:",
    [
      "Musteri: Ich brauche Preis und Bestand fuer DCB31.",
      "Sistem: Almanca olarak fiyat, stok ve kategori bilgisini verir.",
      "Musteri: Kann ich direkt bestellen?",
      "Sistem: Ja, der Artikel kann in den Bestellkorb gelegt werden.",
    ],
    [
      "Kunde: Ich brauche Preis und Bestand fuer DCB31.",
      "System: Gibt Preis, Bestand und Kategorie auf Deutsch an.",
      "Kunde: Kann ich direkt bestellen?",
      "System: Ja, der Artikel kann in den Bestellkorb gelegt werden.",
    ],
    ["staff alman musteri roleplayi", "musteri siparis roleplayi", "musteri fiyat paket roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_code_query",
    ["kod", "barcode", "code"],
    ["musteri kod roleplayi", "musteri stok kodu sorma"],
    ["kunden rollenspiel code", "kunde fragt nach artikelcode"],
    "Role-play musteri stok kodu sorusu:",
    "Kunden-Rollenspiel Artikelcode:",
    [
      "Musteri: Bu urunun stok kodu nedir?",
      "Sistem: Karttaki DRC kodunu gosterir.",
      "Musteri: Kodla arama yapabilir miyim?",
      "Sistem: Evet, arama kutusunda urun kodu ile eslesme yapilir.",
    ],
    [
      "Kunde: Wie lautet der Lagercode dieses Artikels?",
      "System: Zeigt den DRC-Code der Karte an.",
      "Kunde: Kann ich auch per Code suchen?",
      "System: Ja, die Suche findet Artikel auch ueber den Lagercode.",
    ],
    ["staff kodla arama roleplayi", "musteri stok roleplayi", "musteri fiyat paket roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_quantity",
    ["miktar", "quantity", "bestand", "adet"],
    ["musteri miktar roleplayi", "musteri stok adedi sorma"],
    ["kunden rollenspiel menge", "kunde fragt nach menge"],
    "Role-play musteri miktar sorusu:",
    "Kunden-Rollenspiel Mengenfrage:",
    [
      "Musteri: Kac adet var?",
      "Sistem: Stokta gorunen miktari birimiyle verir.",
      "Musteri: Kritik seviyenin altinda mi?",
      "Sistem: Genel stok durumunu soyleyebilir ama ic operasyon detayini acmaz.",
    ],
    [
      "Kunde: Wie viele Stueck sind da?",
      "System: Nennt die sichtbare Lagermenge mit Einheit.",
      "Kunde: Ist der Bestand unter der kritischen Grenze?",
      "System: Kann den allgemeinen Lagerstatus nennen, aber keine internen Betriebsdetails freigeben.",
    ],
    ["musteri stok roleplayi", "musteri siparis roleplayi", "customer restock roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_quote_request",
    ["teklif", "angebot", "quote request"],
    ["musteri teklif talep roleplayi", "musteri teklif isteme senaryosu"],
    ["kunden rollenspiel angebot anfragen", "kunde moechte angebot"],
    "Role-play musteri teklif talebi:",
    "Kunden-Rollenspiel Angebotsanfrage:",
    [
      "Musteri: Siparis yerine once teklif istiyorum.",
      "Sistem: Urunleri secip teklif talebi icin sepete yonlendirir.",
      "Musteri: PDF alabilir miyim?",
      "Sistem: Kaydedilen teklif icin uygun dilde PDF hazirlanabilir.",
    ],
    [
      "Kunde: Ich moechte zuerst ein Angebot statt direkt zu bestellen.",
      "System: Leitet zur Artikelauswahl und Angebotsanfrage weiter.",
      "Kunde: Kann ich ein PDF bekommen?",
      "System: Fuer ein gespeichertes Angebot kann ein PDF in passender Sprache erstellt werden.",
    ],
    ["staff teklif roleplayi", "admin teklif pdf roleplayi", "musteri siparis roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_support_message",
    ["destek", "iletisim", "contact", "message"],
    ["musteri destek roleplayi", "musteri admina mesaj gonderme"],
    ["kunden rollenspiel support", "kunde sendet nachricht an admin"],
    "Role-play musteri destek mesaji:",
    "Kunden-Rollenspiel Support-Nachricht:",
    [
      "Musteri: Siparisimle ilgili admina mesaj gondermek istiyorum.",
      "Sistem: Kategori, baslik ve mesaj alani acilir.",
      "Musteri: Talebi gonder.",
      "Sistem: Mesaj admin kutusuna kaydedildi.",
    ],
    [
      "Kunde: Ich moechte dem Admin eine Nachricht zu meiner Bestellung senden.",
      "System: Kategorie, Betreff und Nachricht werden geoeffnet.",
      "Kunde: Anfrage absenden.",
      "System: Die Nachricht wurde im Admin-Postfach gespeichert.",
    ],
    ["admin mesaj roleplayi", "staff admin mesaj roleplayi", "musteri siparis durum roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_basic_technical",
    ["teknik", "basic", "grundlegend"],
    ["musteri teknik temel roleplayi", "musteri urun ne ise yarar senaryosu"],
    ["kunden rollenspiel technische basis", "kunde fragt wofuer artikel ist"],
    "Role-play musteri temel teknik soru:",
    "Kunden-Rollenspiel technische Basisfrage:",
    [
      "Musteri: DCB31 ne ise yarar?",
      "Sistem: Urunun temel gorevini kisa ve sade aciklar.",
      "Musteri: Daha detayli teknik istersem?",
      "Sistem: Genel teknik yardim verir ama gizli servis verisi veya ic not acmaz.",
    ],
    [
      "Kunde: Wofuer ist DCB31 gedacht?",
      "System: Erklaert die Grundfunktion des Artikels kurz und klar.",
      "Kunde: Was ist, wenn ich mehr technische Details brauche?",
      "System: Gibt allgemeine technische Hilfe, aber keine internen Service- oder Geheimdaten.",
    ],
    ["musteri almanca urun roleplayi", "staff drc man roleplayi", "admin drc man politika roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_history_privacy",
    ["gecmis", "history", "privacy", "other users"],
    ["musteri gecmis gizlilik roleplayi", "musteri sadece kendi gecmisini gorme"],
    ["kunden rollenspiel datenschutz historie", "kunde sieht nur eigene historie"],
    "Role-play musteri gecmis gizliligi:",
    "Kunden-Rollenspiel Datenschutz im Verlauf:",
    [
      "Musteri: Diger musterilerin siparislerini gorebilir miyim?",
      "Sistem: Hayir, sadece kendi siparis gecmisiniz ve kendi hesabiniz gorunur.",
      "Musteri: Bu guvenli mi?",
      "Sistem: Evet, musteri gorunumu diger kullanicilarin verilerini acmaz.",
    ],
    [
      "Kunde: Kann ich die Bestellungen anderer Kunden sehen?",
      "System: Nein, sichtbar sind nur der eigene Bestellverlauf und das eigene Konto.",
      "Kunde: Ist das sicher?",
      "System: Ja, die Kundenansicht oeffnet keine Daten anderer Benutzer.",
    ],
    ["musteri siparis durum roleplayi", "admin yetki roleplayi", "musteri destek roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_cancel_request",
    ["iptal", "cancel", "storno"],
    ["musteri iptal roleplayi", "musteri siparis iptal talebi"],
    ["kunden rollenspiel stornierung", "kunde bittet um bestellstorno"],
    "Role-play musteri iptal talebi:",
    "Kunden-Rollenspiel Stornoanfrage:",
    [
      "Musteri: Siparisimi iptal etmek istiyorum.",
      "Sistem: Musteri kendi durumunu degistiremez; destek mesaji veya admin/personel onayi gerekir.",
      "Musteri: Talep gondereyim.",
      "Sistem: Mesaj kutusu uzerinden iptal talebi yonlendirilir.",
    ],
    [
      "Kunde: Ich moechte meine Bestellung stornieren.",
      "System: Der Kunde kann den Status nicht selbst aendern; eine Nachricht an Admin/Personal ist noetig.",
      "Kunde: Dann sende ich eine Anfrage.",
      "System: Die Stornoanfrage wird ueber das Nachrichtenfach weitergeleitet.",
    ],
    ["musteri destek roleplayi", "musteri siparis durum roleplayi", "staff siparis durum roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_discount_boundary",
    ["indirim", "discount", "alis fiyat", "cost"],
    ["musteri gizli fiyat roleplayi", "musteri indirim ve alis fiyat siniri"],
    ["kunden rollenspiel rabatt grenze", "kunde fragt nach einkaufspreis"],
    "Role-play musteri fiyat siniri:",
    "Kunden-Rollenspiel Preisgrenze:",
    [
      "Musteri: Alis fiyatini ve kar marjini soyle.",
      "Sistem: Musteri modunda sadece satis fiyati ve stok durumu paylasilir.",
      "Musteri: Peki indirim isteyebilir miyim?",
      "Sistem: Satis fiyatina gore talep iletilebilir ama ic maliyet verisi acilmaz.",
    ],
    [
      "Kunde: Nenne mir Einkaufspreis und Marge.",
      "System: In der Kundenansicht werden nur Verkaufspreis und Lagerstatus gezeigt.",
      "Kunde: Kann ich trotzdem einen Rabatt anfragen?",
      "System: Eine Anfrage auf Basis des Verkaufspreises ist moeglich, interne Kostendaten bleiben gesperrt.",
    ],
    ["admin drc man politika roleplayi", "staff fiyat teyit roleplayi", "musteri teklif talep roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_restock",
    ["ne zaman gelir", "restock", "termin"],
    ["musteri ne zaman gelir roleplayi", "musteri tekrar stok sorusu"],
    ["kunden rollenspiel restock", "kunde fragt nach naechster lieferung"],
    "Role-play musteri tekrar stok sorusu:",
    "Kunden-Rollenspiel Restock-Frage:",
    [
      "Musteri: Bu urun ne zaman tekrar gelir?",
      "Sistem: Kesin tarih yoksa bunu net soylemez; stokta varsa hemen siparise yonlendirir, yoksa destek talebi onerir.",
      "Musteri: Haber almak istiyorum.",
      "Sistem: Admina mesaj gonderme veya siparis notu ile talep birakma onerilir.",
    ],
    [
      "Kunde: Wann kommt dieser Artikel wieder rein?",
      "System: Ohne gesicherten Termin wird kein fester Lieferzeitpunkt genannt; bei Verfuegbarkeit geht es direkt zur Bestellung, sonst zur Supportanfrage.",
      "Kunde: Ich moechte informiert werden.",
      "System: Es wird empfohlen, eine Nachricht an den Admin zu senden oder eine Bestellnotiz zu hinterlassen.",
    ],
    ["musteri destek roleplayi", "musteri alternatif roleplayi", "musteri stok roleplayi"]
  ),
  scenario(
    TOPIC_CUSTOMER,
    "customer_login_issue",
    ["giris sorunu", "login issue", "account access"],
    ["musteri giris sorun roleplayi", "musteri hesabima giremiyorum senaryosu"],
    ["kunden rollenspiel login problem", "kunde kommt nicht ins konto"],
    "Role-play musteri giris sorunu:",
    "Kunden-Rollenspiel Login-Problem:",
    [
      "Musteri: Hesabima giremiyorum.",
      "Sistem: Once kullanici adi veya e-posta kontrol edilir; gerekirse sifre yenileme akisi onerilir.",
      "Musteri: Hala olmazsa?",
      "Sistem: Destek mesaji veya iletisim bilgisiyle admin yonlendirmesi sunulur.",
    ],
    [
      "Kunde: Ich komme nicht in mein Konto.",
      "System: Zuerst werden Benutzername oder E-Mail geprueft; bei Bedarf wird der Passwort-Reset empfohlen.",
      "Kunde: Und wenn es trotzdem nicht geht?",
      "System: Dann wird eine Supportnachricht oder die Weiterleitung an den Admin angeboten.",
    ],
    ["musteri sifre roleplayi", "admin musteri hesap destek roleplayi", "musteri kayit roleplayi"]
  ),
];

function buildRows(entries) {
  const rows = [];

  entries.forEach((entry) => {
    const trQuestions = Array.isArray(entry.trQuestions) ? entry.trQuestions : [];
    const deQuestions = Array.isArray(entry.deQuestions) ? entry.deQuestions : [];
    const variantCount = Math.max(trQuestions.length, deQuestions.length);

    for (let index = 0; index < variantCount; index += 1) {
      const trQuestion = cleanText(trQuestions[index] || trQuestions[0]);
      const deQuestion = cleanText(deQuestions[index] || deQuestions[0]);
      if (!trQuestion && !deQuestion) {
        continue;
      }

      rows.push({
        topic: entry.topic,
        audience: entry.audience,
        keywords: entry.keywords
          .map((value) => normalizeText(value))
          .filter(Boolean)
          .filter((value, currentIndex, items) => items.indexOf(value) === currentIndex)
          .join(" "),
        trQuestion,
        trAnswer: entry.trAnswer,
        deQuestion,
        deAnswer: entry.deAnswer,
        suggestions: Array.isArray(entry.suggestions) ? entry.suggestions.slice(0, 4) : [],
      });
    }
  });

  return rows;
}

function writeExports(rows) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const summaryPath = path.join(EXPORT_DIR, "drc_man_roleplay_summary.json");
  const markdownPath = path.join(EXPORT_DIR, "drc_man_roleplay_preview.md");

  const grouped = rows.reduce((accumulator, row) => {
    accumulator[row.topic] = (accumulator[row.topic] || 0) + 1;
    return accumulator;
  }, {});

  fs.writeFileSync(summaryPath, JSON.stringify({ dbRows: rows.length, topics: grouped }, null, 2), "utf8");

  const lines = ["# DRC MAN Role-Play Bank", ""];
  Object.entries(grouped).forEach(([topic, count]) => {
    lines.push(`- ${topic}: ${count} satir`);
  });
  lines.push("");
  rows.slice(0, 12).forEach((row, index) => {
    lines.push(`## Ornek ${index + 1}`);
    lines.push(`Konu: ${row.topic}`);
    lines.push(`TR: ${row.trQuestion}`);
    lines.push(`DE: ${row.deQuestion}`);
    lines.push("");
  });
  fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`, "utf8");

  return { summaryPath, markdownPath };
}

async function main() {
  loadEnv(path.join(process.cwd(), ".env"));
  const { initDatabase, get, withTransaction } = require("../server/db");

  const entries = [...adminScenarios, ...staffScenarios, ...customerScenarios];
  const rows = buildRows(entries);

  await initDatabase();
  const admin = await get("SELECT id FROM users WHERE role = ? ORDER BY id ASC LIMIT 1", ["admin"]);
  const createdByUserId = admin?.id ? Number(admin.id) : null;

  await withTransaction(async (tx) => {
    await tx.execute("DELETE FROM agent_training WHERE topic IN (?, ?, ?)", [TOPIC_ADMIN, TOPIC_STAFF, TOPIC_CUSTOMER]);

    for (const row of rows) {
      await tx.execute(
        `
          INSERT INTO agent_training (
            topic,
            audience,
            keywords,
            tr_question,
            tr_answer,
            de_question,
            de_answer,
            suggestions,
            is_active,
            created_by_user_id,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [
          row.topic,
          row.audience,
          row.keywords,
          row.trQuestion,
          row.trAnswer,
          row.deQuestion,
          row.deAnswer,
          JSON.stringify(row.suggestions),
          1,
          createdByUserId,
        ]
      );
    }
  });

  const exports = writeExports(rows);
  console.log(JSON.stringify({
    ok: true,
    topics: [TOPIC_ADMIN, TOPIC_STAFF, TOPIC_CUSTOMER],
    sourceScenarios: entries.length,
    dbRows: rows.length,
    exports,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
