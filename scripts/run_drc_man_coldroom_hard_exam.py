#!/usr/bin/env python3
"""
DRC MAN — SOĞUK ODA UZMANLIK ZORLU SINAVI
50 soru: malzemeler, parçalar, sorunlar, hesaplama, prosedür.
Her soru için beklenen anahtar kelimeler tanımlı.
Cevabın anahtar kelimeleri içermesi puan kazandırır.
"""
import json
import sys
import time
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))
from drc_man_bridge import _normalize_text, _tokenize  # noqa

# ════════ FAQ banks yükle ════════
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
print('Index hazırlanıyor...')
faq_tokens = []
for entry in faq:
    txt = f"{entry.get('tr_question','')} {entry.get('tr_answer','')[:600]} {entry.get('de_question','')} {entry.get('de_answer','')[:300]}"
    faq_tokens.append((set(_tokenize(txt)), entry))

def find_best(question, top_k=3):
    q_tok = set(_tokenize(question))
    if not q_tok:
        return []
    scored = []
    for tok_set, entry in faq_tokens:
        if not tok_set:
            continue
        common = q_tok & tok_set
        if not common:
            continue
        score = len(common) / (len(q_tok) + len(tok_set) - len(common))
        scored.append((score, entry))
    scored.sort(key=lambda x: -x[0])
    return scored[:top_k]


