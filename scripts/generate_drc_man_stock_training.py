#!/usr/bin/env python3
"""
Stoktaki 139 ürünün teknik verilerini DRC MAN'a Q&A formatında öğretir.
Her ürün için 3-5 Q&A çifti üretir (teknik veri, stok, fiyat, kategori, alternatifler).
"""
import json
import re
import os
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
INPUT = '/tmp/stocked_items.json'
OUTPUT = SCRIPT_DIR / 'drc_man_stock_technical_faq.json'

with open(INPUT, encoding='utf-8') as f:
    items = json.load(f)

print(f'Yüklenen ürün: {len(items)}')

def fmt_price(v):
    return f"€{float(v):.2f}" if v else "—"

def parse_specs(name, notes):
    """Ürün adından ve notlardan teknik özellikleri çıkar."""
    text = f"{name} {notes}".lower()
    specs = {}

    # Güç / kapasite
    hp = re.search(r'(\d+(?:[\.,]\d+)?)\s*hp', text)
    if hp: specs['hp'] = hp.group(1).replace(',', '.')

    watt = re.search(r'(\d+(?:[\.,]\d+)?)\s*w(?:att)?\b', text)
    if watt: specs['watt'] = watt.group(1).replace(',', '.')

    kw = re.search(r'(\d+(?:[\.,]\d+)?)\s*kw\b', text)
    if kw: specs['kw'] = kw.group(1).replace(',', '.')

    # Voltaj
    volt = re.search(r'(220|230|380|400)\s*v', text)
    if volt: specs['volt'] = volt.group(1)

    # Faz
    if '3 faz' in text or '3 ph' in text or 'trifaze' in text or '380v' in text or '400v' in text:
        specs['phase'] = '3F'
    elif '220v' in text or 'tek faz' in text:
        specs['phase'] = '1F'

    # Gaz
    for gas in ['r404', 'r-404', 'r134', 'r-134', 'r290', 'r-290', 'r600', 'r-600', 'r448', 'r-448', 'r449', 'r-449', 'r452', 'r-452', 'r407', 'r-407', 'r410', 'r-410', 'r744', 'co2', 'r717', 'amonyak']:
        if gas in text:
            specs['gas'] = gas.upper().replace('-', '')
            break

    # Boyut/ölçü
    dim = re.search(r'(\d+\s*[x×]\s*\d+(?:\s*[x×]\s*\d+)?)', text)
    if dim: specs['dim'] = dim.group(1).replace(' ', '').replace('×', 'x')

    # Sıcaklık
    temp = re.search(r'(-?\d+)\s*[°˚]?\s*c', text)
    if temp: specs['temp'] = f"{temp.group(1)}°C"

    return specs


