"use strict";
/**
 * DRC MAN 50.000 soruluk soğuk oda DESIGN + EKİPMAN SEÇİMİ + MONTAJ bilgi bankası.
 *
 * Mevcut 25K troubleshooting bankasına paralel; bu set arıza odaklı değil
 * proje/tasarım/montaj odaklı. Çıktı: scripts/drc_man_coldroom_design_50k_faq.json
 * Format: assistant_troubleshooting_bank tablosuna context_id="coldroom_design"
 * altında yüklenecek.
 *
 * Hedef ölçü: 50 family × 50 context × 20 template (10 TR + 10 DE) = 50.000 entry.
 *
 * Kullanım:
 *   node scripts/generate_drc_man_coldroom_design_50k.js
 *
 * Çıktı:
 *   .codex_tmp/drc_man_coldroom_design_50k/drc_man_coldroom_design_50k_faq.json
 *   scripts/drc_man_coldroom_design_50k_faq.json (canlı manifest için kopya)
 */

const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(process.cwd(), ".codex_tmp", "drc_man_coldroom_design_50k");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "drc_man_coldroom_design_50k_faq.json");
const STATIC_PATH = path.join(process.cwd(), "scripts", "drc_man_coldroom_design_50k_faq.json");
const SUMMARY_PATH = path.join(OUTPUT_DIR, "drc_man_coldroom_design_50k_summary.json");
const SOURCE_SUMMARY = "DRC MAN 50K soguk oda design + ekipman secimi + montaj bilgi bankasi";

// ---- TEMPLATES (10 TR + 10 DE) ----

const trTemplates = [
  (ctx, fam) => `${ctx.trLabel} icin ${fam.trSubject} secerken nelere dikkat edilmeli`,
  (ctx, fam) => `${ctx.trLabel} kurulumunda ${fam.trSubject} icin dogru hesap nasil yapilir`,
  (ctx, fam) => `${ctx.trLabel} odasinda ${fam.trSubject} icin tipik deger nedir`,
  (ctx, fam) => `${ctx.trLabel} uygulamasinda ${fam.trSubject} secimini etkileyen baslica faktorler`,
  (ctx, fam) => `${ctx.trLabel} icin ${fam.trSubject} marka/model secerken ne onerirsin`,
  (ctx, fam) => `${ctx.trLabel} sisteminde ${fam.trSubject} olcusu/kapasitesi nasil belirlenir`,
  (ctx, fam) => `${ctx.trLabel} odasinda ${fam.trSubject} montaj sirasinda en sik yapilan hata`,
  (ctx, fam) => `${ctx.trLabel} projesinde ${fam.trSubject} icin DRC katalogundan hangisini onerirsin`,
  (ctx, fam) => `${ctx.trLabel} icin ${fam.trSubject} bakim aralikleri ve usta kontrol noktalari`,
  (ctx, fam) => `${ctx.trLabel} sisteminde ${fam.trSubject} secim hatasi olursa ne olur`,
  // Ek 10 template (alternatif soru kalibi):
  (ctx, fam) => `${ctx.trLabel} projesinde ${fam.trSubject} icin teklife eklenmesi gereken kalemler nelerdir`,
  (ctx, fam) => `${ctx.trLabel} kurulumunda ${fam.trSubject} ile ilgili musteriye ne ozetlenir`,
  (ctx, fam) => `${ctx.trLabel} odasi icin ${fam.trSubject} alternatif urun var mi`,
  (ctx, fam) => `${ctx.trLabel} sisteminde ${fam.trSubject} icin standart enerji harcamasi nedir`,
  (ctx, fam) => `${ctx.trLabel} icin ${fam.trSubject} hesabi yaparken hangi tablodan/programdan yararlanilir`,
  (ctx, fam) => `${ctx.trLabel} uygulamasinda ${fam.trSubject} olmazsa ne hizmet verilemez`,
  (ctx, fam) => `${ctx.trLabel} odasinda ${fam.trSubject} 2.el alimi mantikli mi`,
  (ctx, fam) => `${ctx.trLabel} kurulumunda ${fam.trSubject} icin sertifika/yetki gerekli mi`,
  (ctx, fam) => `${ctx.trLabel} sisteminde ${fam.trSubject} on saat caliştirilarak test mi gerekir`,
  (ctx, fam) => `${ctx.trLabel} odasi icin ${fam.trSubject} secimi yaparken bayi ne sorar`,
];

const deTemplates = [
  (ctx, fam) => `worauf muss man bei der auswahl von ${fam.deSubject} fuer ${ctx.deLabel} achten`,
  (ctx, fam) => `wie wird die richtige berechnung fuer ${fam.deSubject} bei ${ctx.deLabel} gemacht`,
  (ctx, fam) => `welcher typische wert gilt fuer ${fam.deSubject} im ${ctx.deLabel}`,
  (ctx, fam) => `welche faktoren beeinflussen die ${fam.deSubject} auswahl fuer ${ctx.deLabel}`,
  (ctx, fam) => `welche marke modell ${fam.deSubject} empfiehlst du fuer ${ctx.deLabel}`,
  (ctx, fam) => `wie bestimmt man groesse kapazitaet von ${fam.deSubject} im ${ctx.deLabel}`,
  (ctx, fam) => `welcher montagefehler tritt am haeufigsten beim ${fam.deSubject} im ${ctx.deLabel} auf`,
  (ctx, fam) => `welches DRC katalogprodukt empfiehlst du fuer ${fam.deSubject} im ${ctx.deLabel}`,
  (ctx, fam) => `welche wartungsintervalle und meisterpruefpunkte gibt es fuer ${fam.deSubject} im ${ctx.deLabel}`,
  (ctx, fam) => `was passiert wenn ${fam.deSubject} fuer ${ctx.deLabel} falsch ausgewaehlt wird`,
  // 10 zusaetzliche Templates:
  (ctx, fam) => `welche positionen muessen ins angebot fuer ${fam.deSubject} im ${ctx.deLabel} aufgenommen werden`,
  (ctx, fam) => `was wird dem kunden zu ${fam.deSubject} bei ${ctx.deLabel} zusammengefasst`,
  (ctx, fam) => `gibt es alternative produkte zu ${fam.deSubject} fuer ${ctx.deLabel}`,
  (ctx, fam) => `welcher typische energieverbrauch gilt fuer ${fam.deSubject} im ${ctx.deLabel}`,
  (ctx, fam) => `welche tabelle programm hilft bei ${fam.deSubject} berechnung im ${ctx.deLabel}`,
  (ctx, fam) => `welche leistung kann man im ${ctx.deLabel} ohne ${fam.deSubject} nicht anbieten`,
  (ctx, fam) => `lohnt sich ein gebrauchtkauf von ${fam.deSubject} fuer ${ctx.deLabel}`,
  (ctx, fam) => `braucht man fuer ${fam.deSubject} im ${ctx.deLabel} ein zertifikat oder zulassung`,
  (ctx, fam) => `muss ${fam.deSubject} im ${ctx.deLabel} stundenlang im testbetrieb laufen`,
  (ctx, fam) => `welche fragen stellt der haendler bei der ${fam.deSubject} auswahl fuer ${ctx.deLabel}`,
];

