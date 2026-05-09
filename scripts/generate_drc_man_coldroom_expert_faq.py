#!/usr/bin/env python3
"""
DRC MAN — SOĞUK ODA UZMANLIK EĞİTİM BANKASI
Soğuk oda malzemeleri, parçaları, sorunları ve servis prosedürleri.
Her Q&A TR + DE.
"""
import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUTPUT = SCRIPT_DIR / 'drc_man_coldroom_expert_faq.json'

faq = []

# ════════════════════════════════════════════════════════
# A) SOĞUK ODA MALZEMELERİ (Materials)
# ════════════════════════════════════════════════════════
materials_qa = [
    {
        "tags": ["coldroom_expert", "materials", "panel"],
        "tr_question": "Soğuk oda paneli kalınlığı nasıl seçilir?",
        "tr_answer": "Soğuk oda paneli kalınlığı, oda iç sıcaklığına göre seçilir: +4°C/+8°C pozitif odalar için 60-80mm yeterlidir. 0°C/-2°C uygulamaları için 100mm önerilir. -18°C/-25°C donuk odalar için 120-150mm kullanılır. -25°C ve altı şok odalar için 200mm gerekir. Paneller PIR (Poliisosyanürat) veya PUR (Poliüretan) çekirdekli, çift yüzü galvaniz/boyalı sac veya paslanmaz çelik olur. K-değeri 100mm PIR için yaklaşık 0.022 W/mK'dir.",
        "de_question": "Wie wählt man die Stärke eines Kühlraumpaneels?",
        "de_answer": "Die Paneelstärke richtet sich nach der Innentemperatur: +4°C/+8°C Plusräume 60-80mm; 0°C/-2°C Anwendungen 100mm; -18°C/-25°C Tiefkühlräume 120-150mm; Schockfroster unter -25°C 200mm. Paneele haben PIR/PUR-Kern mit beidseitig verzinkt/lackiertem Stahl oder Edelstahl. K-Wert 100mm PIR ca. 0,022 W/mK."
    },
    {
        "tags": ["coldroom_expert", "materials", "panel", "ekleme"],
        "tr_question": "Sandviç panel kilitleri (CAM-LOK) nasıl çalışır?",
        "tr_answer": "Sandviç paneller arası birleşim genellikle CAM-LOK (eksantrik kilit) sistemiyle yapılır. Bir paneldeki dişi yatak ile diğer panelin erkek dişlisi birleştirilir, sonra kam kilit anahtarla 180° döndürülerek sıkıştırılır. Bu hava sızdırmaz ve mekanik olarak sağlam bir bağlantı sağlar. Birleşim noktasına ek olarak NBR conta veya silikon kullanılır. Kilitsiz panellerde ise erkek-dişi geçme + dış sızdırmazlık bandı yöntemi vardır.",
        "de_question": "Wie funktionieren CAM-LOK Verschlüsse bei Sandwichpaneelen?",
        "de_answer": "Die Verbindung zwischen Sandwichpaneelen erfolgt mit CAM-LOK (Exzenterverschluss): Ein Panel hat den weiblichen Sitz, das andere die männliche Nase. Mit einem Schlüssel wird der Nocken um 180° gedreht und damit gespannt. Das ergibt eine luftdichte und mechanisch feste Verbindung. Zusätzlich wird NBR-Dichtung oder Silikon verwendet. Ohne Schlüssel-System: Nut-Feder-Verbindung mit Außenband."
    },
    {
        "tags": ["coldroom_expert", "materials", "kapı"],
        "tr_question": "Soğuk oda kapılarında rezistans (ısıtıcı) ne işe yarar?",
        "tr_answer": "Donuk oda kapılarında (-18°C ve altı) kapı çerçevesinin etrafında kauçuk ısıtıcı rezistans bulunur. İşlevi: kapı ile çerçeve arasındaki contanın donmasını engellemek. Donmuş conta kapıyı yapıştırır ve açılmasını engeller, ayrıca conta yırtılır. Rezistans 220V AC, genellikle 30-50 W/m gücündedir. Kapı switch'i ile (kapı kapalıyken) sürekli devrede tutulur. Pozitif odalarda (>0°C) rezistansa gerek yoktur.",
        "de_question": "Welche Funktion hat die Türrahmenheizung bei Kühlraumtüren?",
        "de_answer": "Bei Tiefkühlraumtüren (-18°C und kälter) ist eine elektrische Heizung um den Türrahmen verlegt. Sie verhindert das Anfrieren der Dichtung am Rahmen. Eingefrorene Dichtung blockiert die Tür und reißt beim Öffnen. Heizleistung 30-50 W/m, 220V AC, mit Tür-Schalter dauerhaft im Betrieb wenn Tür geschlossen. Bei Plus-Räumen (>0°C) nicht nötig."
    },
    {
        "tags": ["coldroom_expert", "materials", "izolasyon"],
        "tr_question": "Bakır boru izolasyonunda hangi malzeme kullanılır?",
        "tr_answer": "Soğutma sistemi bakır borularında kapalı hücreli kauçuk yalıtım (örn. Armaflex, K-Flex, Aeroflex) kullanılır. Tipik kalınlıklar: 9mm, 13mm, 19mm, 25mm. Soğutma uygulamasında: emiş hattı (suction) için 19-25mm önerilir (ısı kazancı önleme), likit hattı için 9-13mm yeterli. Kauçuk izolasyonun avantajı: su buharı geçirmezliği yüksek (μ ≥ 7000), yangın sınıfı B-s3,d0. Genellikle pre-insulated 'twinpack' set olarak satılır (likit + emiş + drenaj kablosu beraber).",
        "de_question": "Welches Material wird zur Kupferrohrisolierung verwendet?",
        "de_answer": "Geschlossenporige Elastomer-Isolierung (Armaflex, K-Flex, Aeroflex). Übliche Stärken: 9, 13, 19, 25mm. Saugleitung 19-25mm (Wärmeaufnahme verhindern), Flüssigleitung 9-13mm. Vorteile: hoher Wasserdampfdiffusionswiderstand (μ ≥ 7000), Brandklasse B-s3,d0. Oft als pre-insulierte Twinpack-Set verkauft (Flüssig + Saug + Drainagekabel zusammen)."
    },
    {
        "tags": ["coldroom_expert", "materials", "perde"],
        "tr_question": "Soğuk oda PVC perdesi neden kullanılır?",
        "tr_answer": "PVC stripler (perde) soğuk oda kapısının önüne asılır. Görevi: kapı açıldığında soğuk hava kaybını ve sıcak nemli havanın girmesini azaltmak. Şeritler %50 örtüşmeli, esnek polar PVC olmalı. Pozitif odalar için saydam standart PVC (~3mm), donuk odalar için Polar PVC (-25°C'ye dayanıklı, ~4mm) kullanılır. Pasta dolapları gibi sürekli açma-kapama olan yerlerde enerji tasarrufu sağlar; tahminen %20-30 enerji kazancı.",
        "de_question": "Warum werden PVC-Streifenvorhänge in Kühlräumen verwendet?",
        "de_answer": "PVC-Streifen werden vor der Kühlraumtür angebracht. Aufgabe: Kälteverlust und Eindringen warmer feuchter Luft beim Türöffnen verringern. 50% Überlappung, flexibles polares PVC. Plus-Räume Standard transparent (~3mm), Tiefkühlräume Polar-PVC bis -25°C (~4mm). Bei häufigem Öffnen ca. 20-30% Energieeinsparung."
    },
    {
        "tags": ["coldroom_expert", "materials", "aksesuar"],
        "tr_question": "Soğuk oda zemin U-profili (PZ aksesuar) ne işe yarar?",
        "tr_answer": "Zemin U-profili soğuk oda paneli ile zemin arasındaki birleşim noktasının ısıl köprüsünü ve nem geçişini engeller. ETS ACSETS/PZ serisi: 50×80×50 (8cm panel için), 50×100×50 (10cm), 50×120×50 (12cm), 50×150×50 (15cm). Plastik enjeksiyon, PVC/PP hammadde. Üst yüzeyde paneli karşılayan oluk + alt yüzeyde zemine yapışacak silikon/conta kanalı. Termal break (ısıl kesik) sağlayarak zemin altından gelen ısı kazancını minimize eder.",
        "de_question": "Wofür dient das Boden-U-Profil (PZ-Zubehör) in Kühlräumen?",
        "de_answer": "Das Boden-U-Profil verhindert Wärmebrücke und Feuchteeintritt zwischen Paneel und Boden. ETS ACSETS/PZ-Serie: 50×80×50 (8cm Paneel), 50×100×50, 50×120×50, 50×150×50. PVC/PP Spritzguss. Obere Nut für Paneel, untere mit Silikon/Dichtung am Boden. Thermische Trennung minimiert Wärmegewinn aus dem Untergrund."
    },
    {
        "tags": ["coldroom_expert", "materials", "köşe"],
        "tr_question": "Soğuk odada dış köşe profili (PD aksesuar) nasıl monte edilir?",
        "tr_answer": "Dış köşe profili (PD = Poly Dış Köşe) iki panelin 90° birleştiği dış köşelere monte edilir. ETS ACSETS/PD serisi: PD080 (50×120 - 8cm panele), PD120 (50×160 - 12cm), PD130 (50×130 - 13cm), PD180 (50×180 - 18cm panele). Montaj sırası: 1) İki panel CAM-LOK ile 90°'de birleştirilir, 2) Köşe hattına silikon çekilir, 3) PD profili köşeye geçirilir, 4) Vidayla sabitlenir. Estetik kapama + mekanik koruma + sızdırmazlık sağlar.",
        "de_question": "Wie wird das Außeneckprofil (PD-Zubehör) in Kühlräumen montiert?",
        "de_answer": "Außeneckprofil (PD = Polyurethan Außenecke) wird an 90°-Außenecken montiert. ETS ACSETS/PD-Serie: PD080 (8cm), PD120 (12cm), PD130 (13cm), PD180 (18cm). Montage: 1) Zwei Paneele mit CAM-LOK verbinden, 2) Silikon auf Eckkante, 3) PD-Profil aufstecken, 4) Verschrauben. Ästhetisch + mechanischer Schutz + Abdichtung."
    },
    {
        "tags": ["coldroom_expert", "materials", "rampa"],
        "tr_question": "Soğuk oda zemininde anti-statik kayma engelleyici neden gereklidir?",
        "tr_answer": "Soğuk oda zemininde nem ve sıcaklık değişimi nedeniyle yoğuşma birikir → kayma riski. Bu yüzden anti-slip (kaymaz) kaplama veya R10/R11 kayma dirençli pano galvaniz/paslanmaz uygulanır. Donuk odalarda zemin sürekli buzlanmaması için: 1) Zemin altında 2cm XPS/PUR yalıtım + ısıtıcı kablo (anti-frost heating) bulunur, 2) +5°C civarında zemin sıcaklığı korunur, 3) Forklift trafiği için yük dayanımı min 500-1000 kg/m². Zemin paneli kullanıldığında PD profili ile zemin arasında ısı köprüsü kesilir.",
        "de_question": "Warum ist rutschhemmender Boden im Kühlraum erforderlich?",
        "de_answer": "Durch Kondenswasser und Temperaturschwankungen entsteht Rutschgefahr. Anti-Slip-Belag oder R10/R11 rutschfeste Paneele werden eingesetzt. Bei TK-Räumen: 1) Boden-XPS/PUR-Isolierung + Heizband (Frostschutz), 2) Bodentemperatur ~+5°C, 3) Belastung min 500-1000 kg/m² für Stapler. Mit PD-Profil thermische Trennung."
    },
]
faq.extend(materials_qa)

