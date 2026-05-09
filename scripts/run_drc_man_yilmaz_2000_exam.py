#!/usr/bin/env python3
"""
DRC MAN — 2000 Sorulu Yılmaz Sınavı
Gerçek müşteri (Yılmaz) tarzı sorular: stok, fiyat, teknik, sorun, prosedür.
Sample: 1500 ürün-spesifik (random items) + 500 genel/teknik.
"""
import json
import random
import sys
import time
import re
import subprocess
import os
from pathlib import Path
from collections import defaultdict

SCRIPT_DIR = Path(__file__).parent
random.seed(2026)

# Bridge tokenizer
sys.path.insert(0, str(SCRIPT_DIR))
from drc_man_bridge import _normalize_text, _tokenize  # noqa

# ════════ DB'den ürünleri yükle ════════
os.chdir('/Users/anilakbas/Desktop/Hamburg depo stok programı ')
import tempfile
node_dump = """
const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8').split('\\n').filter(l=>l.includes('=')).reduce((a,l)=>{const [k,...v]=l.split('=');a[k]=v.join('=').replace(/^"|"$/g,'');return a;},{});
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await pool.query(`SELECT id, name, brand, category, COALESCE(default_price,0)::numeric AS def, COALESCE(sale_price,0)::numeric AS sale, COALESCE(list_price,0)::numeric AS list FROM items WHERE is_active=true ORDER BY id`);
  console.log(JSON.stringify(r.rows));
  await pool.end();
})();
"""
with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, dir='.') as f:
    f.write(node_dump); tmp = f.name
items = json.loads(subprocess.run(['node', tmp], capture_output=True, text=True).stdout)
os.unlink(tmp)
print(f'Aktif ürün: {len(items)}')


# ════════ FAQ banks yükle ════════
print('FAQ bankası yükleniyor...')
faq = []
faq_files = [
    'drc_man_coldroom_expert_faq.json',
    'drc_man_all_products_faq.part1.json',
    'drc_man_all_products_faq.part2.json',
    'drc_man_stock_technical_faq.json',
    'drc_man_malzeme_vs_ustalik_faq.json',
]
for fn in faq_files:
    p = SCRIPT_DIR / fn
    if p.exists():
        faq.extend(json.load(open(p, encoding='utf-8')))
print(f'Toplam yüklenen FAQ: {len(faq)} Q&A')

# Index
print('Index hazırlanıyor (token set)...')
faq_tokens = []
for entry in faq:
    txt = f"{entry.get('tr_question','')} {entry.get('tr_answer','')[:500]}"
    faq_tokens.append((set(_tokenize(txt)), entry))

def find_best(question):
    q_tok = set(_tokenize(question))
    if not q_tok: return None, 0
    best_score = 0
    best = None
    for tok_set, entry in faq_tokens:
        if not tok_set:
            continue
        common = q_tok & tok_set
        if not common:
            continue
        score = len(common) / (len(q_tok) + len(tok_set) - len(common))
        if score > best_score:
            best_score = score
            best = entry
    return best, best_score


# ════════ 2000 SORU ÜRET ════════
print('\n2000 müşteri sorusu üretiliyor...')

questions = []

# A) Ürün-spesifik (1500 soru, ~7-8 farklı pattern × 1500/8 ≈ 187 örnek)
PRODUCT_PATTERNS = [
    "{name} stokta var mı?",
    "{name} fiyatı nedir?",
    "{name} kaç adet var?",
    "{brand} {name} hakkında bilgi ver",
    "{name} ne kadar?",
    "{name} satıyor musunuz?",
    "{brand} {name} stoğunuz var mı?",
    "Bana {name} bul",
]

product_sample = random.sample(items, min(1500, len(items)))
for it in product_sample:
    name = (it.get('name') or '')[:60]
    brand = (it.get('brand') or '').strip() or 'DRC'
    pattern = random.choice(PRODUCT_PATTERNS)
    q = pattern.format(name=name, brand=brand)
    questions.append({
        "q": q,
        "expect_id": it['id'],
        "expect_brand": brand.lower(),
        "expect_sale": float(it['sale']),
        "type": "product"
    })

# B) Teknik / soğuk oda uzmanlık (300 soru, 30 farklı kalıp × 10)
TECH_PATTERNS = [
    "soğuk odamda sıcaklık düşmüyor ne yapmalıyım",
    "kompresör çalışmıyor ne kontrol etmeliyim",
    "evaporatörümde aşırı buz birikiyor neden",
    "gaz kaçağını nasıl tespit edebilirim",
    "donuk oda için kaç mm panel gerekir",
    "R404A için ne kadar şarj atmalıyım",
    "TXV ile kapiler arasındaki fark",
    "yüksek basınç alarmı veriyor",
    "kompresörden tık-tık sesi geliyor",
    "soğuk oda kapısı kapanmıyor",
    "5x4x3 metre soğuk oda için kaç HP",
    "vakum prosedürü nasıl",
    "superheat normal değeri",
    "subcooling ne olmalı R404A için",
    "POE yağı ne için",
    "defrost yöntemleri",
    "R290 propan ne kadar şarj edilebilir",
    "hot gas defrost nasıl çalışır",
    "triple evacuation nedir",
    "burnout sonrası temizlik",
    "suction line accumulator ne için",
    "soğuk odada nem düşük ürünler kuruyor",
    "kompresör short cycling nasıl çözülür",
    "fan gürültü kontrolü",
    "panel kalınlığı seçimi",
    "soğuk oda yapı yükü hesabı",
    "kondenser kapasitesi nasıl seçilir",
    "filtre drier neden lazım",
    "sight glass sarı görünüyor",
    "solenoid valf nereye konur",
    "Dixell DCB100 ne işler yapar",
    "yağ basınç şalteri MP54 ne",
    "elektrikli defrost rezistansı boyutu",
    "compression ratio donuk oda için",
    "anti-frost heating zemin altı ne",
    "PVC perde ne kadar enerji tasarrufu sağlar",
    "rezistanslı kapı neden lazım",
    "bakır boru izolasyonu hangi malzeme",
    "ETS PZ100 ne demek",
    "ETS PD120 nereye monte edilir",
    "pump-down devresi nasıl çalışır",
    "soğuk oda kapı switch arıza",
    "gece modu fan düşürme ne fayda",
    "evaporatör tavan tipi mi duvar tipi mi",
    "scroll kompresör neden verimli",
    "hermetik vs yarı-hermetik fark",
    "R448A R449A retrofit ne için",
    "kapasitör start vs run fark",
    "termostat differential ayarı",
    "drenaj sifonu neden lazım",
]
for q in TECH_PATTERNS * 6:  # 50*6 = 300
    questions.append({"q": q, "expect_id": None, "type": "tech"})