// ---- DESIGN FAMILIES (50 adet) ----
// Her family: id, trSubject, deSubject, trAnswer (template), deAnswer (template)

const designFamilies = [
  // Boyutlandırma + kapasite
  { id: "panel_thickness", trSubject: "panel kalinligi", deSubject: "die panelstaerke", trAnswer: "Pozitif odalar icin 80mm, dondurucu icin 100-150mm normdur. {ctx_hint} Yapi: PIR/PUR koklu sandvic panel. Kalinligi yetersizse U-degeri yukselir, kompresor surekli calisir, fatura artar.", deAnswer: "Fuer Plus-Raeume sind 80mm Standard, fuer Tiefkuehl 100-150mm. {ctx_hint} Aufbau: PIR/PUR-Sandwichpaneel. Zu duenne Daemmung erhoeht den U-Wert, der Verdichter laeuft staendig." },
  { id: "compressor_hp", trSubject: "kompresor hp gucu", deSubject: "die verdichterleistung in PS", trAnswer: "Hesap: oda hacmi (m3) x defrost faktor x devir suresi. {ctx_hint} Tipik bant: 5x4x3 +5C oda icin 2-3HP, dondurucu icin 3-4HP. Embraco/Tecumseh/Danfoss SZ serisi en sik tercih.", deAnswer: "Berechnung: Raumvolumen x Abtaufaktor x Laufzeit. {ctx_hint} Typischer Bereich: 5x4x3 +5C Raum 2-3PS, Tiefkuehl 3-4PS. Embraco/Tecumseh/Danfoss SZ am haeufigsten." },
  { id: "evaporator_capacity", trSubject: "evaporator kapasitesi", deSubject: "die verdampferkapazitaet", trAnswer: "Brut soguk yuk x emniyet faktoru (1.2-1.4). {ctx_hint} Lamel ara mesafesi pozitifte 4-5mm, dondurucu da 7-10mm. Kufluyse 6mm minimum.", deAnswer: "Bruttokaeltelast x Sicherheitsfaktor (1.2-1.4). {ctx_hint} Lamellenabstand bei Plus 4-5mm, bei Tiefkuehl 7-10mm. Bei Schimmelgefahr 6mm minimum." },
  { id: "condenser_capacity", trSubject: "kondenser kapasitesi", deSubject: "die verfluessigerkapazitaet", trAnswer: "Kompresor kapasitesi x 1.25 (R134a/R404A) ya da x 1.4 (R290). {ctx_hint} Yer altinda yatay, ust kotta dik tip tercih edilir. Yaz ortam 35C+ bolgelerde 1 boy daha buyuk al.", deAnswer: "Verdichterleistung x 1.25 (R134a/R404A) oder x 1.4 (R290). {ctx_hint} Im Keller liegend, oben stehend. In heissen Regionen 35C+ eine Nummer groesser." },
  { id: "tev_selection", trSubject: "termostatik genlesme valfi (TXV)", deSubject: "das thermostatische expansionsventil (TXV)", trAnswer: "Sanhua RFKH/RFKE veya Danfoss TES2/TES5 standart. {ctx_hint} Sarji gaza gore (R134a/R404A/R449A). Charge tipi: MOP veya non-MOP. Olcu kompresor kapasitesinin %20 ustunde olmali.", deAnswer: "Sanhua RFKH/RFKE oder Danfoss TES2/TES5 ist Standard. {ctx_hint} Charge nach Gas (R134a/R404A/R449A). MOP oder Non-MOP. Auslegung 20% ueber Verdichterleistung." },
  { id: "expansion_valve_exv", trSubject: "elektronik genlesme valfi (EXV)", deSubject: "das elektronische expansionsventil (EXV)", trAnswer: "Carel E2V/E3V veya Danfoss ETS+EKD kontrol kombinasyonu. {ctx_hint} %30+ enerji tasarrufu, daha hassas superheat. Kontrol kartiyla birlikte planlanmali.", deAnswer: "Carel E2V/E3V oder Danfoss ETS+EKD-Kombination. {ctx_hint} 30% Energieersparnis, praezisere Ueberhitzung. Mit Steuerung gemeinsam planen." },
  { id: "controller_selection", trSubject: "kontrol/termostat panosu", deSubject: "die regler/thermostat-tafel", trAnswer: "Dixell XR60CX (basit), Eliwell IC902 (orta), Carel uChiller (gelismis). {ctx_hint} Defrost, fan, kompresor, alarm role'lerini tek noktadan yonetir. RS485/Modbus uzaktan izleme bonus.", deAnswer: "Dixell XR60CX (einfach), Eliwell IC902 (mittel), Carel uChiller (fortgeschritten). {ctx_hint} Steuert Abtauung/Luefter/Verdichter/Alarm. RS485/Modbus fuer Fernueberwachung." },
  { id: "defrost_strategy", trSubject: "defrost stratejisi", deSubject: "die abtaustrategie", trAnswer: "Pozitif odada off-cycle (kompresor durdurma) yetebilir. {ctx_hint} Dondurucu da elektrikli rezistans veya hot-gas defrost gerek. Sıkligi: 4-6 saatte bir, 20-30 dk.", deAnswer: "Im Plus-Raum reicht oft Off-Cycle. {ctx_hint} Tiefkuehl braucht Elektroheizung oder Heissgas-Abtauung. Frequenz: alle 4-6h, 20-30 min." },
  { id: "drain_design", trSubject: "drenaj tasarimi", deSubject: "die abflussplanung", trAnswer: "U-sifon zorunlu (icerden hava cekisini onler). {ctx_hint} Dondurucu da rezistansli boru gerek (donmasin). Egim min %2.", deAnswer: "U-Siphon ist Pflicht (verhindert Rueckluftzug). {ctx_hint} Tiefkuehl braucht beheizte Leitung. Mindestgefaelle 2%." },
  { id: "door_type", trSubject: "kapi tipi", deSubject: "der tuertyp", trAnswer: "Mentesli 800x1900 standart, sik kullanilan girist surgu. {ctx_hint} Hava perdesiyle birlikte planla. Frame rezistansli (don-cozulme onlemek icin).", deAnswer: "Drehtuer 800x1900 ist Standard, bei haeufiger Nutzung Schiebetuer. {ctx_hint} Mit Luftschleier kombinieren. Beheizter Rahmen verhindert Frost-Tau." },
  { id: "air_curtain", trSubject: "hava perdesi", deSubject: "der luftschleier", trAnswer: "Sik kullanilan kapilarda zorunlu. {ctx_hint} 2m kapi icin 1.2m fan boy yeterli. Dik akis %30 daha enerji-verimli.", deAnswer: "Pflicht bei haeufig genutzten Tueren. {ctx_hint} 2m Tuer = 1.2m Luefter ausreichend. Vertikaler Strom 30% energieeffizienter." },
  { id: "lighting", trSubject: "aydinlatma", deSubject: "die beleuchtung", trAnswer: "LED, IP65, soguk-yana dayanikli (-40C minimum). {ctx_hint} 200-300 lux yeterli. Kapi acilinca otomatik yansin.", deAnswer: "LED, IP65, kaeltebestaendig (-40C min). {ctx_hint} 200-300 Lux genug. Bei Tueroeffnung automatisch an." },
  { id: "alarm_system", trSubject: "alarm sistemi", deSubject: "das alarmsystem", trAnswer: "Sicaklik+kapi+gaz+power alarmlari standart. {ctx_hint} HACCP veya GxP icin loglama zorunlu. SMS/email entegrasyonu bonus.", deAnswer: "Temperatur+Tuer+Gas+Power-Alarme Standard. {ctx_hint} HACCP/GxP verlangt Protokollierung. SMS/Email-Anbindung Bonus." },
  { id: "gas_choice_r290", trSubject: "R290 (propan) gaz secimi", deSubject: "die R290-Gaswahl (Propan)", trAnswer: "Kucuk/orta soguk odalar (max 150g sarj) icin EU normunda standart. {ctx_hint} ATEX uyumlu kompresor (Embraco NEK serisi). %30+ COP avantaji.", deAnswer: "Standard fuer kleine/mittlere Kuehlraeume (max 150g Charge) nach EU. {ctx_hint} ATEX-konformer Verdichter (Embraco NEK). 30% besserer COP." },
  { id: "gas_choice_r134a", trSubject: "R134a gaz secimi", deSubject: "die R134a-Gaswahl", trAnswer: "Yuksek pozitif sicaklik (chiller) icin standart. {ctx_hint} GWP 1430 — yeni montaj icin uygun degil, R513A/R454C alternatif.", deAnswer: "Standard fuer Hochplus-Anwendungen (Chiller). {ctx_hint} GWP 1430 - fuer Neuanlagen ungeeignet, R513A/R454C als Alternative." },
  { id: "gas_choice_r404a", trSubject: "R404A gaz secimi", deSubject: "die R404A-Gaswahl", trAnswer: "Eski sistemlerde standart, yeni proje YASAK (F-Gas 2025). {ctx_hint} Retrofit: R449A veya R448A drop-in (ufak ayarla).", deAnswer: "Bei Altanlagen Standard, Neuanlagen VERBOTEN (F-Gas 2025). {ctx_hint} Retrofit: R449A oder R448A als Drop-in (kleine Anpassung)." },
  { id: "gas_choice_r449a", trSubject: "R449A gaz secimi", deSubject: "die R449A-Gaswahl", trAnswer: "R404A retrofit standardi, yeni proje icin de uygun. {ctx_hint} GWP 1397 (R404A'dan %66 dusuk). Sliding glide var, sarj sıvı fazinda.", deAnswer: "Standard fuer R404A-Retrofit, auch fuer Neuanlagen geeignet. {ctx_hint} GWP 1397 (66% niedriger als R404A). Glide vorhanden, Charge in Fluessigphase." },
  { id: "evaporator_fan", trSubject: "evaporator fani", deSubject: "der verdampferluefter", trAnswer: "EC fan tercih (PWM kontrol, %25 enerji tasarrufu). {ctx_hint} IP55 sogutucu motorlu (oda neminden korunmali). Devirini kontrol kartindan ayarlayabilmeli.", deAnswer: "EC-Luefter bevorzugen (PWM-Steuerung, 25% Energieersparnis). {ctx_hint} IP55 Kaltemotor (vor Raumfeuchte geschuetzt). Drehzahl ueber Steuerung einstellbar." },
  { id: "condenser_fan", trSubject: "kondenser fani", deSubject: "der verfluessigerluefter", trAnswer: "AC standart, EC enerji avantaji. {ctx_hint} Yaz ortami icin Speed-control gerek (gece dusuk, gunduz tam). Dis hava 5C-35C arasi dizayn.", deAnswer: "AC Standard, EC mit Energievorteil. {ctx_hint} Im Sommer Drehzahlregelung noetig. Aussenluft-Auslegung 5C-35C." },
  { id: "insulation_panel_pir", trSubject: "PIR panel kullanimi", deSubject: "die Verwendung von PIR-Paneelen", trAnswer: "Yangin sinifi B-s2,d0, EN13501. {ctx_hint} U-degeri 100mm panelde 0.22 W/m2K. Halogensiz dolgu — ozellikle gida/eczane icin tercih.", deAnswer: "Brandklasse B-s2,d0, EN13501. {ctx_hint} U-Wert 0.22 W/m2K bei 100mm. Halogenfreier Schaum - fuer Lebensmittel/Pharma bevorzugt." },
  { id: "insulation_panel_pur", trSubject: "PUR panel kullanimi", deSubject: "die Verwendung von PUR-Paneelen", trAnswer: "Daha yaygin, ekonomik secim. {ctx_hint} U-degeri 100mm panelde 0.21 W/m2K. Yangin sinifi C-s3,d0 (PIR'den dusuk).", deAnswer: "Verbreiteter, oekonomische Wahl. {ctx_hint} U-Wert 0.21 W/m2K bei 100mm. Brandklasse C-s3,d0 (niedriger als PIR)." },
  { id: "floor_insulation", trSubject: "zemin yalitimi", deSubject: "die Bodenisolierung", trAnswer: "Pozitifte ozel zemin gerekmez (oda zemininden zaten yalitilmis). {ctx_hint} Dondurucu da 100-150mm XPS+sandvic gerek. Forklift gecisli ise C25/30 betonla iclidirilir.", deAnswer: "Bei Plus oft kein Spezialboden noetig. {ctx_hint} Tiefkuehl braucht 100-150mm XPS+Sandwich. Bei Gabelstapler C25/30 Beton ueberzogen." },
  { id: "ceiling_construction", trSubject: "tavan yapisi", deSubject: "die Deckenkonstruktion", trAnswer: "Asılı tip cogu zaman yeterli (4m'ye kadar). {ctx_hint} Ust kotta yuru-tip gerekirse panel 100mm uzeri olmali, profilli gusset eklenir.", deAnswer: "Abgehaengt reicht meistens (bis 4m). {ctx_hint} Bei begehbarem Dach 100mm+ Paneele, profilierte Gusseinlagen." },
  { id: "vapour_barrier", trSubject: "buhar bariyer", deSubject: "die Dampfsperre", trAnswer: "Dondurucu odada zorunlu — ic taraf nem buharinin sogutmadan yogusmasini onler. {ctx_hint} Aluminyum folyo 100u veya pozsoletilen.", deAnswer: "Im Tiefkuehlraum Pflicht - verhindert Kondensation der Dampffeuchte. {ctx_hint} Aluminiumfolie 100u oder Polyurethan." },
  { id: "pipe_design", trSubject: "boru tasarimi", deSubject: "die Rohrleitungsplanung", trAnswer: "Suction line yatay %1 egim kompresore dogru (yag donus). {ctx_hint} Liquid line tek yon olabilir. Cap kompresor capacity ve mesafeye gore (Carrier table veya Danfoss CoolSelector).", deAnswer: "Saugleitung 1% Gefaelle zum Verdichter (Oelrueckfuehrung). {ctx_hint} Fluessigkeitsleitung kann einseitig sein. Durchmesser nach Verdichter und Distanz (Carrier-Tabelle/Danfoss CoolSelector)." },
  { id: "pipe_insulation", trSubject: "boru yalitimi", deSubject: "die Rohrisolierung", trAnswer: "Kullanim/sıvı borularda 13-19mm Armaflex/K-Flex. {ctx_hint} Yogusma onlemek icin koprusuz montaj. UV-darbel disarda Aluminyum jaketle ortulur.", deAnswer: "An Saug/Fluessigleitungen 13-19mm Armaflex/K-Flex. {ctx_hint} Brueckenfreie Montage gegen Kondensation. UV-bestaendige Aluminium-Jacke aussen." },
  { id: "filter_drier", trSubject: "filter drier", deSubject: "der Filtertrockner", trAnswer: "Sıvı hatti zorunlu — gaz nemi tutar. {ctx_hint} Danfoss DML/DCL standart. Burdaki capacity kompresor capacity uzerinde, gaz tipine uygun olmali.", deAnswer: "An Fluessigleitung Pflicht - haelt Gasfeuchtigkeit. {ctx_hint} Danfoss DML/DCL Standard. Kapazitaet ueber Verdichter, gas-passend." },
  { id: "sight_glass", trSubject: "gozetleme camı (sight glass)", deSubject: "das Schauglas", trAnswer: "Sıvı hatti, drier ciktisinda. {ctx_hint} Kabarcık varsa undercharge ya da liquid restriction. Renk degisirse moisture (yesilden sarıya doner).", deAnswer: "An Fluessigleitung, hinter dem Trockner. {ctx_hint} Blasen = Unterfuellung oder Restriktion. Farbwechsel = Feuchtigkeit (gruen->gelb)." },
  { id: "hp_lp_pressostat", trSubject: "HP/LP presostat", deSubject: "der HP/LP-Druckschalter", trAnswer: "HP cut-out R290'da 27 bar, R404A da 28 bar. {ctx_hint} LP cut-in oda sicakligina gore (-25C dondurucu icin 0.7 bar). Manuel reset HP, otomatik reset LP.", deAnswer: "HP-Cut-out: R290 27 bar, R404A 28 bar. {ctx_hint} LP-Cut-in nach Raumtemperatur (-25C TK = 0.7 bar). HP manuell, LP automatisch zuruecksetzbar." },
  { id: "oil_separator", trSubject: "yag ayirici (oil separator)", deSubject: "der Oelabscheider", trAnswer: "Uzun boru/yuksek sicaklik farki olan sistemlerde gerek. {ctx_hint} Helical veya impingement tip. Yag donus kompresore garanti edilir.", deAnswer: "Bei langen Leitungen/grossem Temperaturdelta noetig. {ctx_hint} Helical- oder Prall-Typ. Garantierte Oelrueckfuehrung." },
  { id: "liquid_receiver", trSubject: "sıvı tankı (receiver)", deSubject: "der Fluessigkeitssammler", trAnswer: "Sıvı sarj rezervi — TXV oncesinde. {ctx_hint} Hacim: sistem sarjinin %80'i (servis sirasinda gaz cekildiginde tutar).", deAnswer: "Reserve fuer Fluessigladung - vor TXV. {ctx_hint} Volumen: 80% der Systemcharge (haelt Gas bei Service)." },
  { id: "service_valve", trSubject: "servis valfi", deSubject: "das Serviceventil", trAnswer: "Kompresor ust ve alt (suction/discharge). {ctx_hint} Sanhua/Castel olcusu kompresor olcusune uygun. Sarj ve gaz testi icin sart.", deAnswer: "Verdichterober/-unterseite (Saug/Druck). {ctx_hint} Sanhua/Castel passend zur Verdichtergroesse. Pflicht fuer Charge und Gastest." },
  { id: "discharge_temp_sensor", trSubject: "discharge sicaklik sensoru", deSubject: "der Druckgastemperaturfuehler", trAnswer: "Kompresor cikisinda. {ctx_hint} 100C uzeri alarm. Yuksek discharge = az gaz ya da kondenser tikali.", deAnswer: "Am Verdichteraustritt. {ctx_hint} Alarm bei 100C+. Hohe Druckgastemperatur = wenig Gas oder Verfluessiger verstopft." },
  { id: "suction_temp_sensor", trSubject: "suction sicaklik sensoru", deSubject: "der Sauggastemperaturfuehler", trAnswer: "Evaporator cikisinda, TXV pozisyonunu ayarlar. {ctx_hint} Superheat hesabi: suction temp - evap dewpoint. Hedef 6-10K.", deAnswer: "Am Verdampferaustritt, fuer TXV-Stellung. {ctx_hint} Ueberhitzung = Saug-Temp - Verdampfer-Taupunkt. Ziel 6-10K." },
  { id: "ambient_temp_sensor", trSubject: "ortam sicaklik sensoru", deSubject: "der Umgebungstemperaturfuehler", trAnswer: "Oda icinde, kapidan/havalandirma onunden uzakta. {ctx_hint} Termostat besler. NTC tipi yaygin (10K Carel, 5K Eliwell).", deAnswer: "Im Raum, fern von Tuer/Lueftung. {ctx_hint} Versorgt Thermostat. NTC verbreitet (10K Carel, 5K Eliwell)." },
  { id: "humidity_control", trSubject: "nem kontrolu", deSubject: "die Feuchteregelung", trAnswer: "Sebze/cicek odasinda kritik. {ctx_hint} Defrost sıkligini azaltmak veya ek nemlendirici. Hedef %85-95 RH.", deAnswer: "Bei Gemuese/Blumen kritisch. {ctx_hint} Abtauhaeufigkeit reduzieren oder Befeuchter. Ziel 85-95% RH." },
  { id: "co2_application", trSubject: "CO2 (R744) sistem uygulamasi", deSubject: "die CO2 (R744)-Anwendung", trAnswer: "Buyuk supermarket/cash&carry icin standart artiyor. {ctx_hint} Booster veya transcritical sistem. Yuksek basinc (90-110 bar) ozel ekipman ister.", deAnswer: "Standard fuer grosse Supermaerkte/Cash&Carry. {ctx_hint} Booster oder transkritisch. Hohe Druecke (90-110 bar) brauchen Spezialequipment." },
  { id: "rack_system_design", trSubject: "rack sistem tasarimi", deSubject: "das Rack-Systemdesign", trAnswer: "Birden cok evaporator tek kondenserle paylas. {ctx_hint} 2-4 kompresor parallel + ortak suction header. Variable speed lead compressor enerji avantaji.", deAnswer: "Mehrere Verdampfer teilen einen Verfluessiger. {ctx_hint} 2-4 Verdichter parallel + gemeinsamer Saug-Header. Drehzahlgeregelter Lead-Verdichter spart Energie." },
  { id: "split_vs_monoblock", trSubject: "split mi monoblock mu", deSubject: "Split oder Monoblock", trAnswer: "10m3 alti monoblock daha pratik. {ctx_hint} Buyuk veya cok-oda split. Monoblock saha tek paket (Frigocraft EA serisi).", deAnswer: "Unter 10m3 ist Monoblock praktischer. {ctx_hint} Gross/Mehrraum: Split. Monoblock = Einzelpaket (Frigocraft EA-Serie)." },
  { id: "vrf_for_coldroom", trSubject: "VRF sistem ile soguk oda", deSubject: "VRF-System fuer Kuehlraum", trAnswer: "Sicak odalar (chiller) icin uygun degil normalde — buyuk soguk yuk. {ctx_hint} Systemair SYSVRF serisi orta-buyuk uygulamada VRF + soguk oda kombinasyonu sunar.", deAnswer: "Fuer Chiller normal nicht geeignet - hohe Kaeltelast. {ctx_hint} Systemair SYSVRF-Serie kombiniert VRF mit Kuehlraum bei mittleren Anlagen." },
  { id: "shock_freezer_design", trSubject: "sok dondurucu tasarimi", deSubject: "die Schockfroster-Auslegung", trAnswer: "-30C ile -40C arasi. {ctx_hint} Yuksek hava hizi (4-6 m/s), kalin lamel acikligi (8-12mm). Tipik 90 dk'da +5C urunu -18C'ye dondurur.", deAnswer: "-30C bis -40C. {ctx_hint} Hohe Luftgeschwindigkeit (4-6 m/s), grosser Lamellenabstand (8-12mm). Typisch 90 min von +5C auf -18C." },
  { id: "blast_chiller_design", trSubject: "hizli sogutucu (blast chiller)", deSubject: "die Schnellkuehler-Auslegung", trAnswer: "+90C urunu 90 dk'da +3C'ye sogutur (HACCP gereklilik). {ctx_hint} Yuksek kapasite evaporator + capacity-controlled kompresor. Genelde 0C civarinda calisir.", deAnswer: "Kuehlt +90C in 90 min auf +3C (HACCP-Pflicht). {ctx_hint} Hohe Verdampferkapazitaet + kapazitaetsgeregelter Verdichter. Arbeitet meist um 0C." },
  { id: "low_load_design", trSubject: "dusuk yuk tasarimi", deSubject: "Auslegung bei niedriger Last", trAnswer: "Kismi-yuk verimi icin variable-speed kompresor (Embraco/Tecumseh inverter). {ctx_hint} EXV ile birlikte. Min %30 yukte stabil calisir.", deAnswer: "Fuer Teillast Drehzahlregelter Verdichter (Embraco/Tecumseh Inverter). {ctx_hint} Mit EXV. Stabil ab 30% Last." },
  { id: "heat_recovery", trSubject: "atik isi geri kazanim", deSubject: "die Abwaermerueckgewinnung", trAnswer: "Discharge gazindan ekstra desuperheater + plate-HX ile sicak su uretimi. {ctx_hint} Buyuk sistemde mutfak su isitmasi icin %15-20 enerji geri donus.", deAnswer: "Aus Druckgas mit Desuperheater + Plattenwaermetauscher Warmwasser. {ctx_hint} Bei grossen Anlagen 15-20% Energierueckgewinn fuer Kuechenwasser." },
  { id: "remote_monitoring", trSubject: "uzaktan izleme", deSubject: "die Fernueberwachung", trAnswer: "Carel boss-mini, Eliwell TelevisAir, Danfoss AK-SM. {ctx_hint} Web/App ile sicaklik+kapı+alarm log. HACCP raporu otomatik export. Tipik €800-1500 ilave.", deAnswer: "Carel boss-mini, Eliwell TelevisAir, Danfoss AK-SM. {ctx_hint} Web/App: Temperatur+Tuer+Alarm-Log. HACCP-Bericht auto-Export. Typisch 800-1500 EUR Aufpreis." },
  { id: "energy_audit", trSubject: "enerji denetimi", deSubject: "das Energieaudit", trAnswer: "kWh/m3.gun olcumu yap. {ctx_hint} Pozitif oda 1.5-3, dondurucu 5-10 normal. Defrost ve fan calisma suresi en buyuk fark.", deAnswer: "kWh/m3.Tag messen. {ctx_hint} Plus 1.5-3, TK 5-10 normal. Abtauung und Lueferzeit machen den groessten Unterschied." },
  { id: "ce_compliance", trSubject: "CE/EN378 uyumluluk", deSubject: "CE/EN378-Konformitaet", trAnswer: "EN378-1: tasarim, gaz miktari, ATEX. {ctx_hint} Risk degerlendirmesi zorunlu. R290 ile yas zonelar veya buyuk sarj icin ek tedbir.", deAnswer: "EN378-1: Design, Gasmenge, ATEX. {ctx_hint} Risikoanalyse Pflicht. R290 mit grosser Charge braucht Zusatzmassnahmen." },
  { id: "f_gas_compliance", trSubject: "F-Gas uyumluluk", deSubject: "F-Gas-Konformitaet", trAnswer: "EU 517/2014 — 5+ ton CO2eq sistem yillik kacak testi. {ctx_hint} Sertifikali teknisyen gerekli. R404A 2025 sonrasi yeni proje yasak.", deAnswer: "EU 517/2014 - ab 5 t CO2eq jaehrliche Lecksuche. {ctx_hint} Zertifizierter Techniker noetig. R404A nach 2025 fuer Neuanlagen verboten." },
  { id: "haccp_temperature", trSubject: "HACCP sicaklik kayit", deSubject: "die HACCP-Temperaturaufzeichnung", trAnswer: "EU 178/2002 — gida soguk-zincir. {ctx_hint} Sicaklik 15dk araliklarla, 1 yıl saklanir. Otomatik datalogger zorunlu (manuel kayitla denetim gecmez).", deAnswer: "EU 178/2002 - Lebensmittel-Kuehlkette. {ctx_hint} Temperatur alle 15 min, 1 Jahr Aufbewahrung. Auto-Datalogger Pflicht." },
  { id: "commissioning_checklist", trSubject: "devreye alma kontrol listesi", deSubject: "die Inbetriebnahme-Checkliste", trAnswer: "Vakum (500 mikron+altinda 30dk), gaz sarji, superheat 6-10K, sub-cool 3-5K, akim olcumu, defrost denemesi. {ctx_hint} Tum sensorler okuma yapiyor mu, alarm tetikleniyor mu kontrol et.", deAnswer: "Vakuum (500 Mikron+ unter 30 min), Gascharge, Ueberhitzung 6-10K, Unterkuehlung 3-5K, Strommessung, Abtautest. {ctx_hint} Sensoren-Lesen, Alarm-Test." },
];

