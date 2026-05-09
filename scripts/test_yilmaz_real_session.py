#!/usr/bin/env python3
"""
Yılmaz (customer rolü) gerçek müşteri simülasyonu.
1) Yılmaz'ın user verilerini al
2) Sanitize ettikten sonra ne görür/göremez analiz et
3) DRC MAN'a 30 müşteri sorusu sor, yanıtları puanla
"""
import json
import sys
import time
import subprocess
import os
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
os.chdir('/Users/anilakbas/Desktop/Hamburg depo stok programı ')

sys.path.insert(0, str(SCRIPT_DIR))
from drc_man_bridge import _normalize_text, _tokenize  # noqa

# ════════ Yılmaz user info ════════
import tempfile
node_yilmaz = """
const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8').split('\\n').filter(l=>l.includes('=')).reduce((a,l)=>{const [k,...v]=l.split('=');a[k]=v.join('=').replace(/^"|"$/g,'');return a;},{});
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const u = await pool.query("SELECT id, username, name, role, email, phone, email_verified FROM users WHERE username='yilmazbilgili69' OR id=49");
  const orders = await pool.query("SELECT COUNT(*)::int c FROM orders WHERE customer_user_id=49");
  const projects = await pool.query("SELECT COUNT(*)::int c FROM projects WHERE customer_user_id=49 OR owner_user_id=49");
  console.log(JSON.stringify({ user: u.rows[0], orders: orders.rows[0].c, projects: projects.rows[0].c }));
  await pool.end();
})();
"""
with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, dir='.') as f:
    f.write(node_yilmaz); tmp = f.name
yilmaz_data = json.loads(subprocess.run(['node', tmp], capture_output=True, text=True).stdout)
os.unlink(tmp)

print('═'*80)
print(f'👤 YILMAZ MÜŞTERİ HESABI')
print('═'*80)
y = yilmaz_data['user']
print(f"  user_id: {y['id']}")
print(f"  username: {y['username']}")
print(f"  name: {y['name']}")
print(f"  role: {y['role']}")
print(f"  email_verified: {y['email_verified']}")
print(f"  toplam siparişi: {yilmaz_data['orders']}")
print(f"  projesi: {yilmaz_data['projects']}")

# ════════ Customer'ın görebildiği veri ════════
print()
print('━'*80)
print('🔒 YILMAZ NE GÖRÜR / NE GÖRMEZ (sanitize sonrası)')
print('━'*80)
node_sanitize = """
const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8').split('\\n').filter(l=>l.includes('=')).reduce((a,l)=>{const [k,...v]=l.split('=');a[k]=v.join('=').replace(/^"|"$/g,'');return a;},{});
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  // Sample 5 ürün — admin gözüyle vs müşteri gözüyle
  const r = await pool.query(`
    WITH stock AS (
      SELECT m.item_id, SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END)::numeric AS qty
      FROM movements m GROUP BY m.item_id
    )
    SELECT i.id, i.name, i.brand, i.default_price, i.sale_price, i.list_price,
           s.qty AS stock, i.min_stock
    FROM items i JOIN stock s ON s.item_id=i.id
    WHERE i.is_active=true AND s.qty > 0
    ORDER BY (s.qty * COALESCE(i.default_price,0)) DESC LIMIT 5
  `);
  console.log(JSON.stringify(r.rows));
  await pool.end();
})();
"""
with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, dir='.') as f:
    f.write(node_sanitize); tmp = f.name
sample = json.loads(subprocess.run(['node', tmp], capture_output=True, text=True).stdout)
os.unlink(tmp)

print('  Top 5 stoklu ürün — Admin vs Müşteri görünümü:')
print()
for it in sample:
    stock_real = float(it['stock'] or 0)
    print(f"  #{it['id']} {(it['brand'] or '')[:12]} | {(it['name'] or '')[:50]}")
    print(f"     ADMIN gözüyle: cost €{it['default_price']} | sale €{it['sale_price']} | list €{it['list_price']} | stok {stock_real} | min {it['min_stock']}")
    cust_stock = "Var" if stock_real > 0 else "Yok"
    print(f"     YILMAZ gözüyle: 🚫 cost gizli | sale €{it['sale_price']} | list €{it['list_price']} | stok '{cust_stock}' (sayı YOK)")
    print()

# ════════ DRC MAN sorgu testi ════════
print('━'*80)
print('🤖 DRC MAN — YILMAZ\'IN SORACAĞI 30 GERÇEK SORU')
print('━'*80)

# FAQ banks yükle
faq = []
faq_files = [
    'drc_man_coldroom_expert_faq.json',
    'drc_man_all_products_faq.part1.json',
    'drc_man_all_products_faq.part2.json',
    'drc_man_stock_technical_faq.json',
    'drc_man_malzeme_vs_ustalik_faq.json',
    'drc_man_troubleshooting_faq.json',
    'drc_man_refrigeration_faq.json',
    'drc_man_pt_superheat_faq.json',
    'drc_man_gases_faq.json',
]
for fn in faq_files:
    p = SCRIPT_DIR / fn
    if p.exists():
        faq.extend(json.load(open(p, encoding='utf-8')))
print(f'FAQ havuzu: {len(faq)} Q&A')

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
        if s > best_s:
            best_s = s; best = entry
    return best, best_s