# ════════════════════════════════════════════════════════
# B) PARÇALAR (Kompresör, Evaporatör, Kondenser, Vana, Kontrol)
# ════════════════════════════════════════════════════════
parts_qa = [
    {
        "tags": ["coldroom_expert", "parts", "kompresor", "tip"],
        "tr_question": "Hermetik, yarı-hermetik ve scroll kompresör arasındaki fark nedir?",
        "tr_answer": "Hermetik kompresör: kompresör + motor tek kapalı kabuğun içinde, kaynaklı; tamiri imkansız, değiştirilir. Düşük güç (1/4 - 5 HP), tüketici ve hafif ticari. Embraco, Tecumseh, Cubigel klasik örnekler. Yarı-hermetik: motor ve kompresör aynı muhafazada ama vidalı, sökülüp tamir edilebilir. Orta-büyük güç (3-100 HP), sanayi tipi. Bitzer, Frascold, Dorin, Refcomp tipiktir. Scroll: iki spiral parça birbirine geçerek gaz sıkıştırır, çok az hareketli parça → düşük titreşim ve gürültü, %15 daha verimli. Copeland (Emerson) ZB/ZH/ZP serisi öncüdür. Yağ taşıma sorunsuzdur. R410A klimalarda ve modern ticari soğutmada baskındır.",
        "de_question": "Was ist der Unterschied zwischen hermetisch, halbhermetisch und Scroll-Verdichter?",
        "de_answer": "Hermetisch: Verdichter + Motor in geschlossenem Gehäuse, geschweißt; nicht reparierbar, austauschbar. Niedrige Leistung (1/4 - 5 HP), Konsumenten/leichte Industrie. Embraco, Tecumseh, Cubigel typisch. Halbhermetisch: Motor und Verdichter in einem Gehäuse aber verschraubt, zerlegbar/reparierbar. Mittlere bis große Leistung (3-100 HP), Industrie. Bitzer, Frascold, Dorin, Refcomp typisch. Scroll: zwei Spiralen, wenige bewegliche Teile, niedrige Vibration und 15% effizienter. Copeland (Emerson) ZB/ZH/ZP führend. Bei R410A-Klimas und modernen Kühlanlagen vorherrschend."
    },
    {
        "tags": ["coldroom_expert", "parts", "evaporator", "tip"],
        "tr_question": "Tavan tipi vs duvar tipi evaporatör hangi durumda seçilir?",
        "tr_answer": "Tavan tipi (cube/double-flow): odanın merkezine tavandan asılır, hava akışı 360° veya çift yönlü. Yüksek tavanlı (>2.5m) büyük odalar için ideal. Hava döngüsü her köşeye ulaşır. GVN, Buzyapsan, Frigocraft tavan tipi yapar. Duvar tipi (single-flow): bir duvara asılır, tek yönlü hava üfler. Düşük tavanlı (<2.5m) veya küçük odalar için. Kapı karşısı duvara yerleştirilirse kapı açıldığında ölü hava bölgesi azalır. Buzyapsan BYS-SH (BOX) ve TEA serileri klasik duvar tipidir. Genel kural: 1m³ oda hacmi için ~50W kapasite, donuk için 80W.",
        "de_question": "Wann wählt man Decken- vs. Wandverdampfer?",
        "de_answer": "Deckenverdampfer (Cube/Doppelflow): in Raummitte hängend, 360° oder zweiseitiger Luftstrom. Für hohe Decken (>2.5m) und große Räume ideal. Luftumwälzung erreicht jede Ecke. GVN, Buzyapsan, Frigocraft. Wandverdampfer (Single-Flow): an Wand, einseitiger Luftstrom. Für niedrige Decken (<2.5m) oder kleine Räume. Gegenüber Tür montiert reduziert Totluftzonen. Buzyapsan BYS-SH (BOX) und TEA-Serie. Faustregel: 1m³ Raum ~50W Kapazität, TK-Raum 80W."
    },
    {
        "tags": ["coldroom_expert", "parts", "kondenser", "kapasite"],
        "tr_question": "Kondenser kapasitesi neye göre seçilir?",
        "tr_answer": "Kondenser kapasitesi = Soğutma kapasitesi (Q_evap) + Kompresör motoru gücü (P_motor). Tipik oran: Q_kondenser ≈ 1.2-1.4 × Q_evap. Örneğin 5 kW soğutma için 6-7 kW kondenser gerekir. Hava soğutmalı kondenserde dış sıcaklık (Tamb) önemli: yazın 35°C ortam için TC=50°C tasarlanır (15K Δ). Yüzey alanı m² ile ölçülür: Buzyapsan BYS SH60 BOX 64.17m² → 23.78 kW kapasite. Fan adedi ve devri (RPM) hava debisini belirler. R404A için 0.7-1.0 K/m² ısı transfer katsayısı.",
        "de_question": "Wie wird die Kondensatorkapazität ausgelegt?",
        "de_answer": "Kondensatorkapazität = Kühlleistung (Q_evap) + Verdichtermotorleistung (P_motor). Typisch: Q_cond ≈ 1.2-1.4 × Q_evap. Beispiel: 5 kW Kühlung → 6-7 kW Kondensator. Luftgekühlte Kondensatoren: Außentemperatur (Tamb) wichtig; bei 35°C Sommer wird TC=50°C ausgelegt (ΔT 15K). Fläche in m²: Buzyapsan BYS SH60 BOX 64.17m² → 23.78 kW. Lüfteranzahl und Drehzahl bestimmen Luftvolumen. R404A: 0.7-1.0 K/m² Wärmeübergang."
    },
    {
        "tags": ["coldroom_expert", "parts", "expansion_valve"],
        "tr_question": "Termostatik genleşme valfi (TXV) ile kapiler boru arasındaki fark nedir?",
        "tr_answer": "Termostatik genleşme valfi (TXV): değişken yük altında otomatik orifis ayarlayan, prob ile evaporatör çıkış sıcaklığını okuyup superheat'i sabit tutan valftir (Danfoss TE2/TE5, Sporlan SH/SF). Avantaj: değişen yüke uyum, en verimli kullanım. Maliyet: 50-200 €. Kapiler boru: sabit çap ve uzunluktaki ince bakır boru, basınç düşürmek için sabit kısıtlama. Avantaj: ucuz (1-2€), arızalanmaz. Dezavantaj: değişken yüke uyumsuz, sadece sabit çalışma noktası. Buzdolabı, su sebili, küçük soğutucu için kapiler; ticari/endüstriyel soğutma için TXV.",
        "de_question": "Was ist der Unterschied zwischen TXV und Kapillarrohr?",
        "de_answer": "Thermostatisches Expansionsventil (TXV): variabler Querschnitt, regelt Überhitzung mit Fühler am Verdampferausgang konstant (Danfoss TE2/TE5, Sporlan SH/SF). Vorteil: passt sich Lastwechsel an, höchste Effizienz. Kosten 50-200 €. Kapillarrohr: feste Länge und Durchmesser des dünnen Kupferrohres, konstante Drosselung. Vorteil: billig (1-2€), nicht defekt. Nachteil: keine Anpassung an Lastwechsel, nur ein Betriebspunkt. Kühlschrank/kleine Geräte → Kapillar; gewerblich/industriell → TXV."
    },
    {
        "tags": ["coldroom_expert", "parts", "solenoid"],
        "tr_question": "Solenoid valf neden kullanılır ve nereye monte edilir?",
        "tr_answer": "Solenoid valf elektromanyetik kapama valfi. Görevi: kompresör durduğunda likit hattı kapatıp sıvı kaçağını engellemek (pump-down devresi). Tipik bağlantı: kondenser çıkışından sonra likit hattına, evaporatöre TXV'den ÖNCE. Bobinli (220V AC veya 24V DC). Sanhua DHF, Castel 1064, Danfoss EVR serileri. Açıkken (NO) veya kapalıyken (NC) tipte olabilir. Kapasite: 1/4'' - 1-3/8'' arası. Pump-down: termostat tetiklendiğinde önce solenoid kapanır, kompresör low-pressure switch ile durduğunda evaporatör boşalmış olur. Bu likit batık başlangıç (slug-back) önler.",
        "de_question": "Wofür wird ein Magnetventil verwendet und wo eingebaut?",
        "de_answer": "Magnetventil = elektromagnetisches Absperrventil. Aufgabe: bei Verdichterstillstand Flüssigleitung schließen, Flüssigkeitsmigration verhindern (Pump-Down). Einbau: nach Kondensator in der Flüssigleitung, VOR dem TXV. Spule (220V AC oder 24V DC). Sanhua DHF, Castel 1064, Danfoss EVR. NO oder NC. Kapazität 1/4'' - 1-3/8''. Pump-Down: Thermostat schließt Magnetventil; Verdichter läuft bis Niederdruck-Pressostat abschaltet. Verhindert Flüssigkeitsschläge beim Start."
    },
    {
        "tags": ["coldroom_expert", "parts", "filter_drier"],
        "tr_question": "Likit hat filtre-kurutucusu (drier) neden gereklidir?",
        "tr_answer": "Filtre-kurutucu sistemde nem ve katı parçacıkları tutar. Nem TXV'yi tıkar (don oluşturur), asit oluşturur (yağı bozar), bakırla reaksiyon verir. Likit hattına monte edilir (kondenser çıkışı ile TXV arası). İçinde moleküler elek (3Å/4Å zeolit) + asit absorber + parçacık filtresi vardır. Boyut: 1/4'' (15g) - 1-3/8'' (300g+) arası. Yön ok ile gösterilir (likit akış yönü). 5 yılda bir veya gaz değişikliği sırasında değiştirilir. Sight glass (gözetleme camı) ile birlikte kullanılır: yeşil renk = nem normal, sarı = nem var (drier değişmeli).",
        "de_question": "Warum ist ein Filtertrockner in der Flüssigleitung erforderlich?",
        "de_answer": "Filtertrockner hält Feuchtigkeit und Partikel zurück. Feuchtigkeit verstopft TXV (Eisbildung), bildet Säure (zerstört Öl), reagiert mit Kupfer. Einbau in Flüssigleitung (Kondensator → TXV). Innen: Molekularsieb (3Å/4Å Zeolith) + Säureabsorber + Partikelfilter. Größen: 1/4'' (15g) bis 1-3/8'' (300g+). Pfeil zeigt Strömungsrichtung. Wechsel alle 5 Jahre oder bei Kältemittelwechsel. Mit Schauglas: grün = Feuchte ok, gelb = Wechsel erforderlich."
    },
    {
        "tags": ["coldroom_expert", "parts", "kontrol"],
        "tr_question": "Dijital soğuk oda kontrol cihazı (Dixell, Carel, DCB) ne işler yapar?",
        "tr_answer": "Dijital kontrolör (Dixell XR60CX, Carel ir33, DRC DCB100/DCB31) soğuk oda otomasyonunun beynidir. İşlevleri: 1) Termostat — set noktası ile oda sıcaklığını karşılaştırıp kompresörü açar/kapatır, 2) Defrost yönetimi — zaman/sıcaklık tabanlı, elektrikli/sıcak gaz/hava, 3) Fan kontrolü — defrost sırasında fan durdurma, drip-off bekleme, 4) Alarm — yüksek/düşük sıcaklık, prob arızası, kapı açık alarmı, 5) Modbus/RS485 ile uzaktan izleme. Tipik prob bağlantısı: oda probu (oda sıcaklığı), evaporatör probu (defrost sonu), kondenser probu (basınç güvenliği). Set: -25°C için differential 2K, defrost günde 4 kez, drain time 2 dak.",
        "de_question": "Welche Funktionen hat ein digitaler Kühlraumregler (Dixell, Carel, DCB)?",
        "de_answer": "Digitaler Regler (Dixell XR60CX, Carel ir33, DRC DCB100/DCB31) ist die Steuerzentrale: 1) Thermostat — vergleicht Soll mit Raumtemperatur, schaltet Verdichter, 2) Abtaumanagement — zeitlich/temperaturbasiert, elektrisch/Heißgas/Luft, 3) Lüftersteuerung — Stop bei Abtauung, Drip-Off-Wartezeit, 4) Alarme — Übertemperatur, Fühlerfehler, Türalarm, 5) Modbus/RS485 zur Fernüberwachung. Fühler: Raum, Verdampfer (Abtauende), Kondensator. Beispiel-Setup: -25°C, Schaltdiff 2K, 4× Abtauung/Tag, 2 min Abtropfzeit."
    },
    {
        "tags": ["coldroom_expert", "parts", "presostat"],
        "tr_question": "Yüksek/Alçak basınç şalteri (KP/MP serisi) ne için kullanılır?",
        "tr_answer": "Basınç şalteri (Danfoss KP1/KP5/KP15/MP54, Sporlan PD/PR) sistemi aşırı basınçtan korur. Yüksek basınç şalteri (HP) — kondenser tıkanması, fan arızası → kompresör koruma. Açma: ~28-32 bar (R404A için), reset 22 bar manuel. Alçak basınç şalteri (LP) — likit hattı tıkanması, gaz kaçağı → kompresör donma koruması. Açma: ~1 bar (vakum), reset 2 bar otomatik. MP54 yağ basınç şalteri yarı-hermetik kompresörlerde yağlama eksikliği koruması için (delta P): pompa basıncı - karter basıncı min 0.7 bar olmalı, 60-90 saniye içinde sağlanmazsa durdurur.",
        "de_question": "Wofür dient ein Hoch-/Niederdruckschalter (KP/MP-Serie)?",
        "de_answer": "Druckschalter (Danfoss KP1/KP5/KP15/MP54, Sporlan PD/PR) schützen vor Überdruck. Hochdruckschalter (HP) — Kondensatorverstopfung, Lüfterfehler → Verdichterschutz. Aus bei ~28-32 bar (R404A), manueller Reset 22 bar. Niederdruckschalter (LP) — Flüssigleitungsverstopfung, Leckage → Frostschutz. Aus bei ~1 bar (Vakuum), Reset 2 bar automatisch. MP54 Öldruckschalter für halbhermetische Verdichter: Pumpendruck - Kurbelgehäusedruck min 0,7 bar; bei nicht-Erreichen in 60-90 Sek Notabschaltung."
    },
    {
        "tags": ["coldroom_expert", "parts", "sight_glass"],
        "tr_question": "Sight glass (gözetleme camı) ne gösterir?",
        "tr_answer": "Sight glass likit hattına lehimli/vidalı monte edilen cam pencere. İki bilgi verir: 1) GAZ MİKTARI — flash gaz (köpük/kabarcık) görüyorsan sistem gaz eksikliği veya alt soğutma yetersiz. Likit dolu ise tertemiz görünür. 2) NEM SEVİYESİ — içinde renk değiştiren nem indikatörü vardır: yeşil = kuru (normal), sarı = nem var (drier değiştir). Hata durumunda: kabarcık varsa gaz şarj et, sarı renk varsa filtre-drier yenile. Sanhua SYJ06H11 (1/4'' kaynaklı) tipik bir model. Likit hat üzerinde, drier'dan SONRA, TXV'den ÖNCE bağlanır.",
        "de_question": "Was zeigt ein Schauglas in der Flüssigleitung?",
        "de_answer": "Schauglas, an der Flüssigleitung gelötet/verschraubt, zeigt zwei Dinge: 1) KÄLTEMITTELMENGE — Schaum/Blasen = Untermenge oder fehlende Unterkühlung. Klar gefüllt = ok. 2) FEUCHTIGKEIT — Farbindikator: grün = trocken, gelb = Feuchte (Trockner wechseln). Fehlerbehebung: Blasen → Kältemittel nachfüllen; gelb → Filtertrockner ersetzen. Sanhua SYJ06H11 (1/4'' geschweißt) typisch. Position: nach Trockner, vor TXV."
    },
    {
        "tags": ["coldroom_expert", "parts", "drenaj"],
        "tr_question": "Soğuk oda evaporatörünün drenaj hattı nasıl döşenmeli?",
        "tr_answer": "Evaporatörün drenaj tepsisinde toplanan defrost suyu kapaklı tahliye borusuna gider, oradan dışa drene edilir. KRİTİK kurallar: 1) Drenaj borusu min 1/2'' iç çap, 2) Eğim ≥ %1 (1m'de 1cm aşağı), 3) Soğuk oda dışına çıkana kadar ISITMALI rezistans (donmaya karşı), 4) Sifon (P-trap) HER İKİ SİSTEMDE — koku ve hava sızıntısı önler, 5) Yatay run en fazla 5m, sonra ek sifon, 6) Bina kanalına bağlanırken hava boşluğu (air gap) bırak. Kondens pompası (Siccom Eco Line, Sfa Sanicondens) kanalın yukarıda olduğu durumlarda kullanılır.",
        "de_question": "Wie muss der Verdampfer-Kondensatablauf verlegt werden?",
        "de_answer": "Abtauwasser sammelt sich in der Tropfschale, läuft über das Ablaufrohr nach außen. KRITISCHE Regeln: 1) Mindest 1/2'' Innendurchmesser, 2) Gefälle ≥ 1% (1cm/m), 3) Beheiztes Heizband bis Ausgang Kühlraum (Frostschutz), 4) Siphon (P-Trap) auf BEIDEN Seiten — verhindert Geruch/Luftleck, 5) Horizontale Führung max 5m, dann zusätzlicher Siphon, 6) Anschluss ans Hausabflusssystem mit Luftspalt. Kondensatpumpe (Siccom Eco Line, Sfa Sanicondens) wenn Abfluss höher liegt."
    },
]
faq.extend(parts_qa)