# C) Karma kategori sorular (200)
CATEGORY_PATTERNS = [
    "Soğutma Grupları kategorisinde neler var",
    "Kompresörler kategorisinde Embraco markası ne kadar var",
    "Bakır Borular kategorisinde Ottocool ürünleri",
    "Fan Motorları kategorisinde Weiguang",
    "Soğuk Oda Aksesuarları ETS",
    "Kondenser Üniteleri Buzyapsan",
    "Kapılar SLIDETS",
    "Soğutucu Akışkanlar gaz türleri",
    "DRC private label SKU CP-INS",
    "Danfoss kontrol cihazları",
]
for q in CATEGORY_PATTERNS * 20:  # 10*20 = 200
    questions.append({"q": q, "expect_id": None, "type": "category"})

random.shuffle(questions)
questions = questions[:2000]
print(f'Toplam üretilen soru: {len(questions)}')


# ════════ SINAV ÇALIŞTIR ════════
print('\nSınav çalışıyor (2000 sorgu)...')
start = time.time()
correct = 0
partial = 0
wrong = 0
no_match = 0
by_type = defaultdict(lambda: {'c': 0, 'p': 0, 'w': 0, 'n': 0})

for i, q in enumerate(questions):
    if i % 250 == 0 and i > 0:
        print(f'  {i}/{len(questions)} ({(i/len(questions)*100):.0f}%)...')
    best, score = find_best(q['q'])
    if best is None:
        no_match += 1
        wrong += 1
        by_type[q['type']]['n'] += 1
        continue
    answer = (best.get('tr_answer') or '').lower()
    qtype = q['type']

    if qtype == 'product':
        # Beklenen DB# cevapta mı, marka mı yansıdı
        id_match = f"db#{q['expect_id']}" in answer or f"#{q['expect_id']}" in answer
        brand_match = q['expect_brand'] in answer if q['expect_brand'] else True
        if id_match and brand_match:
            correct += 1; by_type[qtype]['c'] += 1
        elif id_match or brand_match:
            partial += 1; by_type[qtype]['p'] += 1
        else:
            wrong += 1; by_type[qtype]['w'] += 1
    else:
        # Teknik/kategori → score yeterince yüksek mi?
        if score >= 0.05:
            correct += 1; by_type[qtype]['c'] += 1
        elif score >= 0.02:
            partial += 1; by_type[qtype]['p'] += 1
        else:
            wrong += 1; by_type[qtype]['w'] += 1

elapsed = time.time() - start

# ════════ ÖZET ════════
total = len(questions)
score_pct = (correct + 0.5 * partial) / total * 100
grade = "A+" if score_pct >= 95 else "A" if score_pct >= 85 else "B" if score_pct >= 75 else "C" if score_pct >= 65 else "D" if score_pct >= 55 else "F"
print('\n' + '═'*80)
print('🎓 YILMAZ 2000-SORU SINAVI — SONUÇ')
print('═'*80)
print(f'  ✅ Tam Doğru: {correct}/{total} (%{100*correct/total:.1f})')
print(f'  🟡 Kısmen:    {partial}/{total} (%{100*partial/total:.1f})')
print(f'  ❌ Yanlış:    {wrong}/{total} (%{100*wrong/total:.1f})')
print(f'  ⛔ Eşleşmeyen: {no_match}')
print(f'\n  📈 Puan: %{score_pct:.1f}  →  Not: {grade}')
print(f'  ⚡ Toplam süre: {elapsed:.1f}s ({elapsed/total*1000:.0f} ms/sorgu)')
print()
print('Soru tipi başına performans:')
for typ, d in by_type.items():
    t = d['c'] + d['p'] + d['w']
    pct = (d['c'] + 0.5*d['p']) / t * 100 if t else 0
    print(f'  {typ:12} : %{pct:5.1f}  ({d["c"]}D + {d["p"]}K + {d["w"]}Y / {t})')

out = SCRIPT_DIR / 'drc_man_yilmaz2000_result.json'
with open(out, 'w', encoding='utf-8') as f:
    json.dump({
        'total': total, 'correct': correct, 'partial': partial, 'wrong': wrong, 'no_match': no_match,
        'score_pct': round(score_pct, 1), 'grade': grade,
        'elapsed_seconds': round(elapsed, 1),
        'avg_query_ms': round(elapsed/total*1000, 1),
        'by_type': dict(by_type),
    }, f, ensure_ascii=False, indent=2)
print(f'\n💾 Detay: {out}')
