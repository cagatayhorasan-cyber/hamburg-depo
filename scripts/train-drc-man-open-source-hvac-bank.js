const fs = require("fs");
const path = require("path");

const TOPIC_PREFIX = "DRC MAN acik kaynak HVAC bilgisi";
const EXPORT_DIR = path.join(process.cwd(), ".codex_tmp", "drc_man_open_source_hvac");
const SOURCE_MANIFEST = path.join(EXPORT_DIR, "sources.json");
const PREVIEW_MD = path.join(EXPORT_DIR, "preview.md");

const SOURCES = [
  {
    id: "coolprop",
    name: "CoolProp",
    url: "https://github.com/CoolProp/CoolProp",
    use: "Sogutucu akiskan termodinamik ozellikleri, PT/SH/SC mantigi, yogunluk-entalpi-saturasyon hesaplari",
  },
  {
    id: "psychrolib",
    name: "PsychroLib",
    url: "https://github.com/psychrometrics/psychrolib",
    use: "Nem, ciy noktasi, wet-bulb, latent-sensible hava hesaplari",
  },
  {
    id: "bac0",
    name: "BAC0",
    url: "https://github.com/ChristianTremblay/BAC0",
    use: "BACnet aginda cihaz kesfi, nokta okuma-yazma, DDC/BMS entegrasyonu",
  },
  {
    id: "bacnet_stack",
    name: "bacnet-stack",
    url: "https://github.com/bacnet-stack/bacnet-stack",
    use: "Dusuk seviye BACnet protokol uygulamasi ve entegrasyon tabani",
  },
  {
    id: "energyplus",
    name: "EnergyPlus",
    url: "https://github.com/NREL/EnergyPlus",
    use: "Bina ve HVAC simülasyonu, yuk/enerji modelleme, proje oncesi analiz",
  },
  {
    id: "buildingsbench",
    name: "BuildingsBench",
    url: "https://github.com/NREL/BuildingsBench",
    use: "Bina HVAC zaman serisi benchmark ve fault/anomali model denemeleri",
  },
  {
    id: "comstock",
    name: "ComStock",
    url: "https://github.com/NREL/ComStock",
    use: "Buyuk olcek bina enerji stok modellemesi ve benchmarklama",
  },
];

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