# ════════════════════════════════════════════════════════
# C) SOĞUK ODA SORUNLARI (Troubleshooting)
# ════════════════════════════════════════════════════════
problems_qa = [
    {
        "tags": ["coldroom_expert", "trouble", "sicaklik"],
        "tr_question": "Soğuk oda sıcaklığa düşmüyor — neden?",
        "tr_answer": "Sebep listesi sıralı tanı: 1) GAZ EKSİKLİĞİ — sight glass'ta kabarcık, alçak basınç düşük. Çözüm: kaçak ara (kabuk testi, leak detector), şarj et. 2) KONDENSER KİRLİ — basınç yüksek, fan çalışıyor ama hava akışı zayıf. Çözüm: kondenser temizle, fan döndüğünden emin ol. 3) DEFROST TIKANIK — evaporatörde buz birikmiş, hava akışı durmuş. Çözüm: defrost saatini artır, drenaj sifonunu kontrol et. 4) TXV TIKANIK — sıcaklık düşmüyor, alçak basınç çok düşük. Çözüm: drier değiştir, TXV'yi söküp temizle. 5) KOMPRESÖR ZAYIF — basınç farkı yok, akım düşük. Çözüm: kompresör değiştir. 6) KAPI HEP AÇIK — switch arızası, kapı düzgün kapanmıyor. Çözüm: door switch ve conta kontrol. 7) YÜK ÇOK FAZLA — oda kapasitenin üstünde dolduruldu.",
        "de_question": "Kühlraum erreicht Solltemperatur nicht — Warum?",
        "de_answer": "Diagnose-Reihenfolge: 1) KÄLTEMITTELMANGEL — Blasen im Schauglas, Niederdruck zu niedrig. Lösung: Lecksuche, nachfüllen. 2) KONDENSATOR VERSCHMUTZT — Hochdruck hoch, Lüfter läuft aber Luftstrom schwach. Reinigen. 3) ABTAU-VERSAGEN — Eis am Verdampfer, Luftstrom blockiert. Abtauintervall erhöhen, Siphon prüfen. 4) TXV VERSTOPFT — sehr niedriger Niederdruck. Trockner wechseln, TXV reinigen. 5) VERDICHTER SCHWACH — keine Druckdifferenz, niedriger Strom. Wechseln. 6) TÜR DAUEROFFEN — Schalter defekt, schlechte Dichtung. 7) ÜBERLAST — Raum überfüllt."
    },
    {
        "tags": ["coldroom_expert", "trouble", "buzlanma"],
        "tr_question": "Evaporatörde aşırı buz birikiyor — sebepleri ve çözümü?",
        "tr_answer": "Aşırı buzlanma şu sebeplerden olur: 1) DEFROST YETERSİZ — günde 4-6 kez, her 4-6 saatte bir, defrost süresi 20-30 dakika olmalı. Set'i kontrol et. 2) DRENAJ TIKANIK — defrost suyu boşalmıyor, evaporatör altında biriken su tekrar donuyor. Drenaj borusu, sifon ve ısıtıcı kablo kontrol. 3) FAN DÖNMÜYOR — sürekli soğuk hava bir noktada birikiyor → bağıl nem yükseliyor → buz. Fan motoru/kondansatör kontrol. 4) AŞIRI ŞARJ — gaz fazla, evaporatör tabakası düşük, sıvı taşıyor. Şarj boşalt + ölç. 5) KAPI SIK AÇILIYOR — sıcak nemli hava içeri giriyor → buz. PVC perde tak. 6) DEFROST PROBU ARIZALI — hiç bitmediği için sürekli defrost. Probu değiştir. Acil çözüm: manuel defrost başlat, oda boşalt, sebebi giderdikten sonra çalıştır.",
        "de_question": "Übermäßige Vereisung am Verdampfer — Ursachen und Lösung?",
        "de_answer": "Ursachen: 1) UNZUREICHENDE ABTAUUNG — 4-6×/Tag, alle 4-6h, je 20-30 min. Setup prüfen. 2) ABLAUF VERSTOPFT — Wasser bleibt, gefriert wieder. Abflussrohr/Siphon/Heizband prüfen. 3) LÜFTER AUSGEFALLEN — Luftstau, hohe rel. Luftfeuchte → Eis. Motor/Kondensator prüfen. 4) ÜBERFÜLLUNG — zu viel Kältemittel, Sauganteil hoch. Entleeren + nachladen. 5) TÜR ZU OFT GEÖFFNET — feuchte Luft → Eis. PVC-Vorhang. 6) ABTAUFÜHLER DEFEKT — Abtauung endet nie. Fühler tauschen. Sofortmaßnahme: manuelle Abtauung, Raum leeren, Ursache beheben."
    },
    {
        "tags": ["coldroom_expert", "trouble", "gaz_kacagi"],
        "tr_question": "Gaz kaçağı nasıl tespit edilir?",
        "tr_answer": "Gaz kaçak tespit yöntemleri: 1) ELEKTRONIK LEAK DETECTOR — refrigerant gaz kaçağına duyarlı (10g/yıl hassasiyet). Inficon, Cps, Bacharach markaları. Şüpheli noktalar: kaynak yerleri, valf bağlantıları, sight glass, drier, expansion valf, evaporatör/kondenser fitting'leri. 2) UV BOYA — sisteme UV-aktif boya (Errecom, Wipcool) eklenir, çalıştırılır, sonra UV ışıkla noktalar aranır. Sızıntı parlak yeşil parlar. 3) KÖPÜK SPREY — Refco, Bacharach Zip-Bag spray, basınçlı sistemden çıkan gaz köpürür. Hızlı ve görsel. 4) BASINÇ TESTİ — sistem N2 ile 25-30 bar basınçlandırılır, manometre 24 saat izlenir, basınç düşerse kaçak var. En kritik noktalar: 1) flare bağlantılar, 2) Schroeder valfler, 3) kompresör bağlantı flanşları, 4) eski lehim noktaları.",
        "de_question": "Wie wird ein Kältemittelleck gefunden?",
        "de_answer": "Methoden: 1) ELEKTRONISCHER LECKSUCHER — empfindlich auf Kältemittel (10g/Jahr). Inficon, Cps, Bacharach. Verdächtige Stellen: Lötstellen, Ventilanschlüsse, Schauglas, Trockner, Expansionsventil, Verdampfer-/Kondensatorfittings. 2) UV-FARBSTOFF — UV-aktiv (Errecom, Wipcool) im System, mit UV-Lampe Lecks lokalisieren. Leckstelle leuchtet hellgrün. 3) SCHAUMSPRAY — Refco, Bacharach Zip-Bag; Gas aus Druckseite schäumt. Schnell visuell. 4) DRUCKTEST — System mit N2 auf 25-30 bar, Manometer 24h. Kritisch: Flare-Verbindungen, Schroeder-Ventile, Verdichterflansche, alte Lötstellen."
    },
    {
        "tags": ["coldroom_expert", "trouble", "yuksek_basinc"],
        "tr_question": "Yüksek basınç alarm veriyor — neden?",
        "tr_answer": "Yüksek basınç (HP) alarm sebepleri: 1) KONDENSER FAN ÇALIŞMIYOR — fan kondansatörü/motoru arızalı, basınç şalteri açık. Fan ölç + değiştir. 2) KONDENSER TIKANIK — toz, yağ, yaprak. Yıkama önerisi: alkali deterjan + basınçlı su. 3) ORTAM SICAKLIĞI YÜKSEK — yaz aylarında 40°C+ ortamda fan kapasitesi yetmiyor. Daha büyük kondenser veya gölge sağla. 4) AŞIRI ŞARJ — gaz fazla, kondenser doluyor. Boşalt-tartılarak kontrol et. 5) NON-CONDENSABLES (Hava karışmış) — sistem kötü vakumlanmış. Vakumla 500 mikron, gaz değiştir. 6) SOLENOID VALF KAPALI KALMIŞ — likit dönmüyor, kondenser dolu. Valfi kontrol et. R404A için 28 bar üstüne çıkıyorsa HP alarm normal.",
        "de_question": "Hochdruck-Alarm — Ursachen?",
        "de_answer": "Hochdruck-Ursachen: 1) KONDENSATORLÜFTER STILL — Motor/Kondensator defekt. Tauschen. 2) KONDENSATOR VERSCHMUTZT — Staub, Öl, Laub. Reinigung mit Alkalireiniger + Druckwasser. 3) HOHE UMGEBUNGSTEMP — Sommer 40°C+, Lüfterleistung reicht nicht. Größeren Kondensator oder Schatten. 4) ÜBERFÜLLUNG — Kältemittel zu viel. Auswiegen. 5) NICHT-KONDENSIERBARE GASE (Luft im System) — schlechte Vakuumierung. Vakuum 500 µm, neu füllen. 6) MAGNETVENTIL ZU — Flüssigkeit staut sich. Ventil prüfen. R404A: HP-Alarm bei >28 bar normal."
    },
    {
        "tags": ["coldroom_expert", "trouble", "kompresor_arızası"],
        "tr_question": "Kompresör çalışmıyor — adım adım kontrol nedir?",
        "tr_answer": "Kompresör çalışmıyor diagnostik: 1) ELEKTRİK ÖLÇ — sigorta atmış mı, kontaktör açıyor mu, motor terminal voltajı (220V/380V), kontrol panosu power LED. 2) THERMOSTAT — set noktası doğru mu, ortam sıcaklığı set'in altında ise normal kapalıdır. 3) KONTAKTÖR — kontak yapışmış/yanmış olabilir, multimetre ile kontrol. 4) BASINÇ ŞALTERİ — HP/LP açmış olabilir (manuel reset olmayan). Manometre ile basınç oku. 5) MOTOR KORUMA (KLİXON/IKO) — termik koruma açmış. Kompresör soğusun (30 dak), tekrar dene. 6) KAPASİTÖR — start/run kondansatör arızalı (özellikle hermetik). Mikrofarad ölç. 7) SARGI ARIZASI — motor sargısı yanmış, içi kararmış, asit kokusu. Megger ile direnç ölç (R-S, R-C, S-C). 8) MEKANİK KİLİTLİ — kompresör donmuş veya yağsız çalışmış. Ses dinle, motor ısınması var mı.",
        "de_question": "Verdichter läuft nicht — Schritt-für-Schritt-Diagnose?",
        "de_answer": "1) ELEKTRIK — Sicherung, Schütz schaltet, Motorklemme Spannung (220V/380V), Schaltschrank Power-LED. 2) THERMOSTAT — Sollwert ok, Raum unter Soll = normal aus. 3) SCHÜTZ — Kontakt verschmolzen/verbrannt, Multimeter prüfen. 4) DRUCKSCHALTER — HP/LP ausgelöst (ohne autom. Reset). Manometer ablesen. 5) MOTORSCHUTZ (KLIXON/IKO) — Thermo ausgelöst. 30 min abkühlen, neu starten. 6) KONDENSATOR — Start-/Run-Cap defekt (hermetisch). µF messen. 7) WICKLUNGSSCHADEN — schwarz, Säuregeruch. Megger R-S, R-C, S-C. 8) MECHANISCH FEST — eingefroren oder ölfrei gelaufen. Geräusch + Motorerwärmung."
    },
    {
        "tags": ["coldroom_expert", "trouble", "kapı"],
        "tr_question": "Soğuk oda kapısı düzgün kapanmıyor — sebepler?",
        "tr_answer": "Kapı kapanma sorunları: 1) MENTEŞELER YAYLI/AŞINMIŞ — yer çekimi ile düşüyor. Yağla veya değiştir. 2) CONTA YIRTIK — magnet conta deforme olmuş, kenarda boşluk. Conta yenile. 3) DON BLOĞU — donuk odada conta donmuş, açılırken yırtılmış. Rezistans (kapı çerçeve ısıtıcısı) çalışmıyor. 4) KAPI EĞRİ — montaj problemi, çerçeve eğri. Şim/seviye ayarı. 5) KAPI KOLU AYARI — sürgülü/kilitli kolu sıkılmamış. Ayar vidalarını sık. 6) HİDROLİK YAY ARIZASI — kapı kapatıcı (door closer) yıpranmış. Yenile. 7) AŞIRI ZORLAMA — yük ile kapı çarpılmış. Çerçeveyi düzelt. Test: kapıyı kapatıp 1€/A4 kağıdı conta arasına koy, çek; kolayca çıkıyorsa conta sızdırıyor.",
        "de_question": "Kühlraumtür schließt nicht richtig — Ursachen?",
        "de_answer": "1) SCHARNIERE ABGENUTZT — Tür hängt durch. Schmieren oder ersetzen. 2) DICHTUNG GERISSEN — Magnetdichtung deformiert, Spalt am Rand. Tauschen. 3) EISBLOCK — TK-Raum Dichtung gefroren, beim Öffnen gerissen. Türrahmenheizung defekt. 4) TÜR SCHIEF — Montagefehler, Rahmen schief. Justieren. 5) GRIFFEINSTELLUNG — Schiebe-/Hebelgriff lose. Schrauben ziehen. 6) HYDRAULISCHER TÜRSCHLIESSER — verschlissen. Wechseln. 7) BESCHÄDIGUNG — Tür durch Last verbogen. Test: Tür zu, 1€-Münze/A4 zwischen Dichtung; einfaches Herausziehen = Leck."
    },
    {
        "tags": ["coldroom_expert", "trouble", "yag"],
        "tr_question": "Kompresör yağı kontaminasyonu — belirti, sebep, çözüm?",
        "tr_answer": "Yağ kontaminasyonu BELİRTİLERİ: yağ siyahlaşmış, asit kokusu, yağ basıncı düşük, kompresör sıcak çalışıyor. SEBEP: 1) Sistem nem aldı (drier eskimiş, vakum yapılmamış), 2) Aşırı sıcaklık nedeniyle yağ kavruldu (kompresör overheating), 3) Yanlış yağ kullanıldı (R404A → POE 32, R134a → POE 32, R22 → mineral, R290 → POE 22), 4) Asit oluştu (kompresör yanması sonrası). ÇÖZÜM: 1) Kompresör burnout cleanup — sistem N2 ile basınçlı temizleme, 2) Asit test (Errecom RK1349 kit) — pozitif ise burnout drier (Sporlan EHA series) montajı, 3) Yağ tam değişim, 4) Vakumla 500 mikrona, 5) Yeni şarj. Burnout sonrası 2 hafta içinde yağ tekrar kontrol edilmeli (drier 24-48 saat sonra değiştirilir).",
        "de_question": "Verdichteröl-Kontamination — Symptome, Ursache, Lösung?",
        "de_answer": "SYMPTOME: Öl schwarz, Säuregeruch, niedriger Öldruck, heißer Verdichterlauf. URSACHE: 1) Feuchte (alter Trockner, schlechtes Vakuum), 2) Überhitzung (Öl verbrannt), 3) Falsches Öl (R404A→POE 32, R134a→POE 32, R22→mineralisch, R290→POE 22), 4) Säure nach Burnout. LÖSUNG: 1) System mit N2 spülen, 2) Säuretest (Errecom RK1349) — positiv: Burnout-Trockner (Sporlan EHA), 3) Öl komplett wechseln, 4) Vakuum 500 µm, 5) Neu füllen. Nach 2 Wochen erneut prüfen, Trockner nach 24-48h tauschen."
    },
    {
        "tags": ["coldroom_expert", "trouble", "ses"],
        "tr_question": "Kompresörden anormal ses geliyor — tanı?",
        "tr_answer": "Anormal ses türleri: 1) METALİK 'TIK-TAK' — likit batık (slug-back), kompresör sıvı sıkıştırıyor. Sebep: TXV bozuk, aşırı şarj, defrost sonrası refrigerant evaporatöre dolmuş. ÇÖZÜM: durdur, beklet, çalıştır + suction line accumulator ekle. 2) UĞULTU/DRİL SESİ — çekirdekte yağ eksik veya yataklar aşınmış. Yağ seviyesi gözetleme camından kontrol, eklemeli/değişmeli. 3) GICIRTILA — kayış/kasnak (yarı-hermetik motorda) hizasız. Kasnak hizasını ayarla. 4) PATIRTI — gevşek montaj cıvatası, lastik takoz yıpranmış. Sıkma + takoz değişimi. 5) PERİYODİK 'PAT PAT' — boşaltma/emiş valfı bozuk (yarı-hermetik). Valf plakası onarımı. 6) RÖLE 'TIK' — kontaktör hızlı açıp kapatıyor (short cycling), termostat differential düşük. Differential 2-3K artır.",
        "de_question": "Verdichter macht abnormale Geräusche — Diagnose?",
        "de_answer": "1) METALLISCHES 'TIK-TAK' — Flüssigkeitsschlag, Verdichter komprimiert Flüssigkeit. Ursache: TXV defekt, Überfüllung, nach Abtauung Kältemittel im Verdampfer. LÖSUNG: stoppen, warten, neu starten + Sauggassammler. 2) BRUMMEN/BOHREN — Öl im Kern fehlt, Lager verschlissen. Ölstand prüfen, ersetzen. 3) QUIETSCHEN — Riemen/Riemenscheibe fluchtet nicht. 4) RUMPELN — Befestigungsschrauben lose, Gummipuffer alt. 5) PERIODISCHES 'TAK-TAK' — Saug-/Druckventil defekt. Ventilplatte. 6) RELAIS 'TIK' — Schütz schaltet schnell (Short Cycling), Schaltdiff zu klein. 2-3K erhöhen."
    },
]
faq.extend(problems_qa)

