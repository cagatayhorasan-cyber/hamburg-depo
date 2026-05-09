"use strict";
/**
 * DRC MAN için "YAPMA" kuralları (guardrails) bilgi havuzu.
 *
 * Bot'un yaşadığı somut hatalardan ders çıkararak ne yapmaması gerektiğini
 * öğretir. context_id="drc_man_guardrails" altında troubleshooting_bank'e
 * yüklenir; her kural "Anti-pattern + Doğru davranış" formatında.
 *
 * Çıktı: scripts/drc_man_guardrails_faq.json
 */

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "drc_man_guardrails_faq.json");

const RULES = [
  // === GİZLİLİK / İÇ NOTLAR ===
  {
    id: "guard_no_internal_notes",
    family: "privacy",
    keywords: ["plan a", "plan b", "internal", "konsolidasyon", "[2026", "cost", "markup"],
    tr_subject: "iç plan/maliyet/konsolidasyon notlarını müşteri cevabında paylaşmamalısın",
    de_subject: "interne Plan-/Kosten-/Konsolidierungsnotizen sollst du dem Kunden nicht zeigen",
    tr_answer: "YAPMA: Cevapta '[Plan A]', '[Plan B]', '[2026-MM-DD ...]', 'cost=', 'markup=', 'konsolidasyon', '#X buraya birleştirildi' gibi iç notları kullanma. Bu metinler admin için tutulan internal kayıtlardır. YAP: Müşteriye sadece teknik açıklama (kapasite, ölçü, marka, fiyat bantı) ver.",
    de_answer: "NICHT: Verwende keine internen Notizen wie '[Plan A]', '[Plan B]', '[2026-...]', 'cost=', 'markup=', 'konsolidasyon', '#X buraya birlestirildi' in der Kundenantwort. Diese sind nur fuer Admin gedacht. STATTDESSEN: Nur die technische Beschreibung (Kapazitaet, Mass, Marke, Preisband) zeigen.",
  },
  {
    id: "guard_no_cost_to_customer",
    family: "privacy",
    keywords: ["alış fiyatı", "alis fiyati", "cost", "default_price", "maliyet"],
    tr_subject: "müşteriye alış fiyatı / maliyet bilgisi gösterme",
    de_subject: "dem Kunden Einkaufspreis/Kostenbasis nicht zeigen",
    tr_answer: "YAPMA: Customer rolündeki kullanıcıya 'alış fiyatı', 'maliyet', 'default_price', '×3.0 markup' gibi iç bilgileri verme. Yalnızca 'satış fiyatı', 'liste fiyatı', 'net' bantları paylaş. YAP: Fiyat sorulduğunda salePrice ve listPrice'ı (gerekirse KDV bandıyla) anlat.",
    de_answer: "NICHT: Einkaufspreis/Kostenbasis/Markup-Werte einem Kundenkonto nicht offenlegen. STATTDESSEN: Nur Verkaufspreis und Listenpreis (ggf. mit MwSt-Hinweis) nennen.",
  },

  // === YANLIŞ INTENT ===
  {
    id: "guard_dimension_is_room",
    family: "intent",
    keywords: ["3x3", "4x5", "5x4x3", "yükseklik", "metre", "boyut", "oda", "soğuk oda"],
    tr_subject: "boyut bilgisi gelirse soğuk oda projesi okuması yap",
    de_subject: "wenn Maße angegeben sind, lies das als Kuehlraum-Projekt",
    tr_answer: "YAPMA: '3x3 yükseklik 5m artı oda' gibi boyut sorularına kablo, drenaj pompası veya alakasız parça önerme. YAP: 3-boyutlu ölçü tespit ettin mi (3x3x5, 3x3 yükseklik 5, taban 4x6 yükseklik 3) → cold_room_project moduna geç. Hesap: hacim, taban, U-değeri, panel kalınlığı, kapasite bandı, gaz seçeneği, kapı tipi, fiyat aralığı.",
    de_answer: "NICHT: Bei Maßangaben (3x3 Hoehe 5, Plus-Raum) keine Kabel/Pumpen/Ersatzteile vorschlagen. STATTDESSEN: 3D-Mass erkannt → cold_room_project Modus: Volumen, Bodenflaeche, U-Wert, Paneldicke, Kapazitaetsband, Gaswahl, Tuertyp, Preisband.",
  },
  {
    id: "guard_no_unrelated_alternative",
    family: "intent",
    keywords: ["alternatif", "yakın stoklu", "yakin stoklu"],
    tr_subject: "stok yokken alakasız ürünü alternatif olarak önerme",
    de_subject: "bei fehlendem Lagerbestand keine unverwandten Produkte als Alternative vorschlagen",
    tr_answer: "YAPMA: Müşteri 'soğuk oda' soruyor → 'kablo' veya 'priz' alternatifi sunma. Aynı kategoride değilse alternatif değildir. YAP: Aynı kategori/marka/seri içinde stoklu var mı bak. Yoksa 'yakın stoklu adaylar' listele. Kategori dışıysa 'tedarik 1-2 hafta' de.",
    de_answer: "NICHT: Bei 'Kuehlraum'-Anfrage keine 'Kabel'/'Steckdose' als Alternative anbieten. STATTDESSEN: Nur in derselben Kategorie/Marke/Serie suchen. Sonst: 'Lieferzeit 1-2 Wochen' sagen.",
  },

  // === ÜRÜN KART HİJYENİ ===
  {
    id: "guard_no_duplicate_cards",
    family: "data",
    keywords: ["duplicate", "tekrar", "aynı kart"],
    tr_subject: "aynı ürün için yeni kart oluşturma — mevcut kartı güncelle",
    de_subject: "fuer dasselbe Produkt keine neue Karte anlegen — bestehende aktualisieren",
    tr_answer: "YAPMA: 'Embraco NEU6220GK' gibi aynı model için 2. aktif kart oluşturma. YAP: Stok kodu (DRC-XXXXX) ya da marka+model lower-case karşılaştır; varsa o karta movement (entry/exit) ekle. Eski/yanlış kart varsa is_active=false yap, stoğu 0'a çek.",
    de_answer: "NICHT: Fuer dasselbe Modell keine zweite aktive Karte anlegen. STATTDESSEN: Per Stockcode oder Marke+Modell pruefen; vorhandener Karte movement hinzufuegen. Alte falsche Karte deaktivieren (is_active=false), Bestand auf 0 setzen.",
  },
  {
    id: "guard_image_must_match_product",
    family: "data",
    keywords: ["resim", "görsel", "image", "yanlış resim"],
    tr_subject: "ürünle alakasız resim atama — görsel ürünü temsil etmeli",
    de_subject: "kein Produkt-fremdes Bild zuweisen — das Bild muss das Produkt darstellen",
    tr_answer: "YAPMA: 'TTR kablo'ya 'NYA tek damarlı' resmi, 'Sanhua sight glass'a 'Sanhua filtre' resmi, 'Bakır boru'ya 'PE polyethylene' resmi atama. YAP: Marka+seri tutarlı temsili görsel kullan (örn. tüm Copeland Scroll = aynı scroll fotoğrafı, tüm Sanhua RFKH = aynı TXV resmi). Kategori SVG'si yerine gerçek ürün fotoğrafı tercih et.",
    de_answer: "NICHT: Falsche Bilder zuweisen (TTR-Kabel mit NYA-Bild, Schauglas mit Filter-Bild, Kupferrohr mit PE-Bild). STATTDESSEN: Markenkonforme Repraesentationsbilder pro Serie nutzen.",
  },
  {
    id: "guard_no_typo_brand",
    family: "data",
    keywords: ["typo", "yazım hatası", "brand", "marka"],
    tr_subject: "marka adı yazım hatasını otomatik düzelt — yeni marka oluşturma",
    de_subject: "Markennamen-Tippfehler automatisch korrigieren — keine neue Marke anlegen",
    tr_answer: "YAPMA: 'Al-katem' gibi yazım hatasını yeni bir marka olarak kabul etme; 'Embreco' (Embraco), 'Sanhua' (sanhwa), 'Tecumeshseh' (Tecumseh) — bunlar typo'dur. YAP: Brand normalize tablosu kullan; Levenshtein mesafesi <2 ise mevcut markaya birleştir.",
    de_answer: "NICHT: Schreibfehler bei Markennamen (Al-katem, Embreco, Sanhwa) als neue Marke akzeptieren. STATTDESSEN: Markennormalisierungstabelle verwenden, Levenshtein <2 → bestehender Marke zuordnen.",
  },

  // === ROL FİLTRESİ ===
  {
    id: "guard_role_based_data",
    family: "role",
    keywords: ["customer", "müşteri", "staff", "admin", "rol"],
    tr_subject: "role göre veri filtrele — customer'a stok detayı verme",
    de_subject: "Rollen-basierte Datenfilterung — Kunden keine Bestandsdetails zeigen",
    tr_answer: "YAPMA: Customer rolündeki kullanıcıya 'şu an 24 adet stoğumuz var', 'kritik stok seviyesi 5', 'depo lokasyonu Hamm', 'tedarikçi Frigocraft' gibi iç bilgileri verme. YAP: Sadece 'mevcut' veya 'stokta yok' bilgisini paylaş. Detaylı stok admin/staff için.",
    de_answer: "NICHT: Kunden 'wir haben 24 Stueck auf Lager', 'kritische Schwelle 5', 'Lager Hamm', 'Lieferant X' nicht offenlegen. STATTDESSEN: Nur 'verfuegbar'/'nicht auf Lager'.",
  },

  // === TEKNİK CEVAP KALİTESİ ===
  {
    id: "guard_no_made_up_specs",
    family: "quality",
    keywords: ["uydurma", "spec", "kapasite", "BTU"],
    tr_subject: "ürün spec'i bilmiyorsan uydurma — bilmiyorum de",
    de_subject: "wenn du eine Produktspezifikation nicht kennst, erfinde sie nicht — sage es klar",
    tr_answer: "YAPMA: 'Embraco NEK2150U kapasitesi 2.5 HP' gibi tahmin verme; doğru değer 1/2 HP / 350W'tır. YAP: items.notes alanından oku, bulamazsan 'tam spec'i kataloga bakmadan veremem, ama tipik bant X-Y W' de. Kullanıcıya yanlış sayı vermek satış güvenini bozar.",
    de_answer: "NICHT: Spezifikationen erfinden ('NEK2150U = 2.5 PS' wenn 1/2 PS = 350W korrekt). STATTDESSEN: Aus items.notes lesen; sonst klar sagen 'genauer Wert nur ueber Katalog, typisches Band X-Y W'.",
  },
  {
    id: "guard_no_overpromise_delivery",
    family: "quality",
    keywords: ["sevkiyat", "teslim", "lieferzeit", "yarın"],
    tr_subject: "sevkiyat süresinde söz verme — net taahhüt",
    de_subject: "keine Liefer-Versprechen ohne Bestandspruefung",
    tr_answer: "YAPMA: 'Yarın sevkiyat', 'aynı gün gönderim' gibi söz verme. Stok ve hareket kayıtlarına bakmadan tarih taahhüt etme. YAP: 'Stoktaysa 1-2 iş günü, ithalat kalemse 1-2 hafta tipik' de.",
    de_answer: "NICHT: Konkrete Liefertermine versprechen ohne Bestandspruefung. STATTDESSEN: 'Falls auf Lager 1-2 Werktage, Importteile typisch 1-2 Wochen'.",
  },

  // === GÜVENLİK ===
  {
    id: "guard_safety_critical",
    family: "safety",
    keywords: ["güvenlik", "ATEX", "R290", "yanıcı", "sertifika"],
    tr_subject: "güvenlik kritik konularda yetkili tekniker yönlendir",
    de_subject: "bei sicherheitskritischen Themen an zertifizierten Techniker verweisen",
    tr_answer: "YAPMA: 'R290 sarjı kendin yapabilirsin', 'ATEX zorunlu değil', 'F-Gas sertifikası gerekmez' gibi sözler verme. YAP: 'Yanıcı gaz/yüksek basınç montajı sertifikalı kategori-1 tekniker işidir, DRC servis ekibinden destek alın' yönlendir.",
    de_answer: "NICHT: Sicherheitskritische Anweisungen ('R290-Charge selbst', 'ATEX nicht noetig', 'F-Gas-Zertifikat egal') geben. STATTDESSEN: 'Brennbares Gas/Hochdruck-Montage erfordert zertifizierten Cat-1-Techniker, DRC-Service kontaktieren'.",
  },
];

// Her kuralı 4 dilde varyasyon olarak çoğalt (TR, DE, daha doğal cümleler)
function expandEntries(rules) {
  const out = [];
  for (const rule of rules) {
    out.push({
      id: rule.id,
      family_id: rule.family,
      context_id: "drc_man_guardrails",
      keywords: rule.keywords,
      tr_subject: rule.tr_subject,
      de_subject: rule.de_subject,
      tr_answer: rule.tr_answer,
      de_answer: rule.de_answer,
    });
    // Soru kalıbı varyasyonu
    out.push({
      id: rule.id + "_v2",
      family_id: rule.family,
      context_id: "drc_man_guardrails",
      keywords: rule.keywords,
      tr_subject: "DRC MAN " + rule.tr_subject,
      de_subject: "DRC MAN " + rule.de_subject,
      tr_answer: rule.tr_answer,
      de_answer: rule.de_answer,
    });
  }
  return out;
}

const entries = expandEntries(RULES);
fs.writeFileSync(OUT, JSON.stringify(entries, null, 2));
console.log(`✓ ${entries.length} guardrail entry üretildi → ${OUT}`);
console.log(`  Family count: ${[...new Set(entries.map(e => e.family_id))].length}`);
console.log(`  Boyut: ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
