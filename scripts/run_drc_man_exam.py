#!/usr/bin/env python3
"""
DRC MAN Malzeme vs Ustalık Sınav Runner.
Her sınav sorusunu intent classifier'a verir, sonucu kontrol eder.
Hem classifier doğruluğunu hem de cevap kalitesini test eder.
"""
import json
import sys
import unicodedata
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))

# Bridge'tan classifier'ı import et
from drc_man_bridge import _classify_material_vs_expertise, _normalize_text  # noqa


def run_exam():
    exam_path = SCRIPT_DIR / "drc_man_malzeme_vs_ustalik_exam.json"
    with open(exam_path, encoding="utf-8") as f:
        exam = json.load(f)

    print("=" * 80)
    print(f"🎓 {exam['title']}")
    print(f"📅 Sınav tarihi: {exam['date']}")
    print(f"📝 Toplam soru: {exam['total_questions']}")
    print("=" * 80)

    results = []
    correct_intent = 0
    partial_correct = 0
    wrong_intent = 0

    for q in exam["questions"]:
        qid = q["id"]
        text = q["tr"]
        expected = q["expected_intent"]
        actual = _classify_material_vs_expertise(text)

        # Klasifier doğruluğu
        if actual == expected:
            mark = "✅"
            correct_intent += 1
            status = "DOĞRU"
        elif actual == "KARMA" and expected in ("MALZEME", "USTALIK"):
            mark = "🟡"
            partial_correct += 1
            status = "KISMEN (KARMA döndü, beklenen tek yön)"
        elif expected == "KARMA" and actual in ("MALZEME", "USTALIK"):
            mark = "🟡"
            partial_correct += 1
            status = "KISMEN (tek yön döndü, beklenen KARMA)"
        else:
            mark = "❌"
            wrong_intent += 1
            status = "YANLIŞ"

        results.append({
            "id": qid, "text": text, "expected": expected, "actual": actual,
            "status": status, "mark": mark
        })

        print(f"\n{mark} Soru #{qid:>2} — Beklenen: {expected:8s} | Sınıflandı: {actual:8s} | {status}")
        print(f"      ↳ {text}")

    # Özet
    total = len(results)
    print("\n" + "=" * 80)
    print("📊 SINAV SONUCU")
    print("=" * 80)
    print(f"  ✅ Tam Doğru: {correct_intent}/{total}  (%{100*correct_intent/total:.1f})")
    print(f"  🟡 Kısmen:    {partial_correct}/{total}  (%{100*partial_correct/total:.1f})")
    print(f"  ❌ Yanlış:    {wrong_intent}/{total}  (%{100*wrong_intent/total:.1f})")

    score = (correct_intent + 0.5 * partial_correct) / total * 100
    grade = "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70 else "D" if score >= 60 else "F"
    print(f"\n  📈 Puan: %{score:.1f}  →  Not: {grade}")

    # Yanlış cevapları detaylı listele
    if wrong_intent > 0:
        print("\n  ❌ Yanlış sınıflanan sorular (incelenmesi gereken):")
        for r in results:
            if r["mark"] == "❌":
                print(f"     #{r['id']} — beklenen {r['expected']} ama {r['actual']} döndü")
                print(f"        ↳ {r['text']}")

    # Sonucu JSON olarak kaydet
    out = {
        "exam_date": exam["date"],
        "total": total,
        "correct": correct_intent,
        "partial": partial_correct,
        "wrong": wrong_intent,
        "score_percent": score,
        "grade": grade,
        "details": results,
    }
    out_path = SCRIPT_DIR / "drc_man_exam_result.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"\n  💾 Detay rapor: {out_path}")

    return score >= 80


if __name__ == "__main__":
    success = run_exam()
    sys.exit(0 if success else 1)
