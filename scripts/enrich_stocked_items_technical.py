#!/usr/bin/env python3
"""
Stoklu 139 ürünün notes alanını kategori-bazlı teknik özelliklerle zenginleştirir.
Mevcut notes'a "TEKNIK:" bölümü ekler (override etmez, append yapar).
"""
import json
import re
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent

# DB'den aktif stoklu ürünleri Node ile çek
node_dump = """
const { Pool } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('.env','utf8').split('\\n').filter(l=>l.includes('=')).reduce((a,l)=>{const [k,...v]=l.split('=');a[k]=v.join('=').replace(/^"|"$/g,'');return a;},{});
const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await pool.query(`
    WITH stock AS (
      SELECT m.item_id, SUM(CASE WHEN m.type='entry' THEN m.quantity WHEN m.type='exit' THEN -m.quantity ELSE 0 END)::numeric AS qty
      FROM movements m GROUP BY m.item_id
    )
    SELECT i.id, i.name, COALESCE(i.brand,'') AS brand, COALESCE(i.category,'') AS category,
           COALESCE(i.unit,'') AS unit, COALESCE(i.notes,'') AS notes,
           COALESCE(i.notes_de,'') AS notes_de,
           COALESCE(i.default_price,0)::numeric AS def_price, s.qty AS stock
    FROM items i JOIN stock s ON s.item_id=i.id
    WHERE i.is_active=true AND s.qty > 0
    ORDER BY i.id
  `);
  console.log(JSON.stringify(r.rows));
  await pool.end();
})();
"""
import os
os.chdir('/Users/anilakbas/Desktop/Hamburg depo stok programı ')
import tempfile
with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, dir='.') as f:
    f.write(node_dump)
    tmp = f.name
result = subprocess.run(['node', tmp], capture_output=True, text=True)
os.unlink(tmp)
items = json.loads(result.stdout)
print(f'Stoklu ürün: {len(items)}')


# ============================================================
#  KATEGORİ-BAZLI TEKNİK ENRICHMENT FONKSİYONLARI
# ============================================================

def parse_basic_specs(name, notes):
    """Ürün adı + notes'tan temel teknik veri çıkar."""
    text = f"{name} {notes}".lower()
    s = {}

    hp = re.search(r'(\d+(?:[\.,]\d+)?)\s*hp', text)
    if hp: s['hp'] = hp.group(1).replace(',', '.')

    kw = re.search(r'(\d+(?:[\.,]\d+)?)\s*kw\b', text)
    if kw: s['kw'] = kw.group(1).replace(',', '.')

    watt = re.search(r'(\d+(?:[\.,]\d+)?)\s*w(?:att|er)?\b', text)
    if watt: s['watt'] = watt.group(1).replace(',', '.').replace('.', '')

    btu = re.search(r'(\d+[\.,]?\d*)\s*btu', text)
    if btu: s['btu'] = btu.group(1).replace(',', '.')

    volt = re.search(r'(110|220|230|380|400|415)\s*v\b', text)
    if volt: s['volt'] = volt.group(1)

    if any(t in text for t in ['3 faz', '3 ph', 'trifaze', '3 phase', '3ph', '380v', '400v']):
        s['phase'] = '3-faz (380-400V)'
    elif '220v' in text:
        s['phase'] = '1-faz (220V)'

    for gas in ['r404a', 'r-404a', 'r134a', 'r-134a', 'r290', 'r-290', 'r600', 'r-600',
                'r448', 'r-448', 'r449', 'r-449', 'r452', 'r-452', 'r407c', 'r-407c',
                'r410a', 'r-410a', 'r744', 'co2', 'r717', 'r22', 'r-22', 'r1234yf', 'r1234ze',
                'r404', 'r134', 'r407', 'r410']:
        if gas in text:
            s['gas'] = gas.upper().replace('-', '').replace(',', '/')
            break

    dim = re.search(r'(\d+\s*[x×]\s*\d+(?:\s*[x×]\s*\d+)?)', text)
    if dim:
        d = dim.group(1).replace(' ', '').replace('×', 'x')
        if 4 <= len(d) <= 18: s['dim'] = d

    temp = re.search(r'(-?\d+)\s*[°˚]\s*c', text)
    if temp: s['temp'] = f"{temp.group(1)}°C"

    cap_kg = re.search(r'(\d+(?:[\.,]\d+)?)\s*kg\b', text)
    if cap_kg: s['kg'] = cap_kg.group(1).replace(',', '.')

    cap_lt = re.search(r'(\d+(?:[\.,]\d+)?)\s*l(?:t|itre)?\b', text)
    if cap_lt: s['lt'] = cap_lt.group(1).replace(',', '.')

    fan = re.search(r'(\d+)\s*[x×]\s*(\d+)\s*(?:fan|mm)', text)
    if fan: s['fan'] = f"{fan.group(1)}×{fan.group(2)} fan"

    m2 = re.search(r'(\d+(?:[\.,]\d+)?)\s*m[\s\.]?\s*[²2]?', text)
    if m2:
        v = m2.group(1).replace(',', '.')
        if 0.5 < float(v) < 500: s['m2'] = f"{v} m²"

    diam_inch = re.search(r'(\d+/\d+)\s*[\"″]', text)
    if diam_inch: s['inch'] = diam_inch.group(1)

    return s