# ════════ ZORLU SORU SETİ (50 soru) ════════
EXAM = [
    # — Malzemeler —
    {"q": "Donuk soğuk oda için kaç mm panel kalınlığı önerilir?", "expect": ["120", "150", "200", "donuk", "tiefkühl"]},
    {"q": "Sandviç panel CAM-LOK kilit sistemi ne avantaj sağlar?", "expect": ["sızdırmaz", "180", "kam", "eksantrik"]},
    {"q": "Donuk oda kapısında rezistans (ısıtıcı) ne için kullanılır?", "expect": ["conta", "donmasını", "yapıştır", "rezistans"]},
    {"q": "Bakır boru izolasyonunda hangi malzeme kullanılır?", "expect": ["armaflex", "kauçuk", "kapalı hücreli", "elastomer"]},
    {"q": "Soğuk oda PVC perdesi ne işe yarar enerji açısından?", "expect": ["%20", "%30", "enerji", "tasarruf", "kayıp"]},
    {"q": "ETS PZ100 50x100x50 ne anlama gelir?", "expect": ["50", "100", "panel", "u profil", "zemin"]},
    {"q": "ETS PD120 dış köşe profili nereye monte edilir?", "expect": ["dış köşe", "90", "12cm", "panel"]},

    # — Parçalar —
    {"q": "Hermetik ve yarı-hermetik kompresör arasındaki temel fark?", "expect": ["kaynak", "vidalı", "tamir", "değiştir", "söküp"]},
    {"q": "Scroll kompresör neden daha verimli?", "expect": ["spiral", "az hareketli", "%15", "titreşim", "düşük gürültü"]},
    {"q": "Tavan tipi vs duvar tipi evaporatör farkı?", "expect": ["tavan", "360", "yüksek", "duvar", "tek yönlü"]},
    {"q": "Kondenser kapasitesi soğutma kapasitesinin kaç katı seçilir?", "expect": ["1.2", "1.4", "kondenser", "kompresör", "motor"]},
    {"q": "TXV ile kapiler boru arasındaki fark nedir?", "expect": ["txv", "termostatik", "değişken", "kapiler", "sabit", "superheat"]},
    {"q": "Solenoid valf nereye monte edilir?", "expect": ["likit", "kondenser", "txv", "önce", "pump-down"]},
    {"q": "Filtre-drier neden gereklidir?", "expect": ["nem", "asit", "moleküler", "zeolit", "drier"]},
    {"q": "Sight glass'ta sarı renk ne anlama gelir?", "expect": ["nem", "sarı", "drier", "değiştir"]},
    {"q": "Dixell veya DCB100 dijital kontrolör ne işler yapar?", "expect": ["termostat", "defrost", "alarm", "fan", "set"]},
    {"q": "Yüksek basınç şalteri R404A için kaç barda açar?", "expect": ["28", "30", "32", "hp", "yüksek"]},

    # — Sorunlar —
    {"q": "Soğuk oda sıcaklığa düşmüyorsa ilk kontrol edilecekler?", "expect": ["gaz", "kondenser", "defrost", "txv", "kompresör"]},
    {"q": "Evaporatörde aşırı buz birikmesinin sebepleri?", "expect": ["defrost", "drenaj", "fan", "şarj", "kapı"]},
    {"q": "Gaz kaçağı nasıl tespit edilir?", "expect": ["leak detector", "uv", "köpük", "azot", "basınç"]},
    {"q": "Yüksek basınç alarmı sebepleri?", "expect": ["fan", "kondenser", "kirli", "şarj", "ortam", "hava"]},
    {"q": "Kompresör çalışmıyorsa ne kontrol edilmeli?", "expect": ["sigorta", "termostat", "kontaktör", "basınç", "kapasitör"]},
    {"q": "Kapı kapanmıyorsa sebep ne olabilir?", "expect": ["menteşe", "conta", "don", "hidrolik", "rezistans"]},
    {"q": "Yağ kontaminasyonu belirtileri?", "expect": ["asit", "siyah", "burnout", "drier", "vakum"]},
    {"q": "Kompresörden tık-tık sesi gelirse sorun ne olabilir?", "expect": ["likit", "slug", "batık", "txv", "şarj"]},

    # — Hesaplama —
    {"q": "Soğuk oda yapı ısı yükü nasıl hesaplanır?", "expect": ["u", "a", "delta", "0.22", "100mm", "pir"]},
    {"q": "5×4×3 metre 0°C oda için kabaca kaç HP gerekir?", "expect": ["3", "4", "5", "kompresör", "60"]},
    {"q": "Ürün soğutma yükü nasıl hesaplanır (Q_ürün)?", "expect": ["m", "cp", "delta", "kütle", "spesifik", "kg"]},
    {"q": "Vakum prosedüründe hedef değer kaç mikron?", "expect": ["500", "mikron", "torr", "0.5"]},
    {"q": "R404A pozitif 0°C oda için tipik suction basıncı?", "expect": ["4.5", "4", "5", "bar", "0°C"]},
    {"q": "Superheat normal değeri TXV sistemde?", "expect": ["4", "5", "6", "7", "k", "txv"]},
    {"q": "Subcooling R404A için hedef değer?", "expect": ["4", "5", "6", "k", "subcool"]},
    {"q": "Donuk oda -25°C için 30m³ hacim kaç HP?", "expect": ["4", "5", "donuk", "tiefkühl"]},

    # — Servis —
    {"q": "R404A şarjı nasıl yapılır - likit faz mı gaz faz mı?", "expect": ["likit", "yüksek", "sıvı", "tüp", "flüssig"]},
    {"q": "POE yağı R404A için neden zorunlu?", "expect": ["poe", "polyolester", "404", "uyumlu"]},
    {"q": "Defrost yöntemleri ve farkları?", "expect": ["elektrik", "sıcak gaz", "hava", "rezistans"]},
    {"q": "R448A ve R449A ne için kullanılır?", "expect": ["404", "retrofit", "alternatif", "gwp", "f-gas"]},
    {"q": "Triple evacuation prosedürü ne?", "expect": ["vakum", "azot", "n2", "nem", "üç"]},
    {"q": "Burnout sonrası temizlik prosedürü?", "expect": ["asit", "n2", "drier", "burnout", "ehb", "eha"]},
    {"q": "R290 ne kadar şarj limitiyle kullanılabilir?", "expect": ["150", "g", "propan", "yanıcı", "a3"]},
    {"q": "Hot gas defrost nasıl çalışır?", "expect": ["sıcak gaz", "kompresör", "evaporatör", "valf", "3-yollu"]},

    # — Karışık zorlu —
    {"q": "Sistem 30 bar N2 testte 24 saat 5 bar düşerse ne yapmalı?", "expect": ["kaçak", "leak", "test", "leak detector", "köpük"]},
    {"q": "Pump-down devresi nasıl çalışır?", "expect": ["solenoid", "likit", "evaporatör", "boşalt", "lp"]},
    {"q": "Compression ratio nedir, donuk oda için ne olmalı?", "expect": ["8", "9", "10", "12", "ratio", "donuk", "tiefkühl"]},
    {"q": "Anti-frost heating zemin altında ne için?", "expect": ["zemin", "buzlanma", "ısıtıcı", "donmasını", "kablo"]},
    {"q": "Suction line accumulator ne işe yarar?", "expect": ["likit", "slug", "batık", "kompresör", "sıvı"]},
    {"q": "Yağ basınç şalteri MP54 nasıl çalışır?", "expect": ["yağ", "basınç", "delta", "0.7", "60", "yarı-hermetik"]},
    {"q": "Soğuk oda düşük nem sorunu — sebep?", "expect": ["evaporatör", "delta", "düşük", "fark", "yüzey"]},
    {"q": "Compressor short cycling çözümü?", "expect": ["differential", "thermostat", "2", "3", "k", "ratio"]},
    {"q": "Sistem vakum yapamıyor (500 mikrona inmiyor) — neden?", "expect": ["nem", "kaçak", "yağ", "vakum", "n2"]},
    {"q": "Cold room sound design — fan gürültüsü 40dB altı için?", "expect": ["fan", "rpm", "düşük", "yavaş", "izolasyon"]},
]

