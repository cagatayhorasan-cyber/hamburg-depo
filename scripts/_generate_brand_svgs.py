#!/usr/bin/env python3
"""
Top markalar için SVG wordmark logoları üretir.
Her marka için kendi rengi + temiz wordmark.
"""
import os
import urllib.parse

OUT = '/Users/anilakbas/Desktop/Hamburg depo stok programı /public/assets/brands'
os.makedirs(OUT, exist_ok=True)

# (slug, görünen marka adı, renk hex, alt yazı opsiyonel)
BRANDS = [
    # Mevcut (üretilenler atlanır, sadece ek olanlar yazılır)
    ('thermotrick',  'Thermotrick',  '#0099CC', None),
    ('ebmpapst',     'ebm-papst',    '#003D7A', None),
    ('value',        'VALUE',        '#005DAA', None),
    ('blowtech',     'Blow-Tech',    '#1A2A3D', None),
    ('gunay',        'Günay',        '#003366', 'Heat Exchangers'),
    ('castel',       'CASTEL',       '#E30613', None),
    ('olefini',      'Olefini',      '#005DAA', None),
    ('alco',         'ALCO',         '#1A2A3D', 'Controls'),
    ('thermotherm',  'Thermotherm',  '#0099CC', None),
    ('dorin',        'DORIN',        '#003D7A', None),
    ('olab',         'OLAB',         '#0099CC', None),
    ('refcomp',      'REFCOMP',      '#E30613', None),
    ('carel',        'Carel',        '#E30613', None),
    ('typhoon',      'Typhoon',      '#1A2A3D', None),
    ('lionball',     'Lionball',     '#003D7A', None),
    ('cubigel',      'Cubigel',      '#0099CC', None),
    ('frascold',     'Frascold',     '#003D7A', None),
    ('refricomp',    'Refricomp',    '#005DAA', None),
    ('gvn',          'GVN Güven',    '#0099D8', None),
    ('rothenberger', 'ROTHENBERGER', '#E30613', None),
    ('srmtec',       'SRMtec',       '#003D7A', None),
    ('sporlan',      'Sporlan',      '#003D7A', None),
    ('hongsen',      'HONGSEN',      '#005DAA', None),
    ('refco',        'REFCO',        '#E30613', None),
    ('panasonic',    'Panasonic',    '#0F4C92', None),
    ('honeywell',    'Honeywell',    '#E30613', None),
    ('schneider',    'Schneider',    '#3DCD58', 'Electric'),
    ('siemens',      'SIEMENS',      '#009999', None),
    ('mitsubishi',   'Mitsubishi',   '#DC0032', 'Electric'),
    ('samsung',      'SAMSUNG',      '#1428A0', None),
    ('dixell',       'Dixell',       '#1E6091', None),
    ('systemair',    'Systemair',    '#005AAA', None),
    ('weiguang',     'Weiguang',     '#C8102E', None),
    ('emerson',      'EMERSON',      '#005DAA', None),
    ('elektrosan',   'Elektrosan',   '#0F5132', None),
    ('alfalaval',    'Alfa Laval',   '#001F3F', None),
    ('guntner',      'Güntner',      '#003366', None),
    ('luve',         'Lu-Ve',        '#E30613', None),
    ('ottocool',     'Ottocool',     '#0B6CB3', None),
    ('esen',         'Esen',         '#1B1F23', None),
    ('secop',        'Secop',        '#005DAA', None),
    ('ranco',        'Ranco',        '#1A2A3D', None),
    ('fstb',         'FSTB',         '#005DAA', None),
    ('gomax',        'GOMAX',        '#E30613', None),
    ('coldflex',     'Coldflex',     '#0099CC', None),
    ('lubreeze',     'Lubreeze',     '#003D7A', None),
    ('errecom',      'Errecom',      '#E30613', None),
    ('talos',        'Talos',        '#005DAA', 'Ecutherm'),
    ('damla',        'Damla',        '#0099CC', None),
    ('hisense',      'Hisense',      '#1428A0', None),
    ('zingfa',       'Zingfa',       '#E30613', None),
    ('refrigerant',  'Refrigerant',  '#0099CC', None),
    ('kontak',       'KONTAK',       '#003D7A', 'Otomasyon'),
    ('sibax',        'Sibax',        '#003D7A', None),
    ('selsil',       'Selsil',       '#E30613', None),
    ('siccom',       'SICCOM',       '#003D7A', None),
    ('embraco',      'embraco',      '#005EB8', None),  # üzerine yaz, daha temiz
    ('m2m',          'M2M',          '#003D7A', None),
    ('act',          'ACT',          '#E30613', None),
    ('mespan',       'MESPAN',       '#003366', None),  # üzerine yaz
    ('ets',          'ETS',          '#0099CC', 'Mühendislik'),  # üzerine yaz
]

def make_svg(name, color, sub):
    name_len = len(name)
    fs = 32 if name_len <= 6 else (28 if name_len <= 10 else (24 if name_len <= 14 else 20))
    sub_y_offset = 16 if sub else 0
    main_y = 38 if sub else 42
    sub_part = ''
    if sub:
        sub_part = f'''<text x="110" y="54" text-anchor="middle"
        font-family="'Inter','Helvetica Neue',Arial,sans-serif"
        font-weight="500" font-size="11" letter-spacing="0.5"
        fill="#1A2A3D">{sub}</text>'''
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 60" role="img" aria-label="{name}">
  <title>{name}</title>
  <text x="110" y="{main_y}" text-anchor="middle"
        font-family="'Inter','Helvetica Neue',Arial,sans-serif"
        font-weight="800" font-size="{fs}" letter-spacing="-0.3"
        fill="{color}">{name}</text>
  {sub_part}
</svg>
'''
    return svg

count = 0
for slug, display, color, sub in BRANDS:
    path = os.path.join(OUT, f'{slug}.svg')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(make_svg(display, color, sub))
    count += 1

print(f'✓ {count} marka SVG üretildi')
print(f'   Konum: {OUT}')