def fmt_specs(s):
    """Spec dict'i okunabilir kısa metne çevir."""
    parts = []
    if 'hp' in s: parts.append(f"Güç: {s['hp']} HP")
    if 'kw' in s: parts.append(f"Güç: {s['kw']} kW")
    if 'watt' in s and 'kw' not in s and 'hp' not in s: parts.append(f"Kapasite: {s['watt']} W")
    if 'btu' in s: parts.append(f"BTU: {s['btu']}")
    if 'volt' in s: parts.append(f"Voltaj: {s['volt']}V")
    if 'phase' in s: parts.append(f"Faz: {s['phase']}")
    if 'gas' in s: parts.append(f"Soğutkan: {s['gas']}")
    if 'temp' in s: parts.append(f"Sıcaklık: {s['temp']}")
    if 'dim' in s: parts.append(f"Ölçü: {s['dim']} mm")
    if 'm2' in s: parts.append(f"Yüzey: {s['m2']}")
    if 'fan' in s: parts.append(f"Fan: {s['fan']}")
    if 'kg' in s: parts.append(f"Ağırlık/Hacim: {s['kg']} kg")
    if 'lt' in s: parts.append(f"Hacim: {s['lt']} L")
    if 'inch' in s: parts.append(f"Çap: {s['inch']}\"")
    return parts


# Kategori-spesifik ek teknik açıklamalar
CATEGORY_DESCRIPTIONS = {
    'Kompresörler': "Hermetik/Yarı-Hermetik kompresör. Soğutma sistemine uygun yağ ile çalışır. Bağlantı: pas/üfleme/emiş portları.",
    'Kondenser Üniteleri': "Kompresör + kondenser bobini + fan paketi. Dış ünite olarak kullanılır. Sıcak hava reddetme.",
    'Kondenserler': "Sıcak refrigerant gazını yoğunlaştıran ısı değiştirici. Hava soğutmalı, fan tahrikli.",
    'Evaporatörler': "Soğutma odası içinde ısı çekme görevi. Hava üfleme veya tavana asılı tip.",
    'Soğutma Grupları': "Kompresör + kondenser + iç ünite + kontrol komple soğutma sistemi. Anahtar teslim kurulum için.",
    'Panel': "Soğuk oda yalıtım paneli. PIR/PUR sandvic, 2 yüz galvaniz/boyalı sac, kilitli/kilitsiz birleşim.",
    'Soğuk Oda Kapıları': "Menteşeli/sürgülü tip. Rezistans (ısıtıcı) seçeneği donmaya karşı. PIR yalıtım.",
    'Soğuk Oda Aksesuarları': "Köşe profili, U-zemin profili, kapama PVC, düzeltici elemanlar.",
    'Fan Motorları': "Aksiyel/santrifüj radyal fan. Soğuk hava döngüsü için. RPM ve çap önemli.",
    'Soğutucu Akışkanlar': "HFC/HFO/HC tipi soğutkan gaz. Doldurulabilir tüp/depozitolu.",
    'Soğutucu Yağı': "POE/POE+/Mineral kompresör yağı. Soğutkana göre uyumlu seçilir.",
    'İzolasyonlu Borular': "Bakır boru + kapalı hücreli kauçuk yalıtım. Çift hat (likit + emiş).",
    'Bakır Boru': "Çıplak bakır rotalı boru. Lehimli birleşim için tavlı/sert tipi.",
    'Elektrik Malzemeleri': "Kontrol panosu, kablo, sigorta, kontaktör, termostat, prob.",
    'Genleşme Vanaları': "Termostatik/elektronik genleşme. Soğutkana spesifik orifis ve kapasite.",
    'Filtreler & Kurutucular': "Likit hattı kurutucu filtre. Moleküler elek + asit absorber.",
    'Termostatlar & Termometreler': "Soğuk oda kontrolü, dijital ekran. Set range, çalışma voltajı.",
    'Buzdolapları ve Vitrinler': "Endüstriyel soğutmalı dolap/reyon. Cephe veya dik camlı.",
    'Pompalar': "Drenaj pompası kondens suyu için. Kapasite L/saat.",
    'Sızdırmazlık': "Silikon, poliüretan köpük, contalar.",
}

