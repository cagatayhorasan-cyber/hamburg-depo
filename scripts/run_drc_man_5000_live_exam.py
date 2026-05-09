#!/usr/bin/env python3
"""
DRC MAN — 5000 sorulu canlı sınav.
Müşteri (Yılmaz) tipi sorular: ürün, fiyat, soğuk oda, teknik.
Çıktı: Excel rapor (soru/cevap/skor/durum/hata) + JSON.
"""
import json
import random
import sys
import time
import re
import subprocess
import os
import tempfile
from pathlib import Path
from collections import defaultdict, Counter

SCRIPT_DIR = Path(__file__).parent
random.seed(2026509)
os.chdir('/Users/anilakbas/Desktop/Hamburg depo stok programı ')

sys.path.insert(0, str(SCRIPT_DIR))
from drc_man_bridge import _normalize_text, _tokenize  # noqa

# ════════ Items ════════
print('Items yükleniyor...')
node_dump = """
const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8').split('\\n').filter(l=>l.includes('=')).reduce((a,l)=>{const [k,...v]=l.split('=');a[k]=v.join('=').replace(/^"|"$/g,'');return a;},{});
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await pool.query(`
    WITH stock AS (SELECT m.item_id, SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END)::numeric AS qty FROM movements m GROUP BY m.item_id)
    SELECT i.id, i.name, i.brand, i.category, COALESCE(i.default_price,0)::numeric AS def, COALESCE(i.sale_price,0)::numeric AS sale, COALESCE(i.list_price,0)::numeric AS list, COALESCE(s.qty,0)::numeric AS stock
    FROM items i LEFT JOIN stock s ON s.item_id=i.id WHERE i.is_active=true ORDER BY i.id
  `);
  console.log(JSON.stringify(r.rows));
  await pool.end();
})();
"""
with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, dir='.') as f:
    f.write(node_dump); tmp = f.name
items = json.loads(subprocess.run(['node', tmp], capture_output=True, text=True).stdout)
os.unlink(tmp)
print(f'  Aktif ürün: {len(items)}')

# ════════ FAQ ════════
print('FAQ yükleniyor...')
faq = []
for fn in ['drc_man_coldroom_pricing_faq.json','drc_man_coldroom_expert_faq.json',
           'drc_man_all_products_faq.part1.json','drc_man_all_products_faq.part2.json',
           'drc_man_stock_technical_faq.json','drc_man_malzeme_vs_ustalik_faq.json',
           'drc_man_troubleshooting_faq.json','drc_man_refrigeration_faq.json',
           'drc_man_pt_superheat_faq.json','drc_man_gases_faq.json',
           'drc_man_master_components_faq.json','drc_man_master_field_faq.json']:
    p = SCRIPT_DIR / fn
    if p.exists(): faq.extend(json.load(open(p, encoding='utf-8')))
print(f'  FAQ Q&A: {len(faq)}')

print('Index hazırlanıyor (token set)...')
faq_tokens = []
for entry in faq:
    txt = f"{entry.get('tr_question','')} {entry.get('tr_answer','')[:500]}"
    faq_tokens.append((set(_tokenize(txt)), entry))

def find_best(q):
    q_tok = set(_tokenize(q))
    if not q_tok: return None, 0
    best, best_s = None, 0
    for tok_set, entry in faq_tokens:
        if not tok_set: continue
        common = q_tok & tok_set
        if not common: continue
        s = len(common) / (len(q_tok) + len(tok_set) - len(common))
        if s > best_s: best_s = s; best = entry
    return best, best_s


# ════════ 5000 SORU ÜRET ════════
print('\n5000 soru üretiliyor...')
questions = []

# A) 2500 ürün-spesifik
PRODUCT_PATTERNS = [
    "{name} stokta var mı?",
    "{name} fiyatı nedir?",
    "{name} kaç adet var?",
    "{brand} {name} hakkında bilgi ver",
    "{name} ne kadar?",
    "{brand} {name} satıyor musunuz?",
    "Bana {name} bul",
    "{name} stoğunuz?",
    "{brand} ürünlerinden {name} var mı?",
    "{name} kaç euro?",
]
sample = random.choices(items, k=2500)
for it in sample:
    name = (it.get('name') or '')[:60]
    brand = (it.get('brand') or '').strip() or 'DRC'
    pattern = random.choice(PRODUCT_PATTERNS)
    questions.append({
        "q": pattern.format(name=name, brand=brand),
        "expect_id": it['id'],
        "expect_brand": brand.lower(),
        "expect_name": name.lower(),
        "expect_sale": float(it['sale']),
        "expect_stock": float(it['stock']),
        "type": "product",
    })