def build_qa_for_item(it):
    """Bir ürün için 3-5 Q&A çifti üret."""
    qas = []
    item_id = it['id']
    name = (it.get('name') or '').strip()
    name_de = (it.get('name_de') or '').strip() or name
    brand = (it.get('brand') or '').strip() or 'DRC'
    category = (it.get('category') or '').strip()
    unit = (it.get('unit') or 'adet').strip()
    notes = (it.get('notes') or '').strip()
    product_code = (it.get('product_code') or '').strip()

    cost = float(it.get('def_price') or 0)
    sale = float(it.get('sale_price') or 0)
    list_p = float(it.get('list_price') or 0)
    stock = float(it.get('stock') or 0)

    specs = parse_specs(name, notes)
    spec_summary_parts = []
    if 'hp' in specs: spec_summary_parts.append(f"{specs['hp']} HP")
    if 'kw' in specs: spec_summary_parts.append(f"{specs['kw']} kW")
    if 'watt' in specs: spec_summary_parts.append(f"{specs['watt']} W")
    if 'volt' in specs: spec_summary_parts.append(f"{specs['volt']}V")
    if 'phase' in specs: spec_summary_parts.append(specs['phase'])
    if 'gas' in specs: spec_summary_parts.append(specs['gas'])
    if 'dim' in specs: spec_summary_parts.append(specs['dim'])
    if 'temp' in specs: spec_summary_parts.append(specs['temp'])
    spec_summary = ' · '.join(spec_summary_parts) if spec_summary_parts else 'standart konfigürasyon'

    # Notes temizle (uzun teknik metni dengele)
    notes_clean = notes
    # 'Detay:' ile başlıyorsa al, ama uzunsa kıs
    if 'Detay:' in notes_clean:
        notes_clean = notes_clean.split('|')[0].replace('Detay:', '').strip()
    notes_clean = notes_clean[:300]
    # MÜŞTERİ GÜVENLİĞİ: cost/maliyet bilgisi notes'tan sızmamalı
    notes_clean = re.sub(r'cost\s*[=:]?\s*€?\s*\d+(?:[\.,]\d+)?', '[cost gizli]', notes_clean, flags=re.IGNORECASE)
    notes_clean = re.sub(r'maliyet\s*[=:]?\s*€?\s*\d+(?:[\.,]\d+)?', '[maliyet gizli]', notes_clean, flags=re.IGNORECASE)

    # ───── Q1: Stok + fiyat (MALZEME) ─────
    short_name = name[:60]
    tr_q1 = f"{short_name} stokta var mı, kaç adet ve fiyatı nedir?"
    tr_a1 = (
        f"DB#{item_id} {name} | Marka: {brand} | Kategori: {category} | Birim: {unit}. "
        f"Hamburg depoda {stock:g} {unit} stok mevcut. "
        f"Net: {fmt_price(sale)}, Brüt (liste): {fmt_price(list_p)}. "
        f"Teknik özet: {spec_summary}. Bu MALZEME sorusudur — kart bilgisidir."
    )
    de_q1 = f"Wie viele {short_name} sind am Lager und was kostet das?"
    de_a1 = (
        f"DB#{item_id} {name_de} | Marke: {brand} | Kategorie: {category} | Einheit: {unit}. "
        f"In Hamburg lagernd: {stock:g} {unit}. "
        f"Netto (VK): {fmt_price(sale)}, Brutto (Liste): {fmt_price(list_p)}. "
        f"Technische Kurzdaten: {spec_summary}. Das ist eine Materialfrage."
    )
    qas.append({
        "tags": ["stock_technical", "malzeme", brand.lower(), str(item_id)],
        "tr_question": tr_q1, "tr_answer": tr_a1,
        "de_question": de_q1, "de_answer": de_a1,
    })

    # ───── Q2: Teknik veri (USTALIK/MALZEME karma) ─────
    if spec_summary != 'standart konfigürasyon':
        tr_q2 = f"{brand} {short_name} teknik özellikleri nedir?"
        tr_a2 = (
            f"DB#{item_id} {name} kart kayıtlarına göre: {spec_summary}. "
        )
        if notes_clean:
            tr_a2 += f"Detay: {notes_clean}. "
        tr_a2 += (
            f"Bu kalem '{category}' kategorisinde {unit} bazlı satılır. "
            f"Stok: {stock:g} {unit}. "
            f"Net fiyat {fmt_price(sale)}. "
            "Eğer projede uygulayacaksan kapasite, gaz ve sistem uyumunu önce kontrol et."
        )
        de_q2 = f"Was sind die technischen Daten von {brand} {short_name}?"
        de_a2 = (
            f"DB#{item_id} {name_de} laut Stammdaten: {spec_summary}. "
        )
        if notes_clean:
            de_a2 += f"Detail: {notes_clean[:300]}. "
        de_a2 += (
            f"Position liegt in der Kategorie '{category}', Einheit {unit}. "
            f"Lagerstand: {stock:g} {unit}. Nettopreis {fmt_price(sale)}. "
            "Vor Projekteinsatz Kapazitaet, Kaeltemittel und Systemkompatibilitaet pruefen."
        )
        qas.append({
            "tags": ["stock_technical", "malzeme_teknik", brand.lower(), str(item_id)],
            "tr_question": tr_q2, "tr_answer": tr_a2,
            "de_question": de_q2, "de_answer": de_a2,
        })

    # ───── Q3: Code/SKU sorgusu (varsa) ─────
    code = product_code or (it.get('barcode') or '')
    # Ürün adından da kod çıkarılabilir
    if not code:
        code_match = re.search(r'\b([A-Z]{2,}[\.\-]?[A-Z0-9\.\-/]{2,})\b', name)
        if code_match:
            code = code_match.group(1)

    if code and len(code) >= 4 and not code.isdigit():
        tr_q3 = f"{code} kodlu ürün hangisi?"
        tr_a3 = (
            f"{code}, DB#{item_id} '{name}' kaydının kodudur. Marka: {brand}, Kategori: {category}. "
            f"Hamburg depoda {stock:g} {unit} stoklu, net fiyat {fmt_price(sale)}. "
            f"Teknik özet: {spec_summary}."
        )
        de_q3 = f"Welches Produkt ist {code}?"
        de_a3 = (
            f"{code} ist der Code fuer DB#{item_id} '{name_de}'. Marke: {brand}, Kategorie: {category}. "
            f"In Hamburg lagernd: {stock:g} {unit}, VK netto {fmt_price(sale)}. "
            f"Kurzdaten: {spec_summary}."
        )
        qas.append({
            "tags": ["stock_technical", "code_lookup", brand.lower(), str(item_id)],
            "tr_question": tr_q3, "tr_answer": tr_a3,
            "de_question": de_q3, "de_answer": de_a3,
        })

    return qas