CATEGORY_DESCRIPTIONS_DE = {
    'Kompresörler': "Hermetischer/halbhermetischer Verdichter. Mit kältemittelspezifischem Öl. Saug-/Druckanschlüsse.",
    'Kondenser Üniteleri': "Verflüssigungssatz: Verdichter + Kondensator + Lüfterpaket. Außeneinheit.",
    'Kondenserler': "Verflüssiger - Wärmetauscher zur Verflüssigung des Heißgases. Luftgekühlt mit Lüfter.",
    'Evaporatörler': "Verdampfer im Kühlraum für Wärmeaufnahme. Decken- oder Wandmontage mit Lüfter.",
    'Soğutma Grupları': "Komplettes Kältesystem: Verdichter + Verflüssiger + Innengerät + Steuerung.",
    'Panel': "Kühlraum-Sandwichpaneel. PIR/PUR-Kern, beidseitig verzinkt/lackiert.",
    'Soğuk Oda Kapıları': "Schwenk-/Schiebetür mit Rahmenheizung. PIR-Isolierung.",
    'Soğuk Oda Aksesuarları': "Eckprofil, U-Bodenprofil, PVC-Abschluss.",
    'Fan Motorları': "Axial-/Radialventilator für Kühlluftumwälzung. RPM und Durchmesser entscheidend.",
    'Soğutucu Akışkanlar': "HFC/HFO/HC Kältemittel. Wiederbefüllbar mit Pfand.",
    'Soğutucu Yağı': "POE/POE+/Mineralöl für Verdichter. Kältemittelspezifisch.",
    'İzolasyonlu Borular': "Kupferrohr mit Kautschuk-Isolierung. Doppelleitung (Flüssig + Saug).",
    'Bakır Boru': "Blanke Kupferleitung. Geglüht/hart für Lötverbindungen.",
    'Elektrik Malzemeleri': "Schaltschrank, Kabel, Sicherung, Schütz, Thermostat.",
    'Genleşme Vanaları': "Thermostatisches/elektronisches Expansionsventil.",
    'Filtreler & Kurutucular': "Filter-Trockner für Flüssigkeitsleitung.",
    'Termostatlar & Termometreler': "Kühlraumsteuerung mit Digitalanzeige.",
    'Buzdolapları ve Vitrinler': "Industrieller Kühl-/Tiefkühlschrank, Vitrinen.",
    'Pompalar': "Kondensatpumpe für Drainage. Kapazität L/h.",
    'Sızdırmazlık': "Silikon, PU-Schaum, Dichtungen.",
}


