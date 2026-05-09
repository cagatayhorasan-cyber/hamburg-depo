#!/usr/bin/env python3
"""
Tüm 10.267 aktif ürün için DRC MAN'a teknik bilgi öğretir.
Her ürüne 1 zengin Q&A (TR+DE).
Çıktı: drc_man_all_products_faq.part1.json, part2.json (split for size).
"""
import json
import re
import sys
from pathlib import Path
from collections import defaultdict

SCRIPT_DIR = Path(__file__).parent
INPUT = '/tmp/all_active_items.json'

with open(INPUT, encoding='utf-8') as f:
    items = json.load(f)

print(f'Yüklenen aktif ürün: {len(items)}')

def fmt_price(v):
    f = float(v or 0)
    return f"€{f:.2f}" if f > 0 else "—"


def parse_specs(name, notes):
    text = f"{name} {notes}".lower()
    parts = []

    hp = re.search(r'(\d+(?:[\.,]\d+)?)\s*hp', text)
    if hp: parts.append(f"{hp.group(1).replace(',', '.')} HP")

    kw = re.search(r'(\d+(?:[\.,]\d+)?)\s*kw\b', text)
    if kw: parts.append(f"{kw.group(1).replace(',', '.')} kW")

    watt = re.search(r'(\d+(?:[\.,]\d+)?)\s*w(?:att)?\b', text)
    if watt and not kw: parts.append(f"{watt.group(1).replace(',', '.')} W")

    volt = re.search(r'(220|230|380|400|110)\s*v\b', text)
    if volt: parts.append(f"{volt.group(1)}V")

    if any(t in text for t in ['3 faz', '3 ph', 'trifaze', '3 phase', '3ph']):
        parts.append("3F")
    elif any(t in text for t in ['tek faz', '1 faz', '1ph', '1 ph']):
        parts.append("1F")

    for gas in ['r404', 'r-404', 'r134', 'r-134', 'r290', 'r-290', 'r600', 'r-600',
                'r448', 'r-448', 'r449', 'r-449', 'r452', 'r-452', 'r407', 'r-407',
                'r410', 'r-410', 'r744', 'co2', 'r717', 'r22', 'r-22', 'r1234yf', 'r1234ze']:
        if gas in text:
            parts.append(gas.upper().replace('-', ''))
            break

    dim = re.search(r'(\d+\s*[x×]\s*\d+(?:\s*[x×]\s*\d+)?)', text)
    if dim:
        d = dim.group(1).replace(' ', '').replace('×', 'x')
        if len(d) <= 15: parts.append(d)

    temp = re.search(r'(-?\d+)\s*[°˚]\s*c', text)
    if temp:
        parts.append(f"{temp.group(1)}°C")

    cap_kg = re.search(r'(\d+)\s*kg\b', text)
    if cap_kg: parts.append(f"{cap_kg.group(1)} kg")

    cap_lt = re.search(r'(\d+)\s*l(?:t|itre)?\b', text)
    if cap_lt: parts.append(f"{cap_lt.group(1)} L")

    return ' · '.join(parts) if parts else 'standart'


def find_code(name, product_code, barcode):
    if product_code and len(product_code) >= 3:
        return product_code
    if barcode and len(barcode) >= 5:
        return barcode
    # name'den çıkar
    m = re.search(r'\b([A-Z]{2,}[\.\-/]?[A-Z0-9\.\-/]{2,})\b', name)
    if m and len(m.group(1)) >= 4:
        return m.group(1)
    return None


