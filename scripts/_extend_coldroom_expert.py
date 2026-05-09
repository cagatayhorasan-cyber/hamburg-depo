#!/usr/bin/env python3
"""Sınavda zayıf çıkan konuları zenginleştir."""
import json
from pathlib import Path

p = Path(__file__).parent / 'drc_man_coldroom_expert_faq.json'
faq = json.load(open(p, encoding='utf-8'))
print(f'Mevcut: {len(faq)} Q&A')

EXTRA = [
    # ─── Defrost yöntemleri detay ───
    {
        "tags": ["coldroom_expert", "service", "defrost", "elektrik"],
        "tr_question": "Elektrikli defrost rezistansı nasıl boyutlandırılır?",
        "tr_answer": "Elektrikli defrost rezistansı evaporatör kanatları arasına yerleştirilen flat veya tubular ısıtıcılardır. Boyutlandırma: evaporatör kapasitesinin %30-50'si kadar elektrik gücü gerekir. Örnek: 5 kW soğutma kapasiteli evaporatör için 1.5-2.5 kW defrost ısıtıcı. Voltaj 220V veya 380V (3-faz). Defrost süresi 20-30 dakika, günde 4-6 kez. Termination: termostat 15°C'ye ulaşınca veya max 30 dak güvenlik. Drip-off (damlama) süresi 2-5 dak (fan kapalı, su damlasın). Toplam defrost cycle 30-40 dak. ENERJİ kaybı: %3-5 toplam soğutma enerjisinin defrosta gider.",
        "de_question": "Wie wird die elektrische Abtauheizung dimensioniert?",
        "de_answer": "Elektrische Abtauheizung als Flach- oder Rohrheizer zwischen Verdampferlamellen. Dimensionierung: 30-50% der Verdampferleistung. Bsp: 5 kW Verdampfer → 1,5-2,5 kW Heizung. 220V oder 380V (3-Phase). Abtaudauer 20-30 min, 4-6×/Tag. Beendigung: Thermostat bei 15°C oder Sicherheitsabschaltung 30 min. Drip-Off 2-5 min (Lüfter aus). Gesamtzyklus 30-40 min. Energieverlust: 3-5% der Kühlenergie."
    },
    {
        "tags": ["coldroom_expert", "service", "defrost", "hot_gas"],
        "tr_question": "Hot gas (sıcak gaz) defrost devresi nasıl çalışır?",
        "tr_answer": "Hot gas defrost: kompresörden çıkan sıcak yüksek basınçlı gaz kondenser yerine evaporatöre yönlendirilir. Bileşenler: 1) 3-yollu yön valfi (4-yollu reverse valf de olabilir) — Sanhua FDF veya Honeywell, 2) Likit hattı bypass valfi, 3) Defrost timer/sensör. Çevrim: 1) Defrost başlar — 3-yollu valf hot gas hattını evaporatöre açar, 2) Sıcak gaz evaporatör kanatlarını ısıtır, buzu eritir, 3) Soğuyan gaz likit oluşur, accumulator'a düşer, 4) Süre: 5-15 dak (elektrikten %50-75 hızlı), 5) Defrost biter — valf normale döner, normal soğutma başlar. AVANTAJ: hızlı, enerji tasarrufu (kompresör enerjisi kullanır). DEZAVANTAJ: karmaşık devre, ek valf maliyeti, sürekli çalışan kompresör gerek. SADECE çoklu evaporatör sistemlerde mantıklıdır (bir grup soğuturken diğeri defrost eder).",
        "de_question": "Wie funktioniert Heißgas-Abtauung (Hot Gas Defrost)?",
        "de_answer": "Hot Gas Defrost: heißes Druckgas vom Verdichter wird statt zum Kondensator zum Verdampfer geleitet. Komponenten: 1) 3-Wege-Umschaltventil (oder 4-Wege Reverse), 2) Flüssigkeitsbypass-Ventil, 3) Abtau-Timer/Fühler. Ablauf: 1) Start — 3-Wege-Ventil öffnet Hot-Gas-Leitung, 2) Heißes Gas erwärmt Verdampferlamellen, 3) Kondensiert in Akkumulator, 4) Dauer 5-15 min (50-75% schneller als elektrisch), 5) Ende — Ventil zurück. VORTEIL: schnell, spart Energie. NACHTEIL: komplex, teurere Ventile. Nur bei Multi-Verdampfer-Systemen sinnvoll."
    },
    # ─── R290 propan ───
    {
        "tags": ["coldroom_expert", "service", "r290", "propan"],
        "tr_question": "R290 (propan) sistemde maksimum şarj limiti ve güvenlik?",
        "tr_answer": "R290 (propan, doğal hidrokarbon) çevreci ama YANICI (A3 sınıfı). Şarj limitleri: 1) Hermetik küçük sistem (buzdolabı, vitrin) — max 150g (Avrupa EN 60335), 2) Açık alan ticari — max 1 kg, 3) Endüstriyel kapalı oda — özel havalandırma + leak detector zorunlu. Tutuşma sınırı %2.1-9.5 hava karışımı. ALEV NOKTASI -104°C. Güvenlik kuralları: 1) Tüplü dolum YASAK — fabrika dolu hermetik sistem, 2) Servis için ATEX-sertifikalı tools, 3) Sızıntı tespiti hidrokarbon-spesifik leak detector (genel halojen detector çalışmaz), 4) Vakum pompası R290 uyumlu olmalı (yağ ayrıştırıcı), 5) Lehimleme ALEVLE değil mekanik birleşim, 6) Sigorta uyumluluğu kontrol. POE 22 yağ kullan, mineral yağ asla.",
        "de_question": "R290 (Propan) Maximalfüllung und Sicherheit?",
        "de_answer": "R290 (Propan, natürliches HC) umweltfreundlich aber BRENNBAR (A3-Klasse). Füllgrenzen: 1) Hermetisches Kleingerät (Kühlschrank, Vitrine) — max 150g (EN 60335), 2) Gewerblich offen — max 1 kg, 3) Industriell geschlossen — Spezialbelüftung + Leck-Detektor PFLICHT. Zündbereich 2,1-9,5% in Luft. Flammpunkt -104°C. Regeln: 1) Flaschenfüllung VERBOTEN — werksbefüllt hermetisch, 2) ATEX-Werkzeug, 3) HC-spezifischer Lecksucher (Halogen-Detektor funktioniert nicht), 4) R290-kompatible Vakuumpumpe (Ölabscheider), 5) Mechanisch verbinden, NICHT löten, 6) Versicherungskompatibilität prüfen. POE 22 Öl, niemals Mineral."
    },
    # ─── Triple evacuation ───
    {
        "tags": ["coldroom_expert", "service", "vakum", "triple"],
        "tr_question": "Triple evacuation (üçlü vakum) prosedürü nedir?",
        "tr_answer": "Triple evacuation: nem ve gaz kalıntılarını tamamen yok etmek için yapılan üç aşamalı vakumlama. Adımlar: 1) İLK VAKUM — sistemi 1500 mikrona indir (~30 dak), valfleri kapat, 2) AZOT KIRIL — N2 ile sistemi 0.5-1 bar pozitif basınçla doldur (kuru gaz nem alır), 5-10 dak bekle, 3) İKİNCİ VAKUM — N2'yi tahliye et + tekrar 1000 mikrona indir, 4) AZOT KIRIL — tekrar N2 ile doldur, 5-10 dak bekle, 5) FİNAL VAKUM — 500 mikrona indir, 30 dak izle, 6) Stabil ise şarja geç. AMAÇ: tek vakum nemi tam çekemez (yağda çözünmüş su, lehim noktalarında nem). Üçlü süreçle %99.9 nem temizlenir. Yeni sistem (büyük), gaz değişikliği veya burnout sonrası ZORUNLU. Süre: 2-4 saat. TEK vakum sadece servis sonrası (gaz boşalt-tekrar şarj) için yeterli.",
        "de_question": "Was ist Triple Evacuation (dreifaches Vakuumieren)?",
        "de_answer": "Triple Evacuation: dreistufiges Vakuum zur vollständigen Entfeuchtung und Gasentfernung. Schritte: 1) ERSTES VAKUUM — auf 1500 µm (~30 min), Ventile zu, 2) N2-SPÜLUNG — Trockenstickstoff bei 0,5-1 bar Überdruck, 5-10 min, 3) ZWEITES VAKUUM — N2 ablassen + 1000 µm, 4) N2-SPÜLUNG nochmal, 5) FINALES VAKUUM — 500 µm, 30 min beobachten, 6) Stabil → befüllen. ZWECK: Einmaliges Vakuum entfernt nicht komplett Wasser im Öl/an Lötstellen. Dreifach = 99,9% Trockenheit. PFLICHT bei Neuanlagen (groß), Kältemittelwechsel, Burnout. Dauer 2-4h. Einfaches Vakuum nur für Servicearbeiten."
    },
    # ─── Burnout cleanup ───
    {
        "tags": ["coldroom_expert", "service", "burnout", "cleanup"],
        "tr_question": "Burnout (kompresör yanması) sonrası sistem temizleme prosedürü?",
        "tr_answer": "Burnout cleanup tam prosedürü: 1) TEŞHİS — yağ siyah, asit kokusu, motor sargısı yanmış (Megger ile R-S-C ölç). 2) KOMPRESÖR ÇIKART — yeni kompresör hazırla. 3) SİSTEM N2 İLE TEMİZLE — eski yağ ve asitten arındırmak için sistemi N2 ile basınçla yıka, alçak noktada drenaj toplama. 4) BURNOUT DRIER MONTE ET — Sporlan EHB/EHA serisi, normal drier'a göre 3× kapasite, asit absorber ile. Likit hattına ek olarak suction line'a da takılır. 5) YENİ KOMPRESÖR + YAĞ — POE yağı tam dolum, asit testli yağ kullan (Lubreeze/Errecom). 6) VAKUM TRIPLE — burnout sistemde nem hassasiyeti yüksek, üçlü vakum şart. 7) ŞARJ + ÇALIŞTIR — normal şarj, 24 saat çalıştır. 8) ASİT TESTİ TEKRAR — 24 saat sonra yağdan örnek al, Errecom RK1349 kit ile asit testi. POZİTİF ise drier'ı tekrar değiştir, döngü tekrar. Asit temizlenene kadar (genelde 2-3 cycle). 9) FİNAL — drier'ları normal kapasiteyle değiştir, sight glass'tan kontrol. SÜRE: 4-8 saat işçilik + 24-72 saat izleme.",
        "de_question": "Burnout (Verdichterausfall) Reinigungsverfahren?",
        "de_answer": "Burnout-Cleanup vollständig: 1) DIAGNOSE — Öl schwarz, Säuregeruch, Motorwicklung verbrannt (Megger R-S-C). 2) VERDICHTER AUSBAUEN. 3) SYSTEM MIT N2 SPÜLEN — Druckspülung, Drainage am Tiefpunkt. 4) BURNOUT-TROCKNER — Sporlan EHB/EHA, 3× normale Kapazität, Säureabsorber. Sowohl Flüssig- als auch Saugleitung. 5) NEUER VERDICHTER + ÖL — POE, säurefrei (Lubreeze/Errecom). 6) TRIPLE VAKUUM — Pflicht. 7) BEFÜLLEN + 24h LAUFEN. 8) SÄURETEST WIEDERHOLEN — nach 24h Ölprobe, Errecom RK1349. Positiv → Trockner erneut, Zyklus wiederholen (2-3×). 9) FINAL — Normaltrockner einsetzen. DAUER: 4-8h Arbeit + 24-72h Beobachtung."
    },
    # ─── Suction line accumulator ───
    {
        "tags": ["coldroom_expert", "parts", "accumulator"],
        "tr_question": "Suction line accumulator ne işe yarar ve nereye bağlanır?",
        "tr_answer": "Suction line accumulator (SLA): kompresör emiş hattında likit yakalama deposu. GÖREVİ: defrost sonrası veya değişken yük altında evaporatörden geri dönen sıvı refrigerant'ı tutmak — kompresörün likit batık (slug-back) yapmasını önlemek. KRİTİK koruma: bir slug kompresörün çekirdeğini, valflerini veya pistonlarını anlık yok edebilir. KONUM: evaporatör çıkışı ile kompresör emişi arası, kompresörden ÖNCE. ÇALIŞMA: J-tube tasarımı — sıvı dibe çöker, gaz üstten emilir; alt deliklerden yağ taşınması sağlanır (yağ kaybı önlenir). BOYUTLANDIRMA: kompresör kapasitesinin %50-70'i kadar likit hacim alabilir (örn. 5 kg gaz şarjı sistem için 2-3 L accumulator). BU GEREKLİ ZAMANLAR: 1) Çoklu evaporatör (defrost sonrası likit dönüşü), 2) Heat pump (cycle ters dönmesi), 3) Düşük yük çalışması, 4) Burnout retrofit (yağ filtreleme). Frigocraft, Frigomec, Refco markaları yapar.",
        "de_question": "Wofür dient ein Sauggas-Akkumulator (Suction Line Accumulator)?",
        "de_answer": "Sauggas-Akkumulator (SLA): Flüssigkeitssammler in der Saugleitung. AUFGABE: Nach Abtauung oder bei Lastwechsel zurücklaufende flüssige Kältemittel auffangen — Flüssigkeitsschlag (Slug) am Verdichter verhindern. EIN Schlag kann Kern, Ventile oder Kolben sofort zerstören. POSITION: zwischen Verdampfer und Verdichter, VOR dem Verdichter. FUNKTION: J-Rohr-Design — Flüssigkeit setzt sich ab, Gas wird oben gesaugt; Bodenöffnungen für Ölrückführung. DIMENSIONIERUNG: 50-70% der Verdichter-Füllmenge (z.B. 5 kg System → 2-3 L Akku). PFLICHT bei: 1) Multi-Verdampfer, 2) Wärmepumpe, 3) Teillast, 4) Burnout-Retrofit. Frigocraft, Frigomec, Refco."
    },
    # ─── Düşük nem ───
    {
        "tags": ["coldroom_expert", "trouble", "nem"],
        "tr_question": "Soğuk odada nem çok düşük (ürünler kuruyor) — sebep ve çözüm?",
        "tr_answer": "Düşük nem (RH < %75) ürünleri kurur (et, sebze, çiçek). SEBEP: 1) DELTA-T YÜKSEK — evaporatör yüzey sıcaklığı oda sıcaklığından çok düşük (ΔT > 8K). Düşük yüzey sıcaklığı havadaki nemi yoğuşturur, suya dönüştürür, drenajla atar. ÇÖZÜM: ΔT'yi 5-7K'a indirmek için: a) Daha büyük yüzey alanlı evaporatör seç, b) Birden çok evaporatör kullan, c) Suction basıncını yükselt (yüksek superheat). 2) FAN HIZI YÜKSEK — sürekli hava akışı kuruma yapar. ÇÖZÜM: variable speed fan veya gece düşük hız. 3) AŞIRI DEFROST — sık defrost = sık ısınma = nem kaybı. Defrost frekansını azalt. 4) ODA AÇILMA SIK — kapı sıkça açılınca dış kuru hava girer. PVC perde ve kontrollü açılma. 5) HUMIDIFIER YOK — meyve/sebze odasında ultrasonic/atomizer humidifier kur, RH %85-95 hedef. ÖLÇÜM: psikrometre veya Carel/Honeywell digital humidity sensor. EAS (Effective Air Speed) max 0.5 m/s ürün üzerinde.",
        "de_question": "Niedrige Luftfeuchte im Kühlraum (Produkte trocknen) — Ursache und Lösung?",
        "de_answer": "Niedrige Feuchte (rel. < 75%) trocknet Produkte. URSACHEN: 1) HOHES DELTA-T — Verdampferoberfläche zu kalt vs. Raumluft (ΔT > 8K). Kalte Fläche kondensiert Feuchte → Drainage. LÖSUNG: ΔT auf 5-7K reduzieren: a) größere Verdampferfläche, b) mehrere Verdampfer, c) Saugdruck erhöhen (höhere Überhitzung). 2) HOHE LÜFTERDREHZAHL — ständige Luftbewegung trocknet. EC-Lüfter mit Drehzahlregelung oder nachts langsam. 3) ÜBERMÄSSIGE ABTAUUNG — häufige Erwärmung = Feuchteverlust. Frequenz reduzieren. 4) HÄUFIGE TÜRÖFFNUNG — trockene Außenluft. PVC-Vorhang. 5) KEIN BEFEUCHTER — bei Obst/Gemüse Ultraschall-/Atomizer-Befeuchter, RH 85-95% Ziel. Messung: Psychrometer/Digital-Sensor. EAS max 0,5 m/s am Produkt."
    },
    # ─── Compressor short cycling ───
    {
        "tags": ["coldroom_expert", "trouble", "short_cycling"],
        "tr_question": "Kompresör short cycling (sık açılıp kapanma) sorunu ve çözümü?",
        "tr_answer": "Short cycling = kompresör 5 dakikadan kısa aralıklarla açıp kapanıyor (saatte 6+ kez). SORUNLAR: motor aşırı ısınma, kontaktör yıpranma, yağ yetersizliği (start sırasında likit dönüşü), elektrik tüketimi artışı (start akımı 5-7×), kompresör ömrü %50 azalır. SEBEPLER: 1) THERMOSTAT DIFFERENTIAL DAR — set 0°C, diff 1K → 0°C - +1°C arası sürekli açar. ÇÖZÜM: differential 2-3K yap (0°C - +3°C). 2) BASINÇ ŞALTERİ TİTREMESİ — LP cut-in/cut-out aralığı dar (örn. cut 1 bar, in 1.5 bar). LP differential 2-3 bar yap. 3) ODA AŞIRI BÜYÜK + KOMPRESÖR KÜÇÜK — yetersiz kapasite, sürekli max çalışıyor, kısa süre dinlenip tekrar başlıyor. Daha büyük HP grup gerek. 4) GAZ EKSİK — basınç çabuk düşüyor, LP hızlı açıyor. Şarj kontrol. 5) KAPASİTÖR ARIZALI — start kondansatör aşınmış, motor başlamada zorlanıyor. KORUMA: Anti-short cycle timer (5 dak min off) — modern dijital kontrolörler standart sağlar.",
        "de_question": "Verdichter Short Cycling (häufiges An/Aus) — Problem und Lösung?",
        "de_answer": "Short Cycling = Verdichter schaltet alle <5 min an/aus (>6×/h). PROBLEME: Motorüberhitzung, Schützverschleiß, Ölmangel (Flüssigkeitsrücklauf beim Start), Stromverbrauch ↑ (Anlaufstrom 5-7×), Lebensdauer -50%. URSACHEN: 1) ENGE THERMOSTAT-DIFFERENZ — Soll 0°C, Diff 1K. LÖSUNG: 2-3K Differenz. 2) ENGE PRESSOSTAT-DIFFERENZ — LP Cut-in/Cut-out zu nah. 2-3 bar. 3) RAUM ZU GROSS / VERDICHTER ZU KLEIN — größere HP nötig. 4) UNTERFÜLLUNG — Druck fällt schnell, LP schaltet. Nachfüllen. 5) DEFEKTER START-CAP. SCHUTZ: Anti-Short-Cycle-Timer (5 min min-Off) — moderne Digitalregler Standard."
    },
    # ─── Sound design ───
    {
        "tags": ["coldroom_expert", "service", "ses"],
        "tr_question": "Soğuk oda gürültü kontrolü — fan + kompresör için ne yapmalı?",
        "tr_answer": "Gürültü kaynakları: 1) FAN MOTOR (50-65 dB normal) — yüksek RPM = yüksek ses. EC fan motoru AC motora göre %30 daha sessiz, ayarlanabilir hız. Düşük RPM (1000-1200 rpm) gece için. Fan kanat şekli aerodinamik (sickle blade) gürültü azaltır. 2) KOMPRESÖR (60-75 dB) — Scroll en sessiz (60 dB), reciprocating yüksek (70+ dB). Lastik anti-vibration takoz, akustik kabin (Frigocraft G-BOX, Günay GBX). 3) BORU TİTREŞİMİ — sert metal montaj titreşimi yayar. Esnek bağlantı (Frigocraft Vibration Eliminator, Refco), boru klipsleri lastik takozlu. 4) HAVA ÇARPMASI — duct açıları keskin → türbülans → ses. Yumuşak dirsekler. KORUMA: 1) Akustik perde (mineral wool 50mm) yatak çevresinde, 2) Kompresör grubu binadan en az 5m uzakta, 3) Gece modu (set sıcaklık +1-2K, fan düşük) ile gürültü %50 azalır. NORM: ev yakını AC sınır 40 dB(A) gece, 55 dB gündüz (TR yönetmelik).",
        "de_question": "Kühlraum-Geräuschkontrolle — Lüfter + Verdichter?",
        "de_answer": "Geräuschquellen: 1) LÜFTERMOTOR (50-65 dB) — hohe Drehzahl = laut. EC-Motor 30% leiser, regelbar. Niedrig (1000-1200 rpm) nachts. Aerodynamische Sichelflügel reduzieren. 2) VERDICHTER (60-75 dB) — Scroll am leisesten (60 dB), Hubkolben laut (70+). Anti-Vibrationsgummipuffer, Akustikgehäuse (Frigocraft G-BOX, Günay GBX). 3) ROHRVIBRATION — feste Metallbefestigung überträgt Schwingung. Flexible Verbindung (Vibration Eliminator), gummigelagerte Schellen. 4) LUFTSTAUE — scharfe Kanal-Ecken = Turbulenz. Sanfte Bögen. SCHUTZ: 1) Akustikvorhang (Mineralwolle 50mm), 2) Verdichter mind. 5m vom Gebäude, 3) Nachtmodus (Soll +1-2K, Lüfter niedrig) reduziert 50%. NORM: nahe Wohnung AC Grenze 40 dB(A) nachts, 55 dB tags."
    },
]

faq.extend(EXTRA)
print(f'Yeni toplam: {len(faq)} Q&A (+{len(EXTRA)})')
with open(p, 'w', encoding='utf-8') as f:
    json.dump(faq, f, ensure_ascii=False, indent=2)
print(f'✓ {p}')
