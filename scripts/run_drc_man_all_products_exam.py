#!/usr/bin/env python3
"""
DRC MAN — Tüm Aktif Ürünler Teknik Bilgi Sınavı.
50 random aktif ürün için FAQ bankasında doğru match'i bulup bulamadığını ölçer.
"""
import json
import random
import sys
from pathlib import Path
import time

SCRIPT_DIR = Path(__file__).parent
random.seed(42)

sys.path.insert(0, str(SCRIPT_DIR))
from drc_man_bridge import _normalize_text, _tokenize  # noqa

# Tüm aktif ürünleri yükle
with open('/tmp/all_active_items.json', encoding='utf-8') as f:
    items = json.load(f)

# FAQ bankasını yükle (2 parça)
faq = []
for part in (1, 2):
    p = SCRIPT_DIR / f'drc_man_all_products_faq.part{part}.json'
    with open(p, encoding='utf-8') as f:
        faq.extend(json.load(f))

print(f'Yüklenen FAQ: {len(faq)} Q&A')
print(f'Test havuzu: {len(items)} aktif ürün')

# FAQ index oluştur — id_str → entry
faq_by_id = {}
for entry in faq:
    for tag in entry.get('tags', []):
        if tag.isdigit():
            faq_by_id[tag] = entry

# Tokenize tüm FAQ giriş Q+A — tek seferlik index
print('FAQ token indexleniyor...')
start = time.time()
faq_tokens_list = []
for entry in faq:
    text = f"{entry.get('tr_question','')} {entry.get('tr_answer','')[:300]} {entry.get('de_question','')} {entry.get('de_answer','')[:200]}"
    faq_tokens_list.append((set(_tokenize(text)), entry))
print(f'Index hazır: {time.time()-start:.1f}s')


def find_best(question, top_k=1):
    q_tok = set(_tokenize(question))
    if not q_tok:
        return []
    scored = []
    for tok_set, entry in faq_tokens_list:
        if not tok_set:
            continue
        common = q_tok & tok_set
        if not common:
            continue
        score = len(common) / (len(q_tok) + len(tok_set) - len(common))
        scored.append((score, entry))
    scored.sort(key=lambda x: -x[0])
    return scored[:top_k]


# Test soruları üret
sample = random.sample(items, min(50, len(items)))
correct = 0
partial = 0
wrong = 0
results = []

print("\n" + "=" * 80)
print("🎓 DRC MAN — TÜM AKTİF ÜRÜN SINAVI (50 random)")
print("=" * 80)
start = time.time()

for it in sample:
    item_id = it['id']
    name = (it.get('name') or '')[:55]
    brand = (it.get('brand') or '').strip() or 'DRC'
    stock = float(it.get('stock') or 0)
    sale = float(it.get('sale_price') or 0)

    # Random soru
    q_choices = [
        f"{name} stokta var mı?",
        f"{brand} {name} fiyatı?",
        f"{name[:40]} hakkında bilgi ver.",
    ]
    question = random.choice(q_choices)

    matches = find_best(question, top_k=3)
    if not matches:
        wrong += 1
        results.append({"id": item_id, "q": question, "status": "NOT_FOUND"})
        continue

    # En iyi match'in DB#'si soru ile aynı mı?
    top = matches[0][1]
    top_score = matches[0][0]
    expected_tag = str(item_id)
    matched_tags = top.get('tags', [])
    id_in_tags = expected_tag in matched_tags

    # Cevapta DB# var mı?
    answer = top.get('tr_answer', '')
    id_in_answer = f"DB#{item_id}" in answer or f"db#{item_id}" in answer.lower()

    if id_in_tags or id_in_answer:
        correct += 1
        status = 'DOĞRU'
        mark = '✅'
    elif top_score > 0.2:
        # Yakın bir match var ama tam değil
        partial += 1
        status = 'KISMEN'
        mark = '🟡'
    else:
        wrong += 1
        status = 'YANLIŞ'
        mark = '❌'

    results.append({
        "id": item_id, "q": question, "matched_q": top.get('tr_question', '')[:80],
        "score": round(top_score, 3), "status": status,
    })

elapsed = time.time() - start
print(f"\n50 sorgu süresi: {elapsed:.1f}s ({elapsed/50*1000:.0f} ms/sorgu)")

# İlk 15 örneği göster
print("\n=== İLK 15 SONUÇ ===")
for r in results[:15]:
    mark = {'DOĞRU': '✅', 'KISMEN': '🟡', 'YANLIŞ': '❌', 'NOT_FOUND': '⛔'}.get(r['status'], '?')
    print(f"{mark} [#{r['id']:>5}] {r.get('q', '')[:60]}")
    if r.get('matched_q'):
        print(f"    → {r['matched_q'][:70]}  (score {r.get('score', 0)})")

# Özet
total = len(results)
print("\n" + "=" * 80)
print("📊 SINAV SONUCU")
print("=" * 80)
print(f"  ✅ Tam Doğru: {correct}/{total}  (%{100*correct/total:.1f})")
print(f"  🟡 Kısmen:    {partial}/{total}  (%{100*partial/total:.1f})")
print(f"  ❌ Yanlış:    {wrong}/{total}  (%{100*wrong/total:.1f})")

score = (correct + 0.5 * partial) / total * 100
grade = "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70 else "D" if score >= 60 else "F"
print(f"\n  📈 Puan: %{score:.1f}  →  Not: {grade}")
print(f"  ⚡ Ortalama sorgu: {elapsed/total*1000:.0f} ms")

out = {
    "exam_type": "all_products",
    "faq_total": len(faq),
    "items_total": len(items),
    "questions_tested": total,
    "correct": correct, "partial": partial, "wrong": wrong,
    "score_percent": round(score, 1), "grade": grade,
    "avg_query_ms": round(elapsed/total*1000, 1),
    "details": results,
}
out_path = SCRIPT_DIR / 'drc_man_all_products_exam_result.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2, default=str)
print(f"  💾 Detay: {out_path}")