def build_qa(it):
    item_id = it['id']
    name = (it.get('name') or '').strip()
    name_de = (it.get('name_de') or '').strip() or name
    brand = (it.get('brand') or '').strip() or 'DRC'
    category = (it.get('category') or '').strip() or 'Genel'
    unit = (it.get('unit') or 'adet').strip()
    notes = (it.get('notes') or '').strip()

    cost = float(it.get('def_price') or 0)
    sale = float(it.get('sale_price') or 0)
    list_p = float(it.get('list_price') or 0)
    stock = float(it.get('stock') or 0)

    specs = parse_specs(name, notes)
    code = find_code(name, it.get('product_code'), it.get('barcode'))

    # Stok durumu
    if stock > 0:
        stock_tr = f"Hamburg depoda {stock:g} {unit} stoklu"
        stock_de = f"In Hamburg lagernd: {stock:g} {unit}"
    elif stock == 0:
        stock_tr = "Şu an stokta yok (sıfır)"
        stock_de = "Aktuell nicht am Lager (Null)"
    else:
        stock_tr = f"Stok kaydı negatif ({stock:g})"
        stock_de = f"Bestandseintrag negativ ({stock:g})"

    # Fiyat satırı — MÜŞTERİ GÜVENLİĞİ: cost (alış) sızdırılmaz, yalnızca net + brüt.
    if sale > 0:
        price_tr = f"Net: {fmt_price(sale)}, Brüt: {fmt_price(list_p)}"
        price_de = f"Netto: {fmt_price(sale)}, Brutto: {fmt_price(list_p)}"
    else:
        price_tr = "Fiyat henüz girilmemiş — talep gelince güncellenecek"
        price_de = "Preis noch nicht gepflegt — wird bei Bedarf aktualisiert"

    code_part_tr = f" Kodu: {code}." if code else ""
    code_part_de = f" Code: {code}." if code else ""

    short_name = name[:65]
    short_name_de = name_de[:65]

    tr_q = f"{short_name} stokta var mı, fiyatı ve teknik özellikleri nedir?"
    tr_a = (
        f"DB#{item_id} {name}.{code_part_tr} Marka: {brand}. Kategori: {category}. Birim: {unit}. "
        f"{stock_tr}. {price_tr}. Teknik özet: {specs}."
    )
    if notes and 'Detay' in notes:
        notes_short = notes.split('|')[0].replace('Detay:', '').strip()[:200]
        # MÜŞTERİ GÜVENLİĞİ: cost/maliyet sızıntısı temizle
        notes_short = re.sub(r'cost\s*[=:]?\s*€?\s*\d+(?:[\.,]\d+)?', '[cost gizli]', notes_short, flags=re.IGNORECASE)
        notes_short = re.sub(r'maliyet\s*[=:]?\s*€?\s*\d+(?:[\.,]\d+)?', '[maliyet gizli]', notes_short, flags=re.IGNORECASE)
        tr_a += f" {notes_short}."
    tr_a += " Bu MALZEME sorusudur — kart bilgisidir."

    de_q = f"Habt ihr {short_name_de} auf Lager — Preis und Daten?"
    de_a = (
        f"DB#{item_id} {name_de}.{code_part_de} Marke: {brand}. Kategorie: {category}. Einheit: {unit}. "
        f"{stock_de}. {price_de}. Technische Kurzdaten: {specs}."
    )
    de_a += " Das ist eine Materialfrage."

    return {
        "tags": ["all_products", "malzeme", brand.lower(), category.lower()[:20], str(item_id)],
        "tr_question": tr_q, "tr_answer": tr_a,
        "de_question": de_q, "de_answer": de_a,
    }


# ─── Per-item Q&A ───
print('Q&A üretiliyor...')
all_qas = []
for i, it in enumerate(items):
    if i and i % 2000 == 0:
        print(f'  {i}/{len(items)}...')
    all_qas.append(build_qa(it))

print(f'Per-item Q&A: {len(all_qas)}')

# ─── Marka özetleri ───
by_brand = defaultdict(list)
for it in items:
    b = (it.get('brand') or '').strip() or '(markasız)'
    by_brand[b].append(it)

brand_qas = []
for brand, b_items in sorted(by_brand.items(), key=lambda x: -len(x[1]))[:60]:
    if len(b_items) < 3:
        continue
    total_stock = sum(float(it.get('stock') or 0) for it in b_items if float(it.get('stock') or 0) > 0)
    stocked_count = sum(1 for it in b_items if float(it.get('stock') or 0) > 0)
    cats = defaultdict(int)
    for it in b_items: cats[(it.get('category') or '').strip() or 'Genel'] += 1
    top_cats = sorted(cats.items(), key=lambda x: -x[1])[:3]
    cat_str = ', '.join(f"{c} ({n})" for c, n in top_cats)

    tr_a = (
        f"{brand} markasından sistemde toplam {len(b_items)} aktif ürün var. "
        f"{stocked_count} kalemi stoklu (toplam {total_stock:g} adet). "
        f"En çok kategori: {cat_str}. "
        f"Detay sorgu: '{brand} <ürün adı>' diye soruver."
    )
    de_a = (
        f"Vom Hersteller {brand} gibt es {len(b_items)} aktive Artikel im System. "
        f"{stocked_count} davon lagernd (zusammen {total_stock:g} Stueck). "
        f"Top-Kategorien: {cat_str}. "
        f"Detail: '{brand} <Produktname>' fragen."
    )
    brand_qas.append({
        "tags": ["all_products", "brand_overview", brand.lower()],
        "tr_question": f"{brand} markası hakkında bilgi ver.",
        "tr_answer": tr_a,
        "de_question": f"Information zur Marke {brand}.",
        "de_answer": de_a,
    })