# B) 1500 teknik / soğuk oda uzmanlık
TECH_QUESTIONS = [
    "soğuk odam soğutmuyor ne yapmalıyım",
    "kompresör çalışmıyor nereden başlayayım",
    "evaporatör buz tutuyor sürekli",
    "yüksek basınç alarmı var",
    "düşük basınç alarmı veriyor",
    "gaz kaçağı nasıl bulabilirim",
    "kompresörden tık-tık ses geliyor",
    "yağ basıncı düşük neden",
    "donuk oda için kaç mm panel gerekir",
    "pozitif oda için panel kalınlığı",
    "PIR ve PUR panel arasındaki fark",
    "TXV ile kapiler boru farkı",
    "termostatik genleşme valfi nasıl çalışır",
    "solenoid valf nereye konur",
    "filtre drier ne için kullanılır",
    "sight glass ne anlama gelir",
    "sight glass sarı oldu",
    "Dixell kontrolör ayarları",
    "Carel ir33 nasıl programlanır",
    "DCB100 kontrol cihazı özellikleri",
    "presostat KP1 nasıl ayarlanır",
    "MP54 yağ basınç şalteri",
    "R404A için tipik basınç değerleri",
    "R134a hangi sıcaklıkta çalışır",
    "R290 propan ne kadar şarj edilebilir",
    "R448A ve R449A retrofit ne demek",
    "R744 CO2 sistemi nasıl",
    "R1234ze yeni nesil gaz",
    "POE yağ neden kullanılır",
    "mineral yağ ile POE karıştırılır mı",
    "vakum prosedürü nedir",
    "triple evacuation nasıl",
    "vakum 500 mikrona neden inmiyor",
    "şarj prosedürü R404A",
    "likit faz mı gaz faz mı şarj",
    "burnout sonrası temizlik",
    "burnout drier nedir",
    "asit testi nasıl yapılır",
    "kompresör short cycling sebep",
    "compression ratio donuk oda için",
    "pump down devresi nasıl çalışır",
    "hot gas defrost avantajları",
    "elektrikli defrost vs sıcak gaz",
    "defrost frekansı ne olmalı",
    "defrost timer ayarı",
    "drip off süresi ne olmalı",
    "evaporatör fan motoru arızası",
    "kondenser fan motoru çalışmıyor",
    "hisense klima dış ünite",
    "scroll kompresör vs hermetik",
    "hermetik vs yarı hermetik fark",
    "Bitzer 4FES kompresör özellikleri",
    "Frascold A2-9 motor gücü",
    "Dorin H 5000 CS",
    "Refcomp scroll seçimi",
    "Cubigel kompresör R134a",
    "Embraco NEU6220GK voltaj",
    "Tecumseh CAJ 2464 Z",
    "Sanhua DHF solenoid",
    "Sporlan TXV seçimi",
    "Castel 1064 valf",
    "Frigocraft kondenser kapasitesi",
    "Ottocool VRF bakır boru",
    "soğuk oda kapısı conta yenileme",
    "menteşeli kapı ayarı",
    "sürgülü kapı kanal merkezleme",
    "kapı rezistansı çalışmıyor",
    "kapı switch arızası",
    "PVC perde çeşitleri",
    "soğuk oda zemin yalıtımı",
    "anti-frost heating ne için",
    "ETS ACSETS PZ100 nedir",
    "ETS PD120 dış köşe profili",
    "MESPAN sandviç panel ölçüleri",
    "kondenser temizliği nasıl yapılır",
    "evaporatör temizliği prosedür",
    "yağ kontrolü ne sıklıkta",
    "süzgeç temizliği",
    "drenaj ısıtıcı kablo",
    "drenaj sifonu ne için",
    "kondens pompası seçimi",
    "Siccom Eco Line",
    "Sfa Sanicondens Pro",
    "GVN likit tankı boyutları",
    "Buzyapsan BYS SH60 evap",
    "Günay GNKY 750",
    "Damla GMC-SD14",
    "Alkatherm kondenser bataryası",
    "Weiguang fan motoru çapı",
    "ebm-papst EC fan",
    "Ziehl-Abegg fan",
    "soğuk odada nem düşük",
    "ürünler kuruyor neden",
    "humidifier önerisi",
    "RH yüksek olunca ne olur",
    "delta T düşük tutmak",
    "evaporatör superheat ayarı",
    "TXV bulb yerleşimi",
    "subcooling değeri",
    "sight glass'ta köpük var",
    "sistem aşırı şarj belirtileri",
    "sistem undercharge belirtisi",
    "compressor head pressure yüksek",
    "non-condensables nedir",
    "vakum kaçağı tespiti",
    "azot basınç testi",
    "kompresör pull-down süresi",
    "soğuk oda enerji verimliliği",
    "EER COP nedir",
    "GWP nedir F-gaz",
    "ozon delta P hesabı",
    "kapasite control unloader",
    "VFD invertörlü kompresör",
    "EC fan vs AC fan",
    "ısı pompası vs soğutma sistemi",
    "split unit vs paket kondenser",
    "monoblok evaporatör nedir",
    "şok soğuk oda tasarımı",
    "blast freezer kapasitesi",
    "soğuk hava perdesi enerji",
    "loading dock seal",
    "soğuk zincir sürdürülebilirlik",
    "HACCP soğutma kayıt",
    "alarm logu kontrolü",
    "gaz şarj kayıt defterleri",
    "F-gaz sertifikası gereklilikleri",
    "CO2 sistem yüksek basınç",
    "kademeli soğutma R744",
    "kaskada sistem tasarımı",
    "MT vs LT soğutma",
    "supermarket reyon dolap",
    "et soğutma odası -2 derece",
    "sebze soğuk oda nem yüksek",
    "balık soğutma sistemleri",
    "süt ürünleri pozitif oda",
    "dondurulmuş gıda -25",
    "ilaç saklama soğuk oda",
    "kan ve doku saklama",
    "etilen üreten meyve sebze",
    "muz soğuk oda 13 derece",
    "döküm soğutma chiller",
    "su soğutmalı kondenser",
    "kuru soğutucu dry cooler",
    "evaporatif kondenser",
    "Vermek istemiyorsan reverse cycle",
    "kompresör seçim nominal kapasite",
    "evaporatör DT kontrolü",
    "kondenser TC değeri",
    "pressure equalization start",
    "crankcase heater ne için",
    "oil separator yağ ayrıştırıcı",
    "high stage compressor",
    "low stage compressor",
    "subcooler kullanımı",
    "economizer port",
    "liquid line solenoid",
    "discharge line accumulator",
    "suction filter eleme",
    "yağ pompası kompresör",
    "shaft seal kompresör",
    "valve plate yarı hermetik",
    "rotor stator motor sargı",
    "compressor wiring shema",
    "thermal protection klixon",
    "PTC start relay",
    "kapasitör mikrofarad ölçüm",
    "motor koruma kontaktör seçimi",
    "kontaktör size LC1D",
    "termik röle ayarı",
    "ana sigorta seçimi",
    "diferansiyel şalter 30mA",
    "topraklama soğuk oda",
    "panel bara seçimi",
    "kontrol gerilimi 24V DC",
    "PLC soğuk oda otomasyon",
    "Modbus RS485 haberleşme",
    "BMS bağlantı",
    "uzaktan izleme alarm SMS",
    "elektrik panosu IP65",
    "soğuk oda aydınlatma LED",
    "sıcaklık prob seçimi PT100 NTC",
    "prob kalibrasyonu",
    "data logger sıcaklık kayıt",
    "thermograph kağıt",
    "mahkeme sıcaklık kanıt",
    "ECU electronic control unit",
    "ECC AVL chiller monitoring",
    "Carel pCO5 program",
    "Honeywell DCS sistem",
    "soğutma çevriminde vana",
    "EVR Danfoss açık tutma",
    "manuel reset ne zaman",
    "auto reset düşük basınç",
    "differential ne kadar",
    "fan kontrolü FC1",
    "ısıtıcı kablo besleme",
    "elektrikli rezistans kontrol",
    "kapı switch microswitch",
    "alarm zili sesli",
    "buzzer sıcaklık alarmı",
    "PVC drenaj boru",
    "esnek bağlantı vibrationcanceler",
    "bakır boru dirsek lehim",
    "bakır boru çapı seçimi",
    "izolasyon kalınlığı 19mm",
    "Armaflex Aeroflex K-Flex",
    "kapalı hücreli kauçuk yalıtım",
    "boru izolasyon yapışkanı",
    "self adhesive izolasyon bant",
    "schroeder valf kapağı",
    "flare bağlantı 1/4",
    "rotalock kompresör flange",
    "service port seçimi",
    "manifold gauges digital",
    "vakum pompası 2-stage",
    "Value VE 115N özellikleri",
    "Wipcool vakum pompası",
    "leak detector elektronik",
    "Inficon Bacharach Cps",
    "UV boya leak",
    "azot tüpü 10L",
    "regülatör basınç düşürücü",
    "lehim seti oksi-asetilen",
    "silver brazing rod",
    "silfos bakır kaynak",
    "hidrolik test pompası",
    "boru kesme makinesi",
    "boru çapaklama deburring",
    "swaging tool bakır",
    "flaring tool 45 derece",
    "açıkağız anahtar ferro",
    "torque tightening değeri",
    "service valve ayarı",
    "pressure relief valve",
    "burst disc emergency",
    "low pressure receiver",
    "high pressure receiver",
    "yağ filtreleme system",
    "filtration micron",
    "yağ örnekleme test",
    "lab analiz Errecom",
    "moisture indicator",
    "zeolite molecular sieve",
    "alumina drier",
    "burnout drier EHB EHA",
    "fortunately UV lamp",
    "TIF tracer leak",
    "halide torch lamp",
    "elektronik ölçüm doğrulama",
    "kalibrasyon sertifikası",
]
# 1500 / 250 = 6 tekrar
all_tech = TECH_QUESTIONS * 6
random.shuffle(all_tech)
for q in all_tech[:1500]:
    questions.append({"q": q, "expect_id": None, "type": "tech"})

