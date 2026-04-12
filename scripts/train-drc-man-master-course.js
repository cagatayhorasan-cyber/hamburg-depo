const fs = require("fs");
const path = require("path");

loadEnv(path.join(process.cwd(), ".env"));

const { initDatabase, get, withTransaction } = require("../server/db");

const TRAINING_TOPIC_PREFIX = "DRC MAN Usta Egitimi";
const EXPORT_DIR = path.join(process.cwd(), ".codex_tmp", "drc_man_master_course");
const EXPORT_JSON = path.join(EXPORT_DIR, "drc_man_master_course_faq.json");
const EXPORT_MD = path.join(EXPORT_DIR, "drc_man_master_course.md");

async function main() {
  await initDatabase();
  const admin = await get("SELECT id FROM users WHERE role = ? ORDER BY id ASC LIMIT 1", ["admin"]);
  const entries = buildEntries();

  await withTransaction(async (tx) => {
    await tx.execute("DELETE FROM agent_training WHERE topic LIKE ?", [`${TRAINING_TOPIC_PREFIX}%`]);
    for (const entry of entries) {
      await tx.execute(
        `
          INSERT INTO agent_training (
            topic, audience, keywords, tr_question, tr_answer, de_question, de_answer,
            suggestions, is_active, created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          entry.topic,
          entry.audience || "all",
          entry.keywords,
          entry.trQuestion,
          entry.trAnswer,
          entry.deQuestion,
          entry.deAnswer,
          JSON.stringify(entry.suggestions || []),
          true,
          admin?.id ? Number(admin.id) : null,
        ]
      );
    }
  });

  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.writeFileSync(EXPORT_JSON, JSON.stringify(toFaq(entries), null, 2), "utf8");
  fs.writeFileSync(EXPORT_MD, toMarkdown(entries), "utf8");

  console.log(
    JSON.stringify(
      {
        topicPrefix: TRAINING_TOPIC_PREFIX,
        entries: entries.length,
        exportJson: EXPORT_JSON,
        exportMarkdown: EXPORT_MD,
      },
      null,
      2
    )
  );
}

function buildEntries() {
  return [
    entry({
      module: "Modul 1 - Temel",
      keywords: "sogutma temeli soguk oda mantigi isi tasima sistem ne yapar",
      trQuestion: "Sogutma sisteminin temel mantigi nedir?",
      deQuestion: "Was ist die Grundlogik eines Kaeltesystems?",
      trAnswer: [
        "Sogutma sistemi soguk uretmez; isiyi bir noktadan alip baska bir noktaya tasir.",
        "Usta mantiginda ilk kural sudur: oda neden isinıyor, sistem neden zorlanıyor, once buna bakilir.",
        "Evaporator iceriden isi ceker, kompresor gazi cevirir, kondenser bu isi disari atar, genlesme elemani da donguyu dengeler.",
        "Bir sistem calisiyor gorunup yine de odayi toparlayamiyorsa sorun genelde kapasite eksigi, hava akisi, buzlanma, yuksek isi yuku veya yanlis ayardadir.",
        "Bu nedenle soguk oda isi sadece cihaz satmak degil; isi yukunu, urunu, kullanim seklini ve montaji dogru okumaktir.",
      ].join("\n"),
      deAnswer: [
        "Ein Kaeltesystem erzeugt keine Kaelte; es transportiert Waerme von einem Ort zu einem anderen.",
        "Die erste Denkweise des Monteurs ist: Warum kommt Waerme in den Raum und warum arbeitet die Anlage schwer?",
        "Der Verdampfer nimmt innen Waerme auf, der Verdichter zirkuliert das Kaeltemittel, der Verfluessiger gibt die Waerme nach aussen ab und das Expansionsorgan regelt den Kreislauf.",
        "Wenn die Anlage laeuft, den Raum aber nicht sauber herunterbringt, liegt die Ursache oft bei fehlender Leistung, Luftfuehrung, Vereisung, hoher Last oder falscher Einstellung.",
        "Darum ist Kuehlraumtechnik nicht nur Geraeteverkauf, sondern richtiges Lesen von Last, Produkt, Nutzung und Montage.",
      ].join("\n"),
      suggestions: ["Isi yuk hesabı neden onemli?", "Gaz secimi nasil yapilir?", "Evaporator ne is yapar?"],
    }),
    entry({
      module: "Modul 1 - Temel",
      keywords: "isi yuk hesabi oda hesabi neden onemli kapasite secimi",
      trQuestion: "Isi yuk hesabi neden bu kadar onemlidir?",
      deQuestion: "Warum ist die Waermelastberechnung so wichtig?",
      trAnswer: [
        "Ayni olcudeki iki oda ayni cihazla calismaz; cunku urun, kapi acilma sikligi, ortam sicakligi ve panel kalinligi farklidir.",
        "Sadece metrekup uzerinden secim yapmak ustalik degil, tahmindir.",
        "Isi yukunde duvar kayiplari, kapidan gelen sicak hava, aydinlatma, insan hareketi ve en onemlisi iceri giren urunun sicakligi birlikte dusunulur.",
        "Cihaz kucuk secilirse oda gec sogur ve kompresor durmadan calisir; fazla buyuk secilirse sik start-stop, nem bozulmasi ve verimsizlik gorulur.",
        "Dogru secim hacme gore degil, ihtiyac + makul guvenlik payina gore yapilir.",
      ].join("\n"),
      deAnswer: [
        "Zwei Raeume mit gleichem Volumen koennen unterschiedliche Aggregate brauchen, weil Produkt, Tuerhaeufigkeit, Umgebungstemperatur und Paneelstaerke verschieden sind.",
        "Nur nach Kubikmeter zu waehlen ist keine saubere Auslegung, sondern Schaetzung.",
        "Zur Last gehoeren Wandverluste, warme Luft durch die Tuer, Beleuchtung, Personenverkehr und vor allem die Temperatur des eingelagerten Produkts.",
        "Ist die Anlage zu klein, kuehlt der Raum schlecht und der Verdichter laeuft ohne Ruhe; ist sie zu gross, entstehen Start-Stopp-Betrieb, Feuchteprobleme und schlechter Wirkungsgrad.",
        "Richtig ist die Auswahl nach realem Bedarf plus vernuenftigem Sicherheitspuffer.",
      ].join("\n"),
      suggestions: ["Kesifte hangi sorular sorulur?", "Defrost neden onemli?", "Oda neden gec sogur?"],
    }),
    entry({
      module: "Modul 1 - Temel",
      keywords: "kesif sorulari teklif once ne sorulur kesif nasil yapilir",
      trQuestion: "Soguk oda kesfinde once hangi sorular sorulmalidir?",
      deQuestion: "Welche Fragen muessen bei der Kuehlraum-Besichtigung zuerst gestellt werden?",
      trAnswer: [
        "En az su sorular sorulmalidir: oda olcusu nedir, hedef derece nedir, hangi urun saklanacak, urun sicak giriyor mu, gunluk kapı kullanimi nasil, ortam sicakligi kac derece, panel kalinligi ne, zemin izolasyonu var mi?",
        "Buna ek olarak nem hassasiyeti, defrost beklentisi, enerji tipi, mesafe ve montaj sahasi da sorulmalidir.",
        "Sebze odasi, et deposu, sut urunu dolabi ve sok odasi ayni mantikla tekliflenmez.",
        "Dogru soru sorulmadiysa dogru cihaz secmek sansa kalir.",
        "Usta kesfi, tekliften once riski gormek demektir.",
      ].join("\n"),
      deAnswer: [
        "Mindestens diese Fragen muessen gestellt werden: Raumabmessung, Solltemperatur, welches Produkt wird gelagert, kommt Ware warm hinein, wie oft wird die Tuer benutzt, wie hoch ist die Umgebungstemperatur, wie dick ist das Paneel, gibt es Bodendaemmung?",
        "Zusatzfragen sind Feuchtebedarf, Defrost-Anforderung, Stromart, Leitungslänge und Montagesituation.",
        "Gemuese, Fleisch, Milchprodukt und Schockraum werden nicht mit derselben Logik angeboten.",
        "Ohne die richtigen Fragen ist die richtige Geraetewahl Glueckssache.",
        "Eine gute Besichtigung bedeutet, Risiken vor dem Angebot zu erkennen.",
      ].join("\n"),
      suggestions: ["Gaz secimi nasil yapilir?", "Sebze odasinda nem neden onemli?", "Teklifte en sik hata nedir?"],
    }),
    entry({
      module: "Modul 2 - Gazlar",
      keywords: "gaz secimi sogutucu akiskan nasil secilir r290 r134a r404a r507a",
      trQuestion: "Gaz secimi nasil yapilir ve neye gore belirlenir?",
      deQuestion: "Wie wird das Kaeltemittel ausgewaehlt und wonach entscheidet man?",
      trAnswer: [
        "Gaz secimi moda ile degil uygulama ile yapilir.",
        "Bakilan ana basliklar: hedef sicaklik araligi, kompresor uyumu, yag uyumu, enerji verimi, emniyet sinifi, servis aliskanligi ve yasal durumdur.",
        "Ayni kapasitede gorunen iki gaz, basinclar, kompresor sicakligi ve boru davranisi acisindan ayni sonucu vermez.",
        "R290 verimli ve guclu bir secenek olabilir ama yanicidir; bu nedenle her yerde ayni rahatlikla dusunulmez.",
        "R134a, R404A, R507A gibi gazlarin her biri farkli uygulama karakteri tasir; once sistemin ne istedigini, sonra gazi secmek gerekir.",
      ].join("\n"),
      deAnswer: [
        "Das Kaeltemittel wird nicht nach Trend, sondern nach Anwendung gewaehlt.",
        "Die Hauptpunkte sind Solltemperaturbereich, Verdichterfreigabe, Oelvertraeglichkeit, Energieeffizienz, Sicherheitsklasse, Servicepraxis und rechtliche Lage.",
        "Zwei Kaeltemittel mit scheinbar aehnlicher Leistung verhalten sich bei Drucklage, Verdichtertemperatur und Leitungscharakter nicht gleich.",
        "R290 kann effizient und stark sein, ist aber brennbar und deshalb nicht ueberall gleich unkritisch.",
        "R134a, R404A und R507A haben jeweils einen eigenen Einsatzcharakter; zuerst die Anlagenanforderung verstehen, dann das Kaeltemittel festlegen.",
      ].join("\n"),
      suggestions: ["R290 hangi durumda kullanilir?", "R134a ne icin uygundur?", "R404A ve R507A farki nedir?"],
    }),
    entry({
      module: "Modul 2 - Gazlar",
      keywords: "r290 propan ne zaman kullanilir yanici emniyet",
      trQuestion: "R290 gazi ne zaman kullanilir ve neden dikkat ister?",
      deQuestion: "Wann wird R290 verwendet und warum braucht es besondere Vorsicht?",
      trAnswer: [
        "R290 yani propan, ozellikle kompakt sistemlerde ve bazi ticari sogutmalarda verim avantaji saglayabilir.",
        "En buyuk arti tarafi enerji verimi ve bazi uygulamalarda guzel kapasite davranisidir.",
        "En kritik tarafi ise A3 yani yuksek yanicilik sinifinda olmasidir.",
        "Bu nedenle kacaga, havalandirmaya, elektrik komponentlerine, sarj miktarina ve montaj disiplinine cok daha ciddi bakilir.",
        "R290'da iyi usta olmak demek sadece gaz basmak degil; risk yonetimi yapmak demektir.",
      ].join("\n"),
      deAnswer: [
        "R290, also Propan, bringt besonders bei kompakten Systemen und manchen gewerblichen Anwendungen gute Effizienz.",
        "Der groesste Vorteil ist die Energieeffizienz und in passenden Faellen ein gutes Leistungsverhalten.",
        "Der kritische Punkt ist die Sicherheitsklasse A3, also hohe Entzuendbarkeit.",
        "Darum muessen Dichtheit, Belueftung, elektrische Bauteile, Fuellmenge und Montage sauber kontrolliert werden.",
        "R290 sauber zu beherrschen bedeutet nicht nur fuellen, sondern Risiko aktiv zu managen.",
      ].join("\n"),
      suggestions: ["R134a ne icin uygundur?", "Vakum ve kacak testi nasil yapilir?", "Kompresor niye bozulur?"],
    }),
    entry({
      module: "Modul 2 - Gazlar",
      keywords: "r134a nerede kullanilir orta sicaklik pozitif",
      trQuestion: "R134a hangi uygulamalarda daha uygun dusunulur?",
      deQuestion: "Fuer welche Anwendungen ist R134a eher geeignet?",
      trAnswer: [
        "R134a genelde orta sicaklik ve pozitif muhafaza tarafinda daha rahat dusunulen gazlardan biridir.",
        "Sistem basinc davranisi ve servis aliskanligi acisindan teknisyen icin daha tanidik bir alanda durur.",
        "Her yerde ideal degildir ama bircok pozitif uygulamada dengeli ve kontrollu bir secenek olabilir.",
        "Yine de kompresor etiketi, valf uyumu ve yag tipi kontrol edilmeden karar verilmez.",
        "Gaz seciminde aliskanlik degil teknik uyum esas alinmalidir.",
      ].join("\n"),
      deAnswer: [
        "R134a wird haeufig im mittleren Temperaturbereich und in Pluskuehlung betrachtet.",
        "Druckverhalten und Servicepraxis sind fuer viele Techniker vertraut und gut beherrschbar.",
        "Es ist nicht fuer alles ideal, kann aber in vielen Plus-Anwendungen eine ruhige und kontrollierte Wahl sein.",
        "Trotzdem wird nie ohne Verdichteretikett, Ventilabgleich und Oelkontrolle entschieden.",
        "Bei der Kaeltemittelwahl zaehlt technische Eignung, nicht Gewohnheit.",
      ].join("\n"),
      suggestions: ["R404A ve R507A farki nedir?", "Gaz secimi nasil yapilir?", "Superheat nedir?"],
    }),
    entry({
      module: "Modul 2 - Gazlar",
      keywords: "r404a r507a farki derin sogutma negatif",
      trQuestion: "R404A ve R507A ne icin kullanilir, farklari nasil dusunulur?",
      deQuestion: "Wofuer werden R404A und R507A verwendet und wie denkt man ueber ihre Unterschiede?",
      trAnswer: [
        "Bu gazlar tarihsel olarak dusuk sicaklik ve derin sogutma tarafinda cok kullanildi.",
        "Sahada bazen birbirine yakin davranis gosteren secenekler gibi ele alinsalar da sistem etiketi ve komponent uyumu esas alinir.",
        "Serviste en buyuk hata, 'yakindir, ayni gibi calisir' deyip etiketsiz karar vermektir.",
        "Negatif depolarda kompresor isi yuksek, defrost kritik ve borulama disiplini hassas oldugu icin gaz secimi daha dikkatli yapilir.",
        "Derin sogutmada rahat tahmin degil, net teknik kontrol gerekir.",
      ].join("\n"),
      deAnswer: [
        "Diese Kaeltemittel wurden historisch oft im Tiefkuehl- und Niedrigtemperaturbereich eingesetzt.",
        "Auch wenn sie im Feld teilweise aehnlich wirken, gelten immer Verdichteretikett und Bauteilfreigabe.",
        "Der groesste Fehler im Service ist: 'Das ist fast gleich, das wird schon gehen.'",
        "In Tiefkuehlraeumen sind Verdichterbelastung, Defrost und Rohrfuehrung kritischer, deshalb wird das Kaeltemittel dort genauer betrachtet.",
        "Im Negativbereich braucht man keine lockere Schaetzung, sondern saubere technische Pruefung.",
      ].join("\n"),
      suggestions: ["Defrost neden onemli?", "Yuksek basinç arizasi nasil okunur?", "Dusuk basinç arizasi nasil okunur?"],
    }),
    entry({
      module: "Modul 3 - Komponentler",
      keywords: "evaporator ne is yapar hava akisi buzlanma",
      trQuestion: "Evaporator ne is yapar ve neden secimi kritiktir?",
      deQuestion: "Was macht der Verdampfer und warum ist seine Auswahl kritisch?",
      trAnswer: [
        "Evaporator odanin icindeki isi alan parcadir.",
        "Sadece serpantin buyuklugu degil; fan kuvveti, hatve, hava hizi ve defrost karakteri de secimi belirler.",
        "Yanlis evaporator secilirse urun kuruyabilir, oda homojen sogumaz veya serpantin gereksiz hizli buz tutar.",
        "Sebze ile et deposu ayni evaporator davranisini istemez; nem, hava hizi ve yuzey sicakligi farklidir.",
        "Usta secimi, sadece kapasiteye degil urune ve kullanim tipine gore yapar.",
      ].join("\n"),
      deAnswer: [
        "Der Verdampfer ist das Bauteil, das die Waerme aus dem Raum aufnimmt.",
        "Nicht nur die Schlangenflaeche, sondern auch Ventilatorleistung, Lamellenabstand, Luftgeschwindigkeit und Defrost-Verhalten bestimmen die Auswahl.",
        "Bei falscher Wahl kann das Produkt austrocknen, der Raum ungleichmaessig kuehlen oder der Verdampfer zu schnell vereisen.",
        "Ein Gemuese- und ein Fleischraum brauchen nicht dasselbe Verdampferverhalten; Feuchte, Lufttempo und Oberflaechentemperatur sind verschieden.",
        "Die gute Auswahl orientiert sich nicht nur an Leistung, sondern auch an Produkt und Nutzung.",
      ].join("\n"),
      suggestions: ["Kondenser ne is yapar?", "Defrost neden onemli?", "Oda neden esit sogumaz?"],
    }),
    entry({
      module: "Modul 3 - Komponentler",
      keywords: "kondenser ne is yapar yuksek basinç kirli kondenser",
      trQuestion: "Kondenser ne is yapar ve neden rahat nefes almalidir?",
      deQuestion: "Was macht der Verfluessiger und warum muss er frei atmen koennen?",
      trAnswer: [
        "Kondenser, sistemin topladigi isiyi dis ortama atan parcadir.",
        "Kondenser kirlenirse, hava gecmezse veya ortam cok sicaksa sistem yuksek basinçta calisir.",
        "Bu durum kompresor sicakligini arttirir, enerji tuketimini bozar ve bazen basinc presostatina kadar gider.",
        "Sahada 'gaz fazla' sanilan bircok sorun aslinda kirli kondenser veya zayif hava akisidir.",
        "Bu yuzden kondenser temizligi ve montaj yeri performansin yarisi gibidir.",
      ].join("\n"),
      deAnswer: [
        "Der Verfluessiger gibt die im System gesammelte Waerme an die Umgebung ab.",
        "Ist er verschmutzt, schlecht belueftet oder in zu warmer Umgebung, arbeitet die Anlage mit hohem Druck.",
        "Das erhoeht die Verdichtertemperatur, verschlechtert den Verbrauch und fuehrt im Extrem bis zur Hochdruckabschaltung.",
        "Viele vermeintliche 'zu viel Gas'-Fehler sind in Wahrheit ein schmutziger Verfluessiger oder schlechte Luftfuehrung.",
        "Darum sind Reinigung und Einbauort des Verfluessigers entscheidend fuer die Leistung.",
      ].join("\n"),
      suggestions: ["Kompresor neden bozulur?", "Yuksek basinç arizasi nasil okunur?", "Subcool nedir?"],
    }),
    entry({
      module: "Modul 3 - Komponentler",
      keywords: "kompresor ne yapar neden bozulur kalp sistem",
      trQuestion: "Kompresor ne yapar ve en sik neden bozulur?",
      deQuestion: "Was macht der Verdichter und warum geht er am haeufigsten kaputt?",
      trAnswer: [
        "Kompresor devrenin kalbidir ama arizanin asli sebebi cogu zaman baska yerdedir.",
        "En sik nedenler: yetersiz sogutma geri donusu, yuksek basinç, kacakli sistem, kirli devre, yanlis sarj, yag problemi, kotu vakum ve elektrik dengesizligidir.",
        "Bir kompresor durup dururken yanmis gibi anlatilsa da ustalik once 'neden yandi?' sorusunu sormaktir.",
        "Kompresor degistirip kok nedeni cozmezsen ayni ariza tekrar eder.",
        "Bu nedenle kompresor arizasi son nokta degil, arastirmanin baslangici gibi ele alinmalidir.",
      ].join("\n"),
      deAnswer: [
        "Der Verdichter ist das Herz des Kreislaufs, aber die eigentliche Ursache liegt oft anderswo.",
        "Haeufige Gruende sind fehlende Kuehlung am Rueckgas, hoher Druck, undichte Anlage, verschmutzter Kreislauf, falsche Fuellung, Oelprobleme, schlechter Vakuumprozess und elektrische Unruhe.",
        "Wenn gesagt wird 'der Verdichter ist einfach verbrannt', beginnt gute Arbeit erst mit der Frage: warum?",
        "Wer nur den Verdichter tauscht und die Ursache nicht beseitigt, sieht denselben Fehler wieder.",
        "Darum ist ein Verdichterschaden nicht der Schlusspunkt, sondern der Start einer sauberen Analyse.",
      ].join("\n"),
      suggestions: ["Superheat nedir?", "Yuksek basinç arizasi nasil okunur?", "Vakum ve kacak testi nasil yapilir?"],
    }),
    entry({
      module: "Modul 3 - Komponentler",
      keywords: "genlesme valfi expansion valve txv ne is yapar",
      trQuestion: "Genlesme valfi ne is yapar ve neden yanlis secim sorun yaratir?",
      deQuestion: "Was macht das Expansionsventil und warum fuehrt eine falsche Wahl zu Problemen?",
      trAnswer: [
        "Genlesme valfi evaporatore giden sivi miktarini kontrol ederek superheat dengesini kurmaya yardim eder.",
        "Gaz tipi, kapasite ve orifis uyumu yanlis ise evaporator ya ac kalir ya da fazla beslenir.",
        "Ac kalan evaporator kapasite kaybeder; fazla beslenen sistemde sivi donusu ve kompresor riski artar.",
        "Bu yuzden valf sadece 'uyar gibi' mantigiyla secilmez.",
        "Montaj kalitesi, sensor ampulu baglantisi ve izolasyonu da valfin davranisini ciddi etkiler.",
      ].join("\n"),
      deAnswer: [
        "Das Expansionsventil regelt die Fluessigmenge zum Verdampfer und hilft, einen sauberen Superheat aufzubauen.",
        "Sind Kaeltemittel, Leistung oder Duesengroesse falsch, bekommt der Verdampfer zu wenig oder zu viel.",
        "Bei Unterversorgung fehlt Leistung; bei Ueberversorgung steigt das Risiko fuer Fluessigkeitsruecklauf und Verdichterschaden.",
        "Deshalb waehlt man das Ventil nie nur nach dem Prinzip 'passt schon'.",
        "Auch Montage, Fuehlerkontakt und Isolierung beeinflussen das Ventilverhalten stark.",
      ].join("\n"),
      suggestions: ["Superheat nedir?", "Dusuk basinç arizasi nasil okunur?", "Sivi donusu neden tehlikelidir?"],
    }),
    entry({
      module: "Modul 3 - Komponentler",
      keywords: "filter drier solenoid ne ise yarar sivi hatti",
      trQuestion: "Filter drier ve solenoid valf neden onemlidir?",
      deQuestion: "Warum sind Filtertrockner und Magnetventil wichtig?",
      trAnswer: [
        "Filter drier sivi hattindaki nemi ve kiri tutar; sistem sagligi icin kucuk ama kritik bir parcadir.",
        "Nem kalirsa buz, asit ve icten ariza zinciri olusabilir.",
        "Solenoid valf ise akisi kontrol etmek, pump-down gibi senaryolari yonetmek ve sistemi daha kontrollu durdurmak icin kullanilir.",
        "Bu iki parca dogru yerde ve temiz montajla kullanildiginda sistemin omru uzar.",
        "Kucuk parca diye ihmal edilen yerler genelde buyuk ariza sebebi olur.",
      ].join("\n"),
      deAnswer: [
        "Der Filtertrockner haelt Feuchte und Schmutz aus der Fluessigkeitsleitung fern; klein, aber systemkritisch.",
        "Bleibt Feuchte im Kreis, entstehen Eis, Saeure und spaeter innere Schaeden.",
        "Das Magnetventil dient zur Flusskontrolle, fuer Pump-Down-Szenarien und fuer ein kontrollierteres Abschalten.",
        "Wenn beide Bauteile sauber geplant und montiert sind, steigt die Zuverlaessigkeit deutlich.",
        "Gerade kleine, unterschaetzte Teile loesen spaeter oft grosse Fehler aus.",
      ].join("\n"),
      suggestions: ["Vakum ve kacak testi nasil yapilir?", "Defrost neden onemli?", "Kompresor neden bozulur?"],
    }),
    entry({
      module: "Modul 4 - Devreye Alma",
      keywords: "superheat nedir nasil yorumlanir emme tarafi",
      trQuestion: "Superheat nedir ve neden okumayi bilmek gerekir?",
      deQuestion: "Was ist Superheat und warum muss man ihn lesen koennen?",
      trAnswer: [
        "Superheat, evaporator cikisindaki gazin kaynama noktasinin uzerinde ne kadar isindigini anlatir.",
        "Pratikte bu deger, evaporatorun yeterli mi yetersiz mi beslendigini anlamada cok yardim eder.",
        "Cok yuksek superheat genelde aclik, akis kisiti veya dusuk besleme isaretidir.",
        "Cok dusuk superheat ise sivi donusu riskini dusundurur.",
        "Superheat okumayi bilen usta, sadece 'oda sogutmuyor' demez; besleme dengesini sayisal olarak gorur.",
      ].join("\n"),
      deAnswer: [
        "Superheat beschreibt, wie weit das Gas am Verdampferausgang ueber seinen Verdampfungspunkt erwaermt ist.",
        "In der Praxis hilft dieser Wert stark dabei zu verstehen, ob der Verdampfer passend oder zu knapp gespeist wird.",
        "Zu hoher Superheat deutet oft auf Hunger, Flussbegrenzung oder zu geringe Einspeisung hin.",
        "Zu niedriger Superheat laesst an Fluessigkeitsruecklauf denken.",
        "Wer Superheat lesen kann, beschreibt nicht nur 'der Raum kuehlt schlecht', sondern sieht die Einspeisung technisch sauber.",
      ].join("\n"),
      suggestions: ["Subcool nedir?", "Genlesme valfi ne is yapar?", "Dusuk basinç arizasi nasil okunur?"],
    }),
    entry({
      module: "Modul 4 - Devreye Alma",
      keywords: "subcool nedir sivi hatti nasil yorumlanir",
      trQuestion: "Subcool nedir ve neden tek basina basinç bakmak yetmez?",
      deQuestion: "Was ist Subcool und warum reicht reiner Druckblick nicht aus?",
      trAnswer: [
        "Subcool, kondenser cikisindaki sivi hattinin yogusma noktasinin altinda ne kadar sogutuldugunu anlatir.",
        "Bu deger sivi kolonunun sagligi ve sarj durumunu okumada yardimci olur.",
        "Sadece basinç gormek yetmez; cunku basinç degeri tek basina gaz miktari, hava sorunu ve isi atimini ayirt etmez.",
        "Superheat ve subcool birlikte okunursa sistemin aclik mi tasma mi yasadigi daha net anlasilir.",
        "Olcuye bakmadan gaz yorumu yapmak sahadaki en buyuk hatalardan biridir.",
      ].join("\n"),
      deAnswer: [
        "Subcool beschreibt, wie weit die Fluessigkeitsleitung hinter dem Verfluessiger unter den Verfluessigungspunkt abgekuehlt ist.",
        "Der Wert hilft, den Zustand der Fluessigsaeule und das Fuellbild besser zu verstehen.",
        "Nur den Druck zu sehen reicht nicht, weil Druck allein nicht zwischen Fuellmenge, Luftproblem und Waermeabgabe trennt.",
        "Wenn Superheat und Subcool zusammen gelesen werden, erkennt man viel klarer, ob das System hungert oder ueberfuettert ist.",
        "Ohne Messwerte ueber Gas zu urteilen ist einer der groessten Feldfehler.",
      ].join("\n"),
      suggestions: ["Vakum ve kacak testi nasil yapilir?", "Yuksek basinç arizasi nasil okunur?", "Gaz secimi nasil yapilir?"],
    }),
    entry({
      module: "Modul 4 - Devreye Alma",
      keywords: "vakum kacak testi azot neden onemli devreye alma",
      trQuestion: "Vakum ve kacak testi neden zorunludur?",
      deQuestion: "Warum sind Lecktest und Vakuumprozess zwingend?",
      trAnswer: [
        "Kacak testi yapilmadan, sistemin saglam oldugu varsayilamaz.",
        "Azotla basinc testi baglanti kalitesini, kaynak guvenini ve buyuk kacaklari ortaya cikarir.",
        "Vakum ise sistemin icindeki havayi ve nemi uzaklastirir.",
        "Iyi vakum yapilmayan sistemde buz, asit, verim dususu ve kompresor omru kisalmasi gorulebilir.",
        "Gaz basmak hizli bir is gibi gorunebilir ama temiz devreye alma yapmayan usta arizayi davet eder.",
      ].join("\n"),
      deAnswer: [
        "Ohne Lecktest darf man nie annehmen, dass die Anlage dicht ist.",
        "Die Druckprobe mit Stickstoff zeigt Verbindungsqualitaet, Loetstellen und grobe Undichtheiten.",
        "Das Vakuum entfernt Luft und Feuchte aus dem System.",
        "Bei schlechtem Vakuum entstehen Vereisung, Saeure, Wirkungsgradverlust und kuerzere Verdichterlebensdauer.",
        "Das Fuellen wirkt schnell, aber eine unsaubere Inbetriebnahme holt den Fehler spaeter zurueck.",
      ].join("\n"),
      suggestions: ["Sarj nasil yorumlanir?", "Kompresor neden bozulur?", "Filter drier neden onemlidir?"],
    }),
    entry({
      module: "Modul 4 - Devreye Alma",
      keywords: "sarj devreye alma olcuye gore gaz basmak",
      trQuestion: "Gaz sarji ve ilk devreye alma nasil dusunulmelidir?",
      deQuestion: "Wie denkt man ueber Fuellung und erste Inbetriebnahme?",
      trAnswer: [
        "Gaz sarji ezbere degil, sistem davranisina ve olcuye gore yapilir.",
        "Etiket bilgisi, uretici tavsiyesi, superheat, subcool, emme-basma davranisi ve oda kosulu birlikte okunur.",
        "Ilk devreye almada sadece dereceye bakmak yetersizdir; kompresor sesi, fan akisi, buzlanma davranisi ve akim da izlenir.",
        "Sistem hemen kusursuz gibi gorunse bile bir sure stabil davranis beklenir.",
        "Usta, ilk calisma anini degil, sistemin oturmus halini degerlendirir.",
      ].join("\n"),
      deAnswer: [
        "Die Fuellung erfolgt nicht nach Bauchgefuehl, sondern nach Messwert und Anlagenverhalten.",
        "Typenschild, Herstellerangaben, Superheat, Subcool, Saug-/Druckverhalten und Raumzustand werden zusammen gelesen.",
        "Bei der Erstinbetriebnahme reicht ein Temperaturblick nicht; auch Verdichtergeraeusch, Luftstrom, Vereisungsverhalten und Stromaufnahme gehoeren dazu.",
        "Selbst wenn die Anlage sofort gut wirkt, muss man ihr stabiles Verhalten abwarten.",
        "Der gute Monteur bewertet nicht nur den Start, sondern den eingependelten Zustand.",
      ].join("\n"),
      suggestions: ["Oda sogutmuyorsa neye bakilir?", "Yuksek basinç arizasi nasil okunur?", "Evaporator neden buz tutar?"],
    }),
    entry({
      module: "Modul 5 - Ariza",
      keywords: "defrost neden onemli buz tutma evaporator",
      trQuestion: "Defrost neden zorunludur ve yanlis ayarda ne olur?",
      deQuestion: "Warum ist Defrost zwingend und was passiert bei falscher Einstellung?",
      trAnswer: [
        "Evaporator yuzeyinde buz birikirse hava gecisi duser ve kapasite kaybolur.",
        "Cihaz calisiyor gibi gorunur ama oda isiyi cekemez.",
        "Defrost az olursa buz birikir; fazla olursa gereksiz isi yuklenir ve urun korunumu bozulur.",
        "Yanlis defrost saati, suresi veya sonlandirma mantigi sistem performansini dogrudan etkiler.",
        "Bu nedenle defrost ayari soguk odada yan menu degil, ana ayardir.",
      ].join("\n"),
      deAnswer: [
        "Wenn sich Eis auf dem Verdampfer aufbaut, sinkt der Luftdurchsatz und damit die Leistung.",
        "Die Anlage wirkt in Betrieb, kann aber die Waerme nicht mehr sauber aus dem Raum ziehen.",
        "Zu wenig Defrost fuehrt zu Eis, zu viel Defrost bringt unnoetige Waerme und stoert die Produktfuehrung.",
        "Falsche Defrost-Zeit, Dauer oder Endlogik beeinflussen die Anlagenleistung direkt.",
        "Darum ist Defrost in Kuehlraeumen keine Nebenfunktion, sondern eine Kern-Einstellung.",
      ].join("\n"),
      suggestions: ["Evaporator neden buz tutar?", "Oda neden gec sogur?", "Dusuk basinç arizasi nasil okunur?"],
    }),
    entry({
      module: "Modul 5 - Ariza",
      keywords: "yuksek basinç ariza hp fault kondenser",
      trQuestion: "Yuksek basinç arizasi geldiginde ilk ne dusunulur?",
      deQuestion: "Was denkt man zuerst bei einer Hochdruckstoerung?",
      trAnswer: [
        "Ilk bakilan yer kondenser tarafidir: kir, hava gecisi, fan, ortam sicakligi ve montaj mesafesi.",
        "Sonra sarj, non-condensable ihtimali ve akis kisitlari degerlendirilir.",
        "Bir sistemde yuksek basinç goruluyorsa hemen gazi bosaltmak ustalik degildir.",
        "Once isi atilabiliyor mu, fanlar dogru calisiyor mu, kondenser nefes aliyor mu buna bakilir.",
        "Yuksek basinç cogu zaman 'isi disari atamiyorum' diye bagirir.",
      ].join("\n"),
      deAnswer: [
        "Der erste Blick geht auf den Verfluessiger: Verschmutzung, Luftdurchsatz, Ventilator, Umgebungstemperatur und Einbausituation.",
        "Danach werden Fuellbild, moegliche Fremdgase und Flussbegrenzungen betrachtet.",
        "Bei Hochdruck sofort Kaeltemittel abzulassen ist keine saubere Facharbeit.",
        "Zuerst pruefen: kann die Waerme raus, laufen die Ventilatoren richtig, bekommt der Verfluessiger genug Luft?",
        "Hochdruck sagt oft sehr deutlich: Ich bekomme meine Waerme nicht weg.",
      ].join("\n"),
      suggestions: ["Kondenser ne is yapar?", "Subcool nedir?", "Dusuk basinç arizasi nasil okunur?"],
    }),
    entry({
      module: "Modul 5 - Ariza",
      keywords: "dusuk basinç ariza lp aclik kisit tikaniklik",
      trQuestion: "Dusuk basinç arizasi nasil okunur?",
      deQuestion: "Wie liest man eine Niederdruckstoerung?",
      trAnswer: [
        "Dusuk basinç gorunce once evaporatorun ac mi kaldigini dusun.",
        "Muhtemel nedenler: eksik sarj, akis kisiti, tikanik filter drier, sorunlu valf, dusuk isi yuk veya hava eksigi olabilir.",
        "Sadece basinç dusuk diye tek bir sebebe kosulmaz; superheat, buzlanma, sivi hatti ve oda davranisi birlikte okunur.",
        "Ac bir evaporator kapasiteyi dusurur ve oda bir turlu toparlanmaz.",
        "Dogru ustalik, basinç degerini neden-sonuc zinciriyle okumaktir.",
      ].join("\n"),
      deAnswer: [
        "Bei Niederdruck wird zuerst daran gedacht, ob der Verdampfer zu wenig bekommt.",
        "Moegliche Ursachen sind Unterfuellung, Flussbegrenzung, zugesetzter Filtertrockner, Ventilproblem, zu geringe Last oder fehlender Luftstrom.",
        "Nur wegen niedrigem Druck rennt man nicht zu einer einzigen Ursache; Superheat, Vereisung, Fluessigleitung und Raumverhalten werden zusammen gelesen.",
        "Ein hungriger Verdampfer nimmt Leistung weg und der Raum wird nicht sauber erreicht.",
        "Gute Facharbeit bedeutet, den Druckwert in einer Ursache-Wirkung-Kette zu lesen.",
      ].join("\n"),
      suggestions: ["Superheat nedir?", "Evaporator neden buz tutar?", "Vakum ve kacak testi neden onemli?"],
    }),
    entry({
      module: "Modul 5 - Ariza",
      keywords: "oda sogutmuyor neye bakilir problem cozum",
      trQuestion: "Oda sogutmuyorsa sistematik olarak neye bakilir?",
      deQuestion: "Worauf schaut man systematisch, wenn der Raum nicht kuehlt?",
      trAnswer: [
        "Ilk adim: oda yukunu dusun. Kapi acik mi, sicak urun mu girdi, panel veya kapida kacak mi var?",
        "Ikinci adim: hava akisi. Evaporator buzlu mu, fanlar donuyor mu, hava yolu kapali mi?",
        "Ucuncu adim: sogutma cevrimi. Basinclar, superheat, subcool ve sarj mantigi okunur.",
        "Dorduncu adim: kontrol. Defrost ayari, sensor hatasi, termostat, kontaktor ve zamanlama incelenir.",
        "Sistematik bakan usta parcaya atlamaz; once arizayi katman katman daraltir.",
      ].join("\n"),
      deAnswer: [
        "Schritt eins: Raumlast denken. Ist die Tuer offen, kam warme Ware hinein, gibt es Undichtheiten an Paneel oder Tuer?",
        "Schritt zwei: Luftstrom. Ist der Verdampfer vereist, drehen die Ventilatoren, ist der Luftweg frei?",
        "Schritt drei: Kaeltekreis. Drucke, Superheat, Subcool und Fuelllogik werden gelesen.",
        "Schritt vier: Regelung. Defrost, Fuehler, Thermostat, Schuetze und Zeitlogik werden geprueft.",
        "Wer systematisch arbeitet, springt nicht sofort auf Bauteiltausch, sondern grenzt den Fehler Stufe fuer Stufe ein.",
      ].join("\n"),
      suggestions: ["Yuksek basinç arizasi nasil okunur?", "Dusuk basinç arizasi nasil okunur?", "Defrost neden onemli?"],
    }),
    entry({
      module: "Modul 5 - Ariza",
      keywords: "evaporator buz tutuyor neden buzlanma",
      trQuestion: "Evaporator neden buz tutar?",
      deQuestion: "Warum vereist der Verdampfer?",
      trAnswer: [
        "En sik nedenler: yetersiz defrost, dusuk hava akisi, kapi kullanimi, yuksek nem, sensor hatasi ve bazen dusuk besleme dengesidir.",
        "Buzlanma gordugunde sadece gazi dusunmek yanlistir.",
        "Fan durduysa, serpantin kirliyse veya hava yolu kapaliysa yuzey hizla buz tutabilir.",
        "Negatif odalarda buzlanma daha hassastir; defrost ve hava akisi dogru kurulmadiysa kapasite hizla duser.",
        "Buz, sebep degil sonuc olabilir; asıl nedeni bulmak gerekir.",
      ].join("\n"),
      deAnswer: [
        "Hauefige Gruende sind zu wenig Defrost, geringer Luftstrom, Tuerbetrieb, hohe Feuchte, Fuehlerfehler und teilweise eine falsche Einspeisung.",
        "Bei Vereisung nur ans Kaeltemittel zu denken ist falsch.",
        "Wenn der Ventilator steht, der Waermetauscher verschmutzt ist oder der Luftweg blockiert ist, friert die Flaeche schnell zu.",
        "Im Tiefkuehlbereich ist Vereisung besonders sensibel; ohne sauberen Defrost und Luftstrom faellt die Leistung rasch ab.",
        "Eis ist oft nicht die Ursache, sondern das sichtbare Ergebnis eines anderen Problems.",
      ].join("\n"),
      suggestions: ["Defrost neden onemli?", "Dusuk basinç arizasi nasil okunur?", "Oda sogutmuyorsa neye bakilir?"],
    }),
    entry({
      module: "Modul 5 - Ariza",
      keywords: "yag donusu oil return borulama emme hatti",
      trQuestion: "Yag donusu neden onemlidir ve nerede hata yapilir?",
      deQuestion: "Warum ist Oelrueckfuehrung wichtig und wo passieren Fehler?",
      trAnswer: [
        "Kompresor sadece gaz degil yag dengesine de baglidir.",
        "Boru egimleri, hizlar, dusus-kalkislar ve kapasite davranisi yanlis ise yag sistemde dolasir ama geri donmez.",
        "Bu durum uzun vadede kompresoru yorar ve ses, isinma veya ariza olarak geri gelir.",
        "Ozellikle uzun hatlarda, dusu hattinda ve dusuk yukte calisan sistemlerde yag donusu daha dikkatli dusunulur.",
        "Temiz borulama, sadece goruntu degil kompresor omrudur.",
      ].join("\n"),
      deAnswer: [
        "Der Verdichter haengt nicht nur vom Gas-, sondern auch vom Oelhaushalt ab.",
        "Sind Rohrgefaelle, Gasgeschwindigkeiten, Steigleitungen oder Lastverhalten unpassend, wandert Oel durchs System und kommt nicht sauber zurueck.",
        "Das belastet den Verdichter langfristig und fuehrt spaeter zu Geraeusch, Hitze oder Schaden.",
        "Besonders bei langen Leitungen, Steigleitungen und geringer Last muss die Oelrueckfuehrung sauber gedacht werden.",
        "Saubere Rohrfuehrung ist nicht nur Optik, sondern Verdichterlebensdauer.",
      ].join("\n"),
      suggestions: ["Kompresor neden bozulur?", "Vakum neden onemli?", "Yuksek basinç arizasi nasil okunur?"],
    }),
    entry({
      module: "Modul 6 - Satis ve Kesif",
      keywords: "satis kesfi nasil yapilir musteriye ne sorulur teklif",
      trQuestion: "Satis veya teklif oncesi musteriye nasil yaklasilmalidir?",
      deQuestion: "Wie soll man vor Verkauf oder Angebot an den Kunden herangehen?",
      trAnswer: [
        "Once urun satmaya degil ihtiyaci anlamaya odaklan.",
        "Musteriye su cizgide yaklas: ne depolanacak, hangi derecede, ne kadar urun girecek, kapi kullanimi nasil, mevcut sistem var mi, enerji tipi ne?",
        "Erken fiyat vermek bazen hiz kazandirir ama yanlis cihaz satma riskini buyutur.",
        "Usta satici, musteriye sadece rakam soylemez; neden bu sistemi sectigini anlatir.",
        "Guven, en cok dogru sorudan dogar.",
      ].join("\n"),
      deAnswer: [
        "Vor dem Verkauf geht es zuerst nicht um das Produkt, sondern um den Bedarf.",
        "Die Linie zum Kunden ist: Was wird gelagert, bei welcher Temperatur, wie viel Ware kommt hinein, wie oft wird die Tuer genutzt, gibt es ein Bestandssystem, welche Energie liegt an?",
        "Ein zu frueher Preis spart manchmal Zeit, vergroessert aber das Risiko einer falschen Auslegung.",
        "Der gute Verkaeufer nennt nicht nur Zahlen, sondern erklaert, warum genau dieses System passt.",
        "Vertrauen entsteht vor allem durch die richtigen Fragen.",
      ].join("\n"),
      suggestions: ["Isi yuk hesabi neden onemli?", "Teklifte en sik hata nedir?", "Gaz secimi nasil yapilir?"],
    }),
    entry({
      module: "Modul 6 - Satis ve Kesif",
      keywords: "teklifte hata teklif hazirlarken en sik hata fazla kapasite",
      trQuestion: "Teklif verirken en sik yapilan hata nedir?",
      deQuestion: "Was ist der haeufigste Fehler beim Erstellen eines Angebots?",
      trAnswer: [
        "En sik hata, yuk hesabini netlestirmeden sadece buyuk cihazla guvenli kalmaya calismaktir.",
        "Fazla kapasite her zaman iyi cozum degildir; nemi bozar, verimi dusurur ve bazen urune zarar verir.",
        "Ikinci buyuk hata, montaj ve saha risklerini teklif disinda birakmaktir.",
        "Ucuncu hata ise cihaz secimini aciklamadan sadece fiyat sunmaktir.",
        "Iyi teklif, dogru cihaz + dogru gerekce + sahaya uygun uygulama detayidir.",
      ].join("\n"),
      deAnswer: [
        "Der haeufigste Fehler ist, ohne klare Lastberechnung einfach ein groesseres Geraet als vermeintlich sichere Loesung zu waehlen.",
        "Zu viel Leistung ist nicht automatisch gut; sie kann Feuchte stoeren, Wirkungsgrad verschlechtern und im Extrem dem Produkt schaden.",
        "Ein zweiter grosser Fehler ist, Montage- und Feldrisiken aus dem Angebot herauszulassen.",
        "Der dritte Fehler ist, nur einen Preis zu nennen, ohne die Auswahl technisch zu begruenden.",
        "Ein gutes Angebot ist: richtiges Geraet plus richtige Begruendung plus saubere Feldtauglichkeit.",
      ].join("\n"),
      suggestions: ["Kesifte hangi sorular sorulur?", "Satis oncesi musteriye nasil yaklasilir?", "Oda sogutmuyorsa neye bakilir?"],
    }),
    entry({
      module: "Modul 6 - Satis ve Kesif",
      keywords: "sebze odasi nem neden onemli urun korunumu",
      trQuestion: "Sebze odasinda neden sadece derece degil nem de onemlidir?",
      deQuestion: "Warum ist im Gemueseraum nicht nur Temperatur, sondern auch Feuchte wichtig?",
      trAnswer: [
        "Sebze ve meyve gibi urunlerde kalite kaybi cogu zaman sadece sicakliktan degil, nem dengesinden de olur.",
        "Nem dusukse urun su kaybeder, fire verir ve goruntu bozulur.",
        "Nem cok yuksekse yuzeyde yogusma, bozulma ve hijyen sorunu artabilir.",
        "Bu nedenle evaporator secimi, hava hizi ve defrost mantigi urune gore dusunulmelidir.",
        "Sebze odasinda iyi ustalik, sadece sogutmak degil urunu korumaktir.",
      ].join("\n"),
      deAnswer: [
        "Bei Gemuese und Obst entsteht Qualitaetsverlust oft nicht nur durch Temperatur, sondern auch durch die Feuchtebilanz.",
        "Ist die Feuchte zu niedrig, verliert das Produkt Wasser, Gewicht und Aussehen.",
        "Ist sie zu hoch, steigen Kondensation, Verderb und Hygieneprobleme.",
        "Darum muessen Verdampferwahl, Luftgeschwindigkeit und Defrost-Logik auf das Produkt abgestimmt sein.",
        "Gute Arbeit im Gemueseraum bedeutet nicht nur kuehlen, sondern Ware schuetzen.",
      ].join("\n"),
      suggestions: ["Evaporator ne is yapar?", "Isi yuk hesabi neden onemli?", "Defrost neden onemli?"],
    }),
  ];
}

function entry(config) {
  return {
    topic: `${TRAINING_TOPIC_PREFIX} - ${config.module}`,
    audience: "all",
    keywords: config.keywords,
    trQuestion: config.trQuestion,
    trAnswer: config.trAnswer,
    deQuestion: config.deQuestion,
    deAnswer: config.deAnswer,
    suggestions: config.suggestions || [],
  };
}

function toFaq(entries) {
  return entries.map((entry, index) => ({
    id: `drc_master_${String(index + 1).padStart(3, "0")}`,
    keywords: Array.from(new Set(String(entry.keywords || "").split(/\s+/).filter(Boolean))),
    tr_questions: [entry.trQuestion],
    de_questions: [entry.deQuestion],
    tr_answer: entry.trAnswer,
    de_answer: entry.deAnswer,
    suggestions: entry.suggestions || [],
    source_summary: entry.topic,
  }));
}

function toMarkdown(entries) {
  const lines = [
    "# DRC MAN Usta Egitimi",
    "",
    "Bu paket soguk oda ve sogutma isinde temel mantik, gazlar, komponentler, devreye alma, ariza teshisi ve teklif refleksi icin hazirlandi.",
    "",
  ];
  entries.forEach((entry) => {
    lines.push(`## ${entry.topic}`);
    lines.push("");
    lines.push(`TR Soru: ${entry.trQuestion}`);
    lines.push("");
    lines.push(entry.trAnswer);
    lines.push("");
    lines.push(`DE Frage: ${entry.deQuestion}`);
    lines.push("");
    lines.push(entry.deAnswer);
    lines.push("");
  });
  return `${lines.join("\n")}\n`;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