print(f'Marka özet Q&A: {len(brand_qas)}')

# ─── Kategori özetleri ───
by_cat = defaultdict(list)
for it in items:
    c = (it.get('category') or '').strip() or 'Genel'
    by_cat[c].append(it)

cat_qas = []
for cat, c_items in sorted(by_cat.items(), key=lambda x: -len(x[1]))[:40]:
    if len(c_items) < 5: continue
    brands = defaultdict(int)
    for it in c_items: brands[(it.get('brand') or '').strip() or '(markasız)'] += 1
    top_brands = sorted(brands.items(), key=lambda x: -x[1])[:5]
    brand_str = ', '.join(f"{b} ({n})" for b, n in top_brands)
    stocked = sum(1 for it in c_items if float(it.get('stock') or 0) > 0)

    tr_a = (
        f"'{cat}' kategorisinde {len(c_items)} aktif ürün, {stocked} stoklu. "
        f"En çok marka: {brand_str}."
    )
    de_a = (
        f"In der Kategorie '{cat}' sind {len(c_items)} aktive Artikel, davon {stocked} lagernd. "
        f"Top-Marken: {brand_str}."
    )
    cat_qas.append({
        "tags": ["all_products", "category_overview", cat.lower()[:30]],
        "tr_question": f"{cat} kategorisinde neler var?",
        "tr_answer": tr_a,
        "de_question": f"Was gibt es in der Kategorie {cat}?",
        "de_answer": de_a,
    })

print(f'Kategori özet Q&A: {len(cat_qas)}')

# ─── Toplam birleştir ───
all_qas.extend(brand_qas)
all_qas.extend(cat_qas)

# Genel summary
all_qas.append({
    "tags": ["all_products", "ozetleme", "sistem_durumu"],
    "tr_question": "Sistemde toplam kaç aktif ürün var?",
    "tr_answer": (
        f"08.05.2026 itibariyle DRC sisteminde {len(items)} aktif ürün kayıtlı. "
        f"139 kalem stoklu, 405 markasız (eski toplu yükleme), 58 fiyatsız aktif. "
        f"En çok kategori: Kompresörler (1.976), Fan Motorları (960), "
        f"Genleşme Vanaları (669). En çok marka: Danfoss (1.822), Thermotrick (476), "
        f"Ebm-Papst (396), Embraco (375), Sanhua (317)."
    ),
    "de_question": "Wie viele aktive Artikel gibt es im System?",
    "de_answer": (
        f"Stand 08.05.2026 sind {len(items)} aktive Artikel im DRC-System gepflegt. "
        f"139 lagernd, 405 ohne Marke (Altmasse), 58 ohne Preis. "
        f"Top-Kategorien: Verdichter (1.976), Ventilatoren (960), Expansionsventile (669). "
        f"Top-Marken: Danfoss (1.822), Thermotrick (476), Ebm-Papst (396), Embraco (375), Sanhua (317)."
    ),
})

print(f'\nToplam Q&A: {len(all_qas)}')

# ─── Split & save ───
# Tahmini: 10K Q&A × 0.5KB = 5MB. 2 parça yapalım.
SPLIT = 5500
parts = []
for i in range(0, len(all_qas), SPLIT):
    parts.append(all_qas[i:i+SPLIT])

print(f'Bölüm sayısı: {len(parts)}')
for idx, part in enumerate(parts, start=1):
    out = SCRIPT_DIR / f'drc_man_all_products_faq.part{idx}.json'
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(part, f, ensure_ascii=False)
    size_mb = out.stat().st_size / 1024 / 1024
    print(f'✓ part{idx}: {len(part)} Q&A, {size_mb:.2f} MB → {out.name}')