# C) 500 soğuk oda hesaplama (boyut + sıcaklık)
SIZES = [(3,3,2.5),(3,3,3),(4,3,2.5),(4,3,3),(4,4,3),(5,3,3),(5,4,3),(5,4,3.5),(6,4,3),(6,5,3),(8,5,3),(8,6,3),(10,6,3),(10,8,3.5),(12,8,3.5)]
TEMPS = ['+4°C','-18°C','0°C','+2°C','-25°C']
for _ in range(500):
    w,d,h = random.choice(SIZES); t = random.choice(TEMPS)
    patterns = [
        f"{w}x{d}x{h} metre {t} oda için kaç HP",
        f"{w}*{d}*{h} {t} soğuk oda fiyatı",
        f"{w}×{d}×{h} m {t} maliyet",
        f"{w} kere {d} kere {h} metre {t} grup",
        f"oda boyutu {w}x{d}x{h} {t} ne kadar",
    ]
    questions.append({"q": random.choice(patterns), "expect_id": None, "type": "calc"})

# D) 500 karma diagnostic / kategori / marka soruları
MIXED = [
    "Embraco kompresörler katalog",
    "Danfoss kontrol cihazları liste",
    "Bitzer yarı hermetik fiyat",
    "Sanhua valfler ne kadar",
    "Frigocraft kondenser ünitesi",
    "Tecumseh komple grup",
    "ETS soğutma grupları",
    "Buzyapsan evaporatör tipleri",
    "Ottocool izoleli bakır boru",
    "Mespan sandviç panel",
    "Soğuk Oda Aksesuarları kategoride neler",
    "Bakır Borular hangi markalar",
    "Fan Motorları stoklu",
    "Soğuk Oda Kapıları liste",
    "Kondenser Üniteleri stok",
    "Soğutma Grupları markaları",
    "Soğutucu Akışkanlar gaz türleri",
    "Termostatlar dijital",
    "Genleşme Vanaları TXV",
    "Solenoid Vanaları liste",
    "Filtreler Kurutucular drier",
    "Pompalar drenaj",
    "İzolasyonlu Borular kalınlık",
    "Sızdırmazlık silikon köpük",
    "DRC private label SKU",
    "Generic kategorideki ürünler",
]
all_mixed = MIXED * 20
random.shuffle(all_mixed)
for q in all_mixed[:500]:
    questions.append({"q": q, "expect_id": None, "type": "mixed"})