def build_enriched_notes(item):
    """Mevcut notes'u koruyarak teknik özellik bölümü ekle."""
    name = (item.get('name') or '').strip()
    brand = (item.get('brand') or '').strip()
    category = (item.get('category') or '').strip()
    unit = (item.get('unit') or '').strip()
    existing = (item.get('notes') or '').strip()

    specs = parse_basic_specs(name, existing)
    spec_lines = fmt_specs(specs)

    cat_desc = CATEGORY_DESCRIPTIONS.get(category, '')

    # Mevcut notes'ta zaten "TEKNİK ÖZELLİKLER:" varsa override etmeyelim
    if 'TEKNİK ÖZELLİKLER:' in existing or '⚙ TEKNİK' in existing:
        return existing  # Zaten zenginleştirilmiş

    # Yeni teknik bölüm
    parts = []
    if existing:
        parts.append(existing)
    parts.append('')
    parts.append('⚙ TEKNİK ÖZELLİKLER:')
    if spec_lines:
        for line in spec_lines:
            parts.append(f'  • {line}')
    if brand:
        parts.append(f'  • Marka: {brand}')
    if category:
        parts.append(f'  • Kategori: {category}')
    if unit:
        parts.append(f'  • Birim: {unit}')
    if cat_desc:
        parts.append('')
        parts.append(f'ℹ {cat_desc}')

    return '\n'.join(parts)


def build_enriched_notes_de(item):
    name = (item.get('name') or '').strip()
    brand = (item.get('brand') or '').strip()
    category = (item.get('category') or '').strip()
    unit = (item.get('unit') or '').strip()
    existing = (item.get('notes_de') or '').strip()
    existing_tr_notes = (item.get('notes') or '').strip()

    specs = parse_basic_specs(name, existing_tr_notes)
    spec_lines = fmt_specs(specs)
    # Manuel TR→DE çeviri spec etiketleri
    de_translate = {
        'Güç': 'Leistung', 'Kapasite': 'Kapazität', 'BTU': 'BTU',
        'Voltaj': 'Spannung', 'Faz': 'Phase', 'Soğutkan': 'Kältemittel',
        'Sıcaklık': 'Temperatur', 'Ölçü': 'Maße', 'Yüzey': 'Fläche',
        'Fan': 'Lüfter', 'Ağırlık/Hacim': 'Gewicht/Volumen', 'Hacim': 'Volumen', 'Çap': 'Durchmesser',
    }
    de_lines = []
    for line in spec_lines:
        for tr, de in de_translate.items():
            if line.startswith(tr + ':'):
                de_lines.append(line.replace(tr + ':', de + ':', 1))
                break
        else:
            de_lines.append(line)

    cat_desc_de = CATEGORY_DESCRIPTIONS_DE.get(category, '')

    if 'TECHNISCHE DATEN:' in existing or '⚙ TECHNISCHE' in existing:
        return existing

    parts = []
    if existing:
        parts.append(existing)
    parts.append('')
    parts.append('⚙ TECHNISCHE DATEN:')
    if de_lines:
        for line in de_lines:
            parts.append(f'  • {line}')
    if brand:
        parts.append(f'  • Marke: {brand}')
    if category:
        parts.append(f'  • Kategorie: {category}')
    if unit:
        parts.append(f'  • Einheit: {unit}')
    if cat_desc_de:
        parts.append('')
        parts.append(f'ℹ {cat_desc_de}')

    return '\n'.join(parts)


# ============================================================
# PROCESS
# ============================================================
print('Zenginleştirme başlıyor...')
updates = []
for it in items:
    new_tr = build_enriched_notes(it)
    new_de = build_enriched_notes_de(it)
    old_tr = (it.get('notes') or '').strip()
    old_de = (it.get('notes_de') or '').strip()
    if new_tr != old_tr or new_de != old_de:
        updates.append({'id': it['id'], 'tr': new_tr, 'de': new_de})

print(f'Güncellenecek ürün: {len(updates)}/{len(items)}')

# JSON dump for Node update
out = SCRIPT_DIR / '_enriched_notes.json'
with open(out, 'w', encoding='utf-8') as f:
    json.dump(updates, f, ensure_ascii=False, indent=2)
print(f'✓ JSON yazıldı: {out}')

# Örnek 3 ürün göster
print('\n=== ÖRNEK ZENGINLEŞTIRMELER ===')
for u in updates[:3]:
    print(f'\n#{u["id"]} TR (yeni):')
    print('  ' + u['tr'][:400].replace('\n', '\n  '))