function normalizeText(value) {
  return String(value || "")
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

function entry({
  module,
  audience = "all",
  keywords,
  trQuestion,
  deQuestion,
  trAnswer,
  deAnswer,
  suggestions = [],
}) {
  return {
    topic: `${TOPIC_PREFIX} - ${module}`,
    audience,
    keywords: [
      ...keywords,
      trQuestion,
      deQuestion,
      module,
      TOPIC_PREFIX,
    ]
      .map((value) => normalizeText(value))
      .filter(Boolean)
      .filter((value, index, items) => items.indexOf(value) === index)
      .join(" "),
    trQuestion,
    trAnswer,
    deQuestion,
    deAnswer,
    suggestions,
  };
}

function buildEntries() {
  return [
    entry({
      module: "CoolProp giris",
      keywords: ["coolprop", "termodinamik", "sogutucu akiskan", "refrigerant properties"],
      trQuestion: "CoolProp ne ise yarar ve DRC MAN icin neden onemlidir?",
      deQuestion: "Wofuer ist CoolProp und warum ist es fuer DRC MAN wichtig?",
      trAnswer: [
        "CoolProp, sogutucu akiskanlarin ve bazi akiskanlarin termodinamik ozelliklerini hesaplamak icin kullanilan acik kaynak bir kutuphanedir.",
        "Pratikte PT iliskisi, saturasyon, entalpi, yogunluk, superheat ve subcool mantigini sayisal olarak dogrulamak icin cok degerlidir.",
        "DRC MAN icin anlami sudur: servis yorumunu ezberle degil, fiziksel ozellik mantigiyla desteklemek.",
        "Kaynak: CoolProp GitHub.",
      ].join(" "),
      deAnswer: [
        "CoolProp ist eine Open-Source-Bibliothek zur Berechnung thermodynamischer Stoffwerte von Kaeltemitteln und anderen Fluiden.",
        "In der Praxis ist sie wertvoll fuer PT-Beziehungen, Saettigung, Enthalpie, Dichte sowie die Logik von Superheat und Subcool.",
        "Fuer DRC MAN bedeutet das: Servicelogik nicht nur auswendig, sondern physikalisch abgestuetzt beantworten.",
        "Quelle: CoolProp auf GitHub.",
      ].join(" "),
      suggestions: ["CoolProp ile ne hesaplanir", "superheat mantigi nedir", "subcool ne ise yarar"],
    }),
    entry({
      module: "CoolProp hesap mantigi",
      keywords: ["coolprop", "propssi", "saturasyon", "pt", "enthalpy"],
      trQuestion: "CoolProp ile hangi sogutma hesaplari mantikli sekilde desteklenir?",
      deQuestion: "Welche Kaelteberechnungen lassen sich mit CoolProp sinnvoll stutzen?",
      trAnswer: [
        "Saturasyon sicakligi-basinci, superheat, subcool, yogunluk, entalpi ve bazen kabaca kapasite yorumu icin temel veri saglanabilir.",
        "Bu kutuphane servis teknisyeninin yerini almaz; ama olculen basinc ve sicaklik verisinin fizik disi olup olmadigini anlamaya yardim eder.",
        "Yanlis uygulama, sadece sayiya bakip saha gercegini unutmak olur.",
        "Kaynak: CoolProp GitHub.",
      ].join(" "),
      deAnswer: [
        "Saettigungsdruck/-temperatur, Superheat, Subcool, Dichte, Enthalpie und grobe Leistungslogik koennen damit sauber abgestuetzt werden.",
        "Die Bibliothek ersetzt keinen Techniker, hilft aber zu erkennen, ob gemessene Druck- und Temperaturwerte physikalisch plausibel sind.",
        "Der Fehler waere, nur auf Zahlen zu schauen und die reale Feldsituation zu ignorieren.",
        "Quelle: CoolProp auf GitHub.",
      ].join(" "),
      suggestions: ["superheat mantigi nedir", "subcool ne ise yarar", "olculen basinc neden onemli"],
    }),
    entry({
      module: "PsychroLib giris",
      keywords: ["psychrolib", "psychrometric", "nem", "dew point", "wet bulb"],
      trQuestion: "PsychroLib ne icin kullanilir?",
      deQuestion: "Wofuer wird PsychroLib verwendet?",
      trAnswer: [
        "PsychroLib, nemli hava hesaplari icin kullanilan acik kaynak bir kutuphanedir.",
        "Bagil nem, ciy noktasi, wet-bulb, kuru termometre, mutlak nem ve latent-sensible ayirimi gibi HVAC icin temel hava hesaplarini destekler.",
        "DRC MAN icin degeri özellikle klima, hava kanali, hava kurutma ve sebze odasi gibi nem hassas uygulamalarda ortaya cikar.",
        "Kaynak: PsychroLib GitHub.",
      ].join(" "),
      deAnswer: [
        "PsychroLib ist eine Open-Source-Bibliothek fuer feuchte Luft und psychrometrische Berechnungen.",
        "Sie unterstuetzt relative Feuchte, Taupunkt, Feuchtkugel, Trockentemperatur, absolute Feuchte und die Trennung von latent/sensibel.",
        "Fuer DRC MAN ist sie besonders wertvoll bei Klima-, Luftkanal-, Entfeuchtungs- und feuchtesensiblen Anwendungen wie Gemueseraeumen.",
        "Quelle: PsychroLib auf GitHub.",
      ].join(" "),
      suggestions: ["ciy noktasi neden onemli", "sebze odasinda nem neden kritik", "latent sensible farki nedir"],
    }),
    entry({
      module: "PsychroLib soguk oda",
      keywords: ["psychrolib", "sebze odasi", "nem kontrolu", "ciy noktasi"],
      trQuestion: "PsychroLib bilgisi soguk oda tarafinda nerede ise yarar?",
      deQuestion: "Wo hilft PsychroLib-Wissen im Kuehlraumbereich?",
      trAnswer: [
        "Sebze, meyve, pozitif muhafaza ve hava sirkulasyonunda nem dengesini okumak icin ise yarar.",
        "Kapinin acilmasi, sicak hava girisi ve coil yuzey sicakligi nedeniyle yuzeylerde yogusma veya urun kuruma riski varsa psikrometrik mantik yardim eder.",
        "Yani sadece derece degil, hava kalitesini de okumak gerekir.",
        "Kaynak: PsychroLib GitHub.",
      ].join(" "),
      deAnswer: [
        "Es hilft, die Feuchtebalance in Gemuese-, Obst-, Pluskuehl- und Luftumwaelz-Anwendungen zu verstehen.",
        "Bei Tuerverkehr, Warmlufteintritt und Registeroberflaechentemperatur ist psychrometrische Logik wichtig, wenn Kondensat oder Produktaustrocknung droht.",
        "Also nicht nur Temperatur, sondern auch Luftzustand bewerten.",
        "Quelle: PsychroLib auf GitHub.",
      ].join(" "),
      suggestions: ["ciy noktasi neden onemli", "urun neden kurur", "hava hizi nemi nasil etkiler"],
    }),
    entry({
      module: "BAC0 giris",
      keywords: ["bac0", "bacnet", "bms", "ddc", "device discovery"],
      trQuestion: "BAC0 nedir ve ne zaman ise yarar?",
      deQuestion: "Was ist BAC0 und wann ist es hilfreich?",
      trAnswer: [
        "BAC0, Python tabanli bir BACnet otomasyon kutuphanesidir.",
        "Cihaz kesfi, nokta okuma, yazma, trend ve bina otomasyon sistemleriyle calisma icin kullanilir.",
        "DRC PEYK veya uzaktan izleme tarafinda BACnet konusan cihazlara baglanmak icin mantikli bir acik kaynak katman olabilir.",
        "Kaynak: BAC0 GitHub.",
      ].join(" "),
      deAnswer: [
        "BAC0 ist eine Python-basierte BACnet-Automationsbibliothek.",
        "Sie wird fuer Geraeteerkennung, Punktlesen/-schreiben, Trends und die Arbeit mit Gebaeudeautomation genutzt.",
        "Fuer DRC PEYK oder Fernmonitoring kann sie eine sinnvolle Open-Source-Schicht sein, wenn Geraete BACnet sprechen.",
        "Quelle: BAC0 auf GitHub.",
      ].join(" "),
      suggestions: ["BACnet ile ne okunur", "BAC0 ile neye dikkat edilir", "uzaktan izleme ile simulasyon farki nedir"],
    }),
    entry({
      module: "BAC0 saha dikkatleri",
      keywords: ["bac0", "write", "out of service", "override", "bacnet caution"],
      trQuestion: "BAC0 veya BACnet yazma islemlerinde neden dikkatli olmak gerekir?",
      deQuestion: "Warum muss man bei BAC0- oder BACnet-Schreibvorgaengen vorsichtig sein?",
      trAnswer: [
        "Canli binada noktaya yazmak, kontrol stratejisini, override durumunu veya cihaz davranisini degistirebilir.",
        "Bu nedenle once okuma, sonra test, sonra gerekiyorsa kontrollu yazma mantigi gerekir.",
        "DRC MAN'e gore saha cihazina yazmak sadece teknik olarak mumkun diye otomatik olarak dogru degildir.",
        "Kaynak: BAC0 GitHub ve BACnet mantigi.",
      ].join(" "),
      deAnswer: [
        "Das Schreiben auf einen Punkt im Live-Betrieb kann die Regelstrategie, einen Override oder das Geraeteverhalten veraendern.",
        "Darum gilt: zuerst lesen, dann testen und nur wenn noetig kontrolliert schreiben.",
        "Fuer DRC MAN heisst das: Nur weil ein Schreibbefehl technisch moeglich ist, ist er noch nicht automatisch richtig.",
        "Quelle: BAC0 auf GitHub und BACnet-Praxislogik.",
      ].join(" "),
      suggestions: ["BAC0 nedir", "bacnet-stack ne ise yarar", "uzaktan kontrol guvenligi nasil dusunulur"],
    }),
    entry({
      module: "BACnet stack giris",
      keywords: ["bacnet-stack", "protocol", "bacnet", "low level"],
      trQuestion: "bacnet-stack ne ise yarar?",
      deQuestion: "Wofuer dient bacnet-stack?",
      trAnswer: [
        "bacnet-stack, BACnet protokolunun dusuk seviye uygulama tarafini saglayan acik kaynak bir projedir.",
        "Daha dogrudan entegrasyon, gateway, cihaz tarafi veya protokol testi dusunen ekipler icin temeldir.",
        "BAC0 daha operasyonel Python katmani gibi dusunulebilirken, bacnet-stack daha protokol tabanina yakindir.",
        "Kaynak: bacnet-stack GitHub.",
      ].join(" "),
      deAnswer: [
        "bacnet-stack ist ein Open-Source-Projekt fuer die protokollnahe Umsetzung von BACnet.",
        "Es ist eine Basis fuer Teams, die direktere Integration, Gateways, Geraetelogik oder Protokolltests aufbauen wollen.",
        "Waerend BAC0 eher eine operative Python-Schicht ist, liegt bacnet-stack naeher an der Protokollbasis.",
        "Quelle: bacnet-stack auf GitHub.",
      ].join(" "),
      suggestions: ["BAC0 nedir", "BACnet ile ne okunur", "protokol seviyesi ile uygulama seviyesi farki nedir"],
    }),
    entry({
      module: "EnergyPlus giris",
      keywords: ["energyplus", "simulation", "load calculation", "hvac model"],
      trQuestion: "EnergyPlus ne icin kullanilir ve ne icin kullanilmaz?",
      deQuestion: "Wofuer wird EnergyPlus genutzt und wofuer nicht?",
      trAnswer: [
        "EnergyPlus, bina ve HVAC sistemlerini simule etmek icin kullanilan acik kaynak bir enerji modelleme motorudur.",
        "Yuk hesabini, yillik enerji davranisini, setpoint etkisini ve sistem seciminin sonucunu proje oncesinde test etmek icin gucludur.",
        "Ama canli sahada sensor okuyup kompresor arizasi bulmak icin degil, tasarim ve analiz icin uygundur.",
        "Kaynak: EnergyPlus GitHub.",
      ].join(" "),
      deAnswer: [
        "EnergyPlus ist eine Open-Source-Engine fuer Gebaeude- und HVAC-Simulation.",
        "Sie ist stark fuer Lastberechnung, Jahresenergieverhalten, Setpoint-Effekte und die Bewertung von Systemauswahl vor Projektbeginn.",
        "Sie ist aber nicht dafuer gedacht, live Sensoren auszulesen und direkt Feldstoerungen an einem Verdichter zu diagnostizieren.",
        "Quelle: EnergyPlus auf GitHub.",
      ].join(" "),
      suggestions: ["simulasyon ile canli veri farki nedir", "psychrolib ne ise yarar", "buildingsbench nedir"],
    }),
    entry({
      module: "EnergyPlus ve soguk oda",
      keywords: ["energyplus", "cold room", "soguk oda", "design stage"],
      trQuestion: "EnergyPlus mantigi soguk oda projelerinde nasil dusunulebilir?",
      deQuestion: "Wie kann die EnergyPlus-Logik bei Kuehlraumprojekten gedacht werden?",
      trAnswer: [
        "Soguk oda projelerinde bire bir saha yerine, yuk mantigini, cevre etkisini ve farkli kullanim senaryolarini once masada gormek icin faydalidir.",
        "Ozellikle bina etkisi, gunluk kullanim profili ve enerji sonucu onceden dusunulmek isteniyorsa simülasyon mantigi degerlidir.",
        "Ama son cihaz secimi yine sahadaki urun, kapı kullanimi ve operasyon gercegiyle birlikte yapilir.",
        "Kaynak: EnergyPlus GitHub.",
      ].join(" "),
      deAnswer: [
        "Bei Kuehlraumprojekten kann es helfen, Lastlogik, Umgebungswirkung und verschiedene Nutzungsszenarien vorab am Modell zu sehen.",
        "Besonders wenn Gebaeudeeinfluss, Tagesprofil und Energiefolgen frueh betrachtet werden sollen, ist Simulationslogik wertvoll.",
        "Die Endauswahl des Aggregats muss aber immer mit Produkt, Tuerverkehr und echter Betriebsrealitaet abgeglichen werden.",
        "Quelle: EnergyPlus auf GitHub.",
      ].join(" "),
      suggestions: ["isi yuk hesabi neden onemli", "simulasyon ile canli veri farki nedir", "comstock nedir"],
    }),
    entry({
      module: "BuildingsBench giris",
      keywords: ["buildingsbench", "dataset", "timeseries", "benchmark", "fault"],
      trQuestion: "BuildingsBench gibi veri setleri DRC MAN icin ne kazandirir?",
      deQuestion: "Was bringen Datensaetze wie BuildingsBench fuer DRC MAN?",
      trAnswer: [
        "Bina ve HVAC zaman serilerini benchmarklayarak model test etmek icin fayda saglar.",
        "Canli sahadan once, anomali tespiti, tahmin veya siniflandirma mantigini hangi veri yapisiyla deneyeceginizi gormeye yardim eder.",
        "DRC MAN icin faydasi, fault ve monitoring cevaplarini sadece sezgiyle degil veri davranis mantigiyla guclendirmektir.",
        "Kaynak: BuildingsBench GitHub.",
      ].join(" "),
      deAnswer: [
        "Solche Datensaetze helfen, Modelllogik auf Gebaeude- und HVAC-Zeitreihen zu benchmarken.",
        "Vor dem Live-Einsatz sieht man damit, auf welcher Datenstruktur Anomalieerkennung, Prognose oder Klassifikation getestet werden kann.",
        "Fuer DRC MAN heisst das: Monitoring- und Fault-Antworten lassen sich staerker auf Datenverhalten stuetzen statt nur auf Intuition.",
        "Quelle: BuildingsBench auf GitHub.",
      ].join(" "),
      suggestions: ["comstock nedir", "simulasyon ile canli veri farki nedir", "anomali tespiti ne demek"],
    }),
    entry({
      module: "ComStock giris",
      keywords: ["comstock", "building stock", "benchmark", "energy dataset"],
      trQuestion: "ComStock ne saglar ve DRC MAN icin siniri nedir?",
      deQuestion: "Was liefert ComStock und wo liegt die Grenze fuer DRC MAN?",
      trAnswer: [
        "ComStock, ticari bina stogu tarafinda buyuk olcek enerji modelleme ve benchmark mantigi sunar.",
        "Yani tek bir soguk oda servis kaydindan cok, genis bina davranisi ve karsilastirma tarafinda gucludur.",
        "DRC MAN icin bunun anlami: genel enerji stratejisi ve benchmark tarafinda faydali, ama tek bir evaporator arizasi icin dogrudan saha cevabi yerine gecmez.",
        "Kaynak: ComStock GitHub.",
      ].join(" "),
      deAnswer: [
        "ComStock bietet grossskalige Energie- und Benchmarklogik fuer den gewerblichen Gebaeudebestand.",
        "Es ist also staerker fuer breites Gebaeudeverhalten als fuer einen einzelnen Kuehlraum-Servicefall.",
        "Fuer DRC MAN bedeutet das: nützlich fuer Energie- und Benchmarkdenken, aber kein direkter Ersatz fuer Feldantworten zu einer einzelnen Verdampferstoerung.",
        "Quelle: ComStock auf GitHub.",
      ].join(" "),
      suggestions: ["buildingsbench nedir", "energyplus ne icin kullanilir", "canli saha verisi neden ayridir"],
    }),
    entry({
      module: "Simulasyon ve canli saha",
      keywords: ["simulation", "live data", "canli veri", "field service"],
      trQuestion: "Simulasyon verisi ile canli saha verisi arasindaki fark nasil dusunulmeli?",
      deQuestion: "Wie sollte der Unterschied zwischen Simulationsdaten und Live-Felddaten gedacht werden?",
      trAnswer: [
        "Simulasyon, kontrollu varsayimlarla calisir; canli saha verisi ise kirli, eksik, gecikmeli veya yaniltici olabilir.",
        "Bu nedenle modelde guzel gorunen bir mantik, sahada sensor arizasi, montaj hatasi veya operatör davranisi yuzunden bozulabilir.",
        "DRC MAN icin dogru refleks su: simulasyon egitimi tasarim zekasi verir, canli veri ise gercek operasyon refleksi kazandirir; ikisi karistirilmamalidir.",
        "Kaynak: EnergyPlus, BuildingsBench, ComStock mantigi.",
      ].join(" "),
      deAnswer: [
        "Simulation arbeitet mit kontrollierten Annahmen; Live-Felddaten koennen verrauscht, lueckenhaft, verzoegert oder irrefuehrend sein.",
        "Darum kann eine Logik, die im Modell sauber aussieht, im Feld durch Fuehlerfehler, Montageprobleme oder Bedienverhalten scheitern.",
        "Fuer DRC MAN gilt: Simulation schult Entwurfsdenken, Live-Daten schulen Betriebsreflexe; beides darf nicht verwechselt werden.",
        "Quelle: Logik aus EnergyPlus, BuildingsBench und ComStock.",
      ].join(" "),
      suggestions: ["EnergyPlus ne icin kullanilir", "BuildingsBench ne kazandirir", "BAC0 ne zaman ise yarar"],
    }),
    entry({
      module: "DRC PEYK entegrasyon mantigi",
      keywords: ["drc peyk", "iot", "bacnet", "monitoring", "integration"],
      trQuestion: "Bu acik kaynak kaynaklar DRC PEYK veya uzaktan izleme tarafinda nasil birlesir?",
      deQuestion: "Wie lassen sich diese Open-Source-Quellen auf DRC PEYK oder Fernmonitoring uebertragen?",
      trAnswer: [
        "BAC0 ve bacnet-stack saha cihazi tarafina baglanmayi, BuildingsBench tarzı veriler analiz mantigini, CoolProp ve PsychroLib ise teknik yorum katmanini guclendirir.",
        "Bu kombinasyonla DRC PEYK sadece veri gosteren panel degil, daha anlamli yorum yapan bir operasyon ekranina donusebilir.",
        "Yine de canli yazma, alarm karari ve servis yonlendirmesi kontrollu kurallarla yapilmalidir.",
        "Kaynak: BAC0, bacnet-stack, CoolProp, PsychroLib, BuildingsBench.",
      ].join(" "),
      deAnswer: [
        "BAC0 und bacnet-stack verbinden zur Feldgeraeteseite, Datensaetze wie BuildingsBench staerken die Analyselogik, CoolProp und PsychroLib die technische Deutungsschicht.",
        "So kann DRC PEYK von einem reinen Datenpanel zu einem Betriebsbildschirm mit mehr technischer Aussage werden.",
        "Trotzdem muessen Live-Schreiben, Alarme und Serviceentscheidungen ueber kontrollierte Regeln laufen.",
        "Quelle: BAC0, bacnet-stack, CoolProp, PsychroLib und BuildingsBench.",
      ].join(" "),
      suggestions: ["BAC0 nedir", "simulasyon ile canli veri farki nedir", "uzaktan kontrol guvenligi nasil dusunulur"],
    }),
    entry({
      module: "Acil kaynak sinirlari",
      keywords: ["open source limits", "sinir", "limitation", "boundary"],
      trQuestion: "Acik kaynak HVAC reposu kullanirken sinirlar ne olmalidir?",
      deQuestion: "Wo liegen die Grenzen bei der Nutzung von Open-Source-HVAC-Repositories?",
      trAnswer: [
        "Acik kaynak repo, saha tecrubesinin ve cihaz etiketinin yerine gecmez.",
        "Her proje ayni komponent, gaz, standard veya ulke kuraliyla calismaz.",
        "Bu yuzden DRC MAN bu kaynaklari yardimci teknik bilgi olarak kullanir; son karar yine sahadaki olcum, ureteci etiketi ve guvenlik kuraliyla verilir.",
        "Kaynak: Tum secilen GitHub kaynaklari icin ortak prensip.",
      ].join(" "),
      deAnswer: [
        "Ein Open-Source-Repository ersetzt keine Felderfahrung und kein Typenschild des Herstellers.",
        "Nicht jedes Projekt arbeitet mit denselben Komponenten, Kaeltemitteln, Standards oder Landesregeln.",
        "Darum nutzt DRC MAN diese Quellen als technische Hilfe; die finale Entscheidung kommt weiterhin aus Feldmessung, Herstellerfreigabe und Sicherheitsregeln.",
        "Quelle: Gemeinsames Prinzip fuer alle ausgewaehlten GitHub-Quellen.",
      ].join(" "),
      suggestions: ["coolprop ne ise yarar", "bac0 ne zaman ise yarar", "simulasyon ile canli saha farki nedir"],
    }),
  ];
}

function writeExports(entries) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.writeFileSync(SOURCE_MANIFEST, JSON.stringify(SOURCES, null, 2), "utf8");

  const lines = ["# DRC MAN Open Source HVAC Pack", "", "## Kaynaklar", ""];
  SOURCES.forEach((source) => {
    lines.push(`- ${source.name}: ${source.url}`);
    lines.push(`  - Kullanim: ${source.use}`);
  });
  lines.push("", "## Egitim Girdileri", "");
  entries.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.topic}`);
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

  writeExports(entries);
  console.log(JSON.stringify({
    ok: true,
    topicPrefix: TOPIC_PREFIX,
    entries: entries.length,
    exportDir: EXPORT_DIR,
    sources: SOURCES.map((source) => source.url),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