# Tüm ürünler için Q&A üret
all_qas = []
for it in items:
    qas = build_qa_for_item(it)
    all_qas.extend(qas)

print(f'Üretilen Q&A: {len(all_qas)}')

# Genel summary Q&A ekle
all_qas.append({
    "tags": ["stock_technical", "ozetleme", "stok_durumu"],
    "tr_question": "Hamburg depoda toplam kaç çeşit ürün stokta var?",
    "tr_answer": (
        f"Hamburg depoda 08.05.2026 itibariyle {len(items)} farklı stoklu ürün bulunmaktadır. "
        f"Toplam stok değeri yaklaşık €313.515 (cost), €501.084 (sale). "
        f"Bunlar 139 farklı kalem; en çok değer taşıyan 5 kalem: "
        f"DRC çarpma kapı (€18.000), GVN likit tankı (€16.538), Errecom POE 170 yağ (€8.800), "
        f"Copeland scroll kompresör (€8.800), DRC çarpma kapı 180×80 (€8.800). "
        f"Detay rapor için Excel: /Users/anilakbas/Desktop/HamburgDepo_Stoklu_Urunler_08052026.xlsx"
    ),
    "de_question": "Wieviele verschiedene Artikel sind in Hamburg am Lager?",
    "de_answer": (
        f"Stand 08.05.2026 sind {len(items)} verschiedene Artikel im Hamburger Lager auf Bestand. "
        f"Gesamt-Lagerwert ca. EK €313.515, VK €501.084. "
        f"Top 5 nach Wert: DRC Tuerheizung (€18.000), GVN Fluessigkeitssammler (€16.538), "
        f"Errecom POE 170 Oel (€8.800), Copeland Scroll Verdichter (€8.800), DRC Tuerheizung 180×80 (€8.800). "
        f"Excel-Bericht: /Users/anilakbas/Desktop/HamburgDepo_Stoklu_Urunler_08052026.xlsx"
    ),
})

# Marka grupları için summary
from collections import defaultdict
by_brand = defaultdict(list)
for it in items:
    by_brand[(it.get('brand') or '').strip() or 'DRC'].append(it)

for brand, brand_items in sorted(by_brand.items(), key=lambda x: -len(x[1])):
    if len(brand_items) < 2:
        continue
    total_stock_value = sum(float(it.get('stock') or 0) * float(it.get('def_price') or 0) for it in brand_items)
    sample_names = [it['name'][:40] for it in brand_items[:5]]
    tr_q = f"{brand} markasından stokta hangi ürünler var?"
    tr_a = (
        f"{brand} markasından Hamburg depoda toplam {len(brand_items)} farklı kalem stoklu. "
        f"Toplam stok değeri (cost): €{total_stock_value:.2f}. "
        f"Örnek ürünler: {' · '.join(sample_names)}."
    )
    de_q = f"Welche {brand} Artikel sind am Lager?"
    de_a = (
        f"Vom Hersteller {brand} sind aktuell {len(brand_items)} verschiedene Artikel in Hamburg lagernd. "
        f"Gesamtlagerwert (EK): €{total_stock_value:.2f}. "
        f"Beispiele: {' · '.join(sample_names)}."
    )
    all_qas.append({
        "tags": ["stock_technical", "brand_overview", brand.lower()],
        "tr_question": tr_q, "tr_answer": tr_a,
        "de_question": de_q, "de_answer": de_a,
    })

print(f'Toplam Q&A (marka özetleri dahil): {len(all_qas)}')

with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(all_qas, f, ensure_ascii=False, indent=2)

# Boyut bilgisi
size_kb = OUTPUT.stat().st_size / 1024
print(f'✓ Yazıldı: {OUTPUT} ({size_kb:.1f} KB)')
