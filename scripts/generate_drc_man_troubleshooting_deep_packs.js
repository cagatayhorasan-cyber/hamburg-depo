const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), ".codex_tmp", "drc_man_troubleshooting_deep_packs");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "drc_man_troubleshooting_deep_packs.json");
const SUMMARY_PATH = path.join(OUTPUT_DIR, "drc_man_troubleshooting_deep_packs_summary.json");
const MARKDOWN_PATH = path.join(OUTPUT_DIR, "drc_man_troubleshooting_deep_packs_overview.md");

const trQuestionTemplates = [
  (pack, context, family) => `${pack.trLabel} tarafinda ${context.trLabel} icin ${family.trSubject} neden olur`,
  (pack, context, family) => `${context.trLabel} sisteminde ${family.trSubject} varsa usta once neyi olcer`,
  (pack, context, family) => `${pack.trLabel} arizasinda ${family.trSubject} montaj mi ayar mi parca mi diye nasil ayrilir`,
  (pack, context, family) => `${context.trLabel} uygulamasinda ${family.trSubject} tekrar ediyorsa kok neden ne olur`,
  (pack, context, family) => `${family.trSubject} durumunda ${pack.trLabel} icin servis sirasi nasil olmali`,
  (pack, context, family) => `${context.trLabel} tarafinda ${family.trSubject} icin en sik insan hatasi nedir`,
  (pack, context, family) => `${pack.trLabel} odakli arizada ${family.trSubject} icin hangi olcumler birlikte okunur`,
  (pack, context, family) => `${family.trSubject} varsa ${context.trLabel} sisteminde hangi parca hemen suclanmaz`,
  (pack, context, family) => `${pack.trLabel} tarafinda ${family.trSubject} kalici nasil cozulur`,
  (pack, context, family) => `${context.trLabel} icin ${family.trSubject} goruldugunde hangi semptom aldatici olabilir`,
];

const deQuestionTemplates = [
  (pack, context, family) => `warum kommt es im Bereich ${pack.deLabel} bei ${context.deLabel} dazu, dass ${family.deSubject}`,
  (pack, context, family) => `was misst ein meister zuerst, wenn bei ${context.deLabel} ${family.deSubject}`,
  (pack, context, family) => `wie trennt man bei ${pack.deLabel} ab, ob ${family.deSubject} an montage, einstellung oder bauteil liegt`,
  (pack, context, family) => `welche grundursache ist typisch, wenn bei ${context.deLabel} ${family.deSubject} immer wieder auftritt`,
  (pack, context, family) => `wie ist die service reihenfolge, wenn ${family.deSubject} im Bereich ${pack.deLabel}`,
  (pack, context, family) => `welcher typische bedienfehler steckt oft dahinter, wenn bei ${context.deLabel} ${family.deSubject}`,
  (pack, context, family) => `welche messwerte liest man zusammen, wenn bei ${pack.deLabel} ${family.deSubject}`,
  (pack, context, family) => `welches bauteil sollte man nicht sofort beschuldigen, wenn bei ${context.deLabel} ${family.deSubject}`,
  (pack, context, family) => `wie loest man es dauerhaft, wenn im Bereich ${pack.deLabel} ${family.deSubject}`,
  (pack, context, family) => `welches irrefuehrende symptom kann auftreten, wenn bei ${context.deLabel} ${family.deSubject}`,
];

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildAnswerTr(pack, context, family) {
  return `${pack.trLabel} icin ${context.trLabel} senaryosunda ${family.trSubject} gorulurse usta once semptomu isletme kosulundan ayirir. Bu tip durumda tipik kok nedenler ${family.trCause}. ${context.trNote}. Ilk teshiste ${family.trChecks}. Bunun teknik mantigi ${family.trWhy}. ${context.trRisk}. En sik hata ${family.trMistake}. Dogru yol once veri toplamak, sonra olcumleri karsilastirmak ve en son parca kararina gitmektir.`;
}

function buildAnswerDe(pack, context, family) {
  return `Wenn im Bereich ${pack.deLabel} bei ${context.deLabel} ${family.deSubject}, trennt ein Meister zuerst das Symptom sauber vom Betrieb ab. Typische Grundursachen sind ${family.deCause}. ${context.deNote}. In der Erstdiagnose sollten ${family.deChecks}. Der technische Hintergrund ist, dass ${family.deWhy}. ${context.deRisk}. Ein haeufiger Fehler ist ${family.deMistake}. Der saubere Weg ist erst Daten sammeln, dann Messwerte vergleichen und erst am Ende ueber den Bauteiltausch entscheiden.`;
}

function buildEntry(pack, context, family, index) {
  const contextId = `${pack.packId}_${context.id}`;
  const familyId = `${pack.packId}_${family.id}`;
  return {
    id: `deep_${pack.packId}_${String(index + 1).padStart(4, "0")}_${context.id}_${family.id}`,
    context_id: contextId,
    family_id: familyId,
    source_summary: pack.sourceSummary,
    tr_subject: `${pack.trLabel} / ${context.trLabel}: ${family.trSubject}`,
    de_subject: `${pack.deLabel} / ${context.deLabel}: ${family.deSubject}`,
    keywords: uniq([
      pack.trLabel,
      pack.deLabel,
      context.trLabel,
      context.deLabel,
      family.trSubject,
      family.deSubject,
      ...pack.keywords,
      ...context.keywords,
      ...family.keywords,
    ]),
    tr_questions: trQuestionTemplates.map((template) => template(pack, context, family)),
    de_questions: deQuestionTemplates.map((template) => template(pack, context, family)),
    tr_answer: buildAnswerTr(pack, context, family),
    de_answer: buildAnswerDe(pack, context, family),
    suggestions: uniq([
      ...family.suggestions,
      ...context.suggestions,
      ...pack.suggestions,
    ]).slice(0, 6),
  };
}

function createRefrigerantPack({
  packId,
  trLabel,
  deLabel,
  sourceSummary,
  keywords,
  suggestions,
  contexts,
  refrigerantAliases = [],
}) {
  const aliasKeywords = uniq([packId, trLabel, deLabel, ...refrigerantAliases, ...keywords]);

  return {
    packId,
    trLabel,
    deLabel,
    sourceSummary,
    keywords: aliasKeywords,
    suggestions,
    contexts,
    families: [
      {
        id: "low_charge",
        trSubject: `${trLabel} sistemde gaz eksikligi var`,
        deSubject: `im ${deLabel} system unterfuellung besteht`,
        trCause: "mikro kacak, servis sonrasi eksik dolum veya yuk altinda fark edilmeyen sarj kaybidir",
        deCause: "eine Mikroleckage, unvollstaendige Befuellung nach dem Service oder ein schleichender Fuellverlust unter Last",
        trChecks: "superheat, kapasite dususu, emis hatti sicakligi ve sistemin cekis suresi birlikte okunur",
        deChecks: "Superheat, Leistungsabfall, Saugleitungstemperatur und Laufzeitverhalten gemeinsam gelesen werden",
        trWhy: `${trLabel} eksik kaldiginda evaporator tam beslenmez ve performans dususu genelde basinctan once kapasitede hissedilir`,
        deWhy: `bei Unterfuellung im ${deLabel} Kreis der Verdampfer nicht sauber gespeist wird und der Leistungsverlust oft vor dem klaren Druckbild kommt`,
        trMistake: "yalniz dusuk basinca bakip eksik gazi kesin kabul etmektir",
        deMistake: "die Unterfuellung nur aus dem Niederdruckwert abzuleiten",
        keywords: uniq([trLabel, deLabel, "eksik gaz", "undercharge", ...refrigerantAliases]),
        suggestions: [`${trLabel} eksik gaz nasil anlasilir`, `${trLabel} sistem neden kapasite kaybeder`],
      },
      {
        id: "overcharge",
        trSubject: `${trLabel} sistem fazla gazli`,
        deSubject: `die ${deLabel} anlage ueberfuellt ist`,
        trCause: "tartimsiz dolum, receiver davranisinin yanlis okunmasi veya subcool mantiginin karistirilmasidir",
        deCause: "Fuellen ohne Waage, falsche Interpretation des Receivers oder ein missverstandenes Subcooling",
        trChecks: "subcool, basma basinci, kondenserin aktif kalan yuzeyi ve cekilen akim birlikte degerlendirilir",
        deChecks: "Subcooling, Hochdruck, aktive Verfluessigerflaeche und Stromaufnahme zusammen bewertet werden",
        trWhy: "fazla gaz kondenserde yer kaplayip isi atisini dusurur ve sistemin basma tarafini gereksiz yorar",
        deWhy: "zu viel Kaeltemittel im Verfluessiger Flaeche blockiert und die Hochdruckseite unnoetig belastet",
        trMistake: "sight glass sakin diye fazla gaz ihtimalini elemek",
        deMistake: "eine Ueberfuellung auszuschliessen, nur weil das Schauglas ruhig aussieht",
        keywords: uniq([trLabel, deLabel, "fazla gaz", "overcharge", ...refrigerantAliases]),
        suggestions: [`${trLabel} fazla gaz nasil anlasilir`, `${trLabel} sistemde yuksek basinc neden olur`],
      },
      {
        id: "high_head",
        trSubject: `${trLabel} sistemde yuksek basinç goruluyor`,
        deSubject: `im ${deLabel} system hoher druck auftritt`,
        trCause: "kirli kondenser, yetersiz hava akisi, fazla gaz veya yozusmayan gazlardir",
        deCause: "ein verschmutzter Verfluessiger, zu wenig Luft, Ueberfuellung oder nicht kondensierbare Gase",
        trChecks: "ambient, kondenser hava giris-cikis farki, subcool ve basma hatti sicakligi ayni tabloda okunur",
        deChecks: "Umgebung, Lufttemperaturdifferenz am Verfluessiger, Subcooling und Druckgastemperatur zusammen betrachtet werden",
        trWhy: "yuksek basinç yalniz gaz miktarini degil isi atis kabiliyetini de anlatir",
        deWhy: "Hochdruck nicht nur die Fuellung, sondern vor allem die Waermeabgabe des Systems widerspiegelt",
        trMistake: "hemen gaz bosaltmaya gecmek",
        deMistake: "sofort Kaeltemittel abzulassen, ohne die Luftseite zu prüfen",
        keywords: uniq([trLabel, deLabel, "yuksek basinc", "high pressure", "high head", "hp", "hpc", "hp alarm", ...refrigerantAliases]),
        suggestions: [`${trLabel} yuksek basinc neden olur`, `${trLabel} HP alarm neden atar`],
      },
      {
        id: "low_suction",
        trSubject: `${trLabel} sistemde emis basinci dusuk`,
        deSubject: `im ${deLabel} system der saugdruck zu niedrig ist`,
        trCause: "eksik gaz, feed yetersizligi, drier tikanmasi veya evaporator hava tarafinin zayifligidir",
        deCause: "Unterfuellung, zu wenig Einspeisung, Trocknerengstelle oder ein schwacher Luftdurchsatz am Verdampfer",
        trChecks: "superheat, buz deseni, drier giris-cikis sicakligi ve hava debisi birlikte kontrol edilir",
        deChecks: "Superheat, Frostbild, Temperatur vor und nach dem Trockner und Luftvolumen gemeinsam geprueft werden",
        trWhy: "dusuk emis basinç genelde evaporatore gereken enerjinin tasinmadigini gosterir",
        deWhy: "niedriger Saugdruck haeufig zeigt, dass der Verdampfer nicht sauber mit Energie versorgt wird",
        trMistake: "yalniz gaz ekleyip tikanma ihtimalini atlamak",
        deMistake: "nur nachzufuellen und eine Engstelle zu uebersehen",
        keywords: uniq([trLabel, deLabel, "dusuk basinç", "low suction", "low pressure", "lp", "lpc", "lp alarm", ...refrigerantAliases]),
        suggestions: [`${trLabel} dusuk emis basinci ne anlatir`, `${trLabel} LP alarm neden olur`],
      },
      {
        id: "noncondensables",
        trSubject: `${trLabel} devresinde yozusmayan gaz supheli`,
        deSubject: `im ${deLabel} kreis nicht kondensierbare gase vermutet werden`,
        trCause: "zayif vakum, servis sirasinda hava girisi veya tekrar dolumda disiplin eksigidir",
        deCause: "schlechtes Vakuum, Lufteintrag waehrend des Service oder unsaubere Befuellung",
        trChecks: "ambient ile basma basinci uyumu, kondenserin davranisi ve servis gecmisi karsilastirilir",
        deChecks: "Hochdruck in Relation zur Umgebung, Verfluessigerverhalten und Servicehistorie verglichen werden",
        trWhy: "hava ve diger yozusmayan gazlar kondenser yuzeyini bos yere doldurup basinç artisi yaratir",
        deWhy: "Luft und andere Restgase Verfluessigerflaeche blockieren und so unnoetig Hochdruck erzeugen",
        trMistake: "her yuksek basinci fazla gaz sanmak",
        deMistake: "jeden Hochdruck sofort als Ueberfuellung zu lesen",
        keywords: uniq([trLabel, deLabel, "noncondensable", "non condensable", "hava karismis", "air in system", ...refrigerantAliases]),
        suggestions: [`${trLabel} sistemde hava varsa nasil anlasilir`, `${trLabel} noncondensable nasil bulunur`],
      },
      {
        id: "moisture",
        trSubject: `${trLabel} devresinde nem kalmis olabilir`,
        deSubject: `im ${deLabel} kreis feuchtigkeit verblieben ist`,
        trCause: "vakum yetersizligi, uzun sure acikta kalan hat veya yorgun drier kullanimi olabilir",
        deCause: "unzureichendes Vakuum, lange offene Leitungen oder ein erschoepfter Trockner",
        trChecks: "vakum tutma testi, drier gecmisi ve aralikli tikanma davranisi birlikte sorgulanir",
        deChecks: "Vakuumhalteprobe, Trocknerhistorie und intermittierende Engstellensymptome gemeinsam bewertet werden",
        trWhy: "nem sahada bazen sabit degil dalgali semptom verir ve ustayi yaniltir",
        deWhy: "Feuchtigkeit auf der Baustelle haeufig schwankende und irrefuehrende Symptome erzeugt",
        trMistake: "her seferinde yalniz kacak aramak",
        deMistake: "bei jeder Stoerung nur nach Leckage zu suchen",
        keywords: uniq([trLabel, deLabel, "nem", "moisture", "wet system", "vakum", ...refrigerantAliases]),
        suggestions: [`${trLabel} sistemde nem nasil anlasilir`, `${trLabel} moisture sorunu ne yapar`],
      },
      {
        id: "flare_leak",
        trSubject: `${trLabel} sistemde flare baglantida kacak var`,
        deSubject: `im ${deLabel} system an einer boerdelverbindung eine leckage sitzt`,
        trCause: "yanlis flare acisi, eksik tork veya titresimle gevseyen baglantidir",
        deCause: "falscher Boerdelwinkel, unzureichendes Drehmoment oder eine vibrationsbedingt lose Verbindung",
        trChecks: "ozellikle mudahale edilen flare noktalarinda iz, yaglanma ve mikrokacak davranisi aranir",
        deChecks: "vor allem an bearbeiteten Boerdelstellen nach Spuren, Oelfilm und Mikroleckagen gesucht wird",
        trWhy: "flare kacagi sabit buyuk bir bosalma yerine uzun sureli performans dususu yaratabilir",
        deWhy: "eine Boerdelleckage statt eines grossen Ausfalls oft einen schleichenden Leistungsverlust erzeugt",
        trMistake: "flare gorunuyor diye saglam kabul etmek",
        deMistake: "eine sichtbare Boerdelstelle nur optisch als dicht zu werten",
        keywords: uniq([trLabel, deLabel, "flare", "boerdel", "kacak", ...refrigerantAliases]),
        suggestions: [`${trLabel} flare kacagi nasil bulunur`, `${trLabel} mikrokacak nerede aranir`],
      },
      {
        id: "service_port_leak",
        trSubject: `${trLabel} servis portunda kacak supheli`,
        deSubject: `am serviceanschluss der ${deLabel} anlage eine leckage vermutet wird`,
        trCause: "valf cekirdegi yorgunlugu, eksik kapak sikma veya servis sonrasi tam kapatmama olabilir",
        deCause: "ein ermuedeter Ventilkern, eine lose Kappe oder unsauberes Schliessen nach dem Service",
        trChecks: "servis portu, kapak, cekirdek ve son mudahale notu birlikte kontrol edilir",
        deChecks: "Serviceport, Kappe, Ventilkern und der letzte Eingriff gemeinsam geprueft werden",
        trWhy: "ozellikle kucuk sarj kayiplarinda servis portu ciddi performans farki yaratir",
        deWhy: "gerade bei kleineren Fuellverlusten ein Serviceport grosse Leistungsunterschiede ausloesen kann",
        trMistake: "port kapagi var diye kacagi elemek",
        deMistake: "das Leck nur wegen einer vorhandenen Schutzkappe auszuschliessen",
        keywords: uniq([trLabel, deLabel, "service port", "service valve", "kacak", ...refrigerantAliases]),
        suggestions: [`${trLabel} servis port kacagi nasil test edilir`, `${trLabel} servis sonrasi gaz neden eksilir`],
      },
      {
        id: "drier_restriction",
        trSubject: `${trLabel} sistemde drier tikanmasi olabilir`,
        deSubject: `im ${deLabel} system eine trocknerengstelle vorliegt`,
        trCause: "nem, kirlenme veya servis sonrasi devrede kalan partikullerdir",
        deCause: "Feuchtigkeit, Verschmutzung oder nach dem Service verbliebene Partikel",
        trChecks: "drier oncesi-sonrasi sicaklik farki, superheat ve kapasite dususu beraber yorumlanir",
        deChecks: "Temperatur vor und nach dem Trockner, Superheat und Leistungsabfall gemeinsam gelesen werden",
        trWhy: "drier tikanmasi gaz eksigiyle karisabilir ama mantik farki besleme dengesindedir",
        deWhy: "eine Trocknerengstelle wie Unterfuellung aussehen kann, die Ursache aber in der Einspeisung liegt",
        trMistake: "dusuk basincta sadece sarja odaklanmak",
        deMistake: "bei niedrigem Saugdruck nur an die Fuellung zu denken",
        keywords: uniq([trLabel, deLabel, "drier", "restriction", "tikanma", ...refrigerantAliases]),
        suggestions: [`${trLabel} drier tikaliysa nasil anlasilir`, `${trLabel} sistemde tikanma belirtileri nelerdir`],
      },
      {
        id: "feed_instability",
        trSubject: `${trLabel} sistemde besleme organi kararsiz`,
        deSubject: `das einspeiseorgan im ${deLabel} system instabil arbeitet`,
        trCause: "TXV ayari, ampul montaji, kapiler secimi veya yuk degisiminin yanlis yorumlanmasidir",
        deCause: "TXV-Einstellung, Fuehlermontage, Kapillarwahl oder eine falsch gelesene Lastaenderung",
        trChecks: "superheat, ampul konumu, evaporator buz deseni ve yuk tepkisi birlikte izlenir",
        deChecks: "Superheat, Fuehlerlage, Frostbild am Verdampfer und Lastreaktion gemeinsam beobachtet werden",
        trWhy: "besleme organi hatasi bazen gaz hatasi gibi gorunur ama duzeltme yolu farklidir",
        deWhy: "ein Fehler am Einspeiseorgan wie ein Fuellfehler wirken kann, aber anders geloest werden muss",
        trMistake: "TXV ya da kapileri olcmeksizin sarja dokunmak",
        deMistake: "an der Fuellung zu arbeiten, ohne das Einspeiseorgan zu pruefen",
        keywords: uniq([trLabel, deLabel, "txv", "kapiler", "feed", "genlesme", ...refrigerantAliases]),
        suggestions: [`${trLabel} TXV sorunu nasil ayristirilir`, `${trLabel} superheat neden oynar`],
      },
      {
        id: "wrong_superheat",
        trSubject: `${trLabel} sistemde superheat yanlis ayarda`,
        deSubject: `im ${deLabel} system der superheat falsch eingestellt ist`,
        trCause: "TXV ayari, ampul izolasyonu eksigi veya yuk bilgisinin hatali okunmasidir",
        deCause: "eine falsche TXV-Einstellung, fehlende Fuehlerisolierung oder eine falsche Lastbewertung",
        trChecks: "evaporator cikisi, emis hattinin isi durumu ve valf tepkisi birlikte okunur",
        deChecks: "Verdampferaustritt, Zustand der Saugleitung und Reaktion des Ventils zusammen gelesen werden",
        trWhy: "yanlis superheat kompresor korumasi ile kapasite arasindaki dengeyi bozar",
        deWhy: "falscher Superheat die Balance zwischen Verdichterschutz und Leistung zerstoert",
        trMistake: "tek bir noktadan bir kere olcup ayar vermek",
        deMistake: "aus einer einzigen Messung sofort eine neue Einstellung abzuleiten",
        keywords: uniq([trLabel, deLabel, "superheat", "sh", "asiri kizdirma", "superheat high", ...refrigerantAliases]),
        suggestions: [`${trLabel} superheat kac olmali`, `${trLabel} superheat ayari nasil yorumlanir`],
      },
      {
        id: "wrong_subcool",
        trSubject: `${trLabel} sistemde subcool okuma hatali`,
        deSubject: `im ${deLabel} system das subcooling falsch gelesen wird`,
        trCause: "olcum noktasi yanlisligi, receiver etkisinin atlanmasi veya yuk altinda okumama olabilir",
        deCause: "eine falsche Messstelle, ein uebersehener Receivereinfluss oder fehlende Messung unter Last",
        trChecks: "olcum noktasi, likit hatti stabilitesi ve kondenser kullanim alani birlikte bakilir",
        deChecks: "Messpunkt, Stabilitaet der Fluessigkeitsleitung und genutzte Verfluessigerflaeche gemeinsam bewertet werden",
        trWhy: "subcool gaz miktari kadar kondenser davranisini da okumak icin kullanilir",
        deWhy: "Subcooling nicht nur die Fuellung, sondern auch das Verfluessigerverhalten lesbar macht",
        trMistake: "tek subcool degeriyle hemen sarj karari vermek",
        deMistake: "aus einem einzelnen Subcool-Wert sofort die Fuellung abzuleiten",
        keywords: uniq([trLabel, deLabel, "subcool", "sc", "asiri sogutma", "subcool low", ...refrigerantAliases]),
        suggestions: [`${trLabel} subcool nasil yorumlanir`, `${trLabel} receiverli sistemde subcool ne anlatir`],
      },
      {
        id: "hot_pull_down",
        trSubject: `${trLabel} sistem sicakta cekmiyor`,
        deSubject: `das ${deLabel} system bei hitze nicht sauber herunterkuehlt`,
        trCause: "hava tarafi siniri, kondenser yetersizligi, fazla gaz veya yuk tahmininin dusuk tutulmasidir",
        deCause: "eine Luftseitengrenze, zu kleiner Verfluessiger, Ueberfuellung oder unterschaetzte Last",
        trChecks: "sicak saatlerde basinçlar, cekis suresi, fan davranisi ve ortam farki birlikte kaydedilir",
        deChecks: "in heissen Stunden Druecke, Pull-Down-Zeit, Ventilatorverhalten und Umgebungsdifferenz gemeinsam protokolliert werden",
        trWhy: "sicak hava sistemin gizli zayifliklarini en hizli ortaya cikarir",
        deWhy: "heisse Umgebung verdeckte Schwaechen im System am schnellsten sichtbar macht",
        trMistake: "serin saatte test edip sicak hava semptomunu yok saymak",
        deMistake: "nur im kuehlen Zustand zu testen und das Sommerbild zu ignorieren",
        keywords: uniq([trLabel, deLabel, "sicakta cekmiyor", "high ambient", ...refrigerantAliases]),
        suggestions: [`${trLabel} yazin neden performans kaybeder`, `${trLabel} sicakta ilk neye bakilir`],
      },
      {
        id: "oil_return",
        trSubject: `${trLabel} sistemde yag donusu zayif`,
        deSubject: `im ${deLabel} system die oelrueckfuehrung schwach ist`,
        trCause: "uzun hat, dusuk gaz hizi, hat capi hatasi veya sogutucu davranisinin yanlis yorumlanmasidir",
        deCause: "lange Leitung, zu geringe Gasgeschwindigkeit, falscher Leitungsdurchmesser oder falsch gedeutetes Betriebsverhalten",
        trChecks: "hat geometrisi, yuk davranisi ve kompresor karteri birlikte degerlendirilir",
        deChecks: "Leitungsgeometrie, Lastbild und Verdichterkurbelgehaeuse gemeinsam bewertet werden",
        trWhy: "yag donusu eksigi ilk anda basinçtan cok kompresor sagliginda sorun cikarir",
        deWhy: "schwache Oelrueckfuehrung zuerst weniger am Druck als an der Verdichtergesundheit sichtbar wird",
        trMistake: "yalniz yag ekleyip boru mantigini sorgulamamak",
        deMistake: "nur Oel nachzufuellen und die Rohrlogik nicht zu hinterfragen",
        keywords: uniq([trLabel, deLabel, "yag donusu", "oil return", "oil return problem", ...refrigerantAliases]),
        suggestions: [`${trLabel} sistemde yag donusu nasil korunur`, `${trLabel} oil return sorunu nasil anlasilir`],
      },
      {
        id: "vacuum_failure",
        trSubject: `${trLabel} sistemde vakum proseduru basarisiz`,
        deSubject: `das vakuumverfahren im ${deLabel} system fehlgeschlagen ist`,
        trCause: "vakum suresi kisa, ekipman zayif, sistem acikta fazla kalmis veya tutma testi yapilmamistir",
        deCause: "die Evakuierungszeit war zu kurz, das Werkzeug ungeeignet, das System zu lange offen oder die Halteprobe fehlte",
        trChecks: "mikron seviyesi, vakum tutma testi, pompa kapasitesi ve servis akisi birlikte dogrulanir",
        deChecks: "Mikronwert, Vakuumhalteprobe, Pumpenleistung und der Serviceablauf gemeinsam geprueft werden",
        trWhy: "basarisiz vakum ayni anda hem nem hem yozusmayan gaz problemini sistemde birakir",
        deWhy: "ein fehlgeschlagenes Vakuum gleichzeitig Feuchtigkeit und nicht kondensierbare Gase im System hinterlaesst",
        trMistake: "pompa sesi var diye vakumu tamam sanmak",
        deMistake: "die Evakuierung nur wegen einer laufenden Pumpe fuer ausreichend zu halten",
        keywords: uniq([trLabel, deLabel, "vacuum failure", "bad vacuum", "vakum", "vakum hatasi", "vacuum decay", "micron", "vacuum hold", ...refrigerantAliases]),
        suggestions: [`${trLabel} vacuum failure nasil anlasilir`, `${trLabel} vakum tutmuyor ise neye bakilir`],
      },
      {
        id: "post_service_verification",
        trSubject: `${trLabel} sistemde servis sonrasi dogrulama eksik`,
        deSubject: `nach dem service am ${deLabel} system die verifikation unvollstaendig ist`,
        trCause: "yalniz calismaya bakilip kacak, performans ve stabilite kontrolunun atlanmasidir",
        deCause: "nur auf Laufverhalten geschaut wurde, ohne Dichtheit, Leistung und Stabilitaet zu pruefen",
        trChecks: "tamir sonrasi kacak testi, performans, stabil basinçlar ve tekrar cekis davranisi birlikte dogrulanir",
        deChecks: "nach der Reparatur Lecktest, Leistung, stabile Druecke und das erneute Pull-Down-Verhalten gemeinsam bestaetigt werden",
        trWhy: "servis sonrasi ikinci hata en cok eksik kapanis veya eksik dogrulamadan cikar",
        deWhy: "der zweite Fehler nach dem Service oft aus fehlendem Abschlusscheck oder unsauberem Schliessen entsteht",
        trMistake: "calisti deyip isi bitmis sanmak",
        deMistake: "mit 'es laeuft doch' die Arbeit zu frueh zu beenden",
        keywords: uniq([trLabel, deLabel, "servis sonrasi", "verification", "kacak testi", ...refrigerantAliases]),
        suggestions: [`${trLabel} servis sonrasi hangi testler yapilir`, `${trLabel} tamir sonrasi neden tekrar sorun cikar`],
      },
    ],
  };
}