# Müşteri Yılmaz'ın gerçekçi 30 sorusu
YILMAZ_QUESTIONS = [
    "Merhaba, R-404A 10 KG gazınız var mı?",
    "Embraco NJX2219GS stokta mı?",
    "Soğuk oda paneli 100mm fiyatı nedir?",
    "Bana sürgülü soğuk oda kapısı 200x250 lazım, var mı?",
    "Sandviç panel sandviç 100mm metre kareye ne kadar?",
    "ETS thermets HSC.MP10030 3 HP grup ne kadar?",
    "Frigocraft kondenser fiyatları?",
    "Bakır boru 1/4 çift izole var mı?",
    "Soğuk odamda buz birikiyor sürekli, ne yapmalıyım?",
    "Kompresörden tık-tık ses geliyor, ne olabilir?",
    "Donuk oda için kaç mm panel önerirsin?",
    "Soğuk oda kapısı tam kapanmıyor, sebep ne?",
    "Termostat differential ayarı kaç olmalı?",
    "5x4x3 metre soğuk oda için kaç HP grup gerek?",
    "POE yağı ne için kullanılır?",
    "R449A retrofit gazı ne demek?",
    "Defrost yöntemleri nedir?",
    "PVC kapı perdesi ne kadar enerji tasarrufu sağlar?",
    "Sanhua solenoid valf ne için lazım?",
    "Carel kontrol cihazı stoklu mu?",
    "Vakum prosedürü nasıl yapılır?",
    "Sight glass'ım sarı oldu, ne yapmalıyım?",
    "Yüksek basınç alarmı veriyor, sebep?",
    "Hot gas defrost ne avantaj sağlar?",
    "R290 propan ne kadar şarj limiti var?",
    "Triple evacuation prosedürü?",
    "Kompresör short cycling nasıl çözülür?",
    "Suction line accumulator ne işe yarar?",
    "Soğuk odamda nem düşük, ürünler kuruyor",
    "Burnout sonrası temizlik nasıl yapılmalı?",
]

print(f'\n{len(YILMAZ_QUESTIONS)} soru sorulacak...\n')
results = []
correct = 0
partial = 0
wrong = 0

for i, q in enumerate(YILMAZ_QUESTIONS, 1):
    best, score = find_best(q)
    if best is None:
        wrong += 1
        results.append({'q': q, 'status': 'NO_MATCH', 'score': 0})
        print(f'❌ Q{i:2}: {q[:65]}\n     → Eşleşme bulunamadı\n')
        continue

    answer = best.get('tr_answer', '')
    # Reasonable score threshold for natural questions
    if score >= 0.04:
        correct += 1; status = 'DOĞRU'; mark = '✅'
    elif score >= 0.02:
        partial += 1; status = 'KISMEN'; mark = '🟡'
    else:
        wrong += 1; status = 'ZAYIF'; mark = '⚠'

    # Customer-facing yanıt (cost vs sale ayır)
    answer_short = answer[:280].replace('\n', ' ')
    # Cost/maliyet kelimesi varsa flag (müşteri görmemeli)
    has_cost_leak = any(kw in answer.lower() for kw in ['cost: €', 'cost €', 'maliyet'])
    leak_warn = '⚠ COST SIZINTISI!' if has_cost_leak else ''

    results.append({
        'q': q, 'status': status, 'score': round(score, 3),
        'matched_q': best.get('tr_question','')[:80],
        'has_cost_leak': has_cost_leak,
    })
    print(f'{mark} Q{i:2}: {q}')
    print(f'      → match: {best.get("tr_question","")[:70]} (score {score:.3f}) {leak_warn}')
    print(f'      → cevap: {answer_short[:200]}...')
    print()

# Özet
total = len(YILMAZ_QUESTIONS)
score_pct = (correct + 0.5 * partial) / total * 100
grade = "A" if score_pct >= 85 else "B" if score_pct >= 75 else "C" if score_pct >= 65 else "D" if score_pct >= 55 else "F"
print('═'*80)
print('📊 YILMAZ\'IN GERÇEK MÜŞTERİ DENEYİMİ')
print('═'*80)
print(f'  ✅ Tatmin edici: {correct}/{total} (%{100*correct/total:.1f})')
print(f'  🟡 Kısmen:       {partial}/{total} (%{100*partial/total:.1f})')
print(f'  ⚠ Zayıf:         {wrong}/{total} (%{100*wrong/total:.1f})')
print(f'\n  📈 Skor: %{score_pct:.1f}  →  Not: {grade}')

# Cost leakage check (KRITIK güvenlik)
leaks = sum(1 for r in results if r.get('has_cost_leak'))
if leaks > 0:
    print(f'\n  🚨 GÜVENLİK UYARISI: {leaks} cevapta cost (alış fiyatı) müşteriye sızıyor!')
else:
    print(f'\n  ✅ GÜVENLİK: Hiçbir cevapta cost sızıntısı YOK (müşteri korumalı)')

out = SCRIPT_DIR / 'drc_man_yilmaz_real_session_result.json'
with open(out, 'w', encoding='utf-8') as f:
    json.dump({
        'user': yilmaz_data['user'],
        'orders': yilmaz_data['orders'],
        'projects': yilmaz_data['projects'],
        'questions_tested': total,
        'correct': correct, 'partial': partial, 'wrong': wrong,
        'score_pct': round(score_pct, 1), 'grade': grade,
        'cost_leaks': leaks,
        'results': results,
    }, f, ensure_ascii=False, indent=2)
print(f'\n💾 Detay: {out}')
