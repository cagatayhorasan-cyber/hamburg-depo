#!/usr/bin/env python3
"""
DRC MAN — Stoklu Ürün Teknik Bilgi Sınavı.
25 random stoklu ürün için bridge'a soru sor → cevabın stok ve fiyat içerip içermediğini test et.
"""
import json
import random
import sys
import subprocess
from pathlib import Path
from collections import Counter

SCRIPT_DIR = Path(__file__).parent
random.seed(42)

# Test verileri
with open('/tmp/stocked_items.json', encoding='utf-8') as f:
    items = json.load(f)

# Yeni FAQ bankası — direkt buradan match yapacağız (bridge çağırmadan)
with open(SCRIPT_DIR / 'drc_man_stock_technical_faq.json', encoding='utf-8') as f:
    faq = json.load(f)

# Bridge'tan match fonksiyonunu kullan
sys.path.insert(0, str(SCRIPT_DIR))
from drc_man_bridge import _normalize_text, _tokenize  # noqa


def find_best_match(question, faq_entries, top_k=1):
    """Token overlap ile en iyi eşleşmeyi bul."""
    q_tokens = set(_tokenize(question))
    if not q_tokens:
        return None
    scored = []
    for entry in faq_entries:
        candidates = [
            entry.get('tr_question', ''),
            entry.get('de_question', ''),
            entry.get('tr_answer', '')[:500],
        ]
        max_score = 0
        for cand in candidates:
            c_tokens = set(_tokenize(cand))
            if not c_tokens:
                continue
            common = q_tokens & c_tokens
            score = len(common) / (len(q_tokens) + len(c_tokens) - len(common))  # Jaccard
            if score > max_score:
                max_score = score
        scored.append((max_score, entry))
    scored.sort(key=lambda x: -x[0])
    return scored[:top_k] if scored else None


# Test soruları üret — 25 random ürün × farklı sorgu varyasyonları
def make_test_questions():
    sample = random.sample(items, min(25, len(items)))
    questions = []
    for it in sample:
        item_id = it['id']
        name = it['name']
        brand = (it.get('brand') or '').strip() or 'DRC'
        stock = float(it.get('stock') or 0)
        sale = float(it.get('sale_price') or 0)

        # Random soru tipi seç
        q_types = [
            f"{name[:50]} stokta var mı?",
            f"{brand} {name[:40]} fiyatı ne?",
            f"{name[:60]} kaç adet stoklu?",
        ]
        question = random.choice(q_types)
        # Beklenen anahtarlar
        expected_keywords = [
            f"#{item_id}",
            brand.lower() if brand and brand != 'DRC' else '',
            f"{stock:g}",  # stok adedi
        ]
        if sale > 0:
            expected_keywords.append(f"{sale:.0f}")  # fiyat (yaklaşık)
        questions.append({
            "id": item_id,
            "question": question,
            "expected_id": str(item_id),
            "expected_brand": brand,
            "expected_stock": stock,
            "expected_sale": sale,
            "expected_keywords": [k for k in expected_keywords if k],
        })
    return questions


print("=" * 80)
print("🎓 DRC MAN — STOKLU ÜRÜN TEKNİK BİLGİ SINAVI")
print(f"📦 FAQ Bankası: {len(faq)} Q&A")
print(f"🎯 Test edilen: 25 random stoklu ürün")
print("=" * 80)

questions = make_test_questions()
correct = 0
partial = 0
wrong = 0
results = []

for q in questions:
    matches = find_best_match(q['question'], faq, top_k=1)
    if not matches or matches[0][0] < 0.05:
        wrong += 1
        results.append({**q, 'match': None, 'score': 0, 'status': 'NOT_FOUND'})
        print(f"\n❌ [#{q['id']}] {q['question']}")
        print(f"   → Hiç eşleşme bulunamadı")
        continue

    score, best = matches[0]
    answer = best.get('tr_answer', '')

    # Doğruluk kontrolü
    expected_id_match = f"#{q['expected_id']}" in answer or f"db#{q['expected_id']}" in answer.lower()
    keyword_hits = sum(1 for kw in q['expected_keywords'] if str(kw).lower() in answer.lower())

    if expected_id_match and keyword_hits >= len(q['expected_keywords']) // 2:
        correct += 1
        status = 'DOĞRU'
        mark = '✅'
    elif expected_id_match or keyword_hits >= 2:
        partial += 1
        status = 'KISMEN'
        mark = '🟡'
    else:
        wrong += 1
        status = 'YANLIŞ'
        mark = '❌'

    results.append({
        **q, 'match': best.get('tr_question', ''), 'score': score, 'status': status,
        'expected_id_in_answer': expected_id_match, 'keyword_hits': keyword_hits,
    })

    print(f"\n{mark} [#{q['id']}] {q['question']}")
    print(f"   → Match: {best.get('tr_question', '')[:80]}")
    print(f"   → Score: {score:.3f} | ID match: {expected_id_match} | Keywords: {keyword_hits}/{len(q['expected_keywords'])}")

# Özet
total = len(questions)
print("\n" + "=" * 80)
print("📊 SINAV SONUCU")
print("=" * 80)
print(f"  ✅ Tam Doğru: {correct}/{total}  (%{100*correct/total:.1f})")
print(f"  🟡 Kısmen:    {partial}/{total}  (%{100*partial/total:.1f})")
print(f"  ❌ Yanlış:    {wrong}/{total}  (%{100*wrong/total:.1f})")

score = (correct + 0.5 * partial) / total * 100
grade = "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70 else "D" if score >= 60 else "F"
print(f"\n  📈 Puan: %{score:.1f}  →  Not: {grade}")

# Detay rapor
out = {
    "exam_type": "stock_technical",
    "total_faq_entries": len(faq),
    "total_stocked_items": len(items),
    "questions_tested": total,
    "correct": correct, "partial": partial, "wrong": wrong,
    "score_percent": score, "grade": grade,
    "details": results,
}
out_path = SCRIPT_DIR / 'drc_man_stock_exam_result.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2, default=str)
print(f"\n  💾 Detay: {out_path}")