# ════════════════════════════════════════════════════════
# D) HESAPLAMA / KAPASİTE / SERVIS PROSEDÜRLERİ
# ════════════════════════════════════════════════════════
service_qa = [
    {
        "tags": ["coldroom_expert", "service", "kapasite"],
        "tr_question": "Soğuk oda soğutma yükü nasıl hesaplanır?",
        "tr_answer": "Soğuk oda soğutma yükü = Q_yapı + Q_ürün + Q_kişi + Q_aydınlatma + Q_ekipman + Q_kapı (toplam Watt). YAPI yükü: Q = U × A × ΔT, U= 1/(thickness/k + 1/h_in + 1/h_out), 100mm PIR için U≈0.22 W/m²K. Örnek 5×4×3m oda (94m² yüzey), iç 0°C / dış 32°C: Q = 0.22 × 94 × 32 = 661W. ÜRÜN soğutma yükü: m × cp × ΔT / saat. Et için cp=3.49 kJ/kg·K, donma altı için cp=1.84 + gizli ısı 233 kJ/kg. Günlük 1000kg et yüklemesi (+18°C → 0°C, 24 saat): 1000×3.49×18/24/3.6 = 727W. Faktör 1.2× güvenlik. Toplam: bu tipik 5×4×3 et odası için ~3.5 kW soğutma, 4-5 HP grup gerekir.",
        "de_question": "Wie berechnet man die Kühllast eines Kühlraums?",
        "de_answer": "Kühllast = Q_Hülle + Q_Produkt + Q_Personen + Q_Licht + Q_Equipment + Q_Tür. HÜLLE: Q = U × A × ΔT; U = 0,22 W/m²K bei 100mm PIR. Beispiel 5×4×3m (94m² Fläche), innen 0°C / außen 32°C: Q = 0,22 × 94 × 32 = 661W. PRODUKT: m × cp × ΔT/h. Fleisch cp=3,49 kJ/kg·K. 1000kg Fleisch (+18°C → 0°C in 24h): 1000×3,49×18/24/3,6 = 727W. 1,2× Sicherheitsfaktor. Total für typischen Fleischraum 5×4×3m: ~3,5 kW, 4-5 HP-Aggregat."
    },
    {
        "tags": ["coldroom_expert", "service", "vakum"],
        "tr_question": "Soğutma sistemi vakum prosedürü nedir?",
        "tr_answer": "Vakum prosedürü (devreye almadan önce ZORUNLU): 1) Sistemi N2 ile 30 bar test et, 30 dak basınç düşmüyor mu kontrol. 2) N2'yi tahliye et. 3) Vakum pompasını (Value VE-115N min 6 CFM, 2-stage) hem yüksek basınç hem alçak basınç tarafına bağla (3-port manifold). 4) Pompayı çalıştır, manifold valflerini aç. 5) Hedef vakum: 500 mikron (0.5 torr) — değer değişmiyorsa nem yok. 6) Süre: küçük sistem 30 dak, büyük sistem 2-4 saat. 7) Vakum bittikten sonra valfleri kapat, izole et. 8) 15-30 dak bekle — vakum bozulursa sistem kaçırıyor. 9) Bozulmazsa şarja geç. ÖNEMLİ: deep vacuum gauge (mikron metre) kullan, klasik manometre yetersiz (ölçek 0-1 bar). Triple evacuation (vakum-N2-vakum-N2-vakum) yöntemi nem garantisi için.",
        "de_question": "Wie ist der Vakuumprozess vor Inbetriebnahme?",
        "de_answer": "PFLICHT vor Inbetriebnahme: 1) System mit N2 auf 30 bar testen, 30 min Druckverlust prüfen. 2) N2 ablassen. 3) Vakuumpumpe (Value VE-115N min 6 CFM, 2-stufig) an Hoch- + Niederdruckseite. 4) Pumpe + Manifold-Ventile auf. 5) Ziel: 500 µm (0,5 Torr) — stabil = trocken. 6) Dauer: klein 30 min, groß 2-4h. 7) Ventile zu, isolieren. 8) 15-30 min warten — Anstieg = Leck. 9) Stabil = befüllen. Mikrometer (Mikron-Vakuummeter) nötig, klassisches Manometer ungenügend. Triple Evacuation (Vakuum-N2-Vakuum-N2-Vakuum) für absolute Trocknung."
    },
    {
        "tags": ["coldroom_expert", "service", "sarj"],
        "tr_question": "Soğutucu gaz şarjı nasıl yapılır (R404A örneği)?",
        "tr_answer": "Şarj prosedürü: 1) Sistem vakumlanmış olmalı (500 mikron). 2) Kompresör DURDURULMUŞ. 3) Tüpü sisteme yüksek basınç tarafından bağla, valfi aç (likit faz). Tüpü baş aşağı tut (compressor durmuş ise). 4) Sistem set basıncına gelene kadar şarj — likit hattında sight glass'ta tam dolu görüntü. 5) Kompresörü çalıştır, alçak basınç tarafından (suction) GAZ FAZ ile incremental şarj devam et — likit asla gaz hattına gönderme (slug-back!). 6) Hedef performans: superheat 4-7K (TXV sistemler), subcooling 4-6K. 7) Tartılı şarj: tüpü tartı üzerine koy, sistemin nameplate'inde belirtilen miktar (örn. 2.5 kg R404A) eklenir. 8) ÖNEMLİ: R404A azeotropic değil, glide var (~0.5K), HER ZAMAN LİKİT FAZ ile şarj et, gaz fazı kompozisyonu değiştirir. Şarj sonrası: drier sıcak/soğuk dengeleme, sight glass kontrol, manifold gauges'leri sök, Schroeder valf kapakları ile.",
        "de_question": "Wie wird R404A geladen?",
        "de_answer": "Befüllung: 1) System vakuumiert (500 µm). 2) Verdichter AUS. 3) Flasche an Hochdruckseite, Ventil auf (Flüssigphase). Flasche umgekehrt halten (Verdichter aus). 4) Bis Solldruck — Schauglas voll. 5) Verdichter ein, an Saugseite mit GASPHASE inkrementell weiter — niemals Flüssig in Saug (Schlag!). 6) Ziel: Überhitzung 4-7K (TXV), Unterkühlung 4-6K. 7) Wiegen: Flasche auf Waage, lt. Typenschild (z.B. 2,5 kg). 8) WICHTIG: R404A nicht azeotrop, ~0,5K Glide, IMMER Flüssig laden, Gasphase ändert Mischung. Nach Befüllung: Trockner Wärme prüfen, Schauglas, Schroeder-Ventilkappen."
    },
    {
        "tags": ["coldroom_expert", "service", "superheat"],
        "tr_question": "Superheat ve subcooling nasıl ölçülür ve neden önemlidir?",
        "tr_answer": "SUPERHEAT (gaz aşırı kızdırma): evaporatör çıkışındaki gerçek gaz sıcaklığı - doyma sıcaklığı (basınçtan hesap). Ölçüm: clamp-on prob ile suction line üzerinde (evaporatör çıkışı), manifold gauges low-side basıncı. PT chart'tan veya digital manifold'tan saturation temp oku. Hedef: TXV sistem 4-7K, kapiler sistem 5-15K. Düşük superheat (<3K) → likit batık riski (slug). Yüksek superheat (>10K TXV ile) → undercharge veya TXV kapalı kalmış. SUBCOOLING (likit aşırı soğutma): kondenser çıkış likit sıcaklığı - doyma sıcaklığı (HP basınçtan). Ölçüm: clamp-on liquid line + manifold high-side. Hedef: 4-6K (R404A), 8-10K (R134a). Düşük subcooling → undercharge, kondenser sorunu. Yüksek subcooling → overcharge, condenser temizdir kontrol et.",
        "de_question": "Überhitzung und Unterkühlung — Messung und Bedeutung?",
        "de_answer": "ÜBERHITZUNG: Saugleitung-Temperatur - Sättigungstemperatur (aus Druck). Messung: Clamp-Fühler an Saugleitung (Verdampferausgang), Manifold Niederdruck. PT-Chart oder digitales Manometer für Sättigung. Soll: TXV 4-7K, Kapillarrohr 5-15K. Niedrig (<3K) → Schlaggefahr. Hoch (>10K bei TXV) → Untermenge oder TXV zu. UNTERKÜHLUNG: Flüssigleitung-Temp - Sättigungstemp (Hochdruck). Clamp-Fühler an Flüssigleitung. Soll: 4-6K (R404A), 8-10K (R134a). Niedrig → Untermenge oder Kondensatorproblem. Hoch → Überfüllung."
    },
    {
        "tags": ["coldroom_expert", "service", "gaz_secimi"],
        "tr_question": "R404A, R134a, R448A, R449A, R290 hangi uygulamada kullanılır?",
        "tr_answer": "Soğutucu gaz uygulama matrisi: 1) R404A (HFC, GWP=3922) — donuk depo standardı, -40°C'ye kadar. F-Gas yönetmeliği nedeniyle 2020'den beri yasaklanmaya başladı, sadece servis amaçlı. 2) R134a (HFC, GWP=1430) — pozitif uygulamalar (+5°C ve üstü), klima, su sebili, küçük ticari. 3) R448A (HFO/HFC blend, GWP=1387) — R404A retrofit alternatifi, %15-20 enerji tasarrufu. 4) R449A (HFO/HFC blend, GWP=1397) — R404A retrofit, R448A'ya benzer. 5) R290 (Propan, doğal HC, GWP=3) — küçük hermetik (≤150g şarj) entegre vitrin/buzdolabı. Yanıcı (A3) — tüplü değil, fabrika dolu. 6) R744 (CO2, GWP=1) — endüstriyel süpermarket, yüksek basınç (60-100 bar). 7) R1234ze (HFO, GWP=7) — yeni klima sistemleri. F-Gas yönetmeliğinde 2025'ten itibaren GWP < 150 zorunlu küçük sistemde.",
        "de_question": "Welches Kältemittel für welche Anwendung?",
        "de_answer": "1) R404A (HFC, GWP=3922) — Tiefkühlstandard bis -40°C. F-Gas seit 2020 stark eingeschränkt, nur Service. 2) R134a (HFC, GWP=1430) — Plus-Anwendung +5°C+, Klima, Wasserspender, klein-gewerblich. 3) R448A (HFO/HFC, GWP=1387) — R404A-Retrofit, 15-20% Energieersparnis. 4) R449A (HFO/HFC, GWP=1397) — R404A-Retrofit, ähnlich. 5) R290 (Propan, A3, GWP=3) — kleine hermetische Geräte (≤150g), brennbar, werksbefüllt. 6) R744 (CO2, GWP=1) — industrielle Supermärkte, Hochdruck 60-100 bar. 7) R1234ze (HFO, GWP=7) — neue Klimasysteme. F-Gas: ab 2025 GWP < 150 für Kleinsysteme Pflicht."
    },
    {
        "tags": ["coldroom_expert", "service", "defrost_tipleri"],
        "tr_question": "Defrost tipleri (elektrikli, sıcak gaz, hava, su) farkları?",
        "tr_answer": "Defrost yöntemleri: 1) ELEKTRİKLİ (rezistans) — evaporatör kanatları arasında elektrik ısıtıcısı (~1-3 kW). En yaygın, ucuz, basit. Dezavantaj: enerji yoğun, ek ısı odaya verilir. -25°C odalar için tipik. 2) SICAK GAZ (hot gas) — kompresör çıkışındaki sıcak gaz evaporatöre yönlendirilir, defrost yapar, sonra likit hattına döner. 3-yollu valf gerekir. Avantaj: %50 daha hızlı, kompresör enerjisi kullanır. Karmaşık devre, lisanslı kurulum gerekir. 3) HAVA — pozitif odalarda (≥+2°C), fan dönerek oda havası ile evaporatörü çözer. Set 2 saatte bir 30 dak, kompresör off. Sebze odaları için ideal. 4) SU — direk su püskürtme (chiller'larda), 24/7 deniz/balık endüstrisinde. Hızlı ama drenaj çok önemli. Pozitif/şok soğuk için. Çoğu 100mm panelli orta-büyük odada elektrikli + drenaj ısıtmalı standart.",
        "de_question": "Abtauverfahren — elektrisch, Heißgas, Luft, Wasser?",
        "de_answer": "1) ELEKTRISCH — Heizstäbe zwischen Verdampferlamellen (~1-3 kW). Verbreitet, billig. Nachteil: hoher Energiebedarf, zusätzliche Wärme im Raum. Standard für -25°C. 2) HEISSGAS — heißes Druckgas in Verdampfer, dann zurück zur Saugleitung. 3-Wege-Ventil. Vorteil: 50% schneller, nutzt Verdichterenergie. Komplexer, lizenziert. 3) LUFT — Plus-Räume (≥+2°C), Lüfter läuft mit Raumluft. Alle 2h, 30 min, Verdichter aus. Ideal für Gemüse. 4) WASSER — direktes Wasser (Chiller, Fisch), schnell aber Ablauf kritisch. Standard: 100mm Paneel, mittel-groß = elektrisch + Heizband-Ablauf."
    },
    {
        "tags": ["coldroom_expert", "service", "yag_secimi"],
        "tr_question": "Hangi soğutucu için hangi yağ kullanılır?",
        "tr_answer": "Soğutkan-yağ uyumluluk matrisi: 1) MİNERAL YAĞ (klasik) — R12, R22, R502 (eski sistemler) için. POE ile karıştırılamaz. 2) ALKYLBENZENE (AB) — R22 için bazı sistemler. 3) POE (Poliolester) — R134a, R404A, R407C, R410A, R448A, R449A, R452A için ZORUNLU. R290 için de POE (ASTM 22). En yaygın yağ türü. 4) PVE (Polivinileter) — R32 için bazı kompresörler, R410A modern bazı sistemler. 5) PAG (Polialkilen Glikol) — otomotiv klima R134a (bazıları). NEM hassasiyeti: POE > PVE > AB > Mineral. POE açık şişe 2 saat içinde nem alır. Bu yüzden POE her zaman kapalı tüpten doldurulmalı, 50ml sample ile asit testi yapılmalı. Viskozite seçimi: kompresör tipine göre — küçük hermetik POE 32, scroll POE 32, yarı-hermetik POE 68 veya POE 100. Errecom OL6012, Lubreeze NXT-32, POE 170 markalar.",
        "de_question": "Welches Öl für welches Kältemittel?",
        "de_answer": "1) MINERALÖL — R12, R22, R502 (alt). Nicht mit POE mischbar. 2) ALKYLBENZOL (AB) — R22 manche. 3) POE (Polyolester) — R134a, R404A, R407C, R410A, R448A, R449A, R452A PFLICHT. Auch R290 (POE 22). Verbreitetstes. 4) PVE (Polyvinylether) — R32 manche, R410A modern. 5) PAG (Polyalkylenglykol) — Auto-Klima R134a teilweise. Feuchtempfindlichkeit: POE > PVE > AB > Mineral. POE offene Flasche zieht in 2h Feuchte. Daher immer geschlossener Behälter, 50ml Säuretest. Viskosität: hermetisch POE 32, Scroll POE 32, halbhermetisch POE 68/100. Errecom OL6012, Lubreeze NXT-32, POE 170."
    },
]
faq.extend(service_qa)

