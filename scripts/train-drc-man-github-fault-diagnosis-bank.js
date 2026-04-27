const fs = require("fs");
const path = require("path");

const TOPIC_PREFIX = "DRC MAN GitHub ariza teshis";
const EXPORT_DIR = path.join(process.cwd(), ".codex_tmp", "drc_man_github_fault_diagnosis");
const SOURCE_MANIFEST = path.join(EXPORT_DIR, "sources.json");
const PREVIEW_MD = path.join(EXPORT_DIR, "preview.md");

const SOURCES = [
  {
    id: "open_fdd",
    name: "open-fdd",
    url: "https://github.com/bbartling/open-fdd",
    use: "HVAC fault detection and diagnostics workflow, point context, threshold logic, false alarm discipline",
  },
  {
    id: "fault_detection_hvac",
    name: "Fault-Detection-HVAC",
    url: "https://github.com/DC-777/Fault-Detection-HVAC",
    use: "Tree-based ensemble models, dynamic thresholds, supervised fault detection workflow",
  },
  {
    id: "lstm_fdd",
    name: "LSTM-Models-FDD-task",
    url: "https://github.com/samantaheri71/LSTM-Models-FDD-task",
    use: "Sequence modeling, time-series preprocessing, fault classification from temporal HVAC behavior",
  },
  {
    id: "sas_iot_hvac",
    name: "iot-anomaly-detection-hvac",
    url: "https://github.com/sascommunities/iot-anomaly-detection-hvac",
    use: "Real-time monitoring, anomaly scoring, AHU malfunction detection pipeline",
  },
  {
    id: "rough_sets_refrigeration",
    name: "rough-sets-refrigeration-detection",
    url: "https://github.com/bartoszxkozlowski/rough-sets-refrigeration-detection",
    use: "Refrigeration fault logic with IoT sensor data and rough sets reasoning",
  },
  {
    id: "shelly_fridge_controller",
    name: "shelly-fridge-controller",
    url: "https://github.com/chiptoma/shelly-fridge-controller",
    use: "Compressor protection, short cycle logic, runtime alarms, MQTT reporting for refrigeration control",
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
    .replace(/[cç]/g, "c")
    .replace(/[gğ]/g, "g")
    .replace(/[ıİi]/g, "i")
    .replace(/[oö]/g, "o")
    .replace(/[sş]/g, "s")
    .replace(/[uü]/g, "u")
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
      module: "open fdd giris",
      keywords: ["open fdd", "fault detection", "diagnostics", "github fdd"],
      trQuestion: "GitHub ariza teshis paketinde open-fdd bize ne ogretiyor?",
      deQuestion: "Was zeigt uns open-fdd im GitHub-Stoerungspaket?",
      trAnswer: [
        "open-fdd mantigi sunu ogretir: ariza teshisi sadece alarm saymak degil, nokta baglamini okumaktir.",
        "Bir sensor tek basina suclu ilan edilmez; setpoint, vana komutu, fan durumu ve trend yonu birlikte bakilir.",
        "DRC MAN bu pakette once belirtiyi ayirir, sonra olasi kok nedenleri siralar, sonra sahada hangi olcumu alman gerektigini soyler.",
        "Kaynak: bbartling/open-fdd.",
      ].join(" "),
      deAnswer: [
        "Die open-fdd-Logik zeigt: Stoerungsdiagnose heisst nicht nur Alarm zaehlen, sondern Punktkontext lesen.",
        "Ein Fuehler wird nicht isoliert beschuldigt; Sollwert, Ventilkommando, Ventilatorstatus und Trendrichtung werden gemeinsam bewertet.",
        "DRC MAN trennt hier zuerst das Symptom, ordnet dann moegliche Ursachen und nennt danach die Messung, die vor Ort noetig ist.",
        "Quelle: bbartling/open-fdd.",
      ].join(" "),
      suggestions: ["dinamik esik nedir", "yanlis alarm nasil azalir", "sensor drifti nasil anlasilir"],
    }),
    entry({
      module: "dinamik esik mantigi",
      keywords: ["dynamic threshold", "esik", "threshold", "tree ensemble"],
      trQuestion: "Dinamik esik mantigi ariza tespitinde neden onemli?",
      deQuestion: "Warum sind dynamische Schwellwerte in der Stoerungserkennung wichtig?",
      trAnswer: [
        "Sabit esik cok sik yanlis alarm uretir; cunku mevsim, yuk, kapi trafigi ve cihaz modu degistikce normal davranis da degisir.",
        "Fault-Detection-HVAC gibi repolar, sabit kurala mahkum kalmadan zamana ve isletme kosuluna gore degerlendirme yapmayi ogretir.",
        "DRC MAN bu nedenle bir degeri tek basina kritik saymak yerine, once o degerin baglam icinde anormal olup olmadigina bakmalidir.",
        "Kaynak: DC-777/Fault-Detection-HVAC.",
      ].join(" "),
      deAnswer: [
        "Starre Grenzwerte erzeugen oft Fehlalarme, weil sich normales Verhalten je nach Saison, Last, Tuerverkehr und Betriebsmodus aendert.",
        "Repos wie Fault-Detection-HVAC zeigen, wie man statt starrer Regeln kontextabhaengig bewertet.",
        "Darum sollte DRC MAN einen Wert nicht isoliert verurteilen, sondern zuerst pruefen, ob er im aktuellen Betrieb wirklich unplausibel ist.",
        "Quelle: DC-777/Fault-Detection-HVAC.",
      ].join(" "),
      suggestions: ["yanlis alarm nasil azalir", "anomali ile ariza ayni sey mi", "veri baglami neden onemli"],
    }),
    entry({
      module: "sensor drifti",
      keywords: ["sensor drift", "fouhler drift", "probe drift", "calibration"],
      trQuestion: "Sensor drifti ile gercek ariza nasil ayristirilir?",
      deQuestion: "Wie trennt man Fuehlerdrift von einer echten Stoerung?",
      trAnswer: [
        "Tek bir sensor farkli gosterdigi icin hemen kompresor veya gaz suclanmaz.",
        "Ayni prosesi anlatan baska noktalarla capraz kontrol gerekir: emis-basma basinci, boru sicakligi, ortam sicakligi, acma-kapama suresi gibi.",
        "Eger tek nokta sapmis ama sistem davranisi diger acilardan mantikliysa once sensor, kablo veya kalibrasyon suphe edilir.",
        "Kaynak mantigi: open-fdd ve zaman serisi FDD yaklasimlari.",
      ].join(" "),
      deAnswer: [
        "Nur weil ein Fuehler abweicht, ist nicht sofort Verdichter oder Kaeltemittel schuld.",
        "Es braucht Kreuzkontrolle mit anderen Punkten desselben Prozesses: Saug-/Druckdruck, Rohrtemperatur, Raumtemperatur und Laufzeitverhalten.",
        "Wenn nur ein Punkt abdriftet, der Rest des Systems aber logisch wirkt, liegt der erste Verdacht auf Fuehler, Leitung oder Kalibrierung.",
        "Quellenlogik: open-fdd und Zeitreihen-FDD-ansaetze.",
      ].join(" "),
      suggestions: ["veri kalitesi bozuksa ne yapilir", "anomali ile kok neden farki nedir", "kompresor arizasi nasil teyit edilir"],
    }),
    entry({
      module: "veri kalitesi",
      keywords: ["missing data", "data quality", "noise", "sensor gaps"],
      trQuestion: "Veri kalitesi bozuksa ariza teshisi nasil etkilenir?",
      deQuestion: "Wie wirkt sich schlechte Datenqualitaet auf die Stoerungsdiagnose aus?",
      trAnswer: [
        "Eksik, gecikmeli veya ziplayan veri kotu teshisin en hizli yoludur.",
        "LSTM ve anomaly repolari once veri temizleme, yeniden ornekleme ve zaman hizalama adimina agirlik verir; cunku cop veriyle akilli teshis cikmaz.",
        "DRC MAN'in dogru refleksi sudur: veri guvenilir degilse kesin hukum degil, kontrollu suphe ve ek olcum istemek.",
        "Kaynak: LSTM-Models-FDD-task ve iot-anomaly-detection-hvac.",
      ].join(" "),
      deAnswer: [
        "Lueckenhafte, verzoegerte oder springende Daten sind der schnellste Weg zu einer falschen Diagnose.",
        "LSTM- und Anomaly-Repos legen zuerst Wert auf Datenbereinigung, Resampling und Zeitsynchronisation, weil aus schlechten Daten keine saubere Diagnose entsteht.",
        "Der richtige Reflex fuer DRC MAN lautet deshalb: bei unzuverlaessigen Daten kein hartes Urteil, sondern begruendeter Verdacht plus Zusatzmessung.",
        "Quelle: LSTM-Models-FDD-task und iot-anomaly-detection-hvac.",
      ].join(" "),
      suggestions: ["sensor drifti nasil ayristirilir", "anomali ile ariza ayni mi", "canli veri neden zor"],
    }),
    entry({
      module: "anomali ve kok neden",
      keywords: ["anomaly", "root cause", "kok neden", "fault isolation"],
      trQuestion: "Anomali tespiti ile kok neden tespiti ayni sey midir?",
      deQuestion: "Sind Anomalieerkennung und Ursachefindung dasselbe?",
      trAnswer: [
        "Hayir. Anomali, davranisin normalden saptigini soyler; kok neden ise bunun neden oldugunu aciklar.",
        "Bir AHU, soguk oda veya kondenser grubu normal egri disina cikabilir; ama bunun sebebi sensor, fan, gaz, buzlanma veya kumanda olabilir.",
        "DRC MAN once anomalinin varligini tespit etmeli, sonra sahaya uygun hipotez siralamasi kurmalidir.",
        "Kaynak: iot-anomaly-detection-hvac ve open-fdd.",
      ].join(" "),
      deAnswer: [
        "Nein. Eine Anomalie zeigt nur, dass sich das Verhalten vom Normalzustand entfernt hat; die Ursachenanalyse erklaert warum.",
        "Eine AHU, ein Kuehlraum oder eine Verfluessigergruppe kann aus dem normalen Muster fallen, aber der Grund kann Fuehler, Ventilator, Kaeltemittel, Vereisung oder Regelung sein.",
        "DRC MAN sollte also zuerst die Auffaelligkeit erkennen und danach eine feldtaugliche Ursachenliste aufbauen.",
        "Quelle: iot-anomaly-detection-hvac und open-fdd.",
      ].join(" "),
      suggestions: ["kompresor kisa devre nedir", "defrost arizasi nasil okunur", "sensor drifti nasil ayristirilir"],
    }),
    entry({
      module: "kompresor kisa devre",
      keywords: ["short cycle", "compressor protection", "kisa devre", "runtime alarm"],
      trQuestion: "Kompresorun kisa devre yaptigini GitHub mantigiyla nasil yorumlariz?",
      deQuestion: "Wie bewerten wir Verdichter-Kurzzyklen mit GitHub-Logik?",
      trAnswer: [
        "Kisa sure calis, dur, tekrar calis davranisi tek basina kompresor arizasi demek degildir.",
        "Termostat diferansi, sensor yeri, kontaktor, yuk dusuklugu, gaz dengesizligi ve emniyet zinciri birlikte okunur.",
        "Shelly-fridge-controller benzeri projeler koruma mantigini runtime ve restart araligiyla izler; DRC MAN de ayni refleksi kullanmalidir.",
        "Kaynak: chiptoma/shelly-fridge-controller.",
      ].join(" "),
      deAnswer: [
        "Kurze Laufzeit, Stopp und schneller Neustart bedeuten nicht automatisch einen Verdichterschaden.",
        "Thermostatdifferenz, Fuehlerposition, Schuetz, geringe Last, Kaeltemittelzustand und Schutzkette muessen gemeinsam gelesen werden.",
        "Projekte wie shelly-fridge-controller ueberwachen Schutzlogik ueber Laufzeit und Neustartabstand; denselben Reflex sollte DRC MAN nutzen.",
        "Quelle: chiptoma/shelly-fridge-controller.",
      ].join(" "),
      suggestions: ["sensor drifti nasil ayristirilir", "defrost arizasi nasil okunur", "fan hava akisi arizasi nedir"],
    }),
    entry({
      module: "defrost teshisi",
      keywords: ["defrost", "buzlanma", "ice buildup", "coil frost"],
      trQuestion: "Defrost arizasini veri davranisindan nasil anlariz?",
      deQuestion: "Wie erkennt man eine Abtau-Stoerung am Datenverhalten?",
      trAnswer: [
        "Evaporator sicakligi, hava cikis farki ve calisma suresi giderek bozuluyorsa ama yuk ayni kaliyor ise defrost hattina bakilir.",
        "Ariza bankasi mantigina gore sadece buz gordum demek yetmez; abtau zamanlamasi, rezistans cevabi, fan davranisi ve sensorden gelen trend birlikte degerlenir.",
        "DRC MAN burada belirtileri ard arda dizer: kapasite dususu, uzun calisma, coil buzlanmasi, hava gecisinin daralmasi.",
        "Kaynak: FDD yaklasimi ve zaman serisi fault reposu mantigi.",
      ].join(" "),
      deAnswer: [
        "Wenn Verdampfertemperatur, Luftaustrittsdifferenz und Laufzeit stetig schlechter werden, waehrend die Last aehnlich bleibt, schaut man zuerst auf den Abtauzweig.",
        "Nach FDD-Logik reicht 'ich sehe Eis' nicht; Abtauzeit, Heizreaktion, Ventilatorverhalten und Fuehlertrend muessen zusammen gelesen werden.",
        "DRC MAN sollte hier die Symptome strukturiert auflisten: Leistungsabfall, lange Laufzeiten, Vereisung am Register und sinkender Luftdurchsatz.",
        "Quelle: FDD-Ansatz und Zeitreihen-Fault-Repos.",
      ].join(" "),
      suggestions: ["fan hava akisi arizasi nedir", "kompresor kisa devre nedir", "sensor drifti nasil ayristirilir"],
    }),
    entry({
      module: "fan ve hava akisi",
      keywords: ["fan fault", "airflow", "hava akisi", "static pressure"],
      trQuestion: "Fan veya hava akisi problemi veri tarafinda nasil gorunur?",
      deQuestion: "Wie zeigt sich ein Ventilator- oder Luftstromproblem in den Daten?",
      trAnswer: [
        "Hava akisi dusunce sadece sicaklik degil, tepki hizi de bozulur.",
        "Sistem hedefe daha gec gider, coil uzerindeki sicaklik dagilimi bozulur ve bazen gereksiz defrost benzeri belirtiler uretir.",
        "GitHub FDD mantigi, fan komutu var ama beklenen sicaklik cevabi yoksa mekanik hava tarafini suphe etmeyi ogretir.",
        "Kaynak: open-fdd ve AHU anomaly reposu genel mantigi.",
      ].join(" "),
      deAnswer: [
        "Sinkt der Luftstrom, veraendert sich nicht nur die Temperatur, sondern auch die Reaktionsgeschwindigkeit des Systems.",
        "Das System erreicht den Sollwert spaeter, die Temperaturverteilung am Register wird schlechter und es entstehen teils Symptome wie bei einer falschen Abtauung.",
        "Die GitHub-FDD-Logik lehrt: Wenn ein Ventilatorbefehl da ist, aber die erwartete Temperaturreaktion fehlt, ist die mechanische Luftseite zu pruefen.",
        "Quelle: Grundlogik aus open-fdd und AHU-Anomaly-Repos.",
      ].join(" "),
      suggestions: ["defrost arizasi nasil okunur", "anomali ile kok neden ayni mi", "veri kalitesi bozuksa ne olur"],
    }),
    entry({
      module: "gaz kacak ve sarj dengesizligi",
      keywords: ["refrigerant leak", "charge imbalance", "gaz kacagi", "low charge"],
      trQuestion: "GitHub temelli yaklasim gaz kacagi supesinde ne kadar ileri gider?",
      deQuestion: "Wie weit darf ein GitHub-basierter Ansatz beim Verdacht auf Kaeltemittelleck gehen?",
      trAnswer: [
        "Model ve trend sana suphe verir; kesin kani saha olcumu verir.",
        "Dusuk emis, yuksek superheat, dengesiz kapasite ve uzun calisma suresi birlikte gorulurse dusuk sarj ihtimali konusulur ama hemen kesin yargi verilmez.",
        "DRC MAN gaz tarafinda tahmin degil yonlendirme yapmali: kacak testi, tartili dolum, subcool-superheat kontrolu ve etiket uyumu.",
        "Kaynak mantigi: rough-sets-refrigeration-detection ve genel FDD reposu sinirlari.",
      ].join(" "),
      deAnswer: [
        "Ein Modell oder Trend liefert einen Verdacht; die sichere Aussage kommt erst aus der Feldmessung.",
        "Niedriger Saugdruck, hoher Superheat, schwankende Leistung und lange Laufzeiten sprechen fuer Unterfuellung, aber noch nicht fuer ein endgueltiges Urteil.",
        "DRC MAN sollte auf der Kaeltemittelseite nicht raten, sondern den naechsten Schritt nennen: Lecktest, Einwaage, Subcool-/Superheat-Pruefung und Typenschildabgleich.",
        "Quellenlogik: rough-sets-refrigeration-detection und die Grenzen allgemeiner FDD-Repos.",
      ].join(" "),
      suggestions: ["r404a ariza mantigi nedir", "r290 gazinda ne fark eder", "kompresor kisa devre nedir"],
    }),
    entry({
      module: "bacnet ve nokta baglami",
      keywords: ["bacnet", "ddc", "point context", "building automation"],
      trQuestion: "BACnet veya DDC noktalarinda baglam neden bu kadar onemli?",
      deQuestion: "Warum ist Kontext bei BACnet- oder DDC-Punkten so wichtig?",
      trAnswer: [
        "Bir analog deger tek basina hikaye anlatmaz; komut, mod, izin, alarm inhibiti ve override bilgisiyle birlikte anlam kazanir.",
        "FDD reposu noktalar arasi iliski kurmadan yanlis teshis riskinin yuksek oldugunu tekrar tekrar gosterir.",
        "DRC MAN, uzaktan izleme ekraninda sensor degerini tek basina okumak yerine hangi modda, hangi komutla ve hangi sure boyunca oyle kaldigina bakmalidir.",
        "Kaynak: open-fdd ve building automation anomali repolari.",
      ].join(" "),
      deAnswer: [
        "Ein einzelner Analogwert erzaehlt keine ganze Geschichte; er wird erst zusammen mit Befehl, Betriebsart, Freigabe, Alarmsperre und Override sinnvoll.",
        "FDD-Repos zeigen immer wieder, dass ohne Punktbeziehungen das Risiko einer Fehldiagnose hoch bleibt.",
        "DRC MAN sollte im Fernmonitoring daher nicht nur den Sensorwert lesen, sondern auch Modus, Kommando und die Zeitdauer des Zustands bewerten.",
        "Quelle: open-fdd und Repos aus der Gebaeudeautomations-Anomalieerkennung.",
      ].join(" "),
      suggestions: ["anomali ile kok neden ayni mi", "veri kalitesi neden onemli", "uzaktan izleme nasil yorumlanir"],
    }),
    entry({
      module: "zaman serisi on isleme",
      keywords: ["preprocessing", "time series", "resampling", "sequence model"],
      trQuestion: "Zaman serisi on isleme neden ariza tespitinin temeli sayilir?",
      deQuestion: "Warum ist die Zeitreihen-Vorverarbeitung die Basis der Stoerungserkennung?",
      trAnswer: [
        "Yanlis hizalanmis veri, dogru modeli bile kandirir.",
        "LSTM FDD reposu bu yuzden ornekleme araligi, zaman damgasi uyumu ve normalizasyonu temel adim olarak kurar.",
        "DRC MAN veri egitiminde de ayni kural gecerlidir: once veriyi duzgun oku, sonra semptomu yorumla.",
        "Kaynak: samantaheri71/LSTM-Models-FDD-task.",
      ].join(" "),
      deAnswer: [
        "Schlecht ausgerichtete Daten taeuschen selbst ein gutes Modell.",
        "Darum behandelt das LSTM-FDD-Repo Abtastrate, Zeitstempel-Abgleich und Normalisierung als Grundschritt.",
        "Fuer DRC MAN gilt dieselbe Regel: erst die Daten sauber lesen, dann das Symptom interpretieren.",
        "Quelle: samantaheri71/LSTM-Models-FDD-task.",
      ].join(" "),
      suggestions: ["veri kalitesi bozuksa ne olur", "sensor drifti nasil ayristirilir", "yanlis alarm nasil azalir"],
    }),
    entry({
      module: "mqtt ve uzaktan alarm",
      keywords: ["mqtt", "remote alarm", "runtime", "monitoring"],
      trQuestion: "Uzaktan alarm ve MQTT verisi ariza tespitinde nasil kullanilmali?",
      deQuestion: "Wie sollten Remote-Alarme und MQTT-Daten in der Diagnose genutzt werden?",
      trAnswer: [
        "Alarm geldigi icin ariza kesinlesmis sayilmaz; alarm sadece oncelik sirasi verir.",
        "Runtime, restart sayisi, ortam sicakligi ve kontakt cikti gibi tamamlayici sinyaller olmadan salt alarm metni dar kalir.",
        "Shelly tabanli kontrol mantigi, alarmi aciklayici trendlerle eslestirmeyi ogretir; DRC MAN de buna gore cevap vermelidir.",
        "Kaynak: chiptoma/shelly-fridge-controller.",
      ].join(" "),
      deAnswer: [
        "Ein Alarm allein beweist die Stoerung nicht; er setzt nur die Prioritaet.",
        "Ohne Zusatzsignale wie Laufzeit, Neustarthaeufigkeit, Umgebungstemperatur und Relaisstatus bleibt ein Alarmtext zu schmal.",
        "Die Shelly-basierte Steuerlogik zeigt, wie man einen Alarm mit erklaerenden Trends verknuepft; genau so sollte DRC MAN antworten.",
        "Quelle: chiptoma/shelly-fridge-controller.",
      ].join(" "),
      suggestions: ["bacnet nokta baglami neden onemli", "kompresor kisa devre nedir", "uzaktan izleme nasil yorumlanir"],
    }),
    entry({
      module: "rule based ve model based",
      keywords: ["rule based", "model based", "ensemble", "rough sets"],
      trQuestion: "Kural tabanli ve model tabanli ariza tespiti nasil birlestirilir?",
      deQuestion: "Wie kombiniert man regelbasierte und modellbasierte Stoerungserkennung?",
      trAnswer: [
        "Sahada en saglam yontem genelde hibrit yaklasimdir.",
        "Kural tabanli mantik hizli ve aciklanabilir olur; model tabanli mantik ise daha ince sapmalari yakalayabilir.",
        "DRC MAN once sahada anlasilir kural dizisini kurmali, sonra veri yogun oldugu yerde model yardimini ikinci katman olarak kullanmalidir.",
        "Kaynak: open-fdd, Fault-Detection-HVAC, rough-sets-refrigeration-detection.",
      ].join(" "),
      deAnswer: [
        "Im Feld ist meist ein hybrider Ansatz am robustesten.",
        "Regelbasierte Logik ist schnell und erklaerbar; modellbasierte Logik erkennt feinere Abweichungen.",
        "DRC MAN sollte zuerst eine feldtaugliche Regelbasis aufbauen und modellgestuetzte Diagnose dort als zweite Schicht nutzen, wo genug Daten vorhanden sind.",
        "Quelle: open-fdd, Fault-Detection-HVAC und rough-sets-refrigeration-detection.",
      ].join(" "),
      suggestions: ["anomali ile kok neden ayni mi", "dinamik esik nedir", "veri kalitesi neden onemli"],
    }),
    entry({
      module: "saha sinirlari",
      keywords: ["field limits", "sinir", "site verification", "measurement"],
      trQuestion: "GitHub tabanli ariza paketi hangi noktada durmali?",
      deQuestion: "Wo muss ein GitHub-basiertes Stoerungspaket seine Grenze ziehen?",
      trAnswer: [
        "Repo bilgisi sahaya yardimci olur ama sahanin yerine gecmez.",
        "Ozellikle elektriksel guvenlik, gaz islemi, basinc acma, kacak testi ve komponent degisimi gibi noktalarda canli olcum ve uzman mudahalesi zorunludur.",
        "DRC MAN'in dogru tavri, veriye dayali olasi kok nedenleri ve test sirasini vermek; tehlikeli islemleri otomatiklestirmemektir.",
        "Kaynak: secilen tum GitHub kaynaklarinin ortak siniri.",
      ].join(" "),
      deAnswer: [
        "Repo-Wissen hilft im Feld, ersetzt das Feld aber nicht.",
        "Vor allem bei elektrischer Sicherheit, Kaeltemittelarbeit, Druckoeffnung, Lecktest und Komponentenwechsel bleiben Live-Messung und Fachpersonal Pflicht.",
        "Die richtige Haltung fuer DRC MAN ist daher: moegliche Ursachen und Testreihenfolge datenbasiert nennen, gefaehrliche Eingriffe aber nicht automatisieren.",
        "Quelle: gemeinsame Grenze aller ausgewaehlten GitHub-Quellen.",
      ].join(" "),
      suggestions: ["gaz kacagi suphede ne yapilir", "sensor drifti nasil ayristirilir", "uzaktan alarm nasil yorumlanir"],
    }),
  ];
}

function writeExports(entries) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.writeFileSync(SOURCE_MANIFEST, JSON.stringify(SOURCES, null, 2), "utf8");

  const lines = ["# DRC MAN GitHub Fault Diagnosis Pack", "", "## Sources", ""];
  SOURCES.forEach((source) => {
    lines.push(`- ${source.name}: ${source.url}`);
    lines.push(`  - Use: ${source.use}`);
  });
  lines.push("", "## Entries", "");
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
