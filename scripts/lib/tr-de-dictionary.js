"use strict";
// TR → DE teknik sözlük (soğutma/klima/endüstriyel)
// ASCII konvansiyonu: ä→ae, ö→oe, ü→ue, ß→ss
// Kullanım:
//   const { translateTrToDe } = require("./tr-de-dictionary");
//   const de = translateTrToDe("Soğutma grubu 5HP"); // → "Kaelteaggregat 5 PS"
//
// Algoritma: phrase → word sırasıyla regex substitution (uzun ifadeler önce).
// Türkçe karakterler ASCII'ye normalize edilir.

// Uzun ifadeler ÖNCE (çok kelimeli terimler kısa kelimelere parçalanmasın)
const TR_DE_PHRASES = [
  ["soğutma grubu", "Kaelteaggregat"],
  ["soğutma gruplari", "Kaelteaggregate"],
  ["sogutma grubu", "Kaelteaggregat"],
  ["soğutma ünitesi", "Kaelteaggregat"],
  ["kondanser ünitesi", "Verfluessigereinheit"],
  ["kondenser ünitesi", "Verfluessigereinheit"],
  ["kondenser uniteleri", "Verfluessigereinheiten"],
  ["soğutma malzemeleri", "Kuehltechnik-Zubehoer"],
  ["soğuk oda", "Kuehlraum"],
  ["soguk oda", "Kuehlraum"],
  ["soğuk oda kapısı", "Kuehlraumtuer"],
  ["soğuk oda aksesuarları", "Kuehlraum-Zubehoer"],
  ["şok oda", "Schockkuehlraum"],
  ["soguk hava deposu", "Kuehllager"],
  ["genleşme valfi", "Expansionsventil"],
  ["genlesme valfi", "Expansionsventil"],
  ["solenoid valf", "Magnetventil"],
  ["selenoid valf", "Magnetventil"],
  ["servis valfi", "Serviceventil"],
  ["gözetleme cam", "Schauglas"],
  ["gozetleme cam", "Schauglas"],
  ["gözetleme camı", "Schauglas"],
  ["basınç şalteri", "Druckschalter"],
  ["basinc salteri", "Druckschalter"],
  ["yüksek basınç", "Hochdruck"],
  ["yuksek basinc", "Hochdruck"],
  ["alçak basınç", "Niederdruck"],
  ["alcak basinc", "Niederdruck"],
  ["filtre kurutucu", "Filtertrockner"],
  ["filtre dryer", "Filtertrockner"],
  ["filtre drier", "Filtertrockner"],
  ["kapı contası", "Tuerdichtung"],
  ["kapi contasi", "Tuerdichtung"],
  ["likit tank", "Fluessigkeitssammler"],
  ["likit tanki", "Fluessigkeitssammler"],
  ["fan motoru", "Luftermotor"],
  ["fan motorları", "Luftermotoren"],
  ["fan motorlari", "Luftermotoren"],
  ["aksiyel fan", "Axiallufter"],
  ["radyal fan", "Radiallufter"],
  ["kompresör yağı", "Verdichteroel"],
  ["kompresor yagi", "Verdichteroel"],
  ["dijital kontrolör", "Digitalregler"],
  ["dijital kontrolor", "Digitalregler"],
  ["elektronik kontrolör", "Elektronischer Regler"],
  ["elektronik kontrolor", "Elektronischer Regler"],
  ["dijital termostat", "Digitalthermostat"],
  ["kontrol ünitesi", "Steuereinheit"],
  ["kontrol unitesi", "Steuereinheit"],
  ["kontrol paneli", "Bedienfeld"],
  ["bakır boru", "Kupferrohr"],
  ["bakir boru", "Kupferrohr"],
  ["izolasyonlu boru", "Isoliertes Rohr"],
  ["izolasyonlu borular", "Isolierte Rohre"],
  ["izolasyon bantı", "Isolierband"],
  ["izolasyon banti", "Isolierband"],
  ["kendinden yapışkan", "Selbstklebend"],
  ["kendinden yapiskan", "Selbstklebend"],
  ["sandviç panel", "Sandwichpaneel"],
  ["sandvic panel", "Sandwichpaneel"],
  ["drenaj pompası", "Kondensatpumpe"],
  ["drenaj pompasi", "Kondensatpumpe"],
  ["kondens pompası", "Kondensatpumpe"],
  ["kondens tahliyesi", "Kondensatablauf"],
  ["yağ ayırıcı", "Oelabscheider"],
  ["yag ayirici", "Oelabscheider"],
  ["çek valf", "Rueckschlagventil"],
  ["cek valf", "Rueckschlagventil"],
  ["küresel vana", "Kugelventil"],
  ["kuresel vana", "Kugelventil"],
  ["basınç regülatörü", "Druckregler"],
  ["basinc regulatoru", "Druckregler"],
  ["güç kablosu", "Stromkabel"],
  ["guc kablosu", "Stromkabel"],
  ["data kablosu", "Datenkabel"],
  ["bağlantı kablosu", "Anschlusskabel"],
  ["baglanti kablosu", "Anschlusskabel"],
  ["zaman rölesi", "Zeitrelais"],
  ["zaman rolesi", "Zeitrelais"],
  ["aşırı yük", "Ueberlast"],
  ["asiri yuk", "Ueberlast"],
  ["aşırı akım", "Ueberstrom"],
  ["asiri akim", "Ueberstrom"],
  ["koruma rölesi", "Schutzrelais"],
  ["koruma rolesi", "Schutzrelais"],
  ["sigorta soketli", "Sicherungssockel"],
  ["acil durdurma", "Not-Aus"],
  ["defrost rezistansı", "Abtauheizung"],
  ["defrost rezistansi", "Abtauheizung"],
  ["dikey buzdolabı", "Vertikaler Kuehlschrank"],
  ["dikey buzdolabi", "Vertikaler Kuehlschrank"],
  ["dikey pozitif buzdolabı", "Vertikaler Plus-Kuehlschrank"],
  ["derin dondurucu", "Tiefkuehlschrank"],
  ["soğutmalı vitrin", "Kuehlvitrine"],
  ["sogutmali vitrin", "Kuehlvitrine"],
  ["pizza tezgahı", "Pizza-Kuehltisch"],
  ["pizza tezgahi", "Pizza-Kuehltisch"],
  ["tatlı vitrini", "Konditoreivitrine"],
  ["tatli vitrini", "Konditoreivitrine"],
  ["süt vitrini", "Milchvitrine"],
  ["yağ seviye", "Oelstand"],
  ["yag seviye", "Oelstand"],
  ["kumanda kablosu", "Steuerkabel"],
  ["soğutucu akışkan", "Kaeltemittel"],
  ["sogutucu akiskan", "Kaeltemittel"],
  ["soğutucu gaz", "Kaeltemittel"],
  ["sogutucu gaz", "Kaeltemittel"],
  ["vakum pompası", "Vakuumpumpe"],
  ["vakum pompasi", "Vakuumpumpe"],
  ["manometre seti", "Manometersatz"],
];