# ════════════════════════════════════════════════════════
# E) HIZLI BAŞVURU TABLOLARI
# ════════════════════════════════════════════════════════
quickref_qa = [
    {
        "tags": ["coldroom_expert", "quickref", "basinc_sicaklik"],
        "tr_question": "R404A için tipik çalışma basınçları nedir?",
        "tr_answer": "R404A tipik çalışma değerleri (azeotropik gibi davranır, glide ~0.5K): SUCTION (alçak basınç) — donuk -25°C oda için 1.6 bar, donuk -18°C için 2.3 bar, pozitif 0°C için 4.5 bar, +5°C için 5.5 bar. DISCHARGE (yüksek basınç) — yazın 35°C ortamda condenser 50°C → 22 bar, kışın 5°C ortamda 35°C → 13 bar. SUPERHEAT 4-7K, SUBCOOLING 4-6K. PRESSURE LIMIT — HP cut 28-30 bar, LP cut donuk için 0.5 bar (vakum), pozitif için 2 bar. ÇALIŞMA NORMAL: discharge/suction oranı (compression ratio) donuk için 8-12, pozitif için 4-6. Yüksek ratio = kompresör zorlanması.",
        "de_question": "Typische Betriebsdrücke R404A?",
        "de_answer": "R404A typische Werte (azeotrop-ähnlich, Glide ~0.5K): SAUG — TK -25°C: 1,6 bar; -18°C: 2,3 bar; Plus 0°C: 4,5 bar; +5°C: 5,5 bar. DRUCK — Sommer 35°C/Kondensator 50°C: 22 bar; Winter 5°C/35°C: 13 bar. ÜBERHITZUNG 4-7K, UNTERKÜHLUNG 4-6K. GRENZEN: HP-Aus 28-30 bar, LP-Aus TK 0,5 bar (Vakuum), Plus 2 bar. Verdichtungsverhältnis TK 8-12, Plus 4-6. Hoch = Belastung."
    },
    {
        "tags": ["coldroom_expert", "quickref", "kapasite_secim"],
        "tr_question": "Soğuk oda için kompresör HP'si nasıl kabaca seçilir?",
        "tr_answer": "Hızlı seçim tablosu (oda iç sıcaklığı / oda hacmi → kabaca HP): POZİTİF +2°C/+8°C: 5m³ → 0.5 HP, 10m³ → 1 HP, 20m³ → 1.5-2 HP, 30m³ → 2-2.5 HP, 50m³ → 3-3.5 HP, 100m³ → 5-7 HP. DONUK -18°C/-25°C: 5m³ → 1 HP, 10m³ → 1.5-2 HP, 20m³ → 3-4 HP, 30m³ → 4-5 HP, 50m³ → 7-10 HP, 100m³ → 12-15 HP. ŞOK SOĞUK -30°C/-40°C: hacim × 2-3 HP/m³. NOT: bu tablo 100mm panel ve standart yük varsayımı; meyve sebze (yüksek nem yükü) +%30, açık vitrin +%50, kapı sıkça açıldığı yerler +%20-30 ekle. Sigorta payı için her zaman 1.2-1.5× üst seviyeyi seç.",
        "de_question": "Wie wählt man die Verdichter-HP für einen Kühlraum?",
        "de_answer": "Schnellauswahltabelle (Innentemp / Volumen → HP): PLUS +2°C/+8°C: 5m³ → 0,5 HP; 10m³ → 1; 20m³ → 1,5-2; 30m³ → 2-2,5; 50m³ → 3-3,5; 100m³ → 5-7 HP. TIEFKÜHL -18°C/-25°C: 5m³ → 1; 10m³ → 1,5-2; 20m³ → 3-4; 30m³ → 4-5; 50m³ → 7-10; 100m³ → 12-15 HP. SCHOCK -30°C/-40°C: × 2-3 HP/m³. ANNAHMEN: 100mm Paneel, normale Last. Obst+Gemüse (Feuchte) +30%, offene Vitrine +50%, häufige Türöffnung +20-30%. Reserve 1,2-1,5× nach oben."
    },
]
faq.extend(quickref_qa)

# ════════════════════════════════════════════════════════
# Save
# ════════════════════════════════════════════════════════
print(f'Toplam Q&A: {len(faq)}')
with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(faq, f, ensure_ascii=False, indent=2)
print(f'✓ Yazıldı: {OUTPUT} ({OUTPUT.stat().st_size//1024} KB)')