random.shuffle(questions)
TARGET = int(os.environ.get('EXAM_SIZE', '5000'))
# Yetersizse soru havuzu çoğalt
while len(questions) < TARGET:
    questions = questions + list(questions)
random.shuffle(questions)
questions = questions[:TARGET]
print(f'Toplam soru: {len(questions)}')


# ════════ SINAV ÇALIŞTIR ════════
print(f'\n{len(questions)} soru çalıştırılıyor...')
start = time.time()
results = []
correct = partial = wrong = no_match = cost_leaks = 0
by_type = defaultdict(lambda: {'c':0,'p':0,'w':0,'n':0})

for i, q in enumerate(questions):
    if i and i % 500 == 0:
        print(f'  {i}/{len(questions)} (%{i*100//len(questions)})...')
    best, score = find_best(q['q'])
    answer = (best.get('tr_answer') or '') if best else ''
    answer_short = answer[:300].replace('\n', ' / ').replace('\r', '')
    matched_q = (best.get('tr_question') or '')[:120] if best else ''
    qtype = q['type']

    # Cost leak kontrol (KRITIK güvenlik)
    has_leak = bool(re.search(r'cost\s*[:=]?\s*€\s*\d', answer.lower()))
    if has_leak: cost_leaks += 1

    # Skoring
    if best is None:
        wrong += 1; no_match += 1
        status = 'NO_MATCH'; mark = '⛔'
        by_type[qtype]['n'] += 1
        error_type = 'eşleşme_yok'
    else:
        if qtype == 'product':
            id_match = f"db#{q['expect_id']}" in answer.lower() or f"#{q['expect_id']}" in answer
            brand_match = q['expect_brand'] in answer.lower() if q['expect_brand'] else True
            name_first_word = (q['expect_name'].split()[0] if q['expect_name'] else '')[:8]
            name_match = name_first_word in answer.lower() if name_first_word else False
            if id_match:
                correct += 1; status = 'DOĞRU'
                by_type[qtype]['c'] += 1
                error_type = ''
            elif brand_match and name_match:
                partial += 1; status = 'KISMEN'
                by_type[qtype]['p'] += 1
                error_type = 'farklı_ürün_aynı_marka'
            else:
                wrong += 1; status = 'YANLIŞ'
                by_type[qtype]['w'] += 1
                error_type = 'yanlış_ürün' if score > 0 else 'düşük_skor'
        else:
            if score >= 0.04:
                correct += 1; status = 'DOĞRU'
                by_type[qtype]['c'] += 1
                error_type = ''
            elif score >= 0.02:
                partial += 1; status = 'KISMEN'
                by_type[qtype]['p'] += 1
                error_type = 'düşük_alaka'
            else:
                wrong += 1; status = 'YANLIŞ'
                by_type[qtype]['w'] += 1
                error_type = 'çok_düşük_skor'

    results.append({
        'no': i+1,
        'tip': qtype,
        'soru': q['q'],
        'eşleşen_q': matched_q,
        'cevap': answer_short,
        'skor': round(score, 3),
        'durum': status,
        'cost_leak': has_leak,
        'hata_tipi': error_type,
        'beklenen_id': q.get('expect_id'),
        'beklenen_marka': q.get('expect_brand'),
        'beklenen_sale': q.get('expect_sale'),
    })