# ════════ Sınav çalıştır ════════
print(f'\n{"═"*80}')
print(f'🎓 DRC MAN — SOĞUK ODA UZMANLIK ZORLU SINAVI')
print(f'📚 Bilgi havuzu: {len(faq)} Q&A')
print(f'❓ Sınav: {len(EXAM)} zorlu soru')
print(f'{"═"*80}\n')

correct = 0
partial = 0
wrong = 0
results = []
start = time.time()

for i, q in enumerate(EXAM, 1):
    matches = find_best(q['q'], top_k=3)
    if not matches:
        wrong += 1
        results.append({**q, 'status': 'NOT_FOUND', 'score': 0, 'hits': 0})
        print(f'❌ Q{i:2d}: {q["q"][:65]}\n     → Eşleşme bulunamadı')
        continue

    top = matches[0][1]
    top_score = matches[0][0]
    answer_full = (top.get('tr_answer', '') + ' ' + top.get('de_answer', '')).lower()

    # Anahtar kelime puanlaması
    hits = sum(1 for kw in q['expect'] if str(kw).lower() in answer_full)
    expected_count = len(q['expect'])
    pct = hits / expected_count

    # Skoring: anahtar kelime match'i ana kriter (içerik doğruluğu).
    # Score sadece "alakasız değil mi" filtresi (>= 0.01 minimum).
    if pct >= 0.5 and top_score >= 0.01:
        correct += 1
        status = 'DOĞRU'
        mark = '✅'
    elif pct >= 0.25:
        partial += 1
        status = 'KISMEN'
        mark = '🟡'
    else:
        wrong += 1
        status = 'YANLIŞ'
        mark = '❌'

    results.append({**q, 'matched_q': top.get('tr_question','')[:80], 'score': round(top_score, 3), 'hits': hits, 'expected': expected_count, 'status': status})
    print(f'{mark} Q{i:2d}: {q["q"][:65]}')
    print(f'      → match: {top.get("tr_question","")[:70]}  (score {top_score:.3f}, kw {hits}/{expected_count})')

elapsed = time.time() - start

# ════════ ÖZET ════════
total = len(EXAM)
score = (correct + 0.5 * partial) / total * 100
grade = "A+" if score >= 95 else "A" if score >= 85 else "B" if score >= 75 else "C" if score >= 65 else "D" if score >= 55 else "F"
print(f'\n{"═"*80}')
print(f'📊 SINAV SONUCU')
print(f'{"═"*80}')
print(f'  ✅ Tam Doğru: {correct}/{total} (%{100*correct/total:.1f})')
print(f'  🟡 Kısmen:    {partial}/{total} (%{100*partial/total:.1f})')
print(f'  ❌ Yanlış:    {wrong}/{total} (%{100*wrong/total:.1f})')
print(f'\n  📈 Puan: %{score:.1f}  →  Not: {grade}')
print(f'  ⚡ Toplam süre: {elapsed:.1f}s ({elapsed/total*1000:.0f} ms/sorgu)')
print(f'{"═"*80}')

# Konu bazlı analiz
print('\n=== KONU BAZLI BAŞARI ===')
topics = {
    'Malzemeler': range(1, 8),     # Q1-7
    'Parçalar': range(8, 18),      # Q8-17
    'Sorunlar': range(18, 26),     # Q18-25
    'Hesaplama': range(26, 34),    # Q26-33
    'Servis': range(34, 42),       # Q34-41
    'Zorlu Karışık': range(42, 51),# Q42-50
}
for topic, rng in topics.items():
    topic_results = [results[i-1] for i in rng if i <= total]
    t = len(topic_results)
    c = sum(1 for r in topic_results if r['status'] == 'DOĞRU')
    p = sum(1 for r in topic_results if r['status'] == 'KISMEN')
    pct = (c + 0.5 * p) / t * 100 if t > 0 else 0
    print(f'  {topic:18s}: %{pct:5.1f} ({c}D + {p}K + {t-c-p}Y / {t})')

out = SCRIPT_DIR / 'drc_man_coldroom_exam_result.json'
with open(out, 'w', encoding='utf-8') as f:
    json.dump({
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'faq_total': len(faq),
        'questions': total,
        'correct': correct, 'partial': partial, 'wrong': wrong,
        'score_percent': round(score, 1),
        'grade': grade,
        'results': results,
    }, f, ensure_ascii=False, indent=2, default=str)
print(f'\n💾 Detay: {out}')