// ---- CONTEXTS (50 adet) ----

const contexts = [
  { id: "small_chiller_2x2x2", trLabel: "2x2x2 +5C kucuk pozitif oda", deLabel: "kleinen 2x2x2 +5C Plus-Raum" },
  { id: "medium_chiller_4x3x3", trLabel: "4x3x3 +5C orta pozitif oda", deLabel: "mittleren 4x3x3 +5C Plus-Raum" },
  { id: "large_chiller_8x5x4", trLabel: "8x5x4 +2C buyuk pozitif depo", deLabel: "grossen 8x5x4 +2C Plus-Lager" },
  { id: "small_freezer_2x2x2", trLabel: "2x2x2 -22C kucuk dondurucu", deLabel: "kleinen 2x2x2 -22C Tiefkuehlraum" },
  { id: "medium_freezer_4x3x3", trLabel: "4x3x3 -22C orta dondurucu", deLabel: "mittleren 4x3x3 -22C Tiefkuehlraum" },
  { id: "large_freezer_8x5x4", trLabel: "8x5x4 -22C buyuk dondurucu", deLabel: "grossen 8x5x4 -22C Tiefkuehlraum" },
  { id: "shock_freezer", trLabel: "sok dondurucu (-35C blast)", deLabel: "Schockfroster (-35C Blast)" },
  { id: "blast_chiller", trLabel: "hizli sogutucu (+3C blast)", deLabel: "Schnellkuehler (+3C Blast)" },
  { id: "meat_room_minus_2", trLabel: "et oda (-2C asılı)", deLabel: "Fleischraum (-2C haengend)" },
  { id: "fish_room_zero", trLabel: "balik oda (0C buz uzeri)", deLabel: "Fischraum (0C auf Eis)" },
  { id: "vegetable_plus_4", trLabel: "sebze odasi (+4C)", deLabel: "Gemueseraum (+4C)" },
  { id: "fruit_chamber_plus_8", trLabel: "meyve odasi (+8C controlled atm)", deLabel: "Obstkammer (+8C kontrollierte Atmosphaere)" },
  { id: "flower_room_plus_2", trLabel: "cicek odasi (+2C yuksek nem)", deLabel: "Blumenraum (+2C hohe Feuchte)" },
  { id: "dairy_room_plus_4", trLabel: "sut odasi (+4C kazaen)", deLabel: "Milchraum (+4C HACCP)" },
  { id: "bakery_proof_room", trLabel: "firin proof odasi (+30C nemli)", deLabel: "Baeckerei-Gaerraum (+30C feucht)" },
  { id: "wine_cellar_plus_12", trLabel: "sarap mahzeni (+12C %75 RH)", deLabel: "Weinkeller (+12C 75% RH)" },
  { id: "pharma_plus_5", trLabel: "ilac deposu (+5C ±1)", deLabel: "Pharma-Lager (+5C ±1)" },
  { id: "lab_freezer_minus_30", trLabel: "lab dondurucu (-30C ultra)", deLabel: "Labor-Tiefkuehl (-30C ultra)" },
  { id: "blood_bank_plus_4", trLabel: "kan bankasi soguk depo (+4C)", deLabel: "Blutbank-Kuehlraum (+4C)" },
  { id: "ice_cream_minus_25", trLabel: "dondurma deposu (-25C)", deLabel: "Eis-Lager (-25C)" },
  { id: "supermarket_plus_3", trLabel: "supermarket arka oda (+3C reach-in)", deLabel: "Supermarkt-Backroom (+3C Reach-in)" },
  { id: "supermarket_freezer", trLabel: "supermarket arka dondurucu (-22C)", deLabel: "Supermarkt-Backroom Tiefkuehl (-22C)" },
  { id: "restaurant_kitchen_walkin", trLabel: "restoran mutfak walk-in (+4C)", deLabel: "Restaurant-Kueche Walk-in (+4C)" },
  { id: "hotel_kitchen_walkin", trLabel: "otel mutfak walk-in (+4C)", deLabel: "Hotel-Kueche Walk-in (+4C)" },
  { id: "container_cold_room", trLabel: "konteyner tipi soguk oda", deLabel: "Container-Kuehlraum" },
  { id: "rooftop_install", trLabel: "cati ustu kondenser kurulum", deLabel: "Dachverfluessiger-Installation" },
  { id: "basement_install", trLabel: "bodrum kurulum (havalandirma kisitli)", deLabel: "Keller-Installation (Lueftung begrenzt)" },
  { id: "outdoor_summer_high_ambient", trLabel: "yaz 40C+ disarda kondenser", deLabel: "Sommer 40C+ Aussen-Verfluessiger" },
  { id: "outdoor_winter_low_ambient", trLabel: "kis -10C disarda kondenser", deLabel: "Winter -10C Aussen-Verfluessiger" },
  { id: "humid_coastal_install", trLabel: "deniz kenari nemli kurulum", deLabel: "kuestennahe feuchte Installation" },
  { id: "dusty_industrial_install", trLabel: "tozlu sanayi kurulum", deLabel: "staubige Industrieinstallation" },
  { id: "long_pipe_run_30m", trLabel: "30m+ uzun boru hatti", deLabel: "lange 30m+ Rohrleitung" },
  { id: "short_pipe_run_5m", trLabel: "5m kisa boru hatti", deLabel: "kurze 5m Rohrleitung" },
  { id: "single_evap_install", trLabel: "tek evaporator kurulum", deLabel: "Einzel-Verdampfer-Installation" },
  { id: "multi_evap_install", trLabel: "coklu evaporator kurulum", deLabel: "Mehrfach-Verdampfer-Installation" },
  { id: "rack_system_install", trLabel: "rack sistemli ortak kondenser", deLabel: "Rack-System mit Sammelverfluessiger" },
  { id: "single_phase_220v", trLabel: "220V tek faz besleme", deLabel: "220V Einphasenversorgung" },
  { id: "three_phase_380v", trLabel: "380V uc faz besleme", deLabel: "380V Dreiphasenversorgung" },
  { id: "high_traffic_door_install", trLabel: "yogun kapı acilmali kurulum", deLabel: "Installation mit Hochfrequenz-Tueroeffnung" },
  { id: "infrequent_use_install", trLabel: "ara-sira acilan duzenli olmayan kullanim", deLabel: "selten geoeffnete unregelmaessige Nutzung" },
  { id: "energy_save_priority", trLabel: "enerji tasarrufu oncelikli proje", deLabel: "Energiespar-priorisiertes Projekt" },
  { id: "first_cost_priority", trLabel: "ilk maliyet oncelikli proje", deLabel: "Erstinvestitions-priorisiertes Projekt" },
  { id: "haccp_pharma_compliance", trLabel: "HACCP/Pharma uyumluluk gereken proje", deLabel: "HACCP/Pharma-konformes Projekt" },
  { id: "atex_compliance_room", trLabel: "ATEX zonu yakini soguk oda", deLabel: "Kuehlraum nahe ATEX-Zone" },
  { id: "monoblock_compact", trLabel: "monoblock kompakt unite (kucuk oda)", deLabel: "Monoblock-Kompakteinheit (kleiner Raum)" },
  { id: "split_classic", trLabel: "klasik split kondenser+evaporator", deLabel: "klassischer Split Verfluessiger+Verdampfer" },
  { id: "retrofit_old_r404a", trLabel: "eski R404A retrofit", deLabel: "alte R404A-Anlage Retrofit" },
  { id: "new_install_r290", trLabel: "yeni R290 kurulum", deLabel: "Neuinstallation mit R290" },
  { id: "after_5_year_overhaul", trLabel: "5 yil sonra revizyon", deLabel: "nach 5 Jahren Generalueberholung" },
  { id: "rental_temporary_install", trLabel: "kiralik gecici kurulum", deLabel: "Miet-/Temporaerinstallation" },
];