// Tek kelime TR → DE
const TR_DE_WORDS = {
  // Ana bileşenler
  "kompresör": "Verdichter",
  "kompresor": "Verdichter",
  "kompresörü": "Verdichter",
  "kompresorler": "Verdichter",
  "kondenser": "Verfluessiger",
  "kondanser": "Verfluessiger",
  "kondenserler": "Verfluessiger",
  "evaporatör": "Verdampfer",
  "evaporator": "Verdampfer",
  "evaporatorler": "Verdampfer",
  "fan": "Luefter",
  "fanlar": "Luefter",
  "motor": "Motor",
  "motorlar": "Motoren",
  "valf": "Ventil",
  "valfi": "Ventil",
  "valfler": "Ventile",
  "vana": "Ventil",
  "vanası": "Ventil",
  "vanalar": "Ventile",
  "boru": "Rohr",
  "borular": "Rohre",
  "hortum": "Schlauch",
  "hortumlar": "Schlauche",
  "kablo": "Kabel",
  "kablolar": "Kabel",
  "konnektör": "Stecker",
  "konnektor": "Stecker",
  "soket": "Sockel",
  "röle": "Relais",
  "role": "Relais",
  "kontaktör": "Schuetz",
  "kontaktor": "Schuetz",
  "şalter": "Schalter",
  "salter": "Schalter",
  "şalteri": "Schalter",
  "sigorta": "Sicherung",
  "sigortalı": "Sicherung",
  "termostat": "Thermostat",
  "sensör": "Sensor",
  "sensor": "Sensor",
  "prob": "Fuehler",
  "prob'u": "Fuehler",
  "klemens": "Klemme",
  "terminal": "Klemme",
  "pano": "Schaltschrank",
  "panosu": "Schaltschrank",
  "pompa": "Pumpe",
  "pompası": "Pumpe",
  "regülatör": "Regler",
  "regulator": "Regler",
  // Malzemeler
  "izolasyon": "Isolierung",
  "izolasyonlu": "Isoliert",
  "izolasyonsuz": "Unisoliert",
  "kauçuk": "Gummi",
  "kaucuk": "Gummi",
  "köpük": "Schaum",
  "kopuk": "Schaum",
  "bant": "Band",
  "bantı": "Band",
  "bantlar": "Baender",
  "conta": "Dichtung",
  "contası": "Dichtung",
  "plaka": "Platte",
  "panel": "Paneel",
  "paneli": "Paneel",
  "kapı": "Tuer",
  "kapi": "Tuer",
  "kapısı": "Tuer",
  "menteşe": "Scharnier",
  "mentese": "Scharnier",
  "cam": "Glas",
  "camı": "Glas",
  "yağ": "Oel",
  "yag": "Oel",
  "yağı": "Oel",
  // Bölümler
  "buzdolabı": "Kuehlschrank",
  "buzdolabi": "Kuehlschrank",
  "vitrin": "Vitrine",
  "vitrini": "Vitrine",
  "dondurucu": "Gefrierschrank",
  // Teknik
  "basınç": "Druck",
  "basinc": "Druck",
  "akım": "Strom",
  "akim": "Strom",
  "voltaj": "Spannung",
  "gerilim": "Spannung",
  "güç": "Leistung",
  "guc": "Leistung",
  "ısı": "Waerme",
  "isi": "Waerme",
  "sıcaklık": "Temperatur",
  "sicaklik": "Temperatur",
  "nem": "Feuchte",
  "alarm": "Alarm",
  "kontrolör": "Regler",
  "kontrolor": "Regler",
  "kontrol": "Steuerung",
  // Aksesuarlar
  "filtre": "Filter",
  "filtreler": "Filter",
  "kurutucu": "Trockner",
  "lamba": "Leuchte",
  "lambası": "Leuchte",
  "aydınlatma": "Beleuchtung",
  "aydinlatma": "Beleuchtung",
  "düğme": "Taste",
  "dugme": "Taste",
  "buton": "Taster",
  "rezistans": "Heizwiderstand",
  "ısıtıcı": "Heizung",
  "isitici": "Heizung",
  "kasa": "Gehaeuse",
  "kapak": "Deckel",
  "çubuk": "Stange",
  "cubuk": "Stange",
  "somun": "Mutter",
  "cıvata": "Schraube",
  "civata": "Schraube",
  "halka": "Ring",
  "o-ring": "O-Ring",
  "rulman": "Lager",
  "kayış": "Riemen",
  "kayis": "Riemen",
  "kavrama": "Kupplung",
  // Sıfatlar
  "dikey": "Vertikal",
  "yatay": "Horizontal",
  "pozitif": "Plus",
  "negatif": "Minus",
  "tek": "Einzel",
  "çift": "Doppel",
  "cift": "Doppel",
  "üçlü": "Drei",
  "uclu": "Drei",
  "küçük": "Klein",
  "kucuk": "Klein",
  "büyük": "Gross",
  "buyuk": "Gross",
  "uzun": "Lang",
  "kısa": "Kurz",
  "kisa": "Kurz",
  "kalın": "Dick",
  "kalin": "Dick",
  "ince": "Duenn",
  "geniş": "Breit",
  "genis": "Breit",
  "dar": "Schmal",
  "yüksek": "Hoch",
  "yuksek": "Hoch",
  "alçak": "Niedrig",
  "alcak": "Niedrig",
  "düşük": "Niedrig",
  "dusuk": "Niedrig",
  "hafif": "Leicht",
  "ağır": "Schwer",
  "agir": "Schwer",
  "hızlı": "Schnell",
  "hizli": "Schnell",
  "yavaş": "Langsam",
  "yavas": "Langsam",
  // Renkler
  "siyah": "Schwarz",
  "beyaz": "Weiss",
  "kırmızı": "Rot",
  "kirmizi": "Rot",
  "mavi": "Blau",
  "yeşil": "Gruen",
  "yesil": "Gruen",
  "sarı": "Gelb",
  "sari": "Gelb",
  "gri": "Grau",
  "altın": "Gold",
  "altin": "Gold",
  "bakır": "Kupfer",
  "bakir": "Kupfer",
  "pirinç": "Messing",
  "pirinc": "Messing",
  "paslanmaz": "Edelstahl",
  "çelik": "Stahl",
  "celik": "Stahl",
  "alüminyum": "Aluminium",
  "aluminyum": "Aluminium",
  // Durum/Tip
  "yeni": "Neu",
  "kullanılmış": "Gebraucht",
  "kullanilmis": "Gebraucht",
  "orijinal": "Original",
  "muadil": "Ersatz",
  "takım": "Set",
  "takim": "Set",
  "komple": "Komplett",
  "seti": "Set",
  "tip": "Typ",
  "tipi": "Typ",
  "model": "Modell",
  "modeli": "Modell",
  "seri": "Serie",
  "numara": "Nummer",
  "adet": "Stk.",
  "kod": "Code",
  "kodu": "Code",
  // Yön/konum
  "giriş": "Eingang",
  "giris": "Eingang",
  "çıkış": "Ausgang",
  "cikis": "Ausgang",
  "ön": "Vorne",
  "on": "Vorne",
  "arka": "Hinten",
  "sol": "Links",
  "sağ": "Rechts",
  "sag": "Rechts",
  "üst": "Oben",
  "ust": "Oben",
  "alt": "Unten",
  // Malzeme tipleri
  "kristal": "Kristall",
  "plastik": "Kunststoff",
  "polietilen": "Polyethylen",
  "epoksi": "Epoxy",
  "silikon": "Silikon",
  "teflon": "Teflon",
  "vida": "Schraube",
  "dirsek": "Bogen",
  "flanş": "Flansch",
  "flans": "Flansch",
  "klipsli": "Clip",
  // HP/kW ölçüler — kelime olarak
  "beygir": "PS",
  // Yaygın ifadeler
  "ile": "mit",
  "için": "fuer",
  "icin": "fuer",
  "ve": "und",
  "veya": "oder",
  "hariç": "ausgenommen",
  "haric": "ausgenommen",
  "dahil": "inkl.",
  "marka": "Marke",
  "markalı": "Marke",
  "markali": "Marke",
  // Notlar alanında geçen yaygın ifadeler
  "stokta": "auf Lager",
  "teslimat": "Lieferung",
  "garanti": "Garantie",
  "servis": "Service",
  "bakım": "Wartung",
  "bakim": "Wartung",
  "onarım": "Reparatur",
  "onarim": "Reparatur",
  "kurulum": "Installation",
  "montaj": "Montage",
  "söküm": "Demontage",
  "sokum": "Demontage",
  "değişim": "Austausch",
  "degisim": "Austausch",
  "inceleme": "Inspektion",
  "ürün": "Produkt",
  "urun": "Produkt",
  "adet.": "Stk.",
};