elapsed = time.time() - start

# ════════ ÖZET ════════
total = len(questions)
score_pct = (correct + 0.5 * partial) / total * 100
grade = "A+" if score_pct >= 95 else "A" if score_pct >= 85 else "B" if score_pct >= 75 else "C" if score_pct >= 65 else "D" if score_pct >= 55 else "F"

print('\n' + '═'*80)
print(f'🎓 5000-SORU CANLI SINAV — SONUÇ')
print('═'*80)
print(f'  ✅ Doğru:     {correct}/{total} (%{100*correct/total:.1f})')
print(f'  🟡 Kısmen:    {partial}/{total} (%{100*partial/total:.1f})')
print(f'  ❌ Yanlış:    {wrong}/{total} (%{100*wrong/total:.1f})')
print(f'  ⛔ Eşleşmeyen: {no_match}')
print(f'  🚨 Cost leak:  {cost_leaks}')
print(f'\n  📈 Puan: %{score_pct:.1f}  →  Not: {grade}')
print(f'  ⚡ Süre: {elapsed:.1f}s ({elapsed/total*1000:.0f} ms/sorgu)')

print('\nTip bazlı:')
for typ, d in by_type.items():
    t = d['c']+d['p']+d['w']
    pct = (d['c']+0.5*d['p'])/t*100 if t else 0
    print(f'  {typ:10}: %{pct:5.1f}  ({d["c"]}D + {d["p"]}K + {d["w"]}Y / {t})')

# JSON kayıt
out_json = SCRIPT_DIR / 'drc_man_5000_exam_result.json'
with open(out_json, 'w', encoding='utf-8') as f:
    json.dump({
        'total': total, 'correct': correct, 'partial': partial, 'wrong': wrong, 'no_match': no_match,
        'cost_leaks': cost_leaks,
        'score_pct': round(score_pct, 1), 'grade': grade,
        'elapsed_seconds': round(elapsed, 1),
        'avg_query_ms': round(elapsed/total*1000, 1),
        'by_type': {k: dict(v) for k,v in by_type.items()},
        'results': results,
    }, f, ensure_ascii=False, indent=2, default=str)
print(f'\n💾 JSON: {out_json}')
print('Excel rapor _generate_5000_excel.py ile üretilecek...')