// ---- CONTEXT-SPECIFIC HINT (each context gives 1-line nudge) ----

function ctxHint(ctxId, famId) {
  // Bazı tipik bağlam ipuçları — generic bir cümle kalıbi
  const map = {
    small_chiller_2x2x2: "Kucuk hacimde dahi defrost donguleri kacirilmamali.",
    medium_chiller_4x3x3: "Orta hacim icin standart bant uygulanir.",
    large_chiller_8x5x4: "Buyuk depoda hava sirkulasyonu kritik — coklu fan dusunulmeli.",
    small_freezer_2x2x2: "Kucuk dondurucu da bile kapı acilim su buz birikimini hizlandirir.",
    medium_freezer_4x3x3: "Defrost cycle 6 saatte bir, 25 dk tipik.",
    large_freezer_8x5x4: "Buyuk dondurucu icin coklu evaporator + 2-stage kompresor mantikli.",
    shock_freezer: "Hava hizi 5 m/s altinda kalmamali.",
    blast_chiller: "Discharge tarafi cok sicakta calisacagi icin desuperheater kuvvetli olmali.",
    meat_room_minus_2: "Et asma kancalari evaporator hava akisini bozmamali.",
    fish_room_zero: "Buz drenaji icin kanaletalı zemin tercih.",
    vegetable_plus_4: "%85+ nem icin defrost siklik dusurulur.",
    fruit_chamber_plus_8: "CA atmosferi icin O2/CO2 sensorleri ek planlanir.",
    flower_room_plus_2: "Yuksek nem koruma — hassas defrost.",
    dairy_room_plus_4: "Sut isi yuk dalgalanmasi cok — kapasite kontrolu kritik.",
    bakery_proof_room: "Yuksek nem + sicaklik birlikte — evaporator gibi degil nemlendirici/heater karisik.",
    wine_cellar_plus_12: "Sicaklik salinim az olmali (±1C) — variable-speed avantaji.",
    pharma_plus_5: "GxP loglama + ±1C dar tolerans + alarm overlap.",
    lab_freezer_minus_30: "Iki-stage cascade veya direct-expansion seclim.",
    blood_bank_plus_4: "Power-cut alarm + UPS zorunlu, gida zincirinin uzeri standart.",
    ice_cream_minus_25: "Buz/yapis kalitesi icin sabit -25C.",
    supermarket_plus_3: "Reach-in coklu kapı acilim — air curtain veya stripcurtain dusun.",
    supermarket_freezer: "Otomatik defrost gece, sicak gaz tipi.",
    restaurant_kitchen_walkin: "Kapi acilim sıkligi yuksek — hava perdesi gerek.",
    hotel_kitchen_walkin: "Multi-shift kullanim — dayaniklı menteseli kapı.",
    container_cold_room: "Standart 20ft veya 40ft konteynere uyarlanmis paket.",
    rooftop_install: "Ruzgar koruma + kondenser ayagi yuksek tutulmali (su birikimi).",
    basement_install: "Kondenser hava cekisi sinirli — split tip + duct.",
    outdoor_summer_high_ambient: "Kondenser bir boy buyuk + variable-speed fan.",
    outdoor_winter_low_ambient: "Kondenser bypass veya fan-cycling head pressure control.",
    humid_coastal_install: "Tuzlu hava korozyonu — kaplama tipi (ePoxy/PolyEster).",
    dusty_industrial_install: "Kondenser temizlik aralik kisaltilmali.",
    long_pipe_run_30m: "Yag donus icin riser veya double-suction loop.",
    short_pipe_run_5m: "Standart hesap yeterli, ekstra onlem yok.",
    single_evap_install: "Tek evaporator — kontrol basit.",
    multi_evap_install: "EPRV/EEV ile coklu evaporator dengeli kontrol.",
    rack_system_install: "Lead/lag kompresor sirasi + ortak suction header.",
    single_phase_220v: "1HP altina kadar uygun — uzeri uc faz.",
    three_phase_380v: "Standart endustriyel besleme.",
    high_traffic_door_install: "Hava perdesi + IRIS auto-close zorunlu.",
    infrequent_use_install: "Standby modu olabilir — kompresor sik baslatma onlemi.",
    energy_save_priority: "EC fan + variable-speed kompresor + heat-recovery dusun.",
    first_cost_priority: "Standart AC fan + on/off kompresor — minimal control.",
    haccp_pharma_compliance: "Datalogger + redundant sensor + alarm overlap.",
    atex_compliance_room: "ATEX-onayli ekipman + R290 sarj limit dusur.",
    monoblock_compact: "Tek paket — boru olcusu/diziimi yok.",
    split_classic: "Kondenser uzakta — yag donus dikkat.",
    retrofit_old_r404a: "Yag tipi degistirilmesi gerekebilir (POE).",
    new_install_r290: "ATEX kompresor + risk degerlendirmesi.",
    after_5_year_overhaul: "TXV temizlik, drier degisim, gaz sarji yeniden.",
    rental_temporary_install: "Hizli devreye alma + hizli sokum tasarimi.",
  };
  return map[ctxId] || "Standart pratiklere uy, kataloga bak.";
}