// Türkçe karakterleri ASCII'ye normalize
function toAscii(s) {
  return String(s || "")
    .replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/ç/g, "c").replace(/Ç/g, "C")
    .replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ı/g, "i").replace(/İ/g, "I")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ü/g, "u").replace(/Ü/g, "U");
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function preserveCase(src, translated) {
  if (!src) return translated;
  const first = src.charAt(0);
  if (first >= "A" && first <= "Z") {
    return translated.charAt(0).toUpperCase() + translated.slice(1);
  }
  return translated.charAt(0).toLowerCase() + translated.slice(1);
}

// Ana çeviri fonksiyonu
function translateTrToDe(text) {
  if (!text) return "";
  let s = String(text);

  // 1) Phrase-level (case-insensitive, multi-word) replacements
  for (const [tr, de] of TR_DE_PHRASES) {
    const asciiSrc = toAscii(tr);
    const re = new RegExp(`\\b${escapeRegex(asciiSrc)}\\b`, "gi");
    const asciiText = toAscii(s);
    if (re.test(asciiText)) {
      // Orijinal metinde TR karakter olabileceğinden, ascii üzerinden bul & ascii üzerinde değiştir
      s = toAscii(s); // önce tamamen ASCII'ye çevir
      const re2 = new RegExp(`\\b${escapeRegex(asciiSrc)}\\b`, "gi");
      s = s.replace(re2, (m) => preserveCase(m, de));
    }
  }

  // 2) Word-level replacements (tek kelime)
  s = toAscii(s); // güvenlik: ASCII'ye çevir
  const sorted = Object.keys(TR_DE_WORDS).map((k) => toAscii(k)).sort((a, b) => b.length - a.length);
  const seen = new Set();
  const wordMapAscii = {};
  for (const [tr, de] of Object.entries(TR_DE_WORDS)) {
    wordMapAscii[toAscii(tr)] = de;
  }
  for (const w of sorted) {
    if (seen.has(w)) continue;
    seen.add(w);
    const re = new RegExp(`\\b${escapeRegex(w)}\\b`, "gi");
    s = s.replace(re, (match) => preserveCase(match, wordMapAscii[w]));
  }

  return s.trim();
}

module.exports = {
  translateTrToDe,
  toAscii,
  TR_DE_PHRASES,
  TR_DE_WORDS,
};