const deepPacks = [
  {
    packId: "compressor",
    trLabel: "Kompresor",
    deLabel: "Verdichter",
    sourceSummary: "DRC MAN derin ariza bankasi - kompresor",
    keywords: ["kompresor", "verdichter", "compressor", "motor", "termik"],
    suggestions: ["kompresor termige dusuyor", "kompresor neden ses yapar", "kompresore sivi donerse ne olur"],
    contexts: [
      {
        id: "plus_room",
        trLabel: "arti muhafaza odasi",
        deLabel: "Plus-Kuehlraum",
        trNote: "arti odalarda yuk ve kapi trafigi dalgalandigi icin kompresor davranisi gun icinde degisebilir",
        deNote: "in Plusraeumen schwanken Last und Tuerspiel stark, deshalb aendert sich das Verdichterverhalten ueber den Tag",
        trRisk: "usta tek anlik veriye bakarsa yanlis sonuca gider",
        deRisk: "wer nur einen Momentwert betrachtet, zieht schnell falsche Schluesse",
        keywords: ["arti oda", "plus room"],
        suggestions: ["arti odada kompresor neden sik devreye girer", "kapi trafigi kompresoru nasil etkiler"],
      },
      {
        id: "freezer_room",
        trLabel: "negatif depo",
        deLabel: "Tiefkuehlraum",
        trNote: "negatif odalarda geri donen gaz, defrost duzeni ve yaglama daha kritik davranir",
        deNote: "im Tiefkuehlraum verhalten sich Rueckgas, Abtauung und Schmierung deutlich kritischer",
        trRisk: "yanlis yorumlanan superheat kompresoru hizla yorar",
        deRisk: "falsch interpretierter Superheat belastet den Verdichter sehr schnell",
        keywords: ["negatif depo", "freezer"],
        suggestions: ["negatif depoda kompresor neye gore secilir", "kompresor soguk calisiyorsa ne anlasilir"],
      },
      {
        id: "long_line",
        trLabel: "uzun boru hatli sistem",
        deLabel: "Anlage mit langer Rohrstrecke",
        trNote: "uzun hatta basinc kaybi ve yag donusu sorunlari kompresor uzerinde gecikmeli semptom verir",
        deNote: "bei langen Leitungen erzeugen Druckverlust und Oelrueckfuehrung verzoegerte Symptome am Verdichter",
        trRisk: "cihaz atolyede iyi, sahada kotu calisabilir",
        deRisk: "die Anlage kann im Test gut, vor Ort aber schlecht laufen",
        keywords: ["uzun hat", "long line"],
        suggestions: ["uzun hatta yag donusu nasil korunur", "boru capi kompresoru nasil etkiler"],
      },
      {
        id: "summer_ambient",
        trLabel: "yaz yuksek ambient kosulu",
        deLabel: "Sommer-Hochlast",
        trNote: "yuksek ambientte kompresor elektrik ve basinç tarafindan birlikte zorlanir",
        deNote: "unter hoher Sommerlast wird der Verdichter elektrisch und druckseitig gleichzeitig belastet",
        trRisk: "sorun sadece basinç gibi gorunup aslinda kompresor koruma zincirine dayanabilir",
        deRisk: "das Problem wirkt oft wie Hochdruck, liegt aber teilweise in der Verdichterschutzkette",
        keywords: ["yaz", "high ambient"],
        suggestions: ["sicak havada kompresor neden zorlanir", "basma sicakligi neden yukseltir"],
      },
      {
        id: "winter_low_load",
        trLabel: "kis dusuk yuk kosulu",
        deLabel: "Winter-Teillast",
        trNote: "dusuk yukte kompresor kisa devreye girebilir ve yag donusu zayiflayabilir",
        deNote: "bei Teillast kann der Verdichter kurz takten und die Oelrueckfuehrung schwach werden",
        trRisk: "kullanim az diye ariza yok sanilabilir",
        deRisk: "geringe Nutzung wird oft mit stoerungsfreiem Betrieb verwechselt",
        keywords: ["kis", "teillast"],
        suggestions: ["kisa devre calisma kompresoru nasil bozar", "kis ayarinda ne degisir"],
      },
    ],
    families: [
      { id: "start_fail", trSubject: "kompresor hic kalkmiyor", deSubject: "der verdichter gar nicht anlaeuft", trCause: "kumanda zinciri kesikligi, kontaktor cikmisi, termik acikligi veya kilitli rotor ihtimalidir", deCause: "eine unterbrochene Steuerkette, ein defektes Schuetz, ein offener Motorschutz oder ein blockierter Rotor", trChecks: "besleme, kontaktor cekmesi, termik, presostat ve kalkis akimi birlikte kontrol edilir", deChecks: "Versorgung, Schuetzanzug, Motorschutz, Druckschalter und Anlaufstrom geprueft werden", trWhy: "kompresor devreye girmeden once elektrik koruma hattini gecmek zorundadir", deWhy: "der Verdichter vor dem Start immer die komplette elektrische Schutzkette durchlaufen muss", trMistake: "kompresoru olcmekten once bozuk ilan etmektir", deMistake: "den Verdichter vorschnell als defekt zu erklaeren", keywords: ["kalkmiyor", "start fail"], suggestions: ["kompresor neden hic devreye girmez", "termik aciksa ne olur"] },
      { id: "hard_start", trSubject: "kompresor zor kalkiyor", deSubject: "der verdichter schwer anlaeuft", trCause: "dusuk voltaj, zayif kalkis elemani, basinç esitleme sorunu veya mekanik zorlanmadir", deCause: "Unterspannung, schwaches Startbauteil, fehlender Druckausgleich oder mechanische Schwergangigkeit", trChecks: "kalkis akimi, voltaj dusumu, kondansator-start rolu ve stop sonrasi basinç esitlemesi okunur", deChecks: "Anlaufstrom, Spannungsabfall, Startbauteil und Druckausgleich nach dem Stopp kontrolliert werden", trWhy: "kalkis ani kompresorun en hassas ve en yuklu anidir", deWhy: "der Startmoment fuer den Verdichter die empfindlichste und belastendste Phase ist", trMistake: "yalniz kondansator degistirip basinç esitlemesini atlamaktir", deMistake: "nur den Kondensator zu tauschen und den Druckausgleich zu ignorieren", keywords: ["zor kalkiyor", "hard start"], suggestions: ["kalkis kondansatoru nasil kontrol edilir", "basinc esitlenmeden kalkis neden zordur"] },
      { id: "thermal_trip", trSubject: "kompresor termige dusuyor", deSubject: "der verdichter auf motorschutz geht", trCause: "yuksek akim, yuksek basinc, dusuk voltaj veya sogutma eksikligi olabilir", deCause: "eine hohe Stromaufnahme, Hochdruck, Unterspannung oder unzureichende Kuehlung", trChecks: "akim, basinclar, voltaj ve fan-kondenser durumu birlikte okunur", deChecks: "Strom, Druecke, Spannung und Zustand von Ventilator und Verfluessiger gemeinsam gelesen werden", trWhy: "termik kompresorun zorlandigini elektrik diliyle bildirir", deWhy: "der Motorschutz elektrisch meldet, dass der Verdichter ueberlastet wird", trMistake: "termigi sadece resetleyip tekrar denemektir", deMistake: "den Motorschutz nur zu resetten und sofort neu zu starten", keywords: ["termik", "motorschutz"], suggestions: ["kompresor akimi nasil yorumlanir", "termik neden tekrar atar"] },
      { id: "high_amp", trSubject: "kompresor fazla akim cekiyor", deSubject: "der verdichter zu viel strom zieht", trCause: "basinc farkinin artmasi, voltaj dengesizligi veya mekanik surtunmedir", deCause: "ein hoher Druckunterschied, Spannungsschwankung oder mechanische Reibung", trChecks: "faz-faz voltaj, akim dengesi, basinclar ve kompresor yuzey sicakligi olculur", deChecks: "Phasenspannungen, Strombalance, Druecke und Gehaeusetemperatur gemessen werden", trWhy: "akim artikisi kompresorun elektriksel degil surecle ilgili zorlandigini da gosterebilir", deWhy: "ein hoher Strom nicht nur elektrisch, sondern auch prozessbedingt entstehen kann", trMistake: "etiketteki nominal akimi okuyup sahadaki yuk kosulunu atlamaktir", deMistake: "nur den Nennstrom zu lesen und die reale Lastsituation zu ignorieren", keywords: ["fazla akim", "high amp"], suggestions: ["fazla akimda once neye bakilir", "nominal akim neden yetmez"] },
      { id: "short_cycle", trSubject: "kompresor kisa devre calisiyor", deSubject: "der verdichter kurz taktet", trCause: "sensor yeri, diferans ayari, basinç esitlenmesi veya kapasite fazlaligi olabilir", deCause: "Fuehlerposition, Reglungsdifferenz, Druckausgleich oder Ueberdimensionierung", trChecks: "start-stop araligi, sensor konumu, diferans ve basinc esitleme suresi izlenir", deChecks: "Start-Stopp-Abstand, Fuehlerlage, Hysterese und Druckausgleichszeit beobachtet werden", trWhy: "sik start-stop kompresor omrunu kisa surede duserir", deWhy: "haeufiges Takten die Lebensdauer des Verdichters schnell reduziert", trMistake: "kisa devreyi normal sanip saatlik start sayisini kaydetmemektir", deMistake: "Kurzzyklus als normal zu sehen und die Startzahl nicht zu protokollieren", keywords: ["kisa devre", "short cycle"], suggestions: ["saatlik start sayisi kac olmali", "diferans ayari kisa devreyi nasil etkiler"] },
      { id: "locked_rotor", trSubject: "kompresor rotor kilitli gibi davraniyor", deSubject: "der verdichter wie mit blockiertem rotor wirkt", trCause: "mekanik sikiSma, sivi vurmasi gecmisi veya agir kalkis kosuludur", deCause: "mechanische Blockade, Vorgeschichte von Fluessigkeitsschlaegen oder eine schwere Startsituation", trChecks: "kalkis akimi zirvesi, sargi dengesi ve gecmis ariza kaydi incelenir", deChecks: "Spitzenanlaufstrom, Wicklungsbalance und Stoerungshistorie geprueft werden", trWhy: "kilitli rotor semptomu bazen elektrik degil mekanik hasari soyler", deWhy: "das Bild eines blockierten Rotors oft auf einen mechanischen Schaden hinweist", trMistake: "yalniz role-kondansator degistirip kompresor mekanigini atlamaktir", deMistake: "nur Startbauteile zu tauschen und die Mechanik zu ignorieren", keywords: ["locked rotor", "rotor kilitli"], suggestions: ["kilitli rotor nasil anlasilir", "sivi vurmasi kilitli rotor yapar mi"] },
      { id: "floodback", trSubject: "kompresore sivi donuyor", deSubject: "fluessigkeit zum verdichter zurueckkehrt", trCause: "dusuk superheat, asiri besleme, fan sorunu veya yuk dususudur", deCause: "niedriger Superheat, Ueberfuetterung, Ventilatorproblem oder Lastabfall", trChecks: "superheat, emis hatti sicakligi ve valf ampulu kontrol edilir", deChecks: "Superheat, Saugleitungstemperatur und Ventilfuehler geprueft werden", trWhy: "kompresor gaz sikistirmak ister, sivi donusu ic parcaya zarar verir", deWhy: "der Verdichter Gas verdichten will und Fluessigkeitsrueckkehr seine Innenteile schaedigt", trMistake: "yalniz ses dinleyip superheat olcmemektir", deMistake: "nur auf Geraeusche zu hoeren und keinen Superheat zu messen", keywords: ["sivi donusu", "floodback"], suggestions: ["superheat nasil yorumlanir", "sivi donusu kompresoru nasil bozar"] },
      { id: "oil_return", trSubject: "kompresore yag geri donmuyor", deSubject: "das oel nicht sauber zum verdichter zurueckkehrt", trCause: "hat capi, egim, dusuk hiz veya tuzak eksikligidir", deCause: "Leitungsdurchmesser, Gefaelle, zu geringe Gasgeschwindigkeit oder fehlende Oelfallen", trChecks: "suction hatti geometrisi, yuk durumu ve kompresor karteri birlikte incelenir", deChecks: "Saugleitungsgeometrie, Lastzustand und Kurbelgehaeuse gemeinsam bewertet werden", trWhy: "yaglama bozulursa kompresor performansi kadar omru de duser", deWhy: "bei schlechter Oelrueckfuehrung sowohl Leistung als auch Lebensdauer sinken", trMistake: "yag ekleyip boru tasarimini sorgulamamaktir", deMistake: "nur Oel nachzufuellen und die Rohrplanung nicht zu hinterfragen", keywords: ["yag donusu", "oil return"], suggestions: ["oel tuzagi ne zaman gerekir", "uzun hatta yag nasil doner"] },
      { id: "high_discharge", trSubject: "kompresor basma sicakligi cok yuksek", deSubject: "die druckgastemperatur des verdichters zu hoch ist", trCause: "yetersiz sogutma, dusuk emis, fazla superheat veya gaz devresinde tikanmadir", deCause: "unzureichende Kuehlung, niedrige Sauggastemperatur, zu hoher Superheat oder eine Engstelle im Kaeltekreis", trChecks: "basma hatti sicakligi, superheat, kondenser ve valf beslemesi birlikte okunur", deChecks: "Druckgasleitungstemperatur, Superheat, Verfluessiger und Ventileinspeisung gemeinsam betrachtet werden", trWhy: "basma sicakligi kompresor icindeki zorlanmanin gecikmesiz gostergesidir", deWhy: "die Druckgastemperatur ein direkter Hinweis auf die innere Belastung des Verdichters ist", trMistake: "yalniz basincla karar verip sicaklik verisini atlamaktir", deMistake: "nur mit Druckwerten zu urteilen und die Temperaturdaten zu ignorieren", keywords: ["basma sicakligi", "high discharge"], suggestions: ["basma sicakligi kac olmali", "superheat basma sicakligini neden artirir"] },
      { id: "crankcase_heater", trSubject: "karter isitici calismiyor", deSubject: "die kurbelgehaeuseheizung nicht arbeitet", trCause: "isitici devre disi, enerji eksigi veya kontrol mantigi sorunudur", deCause: "eine ausgefallene Heizung, fehlende Versorgung oder ein Problem in der Schaltlogik", trChecks: "isitici cekisi, karter sicakligi ve bekleme sonrasi kalkis davranisi izlenir", deChecks: "Heizstrom, Gehaeusetemperatur und Startverhalten nach Standzeit geprueft werden", trWhy: "karter soguk kalirsa sogutucu yag icine karisabilir", deWhy: "bei kaltem Kurbelgehaeuse Kaeltemittel ins Oel einwandern kann", trMistake: "yalniz calisirken kontrol edip bekleme durumunu gormemektir", deMistake: "nur im Betrieb zu messen und den Stillstand nicht zu bewerten", keywords: ["karter isitici", "crankcase heater"], suggestions: ["karter isitici ne zaman kritik olur", "bekleme sonrasi kalkista neye bakilir"] },
      { id: "noise_knock", trSubject: "kompresor vuruntulu ses yapiyor", deSubject: "der verdichter klopfende geraeusche macht", trCause: "sivi vurmasi, ic mekanik bosluk veya titreSim iletimidir", deCause: "Fluessigkeitsschlag, internes Spiel oder uebertragene Vibration", trChecks: "sesin zamani, superheat ve boru temas noktalari birlikte izlenir", deChecks: "Zeitpunkt des Geraeusches, Superheat und Rohrkontaktstellen gemeinsam beobachtet werden", trWhy: "vuruntu sesi arizayi kompresor ici ile sistem disi arasinda ayirmaya yardim eder", deWhy: "ein klopfendes Geraeusch hilft zwischen internem Schaden und aeusserer Ursache zu unterscheiden", trMistake: "yalniz ses dinleyip yuk altinda veri almamaktir", deMistake: "nur zuzuhoeren und keine Daten unter Last aufzunehmen", keywords: ["vuruntu", "knock"], suggestions: ["vuruntulu ses sivi vurmasi midir", "boru temas sesi nasil ayrilir"] },
      { id: "vibration", trSubject: "kompresor titresimi sisteme vuruyor", deSubject: "die verdichtervibration in die anlage uebergeht", trCause: "takoz yipraniSi, boru dayama hatasi veya dengesiz montajdir", deCause: "verschlissene Daempfer, falsche Rohrabstuetzung oder ungleichmaessige Montage", trChecks: "takoz, boru sabitleme ve vibrasyonun hangi devirde arttigi incelenir", deChecks: "Daempfer, Rohrhalter und der Lastpunkt der Vibrationszunahme geprueft werden", trWhy: "titresim tek basina ses degil ileride boru catlagi ve kontak gevsemesi yapar", deWhy: "Vibrationen spaeter nicht nur Geraeusche, sondern Rohrbrueche und lose Kontakte verursachen", trMistake: "yalniz kompresoru suclayip montaj ayagini unutmaktir", deMistake: "nur den Verdichter zu beschuldigen und die Montagepunkte zu vergessen", keywords: ["titresim", "vibration"], suggestions: ["vibrasyon nasil kesilir", "boru dayama neden kirar"] },
      { id: "phase_loss", trSubject: "kompresor faz eksiginde kaliyor", deSubject: "der verdichter mit phasenausfall laeuft oder stoppt", trCause: "faz kaybi, gevsek terminal veya faz koruma eksigidir", deCause: "Phasenausfall, lose Klemme oder fehlende Phasenueberwachung", trChecks: "faz-faz ve faz-nol gerilimleri, akim dengesi ve terminal sikiligi bakilir", deChecks: "Phasen- und Neutralspannungen, Strombalance und Klemmenfestigkeit geprueft werden", trWhy: "faz eksigi kompresoru hizli asiri isitip sargi riskine goturur", deWhy: "ein Phasenausfall den Verdichter schnell ueberhitzt und Wicklungsschaeden erzeugen kann", trMistake: "multimetrede tek anlik olcumle yetinmektir", deMistake: "sich mit einer einzelnen Spannungsmessung zufrieden zu geben", keywords: ["faz eksigi", "phase loss"], suggestions: ["faz eksigi nasil kesinlesir", "akim dengesizligi ne anlatir"] },
      { id: "pumpdown_restart", trSubject: "pump down sonrasi kompresor gec kalkiyor", deSubject: "der verdichter nach pump down spaet wieder startet", trCause: "solenoid, basinç ayari veya esitleme mantigi sorunudur", deCause: "ein Problem an Magnetventil, Druckeinstellung oder Ausgleichslogik", trChecks: "solenoid hareketi, LP seti ve stop-start araligindaki basinç degisimi izlenir", deChecks: "Magnetventil, LP-Sollwert und Druckverlauf zwischen Stop und Neustart geprueft werden", trWhy: "pump down zincirinde tek gecikme tum start mantigini kaydirir", deWhy: "eine kleine Abweichung in der Pump-Down-Kette den gesamten Neustart verschiebt", trMistake: "yalniz presostati degistirip solenoid ve zaman mantigini atlamaktir", deMistake: "nur den Druckschalter zu tauschen und Magnetventil sowie Zeitlogik zu uebersehen", keywords: ["pump down", "restart"], suggestions: ["pump down sirasi nasil test edilir", "solenoid gecikirse ne olur"] },
      { id: "valve_damage", trSubject: "kompresor valfleri zayif calisiyor gibi", deSubject: "die verdichterventile wie geschwaecht arbeiten", trCause: "yaslanma, sivi gecmisi veya uzun sureli yuksek sicakliktir", deCause: "Alterung, fruehere Fluessigkeitsschlaege oder lang anhaltende Uebertemperatur", trChecks: "basinc toparlama hizi, performans dususu ve enerji cekisi birlikte okunur", deChecks: "Druckaufbau, Leistungsverlust und Stromaufnahme gemeinsam bewertet werden", trWhy: "valf hasari bazen tam durmaz ama kapasiteyi surekli asindirir", deWhy: "Ventilschaeden nicht immer zum Stillstand fuehren, aber die Leistung dauerhaft abbauen", trMistake: "sadece gaz ekleyip kapasite dususunun kaynagini saklamaktir", deMistake: "nur nachzufuellen und den eigentlichen Kapazitaetsverlust zu verdecken", keywords: ["kompresor valfi", "valve damage"], suggestions: ["kompresor valf hasari nasil anlasilir", "kapasite dususu kompresorde midir"] },
      { id: "winding_heat", trSubject: "kompresor sargilari asiri isinmis gibi", deSubject: "die wicklungen des verdichters ueberhitzt wirken", trCause: "faz dengesizligi, tekrarli termik, zor kalkis veya ic zorlanmadir", deCause: "Phasenungleichheit, wiederholte Motorschutzabschaltungen, schwere Starts oder innere Belastung", trChecks: "sargi direnci, izolasyon davranisi ve termik gecmisi birlikte degerlendirilir", deChecks: "Widerstaende, Isolationsverhalten und Motorschutzhistorie gemeinsam bewertet werden", trWhy: "sargi yorgunlugu birikimli hasar verir, tek olay gibi gorunmez", deWhy: "Wicklungsalterung kumulativ wirkt und selten wie ein einzelnes Ereignis aussieht", trMistake: "yalniz o an calisiyorsa sorun bitti sanmaktir", deMistake: "anzunehmen, dass kein Problem mehr besteht, nur weil er gerade laeuft", keywords: ["sargi isinma", "winding heat"], suggestions: ["sargi bozulmasi nasil erken anlasilir", "izolasyon testi ne zaman gerekir"] },
    ],
  },
  {
    packId: "defrost",
    trLabel: "Defrost",
    deLabel: "Abtauung",
    sourceSummary: "DRC MAN derin ariza bankasi - defrost",
    keywords: ["defrost", "abtauung", "rezistans", "heater", "ice"],
    suggestions: ["defrost niye bitmiyor", "defrostta buz neden geri geliyor", "defrost sensori nereye konur"],
    contexts: [
      { id: "humid_plus_room", trLabel: "nemli arti oda", deLabel: "feuchter Plusraum", trNote: "nemli arti odada az hata bile serpantinde hizli nem birikimi yaratir", deNote: "im feuchten Plusraum fuehren schon kleine Fehler schnell zu starker Feuchteansammlung am Register", trRisk: "defrost yetersizligi ilk gun performans, sonra kalite sorunu dogurur", deRisk: "unzureichende Abtauung wird zuerst zum Leistungs- und dann zum Qualitaetsproblem", keywords: ["nemli arti oda"], suggestions: ["nemli odada defrost nasil secilir"] },
      { id: "freezer_room", trLabel: "negatif soguk oda", deLabel: "Tiefkuehlraum", trNote: "negatif odada defrost sekli, su tahliyesi ve fan gecikmesi birlikte calisir", deNote: "im Tiefkuehlraum wirken Abtauart, Wasserabfuhr und Ventilatorverzoegerung zusammen", trRisk: "tek parametre hatasi buyuk buz blokuna donusebilir", deRisk: "ein einzelner Parameterfehler kann zu massiver Eisbildung fuehren", keywords: ["negatif", "freezer"], suggestions: ["negatif depoda fan delay neden gerekir"] },
      { id: "high_traffic_room", trLabel: "yuksek kapi trafikli oda", deLabel: "Raum mit hohem Tuerspiel", trNote: "sik kapi acilisi defrost yukunu cihaz seciminden bile fazla etkileyebilir", deNote: "haeufiges Tuerspiel kann die Abtaulast staerker beeinflussen als die Geraeteauswahl", trRisk: "kullanici hatasi teknik ariza gibi gorunebilir", deRisk: "Bedienungsfehler wirkt hier oft wie ein Technikdefekt", keywords: ["kapi trafigi"], suggestions: ["sik kapi acilisi defrostu nasil bozar"] },
      { id: "washdown_room", trLabel: "sik yikanan oda", deLabel: "haeufig gewaschener Raum", trNote: "yikama suyu ve yuksek nem defrost dengesini hizla bozar", deNote: "Waschwasser und hohe Feuchte stoeren die Abtaubalance sehr schnell", trRisk: "su girisi ile buzlanma semptomu birbirine karisabilir", deRisk: "Wassereintritt und Vereisung koennen leicht verwechselt werden", keywords: ["washdown", "yikama"], suggestions: ["yikama sonrasi defrost nasil kontrol edilir"] },
      { id: "electrical_defrost_panel", trLabel: "elektrikli defrost panosu", deLabel: "elektrische Abtau-Schalttafel", trNote: "defrostta panel cikisi, heater kontaktoru ve sensor sonlandirmasi ayni zincirdedir", deNote: "bei elektrischer Abtauung liegen Reglerausgang, Heizschuetz und Fuehlerbeendigung in derselben Kette", trRisk: "bir eleman hatasi digerini suclatan yalanci semptom uretebilir", deRisk: "ein Fehler in einem Glied kann die anderen Bauteile zu Unrecht verdaechtig machen", keywords: ["defrost panosu"], suggestions: ["heater kontaktoru nasil test edilir"] },
    ],
    families: [
      { id: "heater_open", trSubject: "defrost rezistansi acik devre kalmis gibi", deSubject: "die abtauheizung wie unterbrochen wirkt", trCause: "rezistans kopuklugu, klemens yanigi veya kablo sureksizligidir", deCause: "eine unterbrochene Heizung, verbrannte Klemme oder Kabelunterbrechung", trChecks: "ohm degeri, akim cekisi ve heater uclarinda enerji ayni anda olculur", deChecks: "Widerstand, Stromaufnahme und Spannung an den Heizenden gemeinsam gemessen werden", trWhy: "enerji gorunmesi tek basina heaterin isittigini kanitlamaz", deWhy: "anliegende Spannung allein noch nicht beweist, dass die Heizung wirklich arbeitet", trMistake: "yalniz terminalde voltaj gorup heateri saglam saymaktir", deMistake: "Heizung nur wegen anliegender Spannung fuer intakt zu halten", keywords: ["rezistans acik", "heater open"], suggestions: ["defrost heater nasil olculur"] },
      { id: "heater_relay", trSubject: "defrost heater role-kontaktoru sagliksiz", deSubject: "das schaltglied der abtauheizung unzuverlaessig arbeitet", trCause: "kontakt yapismasi, bobin zayifligi veya kontrol cikisinin kararsizligidir", deCause: "Kontaktkleben, schwache Spule oder ein instabiler Reglerausgang", trChecks: "role cikisi, kontakt gecisi ve heater devresine gerilim tasinmasi bakilir", deChecks: "Relaisausgang, Kontaktuebergang und Spannungsweitergabe zur Heizung geprueft werden", trWhy: "heater saglam olsa bile role sagliksizsa abtau enerji zinciri bozulur", deWhy: "selbst eine intakte Heizung ohne sauberes Schaltglied nicht korrekt arbeitet", trMistake: "yalniz role sesi duyup kontagi saglam sanmaktir", deMistake: "nur auf das Klicken zu hoeren und den Kontakt fuer gut zu halten", keywords: ["heater role", "relay"], suggestions: ["defrost role yapismasi nasil anlasilir"] },
      { id: "timer_wrong", trSubject: "defrost araligi ve suresi yanlis", deSubject: "abtauintervall oder -dauer falsch eingestellt sind", trCause: "yanlis parametre, mevsim degisimi veya isletme yukune gore guncellenmeyen ayardir", deCause: "falsche Parameter, Jahreszeitwechsel oder nicht angepasste Werte fuer die reale Last", trChecks: "gunluk buzlanma, kapı trafigi ve parametre kaydi birlikte degerlendirilir", deChecks: "taegliche Eisbildung, Tuerspiel und Parameterprotokoll gemeinsam bewertet werden", trWhy: "dogru cihaz bile yanlis abtau ritmiyle buz altinda kalir", deWhy: "selbst ein richtiges Geraet mit falschem Abtautakt im Eis endet", trMistake: "ezbere sure kopyalamaktir", deMistake: "Werte einfach zu kopieren, ohne die reale Nutzung zu beachten", keywords: ["defrost araligi", "timer"], suggestions: ["defrost araligi nasil secilir"] },
      { id: "termination_early", trSubject: "defrost erken sonlaniyor", deSubject: "die abtauung zu frueh beendet wird", trCause: "sonlandirma sensoru yakin konumda, bozuk veya hatali okumadadir", deCause: "der Endfuehler zu nah sitzt, defekt ist oder falsch misst", trChecks: "sensor konumu, kablo direnci ve gercek serpantin durumu karsilastirilir", deChecks: "Fuehlerposition, Kabelwiderstand und echter Registerzustand verglichen werden", trWhy: "erken biten abtau gozle gorunmeyen buz cekirdegini birakir", deWhy: "eine zu frueh endende Abtauung unsichtbare Eiskeime zuruecklaesst", trMistake: "yalniz sure arttirmak ve sensor yerini gormemektir", deMistake: "nur die Dauer zu erhoehen und die Fuehlerlage nicht zu pruefen", keywords: ["erken sonlanir", "termination early"], suggestions: ["defrost sonlandirma sensoru nereye konur"] },
      { id: "termination_late", trSubject: "defrost gec sonlaniyor", deSubject: "die abtauung zu spaet beendet wird", trCause: "sensor gec hissediyor, heater fazla calisiyor veya kontrol cikisi takili kaliyor", deCause: "der Fuehler reagiert zu spaet, die Heizung laeuft zu lange oder der Ausgang bleibt kleben", trChecks: "heater bitis noktasi, oda sicaklik etkisi ve sensor gecikmesi okunur", deChecks: "Ende des Heizens, Raumtemperatureinfluss und Fuehlerverzoegerung geprueft werden", trWhy: "gec biten abtau urun ve oda stabilitesini gereksiz bozar", deWhy: "eine zu spaete Beendigung die Raumstabilitaet unnoetig stoert", trMistake: "yalniz buz kalmadi diye durumu normal sanmaktir", deMistake: "Abtauung nur deshalb fuer normal zu halten, weil kein Eis mehr sichtbar ist", keywords: ["gec sonlanir", "termination late"], suggestions: ["defrost suresi fazla olursa ne olur"] },
      { id: "fan_delay", trSubject: "defrost sonrasi fan gecikmesi hatali", deSubject: "die ventilatorverzoegerung nach der abtauung falsch ist", trCause: "fan hemen aciyor, cok gec aciyor veya sensor kriteri yanlistir", deCause: "der Ventilator startet zu frueh, zu spaet oder nach einem falschen Fuehlerkriterium", trChecks: "coil sicakligi ile fan start zamani birlikte izlenir", deChecks: "Registertemperatur und Ventilatorstart gemeinsam beobachtet werden", trWhy: "fan erken acarsa suyu ucurur, gec acarsa kapasiteyi geciktirir", deWhy: "ein zu frueher Start Wasser verstreut, ein zu spaeter Leistung verschenkt", trMistake: "sadece defrostu izleyip fan fazini atlamaktir", deMistake: "nur die Abtauung zu betrachten und die Ventilatorphase zu vergessen", keywords: ["fan delay", "fan gecikmesi"], suggestions: ["fan delay ne ise yarar"] },
      { id: "drain_heater", trSubject: "drenaj heateri yetersiz", deSubject: "die ablaufheizung unzureichend arbeitet", trCause: "heater zayif, sadece tavayi isitiyor veya hat devami korumasizdir", deCause: "die Heizung ist schwach, waermt nur die Wanne oder der Leitungsweg ist ungeschuetzt", trChecks: "tava, cikis hattı ve suyun durdugu nokta birlikte kontrol edilir", deChecks: "Wanne, Leitungsanfang und Wasserstaupunkt gemeinsam geprueft werden", trWhy: "drenaj donarsa sonraki abtau suyu geri doner", deWhy: "bei gefrorenem Ablauf das naechste Abtauwasser zurueckdrueckt", trMistake: "yalniz tavadaki heateri gormekle yetinmektir", deMistake: "sich nur auf die Wannenheizung zu konzentrieren", keywords: ["drenaj heater", "ablaufheizung"], suggestions: ["drenaj hattinda heater nasil kontrol edilir"] },
      { id: "door_heater", trSubject: "kapi rezistansi defrost dengesini bozuyor", deSubject: "die tuerheizung die abtaubilanz stoert", trCause: "kapi rezistansi bozuk veya yetersiz oldugu icin nem yuku artiyordur", deCause: "eine defekte oder zu schwache Tuerheizung den Feuchteeintrag erhoeht", trChecks: "kapi cevresi terleme, conta ve rezistans cekisi birlikte bakilir", deChecks: "Schwitzwasser um die Tuer, Dichtung und Heizaufnahme gemeinsam geprueft werden", trWhy: "kapi cevresindeki nem defrost yukunu serpantine geri tasir", deWhy: "Feuchte an der Tuer die Abtaulast indirekt wieder auf das Register traegt", trMistake: "kapiyi sadece mekanik gorup isitsel tarafi atlamaktir", deMistake: "die Tuer nur mechanisch und nicht thermisch zu betrachten", keywords: ["kapi rezistansi", "door heater"], suggestions: ["kapi rezistansi neden gerekir"] },
      { id: "ice_after_defrost", trSubject: "defrost bitiyor ama buz hizla geri geliyor", deSubject: "nach der abtauung das eis sehr schnell zurueckkommt", trCause: "kok neden kacak, hava debisi veya eksik sonlandirma olabilir", deCause: "die Grundursache kann in Undichtigkeit, Luftmenge oder unvollstaendiger Beendigung liegen", trChecks: "defrost sonrasi ilk saatlerde coil goruntusu ve kapi kullanimi izlenir", deChecks: "in der ersten Stunde nach der Abtauung Registerbild und Tuernutzung beobachtet werden", trWhy: "hizli geri gelen buz genelde abtaudan cok buzun neden olustugunu anlatir", deWhy: "schnell zurueckkehrendes Eis meist mehr ueber die Ursache der Eisbildung als ueber die Abtauung selbst sagt", trMistake: "sadece defrost sayisini artirmaktir", deMistake: "nur die Anzahl der Abtauungen zu erhoehen", keywords: ["buz geri geliyor", "ice returns"], suggestions: ["buz neden hemen geri gelir"] },
      { id: "long_defrost", trSubject: "defrost gereksiz uzun suruyor", deSubject: "die abtauung unnoetig lange dauert", trCause: "zaman fazla, sensor gec veya heater gucu dengesiz olabilir", deCause: "zu lange Zeit, spaeter Fuehler oder unausgewogene Heizleistung", trChecks: "gercek buz yukune gore defrost uzunlugu karsilastirilir", deChecks: "Abtaudauer mit der echten Eislast verglichen wird", trWhy: "uzun abtau kapasite ve urun guvenligini gereksiz etkiler", deWhy: "eine lange Abtauung Leistung und Produktstabilitaet unnoetig stoert", trMistake: "guvenli olsun diye sureyi her zaman yuksek tutmaktir", deMistake: "die Dauer aus Vorsicht dauerhaft zu hoch einzustellen", keywords: ["uzun defrost", "long defrost"], suggestions: ["defrost suresi nasil optimize edilir"] },
      { id: "short_defrost", trSubject: "defrost cok kisa kaliyor", deSubject: "die abtauung zu kurz bleibt", trCause: "zaman az, sensor erken veya buz yukune uygun olmayan programdir", deCause: "zu kurze Zeit, zu fruehes Fuehlersignal oder ein Programm, das nicht zur Eislast passt", trChecks: "coil dip noktasi ve bitis anindaki serpantin durumu gozlenir", deChecks: "kaeltester Punkt und Registerzustand am Ende der Abtauung beobachtet werden", trWhy: "kisa abtau gizli buz birakip her cevrimde sorunu buyutur", deWhy: "eine zu kurze Abtauung Rest-Eis hinterlaesst und das Problem in jedem Zyklus vergroessert", trMistake: "enerji tasarrufu icin sureyi asiri kismaktir", deMistake: "die Zeit fuer vermeintliche Energieersparnis zu stark zu kuerzen", keywords: ["kisa defrost", "short defrost"], suggestions: ["enerji icin defrost kisilir mi"] },
      { id: "uneven_defrost", trSubject: "serpantin esit cozulmuyor", deSubject: "das register nicht gleichmaessig abtaut", trCause: "heater dagilimi, hava tarafi veya sensor referansi dengesizdir", deCause: "ungleichmaessige Heizung, Luftseite oder eine schlechte Fuehlerreferenz", trChecks: "coil uzerinde hangi bolgelerin buz tuttugu ve hangi bolgelerin cozuldugu izlenir", deChecks: "beobachtet wird, welche Registerzonen vereisen und welche abtauen", trWhy: "esitsiz abtau yerel hava kaybi ve tekrarli buz cekirdegi olusturur", deWhy: "ungleiche Abtauung lokale Luftverluste und wiederkehrende Eiskeime erzeugt", trMistake: "tek sensor verisiyle tum coilin esit oldugunu varsaymaktir", deMistake: "vom Fuehlerwert auf eine gleichmaessige Coilabtauung zu schliessen", keywords: ["esit cozunmuyor", "uneven defrost"], suggestions: ["serpantin neden tek taraftan buz tutar"] },
      { id: "sensor_wrong_place", trSubject: "defrost sensoru yanlis yerde", deSubject: "der abtaufuehler falsch sitzt", trCause: "montaj kolayligi icin yanlis noktaya sabitlenmis olabilir", deCause: "der Fuehler kann aus Montagebequemlichkeit an der falschen Stelle sitzen", trChecks: "sensorun coilin en kritik bolgesini gorup gormedigi kontrol edilir", deChecks: "geprueft wird, ob der Fuehler die kritischste Zone des Registers sieht", trWhy: "sensor yeri yanlissa tum abtau mantigi yanlis referansa baglanir", deWhy: "eine falsche Fuehlerlage die komplette Abtaulogik an eine falsche Referenz bindet", trMistake: "parametre degistirip fiziksel yeri degistirmemektir", deMistake: "nur Parameter zu aendern, ohne den Fuehler umzusetzen", keywords: ["sensor yeri", "fuehler falsch"], suggestions: ["defrost sensoru en soguk yere mi konur"] },
      { id: "washdown_moisture", trSubject: "yikama sonrasi defrost dengesi bozuluyor", deSubject: "nach der reinigung die abtaubilanz gestoert ist", trCause: "ek su girisi ve yuzeyde kalan nem coil yukunu buyutuyordur", deCause: "zusatzliches Wasser und Restfeuchte die Registerlast erhoehen", trChecks: "yikama saati ile alarm-buzlanma saatleri ust uste konur", deChecks: "Reinigungszeiten und Stoerungs- oder Vereisungszeiten werden verglichen", trWhy: "yikama aliskanligi teknik kapasiteyi gece gunduz farkli gosterebilir", deWhy: "das Reinigungsverhalten die technische Last ueber den Tag stark veraendern kann", trMistake: "teknik arizayi kullanicidan tamamen ayirmaktir", deMistake: "das Betriebsmuster komplett von der Technik zu trennen", keywords: ["yikama sonrasi", "washdown moisture"], suggestions: ["yikama sonrasi neden buz artar"] },
      { id: "high_door_traffic", trSubject: "kapi trafigi defrostu yetistirmiyor", deSubject: "das hohe tuerspiel die abtauung ueberholt", trCause: "nem yuku defrost kapasitesinden hizli buyuyordur", deCause: "die Feuchtelast schneller waechst als die Abtaukapazitaet", trChecks: "kapi sayaci, buz profili ve abtau zamanlamasi beraber incelenir", deChecks: "Tuernutzung, Eisprofil und Abtauzeitplan gemeinsam bewertet werden", trWhy: "bazi odalarda ariza teknikten cok operasyondan kaynaklanir", deWhy: "in manchen Raeumen die Stoerung eher aus dem Betrieb als aus der Technik entsteht", trMistake: "cihazi buyutmeden once kullanimi duzeltmeyi dusunmemektir", deMistake: "vor jeder Geraetevergroesserung das Nutzungsverhalten nicht zu pruefen", keywords: ["kapi trafigi", "door traffic"], suggestions: ["kapi trafigi yuksekse ne yapilir"] },
      { id: "controller_output", trSubject: "kontrol cihazi defrosta dogru cikis vermiyor", deSubject: "der regler die abtauung nicht sauber ansteuert", trCause: "cikis rolesi, parametre zinciri veya sensor mantigi icte bozulmustur", deCause: "Ausgangsrelais, Parameterkette oder Fuehlerlogik im Regler gestoehrt sind", trChecks: "kumanda cikisi, alarm hafizasi ve parametre sirasi karsilastirilir", deChecks: "Reglerausgang, Alarmhistorie und Parametrierung verglichen werden", trWhy: "panel cikisi arizasi heater veya sensor arizasi gibi gorunebilir", deWhy: "ein Reglerausgangsfehler wie ein Heizungs- oder Fuehlerfehler aussehen kann", trMistake: "yalniz heatere yogunlasip kontrol cikisini test etmemektir", deMistake: "nur die Heizung zu pruefen und den Reglerausgang zu vergessen", keywords: ["kontrol cikisi", "controller output"], suggestions: ["defrost cikisi nasıl test edilir"] },
    ],
  },
  {
    packId: "gas",
    trLabel: "Gaz Kacak ve Sarj",
    deLabel: "Leckage und Fuellung",
    sourceSummary: "DRC MAN derin ariza bankasi - gaz kacak ve sarj",
    keywords: ["gaz", "leak", "kacak", "charge", "refrigerant", "vacuum"],
    suggestions: ["gaz eksigi nasil kesinlesir", "mikro kacak nasil bulunur", "fazla gaz nasil anlasilir"],
    contexts: [
      { id: "old_system", trLabel: "yasli saha sistemi", deLabel: "aeltere Anlage", trNote: "eski sistemlerde birikmis kir, servis gecmisi ve yorgun birlesimler kacak analizini zorlastirir", deNote: "bei aelteren Anlagen erschweren Schmutz, Servicehistorie und gealterte Verbindungen die Lecksuche", trRisk: "tek nokta yerine birden fazla zayif halka olabilir", deRisk: "es kann mehrere schwache Stellen statt nur einer geben", keywords: ["eski sistem"], suggestions: ["eski sistemde kacak nereye bakilir"] },
      { id: "long_line", trLabel: "uzun boru hattı", deLabel: "lange Rohrstrecke", trNote: "uzun hatta sarj miktari ve kacak denetimi daha disiplinli yapilmalidir", deNote: "bei langen Rohrstrecken muessen Fuellung und Leckpruefung deutlich disziplinierter erfolgen", trRisk: "az hata buyuk sarj farki gibi gorunebilir", deRisk: "kleine Fehler koennen wie grosse Fuellabweichungen erscheinen", keywords: ["uzun boru"], suggestions: ["uzun hatta gaz nasil hesaplanir"] },
      { id: "rooftop_condensing", trLabel: "cati kondenserli sistem", deLabel: "Anlage mit Dachverfluessiger", trNote: "cati kosullari servis valfi ve flare birlesimlerinde yipranmayi arttirir", deNote: "Dachbedingungen beschleunigen den Verschleiss an Serviceventilen und Flare-Verbindungen", trRisk: "mevsimsel genlesme birlesim davranisini degistirebilir", deRisk: "saisonale Ausdehnung kann das Verhalten der Verbindungen veraendern", keywords: ["cati kondenser"], suggestions: ["cati unitesinde kacak neden artar"] },
      { id: "retrofit_system", trLabel: "retrofit gaza gecmis sistem", deLabel: "Retrofit-Anlage", trNote: "retrofitte valf ayari, yag uyumu ve yeni pt davranisi eski aliskanligi bozar", deNote: "beim Retrofit veraendern Ventileinstellung, Oelverhalten und neue PT-Werte die alte Gewohnheit", trRisk: "usta eski gaz mantigiyla yeni gazi yanlis yorumlayabilir", deRisk: "das neue Kaeltemittel wird oft noch mit der alten Logik bewertet", keywords: ["retrofit"], suggestions: ["retrofit sonrasi hangi olcum gerekir"] },
      { id: "compact_split", trLabel: "kompakt split sistem", deLabel: "kompakte Splitanlage", trNote: "kucuk sistemlerde gram seviyesindeki sarj farki bile davranisi degistirir", deNote: "bei kompakten Systemen veraendern schon kleine Mengenunterschiede das Verhalten", trRisk: "basinca bakarak sarj karari almak daha da risklidir", deRisk: "eine Fuellentscheidung nur nach Druck ist hier besonders riskant", keywords: ["kompakt split"], suggestions: ["kucuk sistemde gaz nasil dogrulanir"] },
    ],
    families: [
      { id: "micro_leak", trSubject: "mikro gaz kacagi var gibi", deSubject: "eine mikroleckage vorliegt", trCause: "uzun sureli dusuk kayip, flare oturmasi veya servis noktasi yorgunlugudur", deCause: "langsame Verluste, nachgebende Flare-Sitze oder ermuedete Servicepunkte", trChecks: "yag izi, elektronik detektor ve basinc tutma testi birlikte kullanilir", deChecks: "Oelspuren, elektronischer Detektor und Druckhalteprobe gemeinsam genutzt werden", trWhy: "mikro kacak bir anda degil zamanla performansi asindirir", deWhy: "eine Mikroleckage die Leistung schleichend und nicht schlagartig abbaut", trMistake: "bir kere kopukluk goremedim diye kacagi yok sanmaktir", deMistake: "eine Leckage zu verneinen, nur weil kein grosser Austritt sichtbar ist", keywords: ["mikro kacak"], suggestions: ["mikro kacak nasil bulunur"] },
      { id: "flare_leak", trSubject: "flare baglanti kaciriyor", deSubject: "eine flare-verbindung leckt", trCause: "hatali tork, yuzey bozuklugu veya tekrar sikilan flare olabilir", deCause: "falsches Drehmoment, schlechte Dichtflaeche oder eine mehrfach nachgezogene Flare", trChecks: "flare izi, tork gecmisi ve yuk altinda sızdırmazlik kontrol edilir", deChecks: "Flarebild, Drehmomenthistorie und Dichtheit unter Last geprueft werden", trWhy: "flare birlesimi yalniz ilk montajda degil isil dongude de davranir", deWhy: "eine Flare nicht nur bei Montage, sondern auch unter Temperaturwechseln reagiert", trMistake: "sadece daha cok sikarak sorunu cozmeye calismaktir", deMistake: "das Problem nur durch Nachziehen loesen zu wollen", keywords: ["flare"], suggestions: ["flare kacak niye tekrar eder"] },
      { id: "braze_leak", trSubject: "kaynakli noktadan kacak var", deSubject: "an einer loetstelle eine leckage ist", trCause: "azot kullanilmadan kaynak, kirli yuzey veya zayif dolgu olabilir", deCause: "Loeten ohne Stickstoff, verschmutzte Oberflaechen oder schwache Fuellung", trChecks: "kaynak izi, basinç testi ve yakin cevrede yağ izleri kontrol edilir", deChecks: "Loetbild, Drucktest und Oelspuren in der Naehe geprueft werden", trWhy: "kaynak noktasi zamanla ısı-genlesme nedeniyle zayif yerden acilir", deWhy: "Loetstellen sich unter thermischer Wechselbelastung an schwachen Stellen oeffnen", trMistake: "eski kaynagin ustune hazirlamadan tekrar ek atmaktir", deMistake: "auf eine alte Stelle ohne saubere Vorbereitung erneut aufzuloeten", keywords: ["kaynak kacak", "braze leak"], suggestions: ["kaynakta azot neden gerekir"] },
      { id: "schrader_leak", trSubject: "servis sibobu kaciriyor", deSubject: "das schrader-ventil leckt", trCause: "ice kirlenme, kapak eksigi veya ic valfin yipranmasidir", deCause: "Verschmutzung, fehlende Kappe oder verschlissener Ventilkern", trChecks: "cekirdek, kapak ve sabunla kucuk kacis kontrolu yapilir", deChecks: "Ventilkern, Schutzkappe und feine Blasenbildung werden geprueft", trWhy: "kucuk servis valfi kacagi zamanla buyuk sarj kaybi yapabilir", deWhy: "ein kleines Serviceventilleck mit der Zeit zu grossem Kuehlmittelverlust fuehrt", trMistake: "kapak takiliysa kacirmiyor varsaymaktir", deMistake: "anzunehmen, dass mit Kappe alles dicht ist", keywords: ["schrader", "servis sibobu"], suggestions: ["schrader kacak nasil kesinlesir"] },
      { id: "service_valve_leak", trSubject: "servis vanasi milinde kacak var", deSubject: "an der spindel des serviceventils eine leckage ist", trCause: "spindle salmastra yorgunlugu veya yanlis servis kullanimi olabilir", deCause: "eine ermuedete Spindeldichtung oder unsaubere Servicebedienung", trChecks: "vana mili, kapak ve cevredeki yaglanma izi incelenir", deChecks: "Spindel, Kappe und Oelspuren um das Ventil werden geprueft", trWhy: "vana milindeki kacak bazen sadece belirli pozisyonda kendini gosterir", deWhy: "eine Spindelleckage sich manchmal nur in bestimmten Stellungen zeigt", trMistake: "yalniz valf ucuna bakip mil kismini unutmak", deMistake: "nur die Spitze des Ventils zu pruefen und die Spindel zu vergessen", keywords: ["servis vanasi"], suggestions: ["servis vanasi mil kacagi nasil anlasilir"] },
      { id: "undercharge", trSubject: "sistem gazsiz ya da eksik sarjli", deSubject: "die anlage unterfuellt ist", trCause: "kacak, eksik dolum veya dogru sarj dogrulamasi yapilmamis olabilir", deCause: "Leckage, Unterfuellung oder fehlende Verifikation der korrekten Fuellung", trChecks: "superheat, subcool, sight glass ve kapasite davranisi birlikte okunur", deChecks: "Superheat, Subcooling, Schauglas und Leistungsverhalten gemeinsam ausgewertet werden", trWhy: "eksik gaz evaporator beslemesini dusurur ve kompresor sogutmasini bozar", deWhy: "Unterfuellung die Verdampferfuetterung reduziert und die Verdichterkuehlung verschlechtert", trMistake: "yalniz dusuk basinca bakarak sarj karari vermek", deMistake: "die Fuellung nur aus dem Niederdruck abzuleiten", keywords: ["gaz eksik", "undercharge"], suggestions: ["eksik gaz nasil kesinlesir"] },
      { id: "overcharge", trSubject: "sistem fazla gazli", deSubject: "die anlage ueberfuellt ist", trCause: "tartimsiz dolum, receiver yorumu hatasi veya subcool mantigi bilinmemesidir", deCause: "Fuellen ohne Waage, falsche Receiverdeutung oder fehlendes Subcool-Verstaendnis", trChecks: "subcool, basma basinci ve kondenser kullanilan alan birlikte incelenir", deChecks: "Subcooling, Hochdruck und aktive Verfluessigerflaeche gemeinsam bewertet werden", trWhy: "fazla gaz kondenser hacmini bozar ve yuksek basinç yaratir", deWhy: "zu viel Kaeltemittel den Verfluessiger ueberflutet und Hochdruck erzeugt", trMistake: "kopuk sight glass gorulmedi diye fazla gaz ihtimalini elemek", deMistake: "Ueberfuellung auszuschliessen, nur weil kein Blasenbild sichtbar ist", keywords: ["fazla gaz", "overcharge"], suggestions: ["fazla gaz nasil anlasilir"] },
      { id: "noncondensables", trSubject: "sistemde yozusmayan gaz var gibi", deSubject: "nicht kondensierbare gase im system sind", trCause: "yanlis bosaltma, kotu vakum veya servis sirasinda hava girmesidir", deCause: "schlechte Evakuierung oder Lufteintrag waehrend des Service", trChecks: "ambient ile kondenser davranisi ve normalden sapmis basinç okunur", deChecks: "Umgebung, Verfluessigerverhalten und abweichender Hochdruck bewertet werden", trWhy: "yozusmayan gazlar kondenser yuzeyini doldurup isi atisini bozar", deWhy: "nicht kondensierbare Gase die Verfluessigerflaeche blockieren und die Waermeabgabe stoeren", trMistake: "her yuksek basinci fazla gaz zannetmek", deMistake: "jeden Hochdruck sofort als Ueberfuellung zu deuten", keywords: ["noncondensable", "hava karismis"], suggestions: ["havali sistem nasil anlasilir"] },
      { id: "moisture", trSubject: "sistemde nem kalmis", deSubject: "feuchtigkeit im system verblieben ist", trCause: "zayif vakum, acikta bekleyen malzeme veya drier yetersizligidir", deCause: "schwaches Vakuum, offen gelassene Bauteile oder ein unzureichender Trockner", trChecks: "vakum davranisi, drier gecmisi ve sureksiz tikanma belirtileri incelenir", deChecks: "Vakuumverhalten, Trocknerhistorie und Anzeichen fuer wiederkehrende Engstellen geprueft werden", trWhy: "nem bazen sabit degil degisken semptom verip ustayi sasirtir", deWhy: "Feuchtigkeit oft wechselhafte und irrefuehrende Symptome erzeugt", trMistake: "yalniz kacak arayip nem ihtimalini unutmak", deMistake: "nur Leckagen zu suchen und Feuchtigkeit zu vergessen", keywords: ["nem", "moisture"], suggestions: ["nem sisteme ne yapar"] },
      { id: "wrong_refrigerant", trSubject: "yanlis gaz sarji yapilmis olabilir", deSubject: "das falsche kaeltemittel eingefuellt wurde", trCause: "etiket hatasi, servis aliskanligi veya retrofit kaydinin eksigidir", deCause: "falsche Kennzeichnung, Servicegewohnheit oder fehlende Retrofitdokumentation", trChecks: "silindir kaydi, etiket, basinc-sicaklik uyumu ve servis notu karsilastirilir", deChecks: "Flaschenhistorie, Etikett, Druck-Temperatur-Plausibilitaet und Serviceprotokoll verglichen werden", trWhy: "yanlis gaz bazen dogrudan alarm vermeyip performansi bozar", deWhy: "das falsche Kaeltemittel nicht immer sofort alarmiert, aber die Leistung verfremdet", trMistake: "pt sapmasini cihaz arizasi sanmaktir", deMistake: "PT-Abweichungen sofort als Geraetefehler zu lesen", keywords: ["yanlis gaz", "wrong refrigerant"], suggestions: ["yanlis gaz nasil kesinlesir"] },
      { id: "poor_vacuum", trSubject: "vakum proseduru yetersiz kalmis", deSubject: "das vakuumverfahren unzureichend war", trCause: "sure az, ekipman zayif veya sistemin acikta kalma suresi uzundur", deCause: "zu kurze Zeit, schwache Ausruestung oder lange Offenzeit des Systems", trChecks: "vakum derinligi, tutma testi ve sonrasindaki davranis birlikte sorgulanir", deChecks: "Vakuumniveau, Halteprobe und Verhalten danach gemeinsam bewertet werden", trWhy: "yetersiz vakum hem nem hem hava sorununu gizlice birakir", deWhy: "ein schlechtes Vakuum sowohl Feuchtigkeit als auch Restgase zuruecklaesst", trMistake: "pompa sesi duymayi yeterli sanmaktir", deMistake: "das Laufen der Pumpe bereits fuer ausreichend zu halten", keywords: ["vakum", "poor vacuum"], suggestions: ["vakum ne kadar surmeli"] },
      { id: "leak_after_service", trSubject: "servis sonrasi gaz tekrar eksiliyor", deSubject: "nach dem service erneut kaeltemittel fehlt", trCause: "mudahele noktasinda yeni kacak veya eksik kapatma olabilir", deCause: "an der bearbeiteten Stelle ein neues Leck oder eine nicht sauber geschlossene Verbindung entstanden ist", trChecks: "servis yapilan butun noktalar geriye dogru izlenir", deChecks: "alle beruehrten Servicepunkte rueckwaerts kontrolliert werden", trWhy: "kacak bazen eski degil son mudahalenin yan urunudur", deWhy: "die Leckage manchmal nicht alt, sondern Folge des letzten Eingriffs ist", trMistake: "servis sonrasi olamaz diye yeni noktayi elemek", deMistake: "die zuletzt bearbeitete Stelle vorschnell auszuschliessen", keywords: ["servis sonrasi kacak"], suggestions: ["servis sonrasi neden tekrar gaz eksilir"] },
      { id: "receiver_level_misread", trSubject: "receiver dolulugu yanlis yorumlaniyor", deSubject: "der receiverfuellstand falsch gelesen wird", trCause: "gozlem yanilgiSi veya sistem kosuluna gore yanlis zamanlamadir", deCause: "eine Fehlinterpretation oder die Beobachtung im falschen Betriebszustand", trChecks: "receiver davranisi, subcool ve yuk kosulu ayni anda okunur", deChecks: "Receiververhalten, Subcooling und Lastzustand gleichzeitig betrachtet werden", trWhy: "receiver yalniz kendi basina degil tum devre ile birlikte yorumlanir", deWhy: "ein Receiver nie isoliert, sondern nur im Gesamtkreis sinnvoll bewertet wird", trMistake: "tek bir goruntuye bakip fazla ya da eksik gaz karari vermek", deMistake: "aus einem einzelnen Bild sofort auf Ueber- oder Unterfuellung zu schliessen", keywords: ["receiver", "doluluk"], suggestions: ["receiver seviyesi nasil yorumlanir"] },
      { id: "bubble_misread", trSubject: "sight glass kopuklugu yanlis yorumlaniyor", deSubject: "das schauglasbild falsch interpretiert wird", trCause: "yuk degisimi, kondenzasyon farki veya sistem tipine uygun olmayan beklentidir", deCause: "Lastwechsel, Kondensationsbedingungen oder eine unpassende Erwartung an das Systembild", trChecks: "sight glass goruntusu superheat ve subcool ile beraber okunur", deChecks: "das Schauglas immer zusammen mit Superheat und Subcooling gelesen wird", trWhy: "kopukluk tek basina ne eksik gaz ne fazla gaz kanitidir", deWhy: "ein Blasenbild allein weder Unter- noch Ueberfuellung beweist", trMistake: "yalniz goze bakarak dolum yapmak", deMistake: "nur nach dem Blick ins Schauglas nachzufuellen", keywords: ["sight glass", "kopukluk"], suggestions: ["kopukluk ne zaman anlamlidir"] },
      { id: "long_line_charge_error", trSubject: "uzun hatta sarj hesabi yanlis", deSubject: "die fuellung bei langer leitung falsch berechnet ist", trCause: "ek boru hacmi, receiver etkisi veya katalog verisinin sahaya uyumsuzlugudur", deCause: "zusatzvolumen der Leitung, Receivereffekt oder fehlende Feldanpassung der Katalogwerte", trChecks: "boru boyu, cap, ek hacim ve final superheat-subcool birlikte karsilastirilir", deChecks: "Rohrlaenge, Durchmesser, Zusatzvolumen und finale Superheat-Subcool-Werte gemeinsam verglichen werden", trWhy: "uzun hatta standart dolum aliskanligi ciddi hata yaratir", deWhy: "die Standardfuellung bei langen Leitungen zu grossen Fehlern fuehren kann", trMistake: "etiket sarjini sahadaki ek hacimle birlestirmemek", deMistake: "die Etikettfuellung nicht um das reale Leitungsvolumen zu erweitern", keywords: ["uzun hat sarj"], suggestions: ["uzun hatta sarj nasil hesaplanir"] },
      { id: "intermittent_leak", trSubject: "kacak arada bir ortaya cikiyor", deSubject: "die leckage nur zeitweise sichtbar ist", trCause: "sicaklik-genlesme, titreSim veya vana pozisyonuna bagli davranis olabilir", deCause: "Temperaturausdehnung, Vibration oder eine ventilabhaengige Leckage", trChecks: "hangi kosulda kacagin arttigi kaydedilir", deChecks: "es wird festgehalten, unter welchen Bedingungen die Leckage zunimmt", trWhy: "aralikli kacaklar sabit testte saklanabilir", deWhy: "intermittierende Leckagen sich bei statischen Tests verstecken koennen", trMistake: "tek seferlik testte kacagi yok saymak", deMistake: "das Leck nach einem einmaligen Test zu verneinen", keywords: ["aralikli kacak", "intermittent leak"], suggestions: ["sicakta artan kacak neden olur"] },
    ],
  },
  {
    packId: "panel",
    trLabel: "Elektrik Panosu",
    deLabel: "Schaltschrank",
    sourceSummary: "DRC MAN derin ariza bankasi - elektrik panosu",
    keywords: ["panel", "pano", "schaltschrank", "kontaktor", "phase", "fuse"],
    suggestions: ["kontaktor neden yanar", "faz eksigi panoda nasil bulunur", "nemli panoda ilk neye bakilir"],
    contexts: [
      { id: "three_phase_panel", trLabel: "uc faz pano", deLabel: "Drehstrom-Schaltschrank", trNote: "uc faz panoda akim dengesizligi ve faz sirasi arizayi buyutebilir", deNote: "im Drehstromschrank koennen Stromunwucht und Phasenfolge den Fehler verschaerfen", trRisk: "tek faz olcum yetmez", deRisk: "eine Einzelmessung reicht hier nicht", keywords: ["uc faz"], suggestions: ["uc faz panoda ilk hangi olcum yapilir"] },
      { id: "single_phase_panel", trLabel: "tek faz pano", deLabel: "Einphasen-Schaltschrank", trNote: "tek faz panoda kalkis elemanlari ve neutral davranisi daha belirleyicidir", deNote: "im Einphasenschrank sind Startbauteile und Neutralverhalten besonders wichtig", trRisk: "basit gorunen ariza aslinda gerilim dusumunden dogabilir", deRisk: "ein einfacher Fehler kann in Wahrheit aus Spannungsabfall stammen", keywords: ["tek faz"], suggestions: ["tek faz panoda kondansator nasil ayristirilir"] },
      { id: "humid_panel", trLabel: "nemli mahal panosu", deLabel: "feuchter Schaltschrank", trNote: "nem ve yogusma soket, terminal ve kart davranisini bozar", deNote: "Feuchte und Kondensation stoeren Stecker, Klemmen und Elektronik", trRisk: "ariza surekli degil aralikli gorulebilir", deRisk: "die Stoerung kann intermittierend statt dauerhaft auftreten", keywords: ["nemli pano"], suggestions: ["nem panoda ne yapar"] },
      { id: "rooftop_panel", trLabel: "dis ortam panosu", deLabel: "Aussen-Schaltschrank", trNote: "gunes, sicaklik farki ve titreSim panodaki baglantilari yorar", deNote: "Sonne, Temperaturwechsel und Vibration belasten die Verbindungen im Aussenschrank", trRisk: "mevsimsel arizalar daha sik gorulur", deRisk: "saisonale Stoerungen treten haeufiger auf", keywords: ["dis ortam pano"], suggestions: ["dis ortam panosunda hangi hatalar artar"] },
      { id: "old_panel", trLabel: "yasli pano", deLabel: "aelterer Schaltschrank", trNote: "yasli panolarda oksitlenme, izinsel isinma ve parca yorgunlugu birikir", deNote: "in alten Schaltschranken sammeln sich Oxidation, Kontaktwaerme und Bauteilalterung", trRisk: "bir hata digerini tetikleyen zincir olusabilir", deRisk: "ein Fehler kann den naechsten in der Kette ausloesen", keywords: ["yasli pano"], suggestions: ["eski panoda nerelerden baslanir"] },
    ],
    families: [
      { id: "contactor_burn", trSubject: "kontaktor yanar veya kontaklari yanik gibi", deSubject: "das schuetz verbrennt oder die kontakte verbrannt wirken", trCause: "asiri akim, gevsek baglanti veya yuksek start sikligidir", deCause: "Ueberstrom, lose Verbindung oder zu haeufige Starts", trChecks: "kontak dusumu, akim ve bobin davranisi birlikte okunur", deChecks: "Kontaktspannungsfall, Strom und Spulenverhalten gemeinsam geprueft werden", trWhy: "yanik kontaktor sadece son nokta, asıl sebep upstream olabilir", deWhy: "ein verbranntes Schuetz oft nur das Ende und nicht die eigentliche Ursache ist", trMistake: "yalniz kontaktoru degistirip akim nedenini aramamak", deMistake: "nur das Schuetz zu tauschen und die Stromursache nicht zu suchen", keywords: ["kontaktor", "schuetz", "kontaktor neden yanar", "kontaktor yanar", "burned contactor"], suggestions: ["kontaktor neden yanar"] },
      { id: "relay_stuck", trSubject: "role yapisiyor veya dusmuyor", deSubject: "ein relais klebt oder nicht sauber abfaellt", trCause: "kontak yapismasi, zayif bobin veya kontrol karti kararsizligidir", deCause: "Kontaktkleben, schwache Spule oder instabiler Reglerausgang", trChecks: "role cikisi, bobin gerilimi ve gercek kontak davranisi birlikte bakilir", deChecks: "Relaisausgang, Spulenspannung und Kontaktverhalten gemeinsam beobachtet werden", trWhy: "role sesi tek basina dogru anahtarlama oldugunu kanitlamaz", deWhy: "ein Klickgeraeusch nicht beweist, dass das Relais sauber schaltet", trMistake: "role tikliyor diye saglam sanmak", deMistake: "ein Relais nur wegen des Klicks als intakt zu sehen", keywords: ["role yapisiyor", "relay stuck"], suggestions: ["role yapismasi nasil test edilir"] },
      { id: "terminal_loose", trSubject: "terminal gevsekligi var", deSubject: "eine lose klemme vorhanden ist", trCause: "titreSim, isil genlesme veya zayif montajdir", deCause: "Vibration, thermische Ausdehnung oder schlechte Montage", trChecks: "isinma izi, terminal sikiligi ve kablo rengi kontrol edilir", deChecks: "Waermespuren, Klemmenfestigkeit und Kabelfarbe geprueft werden", trWhy: "gevsek terminal voltaj dusumu kadar yangin riski de yaratir", deWhy: "lose Klemmen nicht nur Spannungsabfall, sondern auch Brandrisiko verursachen", trMistake: "yalniz multimetre ile bakip fiziksel sikiligi test etmemek", deMistake: "nur zu messen und die mechanische Festigkeit nicht zu pruefen", keywords: ["terminal gevsek"], suggestions: ["gevsek terminal nasil bulunur"] },
      { id: "phase_sequence", trSubject: "faz sirasi yanlis", deSubject: "die phasenfolge falsch ist", trCause: "yanlis baglanti veya mudahele sonrasi tersleme olabilir", deCause: "falscher Anschluss oder Vertauschung nach Service", trChecks: "faz sirasi cihazi ve motor donus yonu birlikte kontrol edilir", deChecks: "Phasenfolgegeraet und Drehrichtung werden gemeinsam geprueft", trWhy: "faz sirasi bazi ekipmanda sadece yon degil basinç davranisini da bozar", deWhy: "die Phasenfolge bei manchen Aggregaten mehr als nur die Drehrichtung beeinflusst", trMistake: "motor donuyor diye faz sirasi dogru sanmak", deMistake: "anzunehmen, dass die Phasenfolge stimmt, nur weil ein Motor dreht", keywords: ["faz sirasi"], suggestions: ["faz sirasi nasil teyit edilir"] },
      { id: "phase_loss", trSubject: "faz eksigi var", deSubject: "ein phasenausfall besteht", trCause: "sigorta, soket, kablo kopugu veya yuk altinda dusen faz olabilir", deCause: "Sicherung, Steckverbindung, Kabelbruch oder eine unter Last wegfallende Phase", trChecks: "bosta ve yukte fazlarin tamami olculur", deChecks: "alle Phasen leer und unter Last gemessen werden", trWhy: "faz eksigi bazen bos testte gizlenir, yukte cikar", deWhy: "ein Phasenausfall sich im Leerlauf verstecken und erst unter Last zeigen kann", trMistake: "yalniz bos faz olcumu ile karar vermek", deMistake: "nur anhand der Leerlaufmessung zu urteilen", keywords: ["faz eksigi"], suggestions: ["faz eksigi yukte nasil bulunur"] },
      { id: "low_voltage", trSubject: "panelde gerilim dusuyor", deSubject: "die spannung im schaltschrank abfaellt", trCause: "uzun hat, zayif baglanti veya yuksek kalkis akimidir", deCause: "lange Leitung, schlechte Verbindung oder hoher Anlaufstrom", trChecks: "giris-cikis gerilimi ve yuk anindaki dusus ayni anda izlenir", deChecks: "Eingangs- und Ausgangsspannung sowie der Spannungsfall unter Last beobachtet werden", trWhy: "dusuk voltaj pek cok arizayi mekanik gibi gosterir", deWhy: "Unterspannung viele Stoerungen wie mechanische Fehler aussehen laesst", trMistake: "yalniz nominal beslemeyi okuyup dinamigi gormemek", deMistake: "nur die Nennspannung zu lesen und die Dynamik zu ignorieren", keywords: ["voltaj dusuk"], suggestions: ["gerilim dusumu panoda nasil bulunur"] },
      { id: "breaker_trip", trSubject: "otomatik sigorta atiyor", deSubject: "der leitungsschutz ausloest", trCause: "kisa devre, asiri akim veya hatali secilmis koruma olabilir", deCause: "Kurzschluss, Ueberstrom oder eine falsch gewaehlte Schutzcharakteristik", trChecks: "ne zaman attigi, hangi yukte attigi ve downstream devre birlikte izlenir", deChecks: "Zeitpunkt, Lastsituation und nachgeschalteter Kreis gemeinsam betrachtet werden", trWhy: "sigorta atmasi sonucu degil sebebi anlatir", deWhy: "eine ausgeloeste Sicherung das Ergebnis und nicht die Ursache ist", trMistake: "buyuk sigorta takarak sorunu gizlemek", deMistake: "das Problem mit groesserem Schutz nur zu verdecken", keywords: ["otomatik sigorta", "breaker"], suggestions: ["otomatik sigorta neden atar"] },
      { id: "fuse_blow", trSubject: "kartal sigorta tekrar patliyor", deSubject: "eine sicherung immer wieder durchbrennt", trCause: "kisa devre, bobin arizasi veya anlik surteS olabilir", deCause: "Kurzschluss, Spulendefekt oder ein schlagartiger Stromstoss", trChecks: "hangi dalda patladigi ve downstream yukler ayrilarak test edilir", deChecks: "welcher Zweig betroffen ist und welche Lasten dahinter liegen, wird getrennt getestet", trWhy: "tekrar patlayan sigorta sabit bir asiri yük veya kisa devreye isaret eder", deWhy: "eine wiederholt ausloesende Sicherung auf einen anhaltenden Fehler hinweist", trMistake: "tekrar tekrar ayni sigortayi degistirmek", deMistake: "immer wieder nur die Sicherung zu ersetzen", keywords: ["sigorta patliyor", "fuse"], suggestions: ["hangi devre sigortayi patlatir"] },
      { id: "overload_setting", trSubject: "termik ayari yanlis", deSubject: "der motorschutz falsch eingestellt ist", trCause: "etiket degeriyle saha yukunun karistirilmasidir", deCause: "eine Verwechslung von Typenschild und realer Feldlast", trChecks: "motor etiketi, olculen akim ve ayar degeri yan yana okunur", deChecks: "Motorschild, gemessener Strom und eingestellter Wert verglichen werden", trWhy: "termik ne cok dusuk ne gereksiz yuksek olmalidir", deWhy: "ein Motorschutz weder zu tief noch zu hoch eingestellt werden darf", trMistake: "sorun olmasin diye ayari buyutmek", deMistake: "den Wert aus Bequemlichkeit einfach hoeher zu setzen", keywords: ["termik ayari"], suggestions: ["motorschutz nasil ayarlanir"] },
      { id: "transformer_fail", trSubject: "kontrol trafosu sagliksiz", deSubject: "der steuertransformator unzuverlaessig ist", trCause: "ic sargı zayifligi, asiri yuk veya isil yorgunluktur", deCause: "Wicklungsschwaeche, Ueberlast oder thermische Alterung", trChecks: "primer-sekonder gerilim ve yuk altindaki davranis izlenir", deChecks: "Primaer-, Sekundaerspannung und Verhalten unter Last geprueft werden", trWhy: "zayif trafo kart arizasi gibi yalanci semptom yaratabilir", deWhy: "ein schwacher Trafo wie ein Elektronikfehler wirken kann", trMistake: "yalniz bos sekonder gerilimi olcmek", deMistake: "nur die Leerlaufspannung am Sekundaer zu messen", keywords: ["trafo"], suggestions: ["kontrol trafosu nasil test edilir"] },
      { id: "sensor_supply", trSubject: "sensor beslemesi bozuk", deSubject: "die fuehlerversorgung gestoert ist", trCause: "referans gerilim hatasi, kart cikisi veya kablo sorunudur", deCause: "ein Fehler in Referenzspannung, Kartenausgang oder Kabelweg", trChecks: "sensor hattinda gerilim ve okunan deger sapmasi birlikte bakilir", deChecks: "Spannung auf der Fuehlerleitung und Messwertabweichung zusammen betrachtet werden", trWhy: "besleme bozuksa sensoru suclamak eksik tespittir", deWhy: "bei fehlerhafter Versorgung der Fuehler allein nicht die ganze Ursache ist", trMistake: "direkt sensor degistirmek", deMistake: "den Fuehler sofort zu tauschen", keywords: ["sensor besleme"], suggestions: ["sensor beslemesi nasil kontrol edilir"] },
      { id: "controller_output", trSubject: "kontrol karti cikisi kararsiz", deSubject: "der reglerausgang instabil ist", trCause: "ic role, kart beslemesi veya parametre gecisi bozulmustur", deCause: "internes Relais, Kartenversorgung oder Parametrierung fehlerhaft sind", trChecks: "cikis komutu, gercek enerji gecisi ve alarm hafizasi birlikte okunur", deChecks: "Ausgangsbefehl, reale Energieuebergabe und Alarmhistorie gemeinsam geprueft werden", trWhy: "kart cikisi arizasi saha elemanlarini bos yere suclatir", deWhy: "ein Kartenfehler viele Feldbauteile zu Unrecht verdaechtig macht", trMistake: "kontrol kartini en sona birakmak", deMistake: "den Reglerausgang viel zu spaet in die Analyse einzubeziehen", keywords: ["kart cikisi"], suggestions: ["regler cikisi nasil test edilir"] },
      { id: "moisture_in_panel", trSubject: "panoda nem var", deSubject: "sich feuchtigkeit im schaltschrank bildet", trCause: "kapak sizdirmazligi, havalandirma hatasi veya ciy noktasi problemidir", deCause: "Undichtigkeit am Gehaeuse, schlechte Belueftung oder Taupunktprobleme", trChecks: "damla izi, oksitlenme ve kapak cevresi kontrol edilir", deChecks: "Wassertropfen, Oxidation und der Bereich um die Tuerdichtung geprueft werden", trWhy: "nem arizasi sabit degil zamanla ortaya cikan yalanci kontaklar yapar", deWhy: "Feuchtigkeit haeufig zeitverzoegerte Wackelkontakte und Fehlbilder erzeugt", trMistake: "yalniz kart degistirip nem kaynagini kapatmamak", deMistake: "nur Elektronik zu tauschen, ohne die Feuchtequelle zu beseitigen", keywords: ["panoda nem"], suggestions: ["nemli panoda ilk neye bakilir"] },
      { id: "ground_fault", trSubject: "toprak kacagi supheli", deSubject: "ein erdschluss vermutet wird", trCause: "izolasyon zayifligi, su girisi veya zarar gormus kablodur", deCause: "Isolationsschwaeche, Wassereintritt oder ein beschaedigtes Kabel", trChecks: "izolasyon testi ve devreyi parcali ayirma yontemi uygulanir", deChecks: "Isolationsmessung und schrittweises Trennen der Stromkreise angewendet werden", trWhy: "toprak kacagi aralıklıysa basit testte saklanabilir", deWhy: "ein intermittierender Erdschluss sich in einfachen Tests verstecken kann", trMistake: "her atmayi cihaz hatasi sanmak", deMistake: "jede Ausloesung sofort als Geraetefehler zu lesen", keywords: ["toprak kacagi", "ground fault"], suggestions: ["toprak kacagi nasil bulunur"] },
      { id: "neutral_issue", trSubject: "nötr hatti sorunlu", deSubject: "die neutralleitung problematisch ist", trCause: "nötr gevsek, kirik veya ortak yukte dengesiz olabilir", deCause: "ein loser, gebrochener oder unter Gemeinschaftslast instabiler Neutralleiter", trChecks: "nötr potansiyeli ve dengesiz gerilim davranisi birlikte okunur", deChecks: "Neutralpotential und asymmetrisches Spannungsverhalten gemeinsam geprueft werden", trWhy: "nötr sorunu kart ve sensor arizasi gibi kendini kamufle eder", deWhy: "Neutralprobleme sich oft wie Sensor- oder Reglerfehler tarnen", trMistake: "sadece fazlara bakip nötru unutmaktir", deMistake: "nur die Phasen zu messen und den Neutralleiter zu vergessen", keywords: ["notr", "neutral"], suggestions: ["notr sorunu nasil belli olur"] },
      { id: "door_switch_interlock", trSubject: "kapi switchi kumanda zincirini bozuyor", deSubject: "der tuerschalter die steuerkette stoert", trCause: "switch ayarsiz, nemli veya mekanik olarak yorulmus olabilir", deCause: "der Schalter kann verstellt, feucht oder mechanisch ermuedet sein", trChecks: "kapı acik-kapali konumunda switch gecisi kararlı mi diye bakilir", deChecks: "geprueft wird, ob der Schalter in offener und geschlossener Stellung sauber wechselt", trWhy: "kapi switchi bazen kompresor ya da fan arizasi gibi yalanci tablo cikarir", deWhy: "ein Tuerschalter leicht ein falsches Bild von Verdichter- oder Ventilatorstoerung erzeugen kann", trMistake: "mekanik switchi yazilim arizasi sanmak", deMistake: "einen mechanischen Schalterfehler fuer ein Softwareproblem zu halten", keywords: ["kapi switch"], suggestions: ["kapi switchi nasil test edilir"] },
    ],
  },
  {
    packId: "r290",
    trLabel: "R290 Sistem",
    deLabel: "R290-System",
    sourceSummary: "DRC MAN derin ariza bankasi - R290",
    keywords: ["r290", "propan", "kompakt sistem", "charge", "safety"],
    suggestions: ["R290 sistemde fazla gaz olursa ne olur", "R290 cihaz niye performans kaybeder", "R290 servis sonrasi neye bakilir"],
    contexts: [
      { id: "compact_monoblock", trLabel: "kompakt monoblok R290 cihaz", deLabel: "kompaktes R290-Monoblockgeraet", trNote: "R290 kompakt cihazlarda hava yolu ve sarj miktari cok hassastir", deNote: "bei kompakten R290-Geraeten sind Luftweg und Fuellmenge sehr sensibel", trRisk: "cok kucuk hata buyuk performans farki yapar", deRisk: "schon kleine Fehler erzeugen grosse Leistungsunterschiede", keywords: ["kompakt monoblok"], suggestions: ["kompakt R290 cihazda hava yolu neden kritik"] },
      { id: "small_coldroom", trLabel: "kucuk soguk oda R290 sistemi", deLabel: "kleines R290-Kuehlraumsystem", trNote: "kucuk soguk oda uygulamasinda sarj, hava ve montaj birbiriyle cok baglantilidir", deNote: "im kleinen R290-Kuehlraum greifen Fuellung, Luftseite und Montage stark ineinander", trRisk: "tek semptomdan tek sebebe gitmek kolay ama yanlis olabilir", deRisk: "aus einem Symptom direkt auf eine Ursache zu schliessen, ist hier verlockend, aber falsch", keywords: ["kucuk soguk oda"], suggestions: ["R290 kucuk odada superheat neden kritik"] },
      { id: "kitchen_install", trLabel: "mutfak icindeki R290 cihaz", deLabel: "R290-Geraet in der Kueche", trNote: "mutfakta hava sicakligi, yagli ortam ve havalandirma cihaz davranisini etkiler", deNote: "in Kuechen beeinflussen hohe Temperatur, Fettluft und Belueftung das Geraet stark", trRisk: "kondenser ve ventilasyon arizalari daha sik gorulur", deRisk: "Probleme an Verfluessiger und Belueftung treten haeufiger auf", keywords: ["mutfak R290"], suggestions: ["mutfakta R290 cihaz neden zorlanir"] },
      { id: "summer_high_ambient", trLabel: "yaz yuksek ambient R290 kosulu", deLabel: "R290-System bei hoher Sommerumgebung", trNote: "yuksek ambientte R290 sistem sarj ve hava akisi hatalarina daha sert tepki verir", deNote: "unter Sommerbedingungen reagiert ein R290-System deutlich empfindlicher auf Fuell- und Luftfehler", trRisk: "normal gunde kabul edilen durum sicakta alarm olur", deRisk: "was an normalen Tagen noch geht, wird im Sommer schnell zum Alarm", keywords: ["R290 yaz"], suggestions: ["R290 yaz performansi neden duser"] },
      { id: "post_service_unit", trLabel: "servis sonrasi R290 cihaz", deLabel: "R290-Geraet nach dem Service", trNote: "servis sonrasi kacak, sarj ve genel dogrulama daha disiplinli yapilmalidir", deNote: "nach dem Service muessen Leckage, Fuellung und Gesamtcheck besonders sauber erfolgen", trRisk: "son mudahale sonrasi dogan hata eski ariza gibi gorunebilir", deRisk: "ein neuer Fehler nach dem Service kann wie eine alte Stoerung wirken", keywords: ["R290 servis sonrasi"], suggestions: ["R290 servis sonrasi hangi kontroller yapilir"] },
    ],
    families: [
      { id: "low_charge_sensitive", trSubject: "R290 sarji eksik kaldiginda cihaz cok hassas davranıyor", deSubject: "das R290-geraet bei unterfuellung sehr empfindlich reagiert", trCause: "kucuk sarjli sistemlerde gram farkinin buyuk etkisi vardir", deCause: "bei kleineren R290-Systemen selbst kleine Mengenabweichungen grosse Wirkung haben", trChecks: "superheat, subcool ve performans dususu birlikte okunur", deChecks: "Superheat, Subcooling und Leistungsverlust gemeinsam gelesen werden", trWhy: "R290 kompakt devrede sarj dengesi toleransi dardir", deWhy: "die Fuelltoleranz im kompakten R290-Kreis enger ist", trMistake: "basinca bakip eksik sarji gozle tahmin etmek", deMistake: "die Unterfuellung nur nach Druck und Gefuehl zu bewerten", keywords: ["R290 eksik sarj"], suggestions: ["R290 eksik sarj nasil anlasilir"] },
      { id: "overcharge_sensitive", trSubject: "R290 cihazda fazla gaz var", deSubject: "das R290-geraet ueberfuellt ist", trCause: "kondenser hacmi sinirli oldugu icin fazla sarj hizla basinç ve isi yukunu artirir", deCause: "der begrenzte Verfluessigerraum bei Ueberfuellung Druck und Waermelast schnell steigen laesst", trChecks: "subcool, basma ve hava cikis sicakligi birlikte okunur", deChecks: "Subcooling, Hochdruck und Luftaustrittstemperatur gemeinsam betrachtet werden", trWhy: "R290 kompakt yapida fazla sarj gorunenden daha buyuk etki yapar", deWhy: "Ueberfuellung in kompakten R290-Systemen ueberproportional wirkt", trMistake: "az daha ekleyelim mantigiyla sarji bozmaktir", deMistake: "mit der Haltung 'ein bisschen mehr' die Fuellung zu verschieben", keywords: ["R290 fazla sarj", "R290 fazla gaz", "fazla gaz", "overcharge"], suggestions: ["R290 fazla gaz nasil anlasilir"] },
      { id: "airflow_blocked", trSubject: "R290 cihazda hava yolu kisitli", deSubject: "der luftweg im R290-geraet eingeschraenkt ist", trCause: "kirli kondenser, yakin duvar, ızgara tikanmasi veya fan zayifligidir", deCause: "verschmutzter Verfluessiger, geringe Abstaende, verstopfte Gitter oder schwacher Ventilator", trChecks: "hava girisi-cikisi, serpantin yuzeyi ve fan cekisi bakilir", deChecks: "Lufteintritt, Luftaustritt, Registeroberflaeche und Ventilatorleistung geprueft werden", trWhy: "R290 cihazlarda hava tarafi performans ve guvenlik acisindan daha da belirgindir", deWhy: "die Luftseite bei R290-Geraeten fuer Leistung und Betriebssicherheit besonders wichtig ist", trMistake: "yalniz gaz tarafina bakmak", deMistake: "sich nur auf den Kaeltekreis zu konzentrieren", keywords: ["R290 hava yolu"], suggestions: ["R290 cihazda ventilasyon nasil kontrol edilir"] },
      { id: "ventilation_poor", trSubject: "R290 cihaz yetersiz ventilasyonda kaliyor", deSubject: "das R290-geraet in schlechter belueftung arbeitet", trCause: "kurulum yeri uygun degil veya sicak hava geri donuyordur", deCause: "der Aufstellort ist ungeeignet oder warme Luft wird rueckgesaugt", trChecks: "cihaz etrafindaki bosluklar ve sicak hava geri donusu gozlenir", deChecks: "Freiraeume um das Geraet und Rueckansaugung warmer Luft beobachtet werden", trWhy: "ventilasyon eksigi basinç kadar kabin ic ısısını da bozar", deWhy: "mangelnde Belueftung nicht nur Druecke, sondern auch die Innenwaermebilanz stoert", trMistake: "fan donuyor diye ventilasyonu tamam sanmak", deMistake: "anzunehmen, dass mit laufendem Fan schon genug Belueftung da ist", keywords: ["R290 ventilasyon"], suggestions: ["R290 cihaz etrafinda ne kadar bosluk gerekir"] },
      { id: "discharge_temp", trSubject: "R290 kompresor basma sicakligi yukseldi", deSubject: "die druckgastemperatur beim R290-verdichter steigt", trCause: "hava yetersizligi, eksik sarj veya fazla superheat olabilir", deCause: "Luftmangel, Unterfuellung oder zu hoher Superheat", trChecks: "basma hatti, superheat ve kondenser yukü ayni anda okunur", deChecks: "Druckgasleitung, Superheat und Verfluessigerlast gleichzeitig gelesen werden", trWhy: "R290 sistemde basma sicakligi kompresor sagligi icin hizli alarm verir", deWhy: "die Druckgastemperatur im R290-System schnell auf Verdichterstress hinweist", trMistake: "yalniz basinçla karar vermek", deMistake: "nur mit Druckwerten zu urteilen", keywords: ["R290 basma sicakligi"], suggestions: ["R290 basma sicakligi neden artar"] },
      { id: "compressor_start_fail", trSubject: "R290 kompresor kalkmiyor", deSubject: "der R290-verdichter nicht startet", trCause: "kalkis elemani, besleme veya koruma zinciri problemidir", deCause: "Startbauteil, Versorgung oder Schutzkette gestoehrt sind", trChecks: "gerilim, role-kapasitor ve kalkis akimi kontrol edilir", deChecks: "Spannung, Relais-Kondensator und Anlaufstrom geprueft werden", trWhy: "kompakt R290 cihazda start arizasi bazen yetersiz ventilasyonla da iliskili olabilir", deWhy: "ein Startproblem beim kompakten R290-Geraet auch mit schlechter Belueftung zusammenhaengen kann", trMistake: "yalniz role degistirip genel kosulu gormemek", deMistake: "nur das Relais zu tauschen und das Gesamtsystem nicht zu bewerten", keywords: ["R290 kompresor kalkmiyor"], suggestions: ["R290 kalkis arizasinda neye bakilir"] },
      { id: "relay_capacitor", trSubject: "R290 kalkis role-kapasitor tarafi zayif", deSubject: "die startkomponenten des R290-geraets schwach sind", trCause: "yaslanan rolé, zayif kapasitor veya tekrarlayan zor kalkistir", deCause: "gealtertes Relais, schwacher Kondensator oder wiederholte Schwerstarts", trChecks: "bilesen degeri ve kalkis davranisi birlikte bakilir", deChecks: "Bauteilwerte und Startverhalten gemeinsam geprueft werden", trWhy: "zayif kalkis elemani kompresoru gereksiz zorlar", deWhy: "schwache Startkomponenten den Verdichter unnoetig stark belasten", trMistake: "yalniz bir parcayi rastgele degistirmek", deMistake: "einzelne Teile ohne Messung zufaellig zu wechseln", keywords: ["R290 role kapasitor"], suggestions: ["R290 kalkis elemanlari nasil test edilir"] },
      { id: "service_port_leak", trSubject: "R290 servis portunda kacak supheli", deSubject: "am serviceport des R290-geraets eine leckage vermutet wird", trCause: "cekirdek yorgunlugu veya servis sonrasi eksik kapatma olabilir", deCause: "ermuedeter Ventilkern oder unvollstaendige Abdichtung nach dem Service", trChecks: "cekirdek, kapak ve minik kacis izleri kontrol edilir", deChecks: "Ventilkern, Kappe und feine Leckageanzeichen geprueft werden", trWhy: "kucuk sarjli sistemde servis port kacaklari daha hizli performans kaybi yapar", deWhy: "bei kleinen Fuellmengen Serviceport-Lecks schneller zu Leistungsverlust fuehren", trMistake: "kapak var diye kacagi elemek", deMistake: "das Leck wegen vorhandener Kappe auszuschliessen", keywords: ["R290 servis port"], suggestions: ["R290 servis port kacagi nasil bulunur"] },
      { id: "drier_moisture", trSubject: "R290 sistemde drier-nem problemi var", deSubject: "im R290-system ein trockner-feuchteproblem besteht", trCause: "vakum eksigi veya servis acik kalma sureci olabilir", deCause: "unzureichendes Vakuum oder lange Offenzeit waehrend des Service", trChecks: "drier davranisi, tikanma semptomu ve vakum gecmisi sorgulanir", deChecks: "Trocknerverhalten, Engstellensymptome und Vakuumhistorie geprueft werden", trWhy: "nem kucuk devrede davranisi daha oynak hale getirir", deWhy: "Feuchtigkeit den kleinen Kaeltekreis noch instabiler macht", trMistake: "yalniz sarjla oynamak", deMistake: "nur an der Fuellung zu arbeiten", keywords: ["R290 drier"], suggestions: ["R290 sistemde drier ne zaman degisir"] },
      { id: "capillary_or_valve_feed", trSubject: "R290 besleme organi dengesiz", deSubject: "das einspeiseorgan im R290-system instabil arbeitet", trCause: "kapiler/valf secimi, tikanma veya hava tarafi dengesizligi olabilir", deCause: "Kapillar- oder Ventilauswahl, Teilblockade oder Luftseitenschwankung", trChecks: "superheat, buz deseni ve hava akisi birlikte okunur", deChecks: "Superheat, Frostbild und Luftstrom gemeinsam bewertet werden", trWhy: "R290 kompakt sistemde besleme organi semptomu hizi yuksek degisir", deWhy: "das Einspeiseverhalten in kompakten R290-Systemen sehr dynamisch ist", trMistake: "yalniz valfi suclayip hava yolunu unutmaktir", deMistake: "nur das Ventil zu verdaechtigen und die Luftseite zu vergessen", keywords: ["R290 besleme"], suggestions: ["R290 cihazda superheat neyi anlatir"] },
      { id: "oil_dilution", trSubject: "R290 cihazda yag seyrelmesi supheli", deSubject: "im R290-geraet eine oelverduennung vermutet wird", trCause: "uzun bekleme, karter isi yetersizligi veya geri donen sogutucu olabilir", deCause: "lange Stillstandszeit, zu wenig Gehaeusewaerme oder Kaeltemittelrueckwanderung", trChecks: "bekleme sonrasi kalkis ve karter davranisi izlenir", deChecks: "Start nach Stillstand und Verhalten des Kurbelgehaeuses beobachtet werden", trWhy: "seyrelmis yag kalkis aninda kompresor korumasini azaltir", deWhy: "verduenntes Oel den Verdichter beim Start schlechter schuetzt", trMistake: "yalniz calisirken bakip bekleme etkisini gormemek", deMistake: "nur den Laufzustand zu beobachten und den Stillstand zu vergessen", keywords: ["R290 yag"], suggestions: ["R290 cihazda bekleme sonrasi ne kontrol edilir"] },
      { id: "frosting_pattern_wrong", trSubject: "R290 cihazda buz deseni normal degil", deSubject: "das frostbild am R290-geraet unplausibel ist", trCause: "hava yolu, sarj veya besleme mantigi bozulmustur", deCause: "Luftweg, Fuellung oder Einspeisung nicht stimmen", trChecks: "buz desenine superheat-subcool ve fan davranisi eklenir", deChecks: "zum Frostbild werden Superheat, Subcooling und Ventilatorverhalten hinzugezogen", trWhy: "tek basina buz deseni yetmez ama guclu bir ipucudur", deWhy: "das Frostbild allein nicht reicht, aber ein starkes Indiz ist", trMistake: "buz desenini tek karar verisi yapmak", deMistake: "das Frostbild als einziges Kriterium zu verwenden", keywords: ["R290 buz deseni"], suggestions: ["buz deseni ne zaman anlamlidir"] },
      { id: "hot_ambient_alarm", trSubject: "R290 cihaz sicakta daha cok alarm veriyor", deSubject: "das R290-geraet bei hitze haeufiger alarmiert", trCause: "hava yolu siniri, fazla sarj veya ventilasyon eksigi olabilir", deCause: "Luftgrenze, Ueberfuellung oder schlechte Belueftung", trChecks: "sicak saatlerde basinç, hava cikisi ve fan yuku karsilastirilir", deChecks: "in den heissen Stunden Druck, Luftaustritt und Ventilatorlast verglichen werden", trWhy: "yaz kosulu gizli zayifligi hizla ortaya cikarir", deWhy: "Sommerbedingungen versteckte Schwaechen schnell sichtbar machen", trMistake: "kista sorun yoktu diye yaz davranisini yok saymak", deMistake: "das Sommerverhalten zu ignorieren, nur weil es im Winter gut lief", keywords: ["R290 sicak hava"], suggestions: ["R290 neden yazin alarm verir"] },
      { id: "wrong_component_selection", trSubject: "R290 sistemde parca secimi uyumsuz", deSubject: "die komponentenauswahl im R290-system nicht passt", trCause: "fan, kondenser, drier veya besleme elemani kapasitesi uyumsuz olabilir", deCause: "Ventilator, Verfluessiger, Trockner oder Einspeiseorgan falsch dimensioniert sind", trChecks: "katalog veri ile sahadaki davranis ayni tabloda okunur", deChecks: "Katalogdaten und reales Verhalten gemeinsam bewertet werden", trWhy: "uygunsuz secim servisle degil tasarimla ilgilidir", deWhy: "eine Fehlwahl eher ein Auslegungs- als ein Serviceproblem ist", trMistake: "servisle kapatilmaya calisilan tasarim eksigini gormemek", deMistake: "einen Auslegungsfehler mit Serviceeingriffen ueberspielen zu wollen", keywords: ["R290 parca secimi"], suggestions: ["R290 icin hangi kondenser gerekir"] },
      { id: "post_repair_check", trSubject: "R290 tamir sonrasi dogrulama eksik", deSubject: "nach einer R290-reparatur die verifikation unvollstaendig ist", trCause: "yalniz calisti deyip performans-kacak-sarj kontrolunun atlanmasidir", deCause: "nur zu sehen, dass es laeuft, ohne Leistung, Dichtheit und Fuellung zu verifizieren", trChecks: "tamir sonrasi kacak, performans ve stabil calisma birlikte dogrulanir", deChecks: "nach der Reparatur Dichtheit, Leistung und stabiler Lauf gemeinsam bestaetigt werden", trWhy: "R290 cihazlar kucuk sarj nedeniyle sonraki kontrolu daha hassas ister", deWhy: "R290-Geraete wegen der kleinen Fuellung eine genauere Abschlusskontrolle brauchen", trMistake: "tamiri bitirmekle isi bitmis sanmak", deMistake: "die Arbeit mit dem Ende der Reparatur fuer erledigt zu halten", keywords: ["R290 tamir sonrasi"], suggestions: ["R290 tamir sonrasi hangi testler gerekir"] },
      { id: "safety_prep_error", trSubject: "R290 serviste on hazirlik hatasi yapilmis", deSubject: "bei der R290-wartung eine falsche vorbereitung gemacht wurde", trCause: "is akisi, ekipman hazirligi veya kontrol sirasinin bozuklugudur", deCause: "Arbeitsablauf, Ausruestungsvorbereitung oder die Reihenfolge unpassend waren", trChecks: "servis oncesi durum, cihaz yerlesimi ve sonrasindaki semptom karsilastirilir", deChecks: "Ausgangszustand, Geraeteumgebung und Symptome nach dem Eingriff verglichen werden", trWhy: "on hazirlik hatasi teknik sonucu da guvenlik sonucunu da bozar", deWhy: "ein Fehler in der Vorbereitung sowohl Technik als auch Sicherheit negativ beeinflusst", trMistake: "hazirlik adimlarini formalite sanmak", deMistake: "die Vorbereitung fuer Formalitaet zu halten", keywords: ["R290 hazirlik"], suggestions: ["R290 serviste is akisi neden onemli"] },
    ],
  },
  createRefrigerantPack({
    packId: "r404a",
    trLabel: "R404A Sistem",
    deLabel: "R404A-System",
    sourceSummary: "DRC MAN derin ariza bankasi - R404A gaz hatalari",
    keywords: ["r404a", "r404", "r4040", "low temp", "deep freezer"],
    refrigerantAliases: ["r404a", "r404", "r4040"],
    suggestions: ["R404A sistemde yuksek basinc neden olur", "R404A eksik gaz nasil anlasilir", "R404A sistemde tikanma nasil ayristirilir"],
    contexts: [
      {
        id: "negative_coldroom",
        trLabel: "negatif soguk oda",
        deLabel: "Tiefkuehlraum",
        trNote: "negatif odada cekis suresi, buz deseni ve kompresor sogumasi birlikte okunmalidir",
        deNote: "im Tiefkuehlraum muessen Pull-Down-Zeit, Frostbild und Verdichterkuehlung gemeinsam gelesen werden",
        trRisk: "usta yalniz basinç goruntusune bakarsa buharlastirici tarafini kacirir",
        deRisk: "wer nur auf das Druckbild schaut, uebersieht schnell die Verdampferseite",
        keywords: ["negatif depo", "deep freezer", "freezer room"],
        suggestions: ["negatif odada R404A neden zayif ceker"],
      },
      {
        id: "market_showcase",
        trLabel: "market dolabi",
        deLabel: "Marktkuehlmoebel",
        trNote: "dolap uygulamasinda hava perdesi ve yukleme aliskanligi gaz semptomunu kolayca bozar",
        deNote: "im Kuehlmoebel verfremden Luftschleier und Beladungsgewohnheiten das Kaeltemittelbild schnell",
        trRisk: "kapak ve yukleme hatasi gaz arizasi sanilabilir",
        deRisk: "Beladung und Bedienfehler koennen wie ein Kaeltemittelfehler wirken",
        keywords: ["market dolabi", "showcase"],
        suggestions: ["market dolabinda R404A neden performans kaybeder"],
      },
      {
        id: "rack_system",
        trLabel: "merkezi rack sistem",
        deLabel: "zentrales Rack-System",
        trNote: "rack sistemlerde tek devre hatasi ortak davranisi bozup ustayi yaniltabilir",
        deNote: "in Rack-Systemen kann ein Fehler in einem Kreis das Gesamtbild verfremden",
        trRisk: "tek evaporator verisiyle genelleme yapmak tehlikelidir",
        deRisk: "aus einem Verdampfer sofort auf das ganze System zu schliessen, ist riskant",
        keywords: ["rack", "merkezi sistem"],
        suggestions: ["rack sistemde R404A kacak nasil ayrilir"],
      },
      {
        id: "long_line_freezer",
        trLabel: "uzun hatli dondurucu sistem",
        deLabel: "Tiefkuehlanlage mit langer Leitung",
        trNote: "uzun hatta sarj ve yag donusu hatalari gecikmeli semptom verir",
        deNote: "bei langen Leitungen zeigen sich Fuell- und Oelrueckfuehrungsfehler oft verzoegert",
        trRisk: "atolyede iyi calisan sistem sahada zayif kalabilir",
        deRisk: "eine Anlage kann im Test gut und vor Ort doch schwach laufen",
        keywords: ["uzun hat", "long line"],
        suggestions: ["uzun hatta R404A sarj hatasi nasil bulunur"],
      },
      {
        id: "summer_condenser_load",
        trLabel: "yaz yuksek kondenser yuku",
        deLabel: "hohe Sommerkondensationslast",
        trNote: "R404A sicakta kondenser tarafindaki zayifligi hizli belli eder",
        deNote: "R404A zeigt im Sommer sehr schnell jede Schwachstelle auf der Verfluessigerseite",
        trRisk: "kis verisine guvenmek yaz arizasini gizler",
        deRisk: "Winterdaten koennen Sommerprobleme leicht verdecken",
        keywords: ["yaz", "high ambient"],
        suggestions: ["sicakta R404A neden yuksek basinca cikar"],
      },
    ],
  }),
  createRefrigerantPack({
    packId: "r134a",
    trLabel: "R134a Sistem",
    deLabel: "R134a-System",
    sourceSummary: "DRC MAN derin ariza bankasi - R134a gaz hatalari",
    keywords: ["r134a", "r134", "plus room", "cabinet", "chiller"],
    refrigerantAliases: ["r134a", "r134"],
    suggestions: ["R134a sistemde gaz eksikligi nasil anlasilir", "R134a sistem neden sicakta cekmez", "R134a sistemde yanlis superheat nasil bulunur"],
    contexts: [
      {
        id: "drink_cabinet",
        trLabel: "icecek dolabi",
        deLabel: "Getraenkekuehler",
        trNote: "kucuk hacimli dolaplarda sensor, hava akisi ve gaz semptomu birbirine karisabilir",
        deNote: "in kompakten Getraenkekuehlern vermischen sich Fuehlerbild, Luftstrom und Kaeltemittelsymptome schnell",
        trRisk: "yalniz kabin sicakligiyla karar vermek yaniltir",
        deRisk: "nur aus der Innenraumtemperatur zu urteilen, fuehrt leicht in die Irre",
        keywords: ["icecek dolabi", "drink cabinet"],
        suggestions: ["icecek dolabinda R134a eksik gaz nasil ayristirilir"],
      },
      {
        id: "milk_chiller",
        trLabel: "sutluk veya sut sogutucu",
        deLabel: "Milchkuehler",
        trNote: "R134a sut uygulamasinda yuk degisimi ve hijyen kaynakli serpantin kirlenmesi sik gorulur",
        deNote: "bei Milchkuehlern mit R134a sind Lastwechsel und verschmutzte Waermeuebertrager haeufig",
        trRisk: "kirli serpantin gaz arizasi gibi okunabilir",
        deRisk: "ein verschmutzter Waermeuebertrager kann wie ein Kaeltemittelfehler wirken",
        keywords: ["sut sogutucu", "milk chiller"],
        suggestions: ["sut sogutucuda R134a neden zayif ceker"],
      },
      {
        id: "plus_room",
        trLabel: "arti soguk oda",
        deLabel: "Plus-Kuehlraum",
        trNote: "arti odada kapi trafigi ve evaporator hava tarafi gaz davranisini bozar",
        deNote: "im Plus-Kuehlraum beeinflussen Tuerverkehr und Luftseite des Verdampfers das Kaeltemittelbild stark",
        trRisk: "kapak acikligi gaz eksigiyle karisabilir",
        deRisk: "offene Tuerzeiten koennen wie Unterfuellung wirken",
        keywords: ["arti oda", "plus room"],
        suggestions: ["arti odada R134a dusuk basinc neden yapar"],
      },
      {
        id: "capillary_system",
        trLabel: "kapilerli kucuk sistem",
        deLabel: "kleines Kapillarrohrsystem",
        trNote: "kapilerli R134a sistemlerde gramaj ve tikanma yorumu daha hassastir",
        deNote: "bei kleinen R134a-Kapillarrohrsystemen ist die Bewertung von Fuellung und Engstelle besonders sensibel",
        trRisk: "ustanin sarj ve tikanma farkini kacirma riski yuksektir",
        deRisk: "hier wird Unterfuellung haeufig mit einer Engstelle verwechselt",
        keywords: ["kapiler", "capillary"],
        suggestions: ["kapilerli R134a sistemde tikanma nasil bulunur"],
      },
      {
        id: "long_runtime_display",
        trLabel: "uzun sure calisan vitrin",
        deLabel: "Displaygeraet mit langer Laufzeit",
        trNote: "uzun sureli calisma kucuk performans kayiplarini daha belirgin hale getirir",
        deNote: "lange Laufzeiten machen kleine Leistungsverluste deutlich sichtbarer",
        trRisk: "yavas zayiflama gozden kacarsa enerji tuketimi artar",
        deRisk: "wenn der schleichende Leistungsverlust uebersehen wird, steigt der Energieverbrauch deutlich",
        keywords: ["vitrin", "display"],
        suggestions: ["uzun sure calisan R134a vitrinde performans kaybi neyi anlatir"],
      },
    ],
  }),
  createRefrigerantPack({
    packId: "r290_gas",
    trLabel: "R290 Gaz Sistemi",
    deLabel: "R290-Kaeltekreis",
    sourceSummary: "DRC MAN derin ariza bankasi - R290 gaz hatalari",
    keywords: ["r290", "propan", "hydrocarbon", "gaz hatalari"],
    refrigerantAliases: ["r290", "propan"],
    suggestions: ["R290 HP alarm neden atar", "R290 LP alarm neden olur", "R290 vacuum failure nasil bulunur"],
    contexts: [
      {
        id: "compact_monoblock",
        trLabel: "kompakt monoblok cihaz",
        deLabel: "kompaktes Monoblockgeraet",
        trNote: "kompakt R290 cihazlarda gramaj, hava akisi ve saha montaji birlikte okunmalidir",
        deNote: "bei kompakten R290-Geraeten muessen Fuellmenge, Luftseite und Montage gemeinsam bewertet werden",
        trRisk: "tek veriyle karar verilirse gaz ve hava tarafi karisir",
        deRisk: "bei einer Einzelmessung werden Luft- und Kaeltekreis leicht verwechselt",
        keywords: ["kompakt monoblok", "monoblock"],
        suggestions: ["kompakt R290 cihazda HP alarm neden olur"],
      },
      {
        id: "small_coldroom",
        trLabel: "kucuk soguk oda uygulamasi",
        deLabel: "kleine Kuehlraumanlage",
        trNote: "kucuk odada evaporator hava tarafi ve sarj birbiriyle hizli etkilesir",
        deNote: "in kleinen Kuehlraeumen beeinflussen Verdampferluftseite und Fuellung sich sehr schnell",
        trRisk: "gaz hatasi gibi gorunen tablo aslinda hava eksigi olabilir",
        deRisk: "ein scheinbarer Kaeltemittelfehler kann in Wahrheit ein Luftproblem sein",
        keywords: ["kucuk soguk oda", "small coldroom"],
        suggestions: ["kucuk R290 odada LP alarm nasil yorumlanir"],
      },
      {
        id: "kitchen_install",
        trLabel: "mutfak ici kurulum",
        deLabel: "Kuechenaufstellung",
        trNote: "mutfakta yuksek ortam isi ve yagli hava kondenzasyonu daha sert etkiler",
        deNote: "in Kuechen beeinflussen hohe Umgebungstemperatur und Fettluft die Kondensation deutlich staerker",
        trRisk: "servis sadece gaz tarafina bakarsa asil sebep kacar",
        deRisk: "wer nur den Kaeltekreis prüft, verpasst oft die eigentliche Ursache",
        keywords: ["mutfak", "kitchen"],
        suggestions: ["mutfakta R290 neden yuksek basinca cikar"],
      },
      {
        id: "summer_high_ambient",
        trLabel: "yaz yuksek ambient kosulu",
        deLabel: "hohe Sommerumgebung",
        trNote: "yaz kosulunda R290 gaz hatalari daha belirgin ve hizli gorunur",
        deNote: "unter Sommerbedingungen werden R290-Gasfehler deutlicher und schneller sichtbar",
        trRisk: "kis verisine guvenmek yaz arizasini saklar",
        deRisk: "Winterdaten verdecken leicht das Sommerfehlerbild",
        keywords: ["yaz", "high ambient"],
        suggestions: ["R290 yazin neden HP alarm verir"],
      },
      {
        id: "post_service_unit",
        trLabel: "servis sonrasi cihaz",
        deLabel: "Geraet nach dem Service",
        trNote: "servis sonrasi vakum, kacak ve dogrulama eksigi R290 tarafinda daha kritik okunur",
        deNote: "nach dem Service muessen Vakuum, Dichtheit und Abschlusskontrolle bei R290 besonders kritisch gelesen werden",
        trRisk: "son mudahalenin hatasi eski ariza gibi okunabilir",
        deRisk: "ein Fehler nach dem letzten Eingriff kann wie eine alte Stoerung wirken",
        keywords: ["servis sonrasi", "post service"],
        suggestions: ["R290 vacuum failure servis sonrasi nasil bulunur"],
      },
    ],
  }),
];