// ---- ENTRY GENERATION ----

function buildKeywords(ctx, fam) {
  const kw = new Set();
  const tokens = (s) => String(s || "").toLowerCase().replace(/[^a-zaöüçşığ0-9 ]/gi, " ").split(/\s+/).filter((t) => t.length >= 3);
  tokens(ctx.trLabel).forEach((t) => kw.add(t));
  tokens(ctx.deLabel).forEach((t) => kw.add(t));
  tokens(fam.trSubject).forEach((t) => kw.add(t));
  tokens(fam.deSubject).forEach((t) => kw.add(t));
  return [...kw].slice(0, 20);
}

function generateEntries() {
  const entries = [];
  let nextId = 1;

  for (const ctx of contexts) {
    const hint = ctxHint(ctx.id);
    for (const fam of designFamilies) {
      const keywords = buildKeywords(ctx, fam);

      for (let t = 0; t < trTemplates.length; t += 1) {
        const trQ = trTemplates[t](ctx, fam) + " ?";
        const deQ = deTemplates[t](ctx, fam) + " ?";
        const trA = fam.trAnswer.replace("{ctx_hint}", hint);
        const deA = fam.deAnswer.replace("{ctx_hint}", hint);

        entries.push({
          id: `coldroom_design_${ctx.id}_${fam.id}_t${t + 1}`,
          family_id: fam.id,
          context_id: ctx.id,
          keywords,
          tr_subject: trQ,
          de_subject: deQ,
          tr_answer: trA,
          de_answer: deA,
        });
        nextId += 1;
      }
    }
  }
  return entries;
}

function main() {
  const entries = generateEntries();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(entries));
  fs.writeFileSync(STATIC_PATH, JSON.stringify(entries));

  const summary = {
    source_summary: SOURCE_SUMMARY,
    contexts_count: contexts.length,
    families_count: designFamilies.length,
    templates_count: trTemplates.length,
    total_entries: entries.length,
    expected: contexts.length * designFamilies.length * trTemplates.length,
    file_size_mb: (fs.statSync(OUTPUT_PATH).size / (1024 * 1024)).toFixed(2),
    generated_at: new Date().toISOString(),
  };
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  console.log("=== DRC MAN Coldroom Design 50K — Üretim Tamam ===");
  console.log(`  Contexts             : ${contexts.length}`);
  console.log(`  Design families      : ${designFamilies.length}`);
  console.log(`  Templates / language : ${trTemplates.length}`);
  console.log(`  Toplam entry         : ${entries.length}`);
  console.log(`  Beklenen             : ${summary.expected}`);
  console.log(`  Dosya boyutu         : ${summary.file_size_mb} MB`);
  console.log(`  Çıktı                : ${OUTPUT_PATH}`);
  console.log(`  Static kopya         : ${STATIC_PATH}`);
}

main();