function ensurePackShape(pack) {
  if (pack.contexts.length !== 5) {
    throw new Error(`${pack.packId} expected 5 contexts, got ${pack.contexts.length}`);
  }
  if (pack.families.length !== 16) {
    throw new Error(`${pack.packId} expected 16 families, got ${pack.families.length}`);
  }
}

function buildAllEntries() {
  const entries = [];
  deepPacks.forEach((pack) => {
    ensurePackShape(pack);
    pack.contexts.forEach((context) => {
      pack.families.forEach((family) => {
        entries.push(buildEntry(pack, context, family, entries.length));
      });
    });
  });
  return entries;
}

function buildSummary(entries) {
  const byPack = {};
  deepPacks.forEach((pack) => {
    byPack[pack.packId] = entries.filter((entry) => entry.id.startsWith(`deep_${pack.packId}_`)).length;
  });

  return {
    outputFile: OUTPUT_PATH,
    totalPacks: deepPacks.length,
    totalEntries: entries.length,
    totalQuestionCount: entries.reduce((sum, entry) => sum + entry.tr_questions.length + entry.de_questions.length, 0),
    packBreakdown: byPack,
  };
}

function writeMarkdown(entries, summary) {
  const lines = [
    "# DRC MAN Derin Ariza Packleri",
    "",
    `Toplam pack: ${summary.totalPacks}`,
    `Toplam konu karti: ${summary.totalEntries}`,
    `Toplam soru: ${summary.totalQuestionCount}`,
    "",
  ];

  Object.entries(summary.packBreakdown).forEach(([packId, count]) => {
    lines.push(`- ${packId}: ${count} kart`);
  });

  lines.push("", "## Ornekler", "");
  entries.slice(0, 15).forEach((entry, index) => {
    lines.push(`### ${index + 1}. ${entry.tr_subject}`);
    lines.push(`- DE: ${entry.de_subject}`);
    lines.push(`- TR soru: ${entry.tr_questions[0]}`);
    lines.push(`- DE soru: ${entry.de_questions[0]}`);
    lines.push("");
  });

  fs.writeFileSync(MARKDOWN_PATH, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const entries = buildAllEntries();
  const totalQuestionCount = entries.reduce((sum, entry) => sum + entry.tr_questions.length + entry.de_questions.length, 0);
  const expectedEntries = deepPacks.length * 5 * 16;
  const expectedQuestionCount = expectedEntries * (trQuestionTemplates.length + deQuestionTemplates.length);

  if (entries.length !== expectedEntries) {
    throw new Error(`Expected ${expectedEntries} deep-pack entries, got ${entries.length}`);
  }

  if (totalQuestionCount !== expectedQuestionCount) {
    throw new Error(`Expected ${expectedQuestionCount} deep-pack questions, got ${totalQuestionCount}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(entries, null, 2), "utf8");

  const summary = buildSummary(entries);
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf8");
  writeMarkdown(entries, summary);

  console.log(
    JSON.stringify(
      {
        outputFile: OUTPUT_PATH,
        summaryFile: SUMMARY_PATH,
        markdownFile: MARKDOWN_PATH,
        totalEntries: entries.length,
        totalQuestionCount,
      },
      null,
      2
    )
  );
}

main();
