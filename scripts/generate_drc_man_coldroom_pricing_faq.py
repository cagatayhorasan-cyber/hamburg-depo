#!/usr/bin/env python3
"""
DRC MAN — SOĞUK ODA KAPASITE + FİYAT HESAPLAMA BANKASI
ColdRoomPro mantığıyla yaygın oda boyutları için tam fiyatlandırma.
"""
import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUTPUT = SCRIPT_DIR / 'drc_man_coldroom_pricing_faq.json'

# ─── Sabitler (ColdRoomPro defaultları + DB'deki gerçek ürün fiyatları) ───
PANEL_M2_PRICE = 50      # €/m² (DRC default 2026-05-08)
DOOR_PRICE = 350         # € adet (DRC default standart kapı 80×190 12cm)

# Kompresör/grup HP → fiyat (DRC katalogundan, sale price)
COMPRESSOR_GROUPS = {
    1.0: ('1 HP (0/+5) 220V Tecumseh Komplu Grubu', '#23893', 1220),
    1.5: ('1.5 HP (0/+5) ThermETS HSC-MP10015', '#23816', 1990),
    2.0: ('2.0 HP (0/+5) ThermETS HSC-MP10020 / 380V Tecumseh', '#20', 1560),
    2.5: ('2.5 HP (0/+5) 380V Tecumseh Komplu Grubu', '#23894 ya da #44', 2684),
    3.0: ('3 HP (0/-18) 380V Tecumseh Komplu (donuk için)', '#40', 1951),
    3.5: ('3 HP Pozitif veya 3.5 HP arasında karma seçim', '#21', 2285),
    4.0: ('4.5 HP (0/+5) 380V Tecumseh Komplu Grubu', '#44', 2684),
    5.0: ('5 HP THERMETS/HSC.MP10050.TT04SE 5HP Pozitif', '#22', 2954),
    7.5: ('7.5 HP (0/+5) 380V Dorin Komplu Soğutma Grubu', '#41', 4689),
    10.0: ('10 HP (0/+5) 380V Dorin Komplu Çift Evapli', '#49', 5074),
    16.0: ('16 HP ThermETS SHSC-LP10160-DT04SE Semi-Hermetik', '#19', 7593),
}

# Oda boyutları (W × D × H metre)
ROOMS = [
    (3, 3, 2.5,  '+4°C', 1.0),  # küçük market deposu
    (3, 3, 2.5,  '-18°C', 1.5),
    (3, 3, 3,    '+4°C', 1.0),
    (4, 3, 2.5,  '+4°C', 1.5),
    (4, 3, 3,    '+4°C', 1.5),
    (4, 3, 3,    '-18°C', 2.5),
    (4, 4, 3,    '+4°C', 2.0),
    (5, 3, 3,    '+4°C', 2.0),
    (5, 4, 3,    '+4°C', 2.5),  # USER'IN SORDUĞU ÖRNEK
    (5, 4, 3,    '-18°C', 4.0),
    (5, 4, 3,    '0°C',  3.0),
    (6, 4, 3,    '+4°C', 3.0),
    (6, 4, 3,    '-18°C', 5.0),
    (6, 5, 3,    '+4°C', 3.0),
    (6, 5, 3,    '-18°C', 5.0),
    (8, 5, 3,    '+4°C', 4.0),
    (8, 5, 3,    '-18°C', 7.5),
    (8, 6, 3,    '+4°C', 5.0),
    (8, 6, 3,    '-18°C', 7.5),
    (10, 6, 3,   '+4°C', 5.0),
    (10, 6, 3,   '-18°C', 10.0),
    (10, 8, 3.5, '+4°C', 7.5),
    (10, 8, 3.5, '-18°C', 10.0),
    (12, 8, 3.5, '+4°C', 7.5),
    (12, 8, 3.5, '-18°C', 16.0),
]


def calc_room(w, d, h, temp, hp):
    volume = w * d * h
    door_w, door_h = 0.8, 1.9  # standart kapı
    door_area = door_w * door_h
    surface = (2*w*h + 2*d*h + w*d) - door_area  # 5 yüz, alt hariç değil; toplam-kapı
    # Kapı hariç sandviç panel m²:
    panel_m2 = surface
    panel_cost = panel_m2 * PANEL_M2_PRICE
    door_cost = DOOR_PRICE
    if temp == '-18°C':
        panel_thickness = 120 if w*d <= 30 else 150
        # donuk için min 120mm
    elif temp == '0°C':
        panel_thickness = 100
    else:
        panel_thickness = 80 if w*d <= 12 else 100
    grp_name, grp_id, grp_price = COMPRESSOR_GROUPS.get(hp, ('Belirsiz', '?', 0))
    # Tahmini ek aksesuar: evaporatör kabaca grup fiyatının %30u, kontrol panosu €100, drier+gözetleme €50
    evap_estimate = int(grp_price * 0.30)
    accessories = 100 + 50
    total = panel_cost + door_cost + grp_price + evap_estimate + accessories
    return {
        'volume': round(volume, 1),
        'surface_m2': round(panel_m2, 1),
        'panel_thickness_mm': panel_thickness,
        'panel_cost': round(panel_cost, 2),
        'door_cost': door_cost,
        'group_name': grp_name,
        'group_id': grp_id,
        'group_price': grp_price,
        'evap_estimate': evap_estimate,
        'accessories_estimate': accessories,
        'total_estimate': round(total, 2),
    }


faq = []
for w, d, h, temp, hp in ROOMS:
    c = calc_room(w, d, h, temp, hp)
    sizing_guide = f"{hp} HP" if hp else "değişken"

    tr_q = f"{w}×{d}×{h} metre {temp} soğuk oda için kaç HP grup ve toplam maliyet?"
    tr_a = (
        f"{w}×{d}×{h}m {temp} soğuk oda hesabı: "
        f"Hacim {c['volume']} m³, panel yüzey alanı (kapı hariç) {c['surface_m2']} m², "
        f"panel kalınlığı {c['panel_thickness_mm']} mm önerilir. "
        f"KOMPRESÖR GRUP: {sizing_guide} → {c['group_name']} ({c['group_id']}, sale €{c['group_price']}). "
        f"FİYAT TABLOSU (yaklaşık): "
        f"Sandviç panel ({c['surface_m2']} m² × €{PANEL_M2_PRICE}) = €{c['panel_cost']}, "
        f"Soğuk oda kapısı (80×190, {c['panel_thickness_mm']}mm) = €{c['door_cost']}, "
        f"Komple soğutma grubu ({sizing_guide}) = €{c['group_price']}, "
        f"Evaporatör (yaklaşık) = €{c['evap_estimate']}, "
        f"Aksesuar/profil/kontrol = €{c['accessories_estimate']}. "
        f"TOPLAM TAHMİNİ MALZEME = €{c['total_estimate']}. "
        f"İŞÇİLİK + nakliye + montaj hariç. ColdRoomPro modülünden detaylı tasarım yapılır. "
        f"Bu MALZEME fiyat sorusudur."
    )
    de_q = f"{w}×{d}×{h} m {temp} Kühlraum — wieviele PS und Gesamtkosten?"
    de_a = (
        f"{w}×{d}×{h}m {temp} Kühlraum-Berechnung: "
        f"Volumen {c['volume']} m³, Paneelfläche (ohne Tür) {c['surface_m2']} m², "
        f"Paneelstärke {c['panel_thickness_mm']} mm empfohlen. "
        f"VERDICHTERAGGREGAT: {sizing_guide} → {c['group_name']} ({c['group_id']}, VK €{c['group_price']}). "
        f"PREISÜBERSICHT (ungefähr): "
        f"Sandwichpaneel ({c['surface_m2']} m² × €{PANEL_M2_PRICE}) = €{c['panel_cost']}, "
        f"Kühlraumtür (80×190, {c['panel_thickness_mm']}mm) = €{c['door_cost']}, "
        f"Verflüssigungssatz ({sizing_guide}) = €{c['group_price']}, "
        f"Verdampfer (geschätzt) = €{c['evap_estimate']}, "
        f"Zubehör/Profile/Steuerung = €{c['accessories_estimate']}. "
        f"GESAMT MATERIAL ≈ €{c['total_estimate']}. Montage/Transport extra. "
        f"Detail über ColdRoomPro-Modul. Materialfrage."
    )
    faq.append({
        "tags": ["coldroom_pricing", "calculation", f"{w}x{d}x{h}", temp, f"{hp}hp"],
        "tr_question": tr_q, "tr_answer": tr_a,
        "de_question": de_q, "de_answer": de_a,
    })

# Genel fiyatlandırma kuralları
faq.append({
    "tags": ["coldroom_pricing", "general", "panel"],
    "tr_question": "Soğuk oda paneli m² fiyatı ne kadar?",
    "tr_answer": (
        f"DRC standart soğuk oda paneli m² fiyatı: €{PANEL_M2_PRICE}/m² (varsayılan, ColdRoomPro içinde her teklif için override edilebilir). "
        f"Bu fiyat 60mm-200mm arası tüm kalınlıklar için geçerli (kalınlığa göre değişmez varsayılan). "
        f"PIR/PUR çekirdek + 2 yüz galvaniz/boyalı sac panel. Detay ürünler: "
        f"#10 PANETS/PPWP-100 100mm Duvar Paneli (Lento) Net €29.89, "
        f"#11 PANETS/PPWP-150 150mm Duvar Paneli Net €37.82, "
        f"#26 PANETS/PPWP-80 80mm Duvar Paneli Net €24.40, "
        f"#23133 MESPAN Sandviç Panel 100mm 1×4m Net €42.70."
    ),
    "de_question": "Wie viel kostet ein Kühlraum-Sandwichpaneel pro m²?",
    "de_answer": (
        f"DRC Standard-Sandwichpaneel: €{PANEL_M2_PRICE}/m² (Default, in ColdRoomPro je Angebot überschreibbar). "
        f"Gültig für 60-200 mm Stärken. PIR/PUR-Kern + beidseitig verzinkt/lackiert. Spezifische Produkte: "
        f"#10 PPWP-100 100mm €29,89; #11 PPWP-150 150mm €37,82; #26 PPWP-80 80mm €24,40; "
        f"#23133 MESPAN 100mm 1×4m €42,70."
    ),
})

faq.append({
    "tags": ["coldroom_pricing", "general", "kapı"],
    "tr_question": "Soğuk oda kapısı fiyatı ne kadar?",
    "tr_answer": (
        f"DRC soğuk oda kapısı default fiyatı: €{DOOR_PRICE}/adet (standart 80×190, 100-120mm). "
        f"Stoklu kapı kalemleri: "
        f"#12 SLIDETS/ATS2025.0100PP 200×250 Sürgülü Kapı 100mm Net €1.282, "
        f"#23814 ETS 200×250 Sürgülü Tip 120mm Net €1.350, "
        f"#53 HINGETS/PTM0919.0120PP 90×180 Menteşeli Kapı Net €335, "
        f"#55 HINGETS/ATM1020.0120PP 107×185 Menteşeli Kapı Net €595. "
        f"Donuk oda için rezistans (ısıtıcı çerçevesi) +€50-100 ek."
    ),
    "de_question": "Wie viel kostet eine Kühlraumtür?",
    "de_answer": (
        f"DRC Standard-Kühlraumtür: €{DOOR_PRICE}/Stk (80×190, 100-120mm). "
        f"Lagerartikel: #12 SLIDETS 200×250 100mm Schiebetür €1.282; "
        f"#23814 ETS 200×250 120mm €1.350; #53 HINGETS 90×180 €335; "
        f"#55 HINGETS 107×185 €595. TK-Tür mit Rahmenheizung +€50-100."
    ),
})

faq.append({
    "tags": ["coldroom_pricing", "general", "hp_secim"],
    "tr_question": "Soğuk oda için HP grup nasıl seçilir, fiyat nedir?",
    "tr_answer": (
        "Soğuk oda hacmine göre HP grup seçimi (DRC katalogu net fiyat):\n"
        "POZİTİF (+2 / +8°C):\n"
        "  • 5-10 m³ → 1 HP Tecumseh #23893 €1.220\n"
        "  • 10-20 m³ → 1.5-2 HP ThermETS HSC-MP10015 #23816 €1.990\n"
        "  • 20-30 m³ → 2-2.5 HP ThermETS HSC-MP10020 #20 €1.560\n"
        "  • 30-50 m³ → 3 HP komple #21 €2.285 ya da #44 (4.5HP) €2.684\n"
        "  • 50-100 m³ → 5 HP THERMETS/HSC.MP10050 #22 €2.954\n"
        "  • 100-150 m³ → 7.5 HP Dorin Komplu #41 €4.689\n"
        "DONUK (-18 / -25°C):\n"
        "  • 5-10 m³ → 1.5-2 HP\n"
        "  • 10-20 m³ → 3-4 HP Tecumseh Komplu #40 €1.951\n"
        "  • 20-30 m³ → 4-5 HP\n"
        "  • 30-50 m³ → 7.5-10 HP Dorin Çift Evapli #49 €5.074\n"
        "  • 50-100 m³ → 10-15 HP\n"
        "  • 100+ m³ → 16 HP Semi Hermetik ThermETS #19 €7.593\n"
        "Faktör 1.2× güvenlik için üst seviyeyi seç."
    ),
    "de_question": "Wie wählt man die HP-Gruppe für einen Kühlraum, welcher Preis?",
    "de_answer": (
        "Auswahl nach Volumen (DRC Netto-VK):\n"
        "PLUS (+2 / +8°C):\n"
        "  • 5-10 m³ → 1 HP Tecumseh #23893 €1.220\n"
        "  • 10-20 m³ → 1,5-2 HP ThermETS HSC-MP10015 #23816 €1.990\n"
        "  • 20-30 m³ → 2-2,5 HP ThermETS HSC-MP10020 #20 €1.560\n"
        "  • 30-50 m³ → 3 HP #21 €2.285 oder 4,5 HP #44 €2.684\n"
        "  • 50-100 m³ → 5 HP THERMETS HSC.MP10050 #22 €2.954\n"
        "  • 100-150 m³ → 7,5 HP Dorin Komplett #41 €4.689\n"
        "TIEFKÜHL (-18 / -25°C):\n"
        "  • 5-10 m³ → 1,5-2 HP\n"
        "  • 10-20 m³ → 3-4 HP Tecumseh Komplett #40 €1.951\n"
        "  • 20-30 m³ → 4-5 HP\n"
        "  • 30-50 m³ → 7,5-10 HP Dorin Doppelverdampfer #49 €5.074\n"
        "  • 50-100 m³ → 10-15 HP\n"
        "  • 100+ m³ → 16 HP Halbhermetisch ThermETS #19 €7.593\n"
        "Sicherheitsfaktor 1,2× nach oben."
    ),
})

print(f'Toplam Q&A: {len(faq)}')
with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(faq, f, ensure_ascii=False, indent=2)
print(f'✓ {OUTPUT} ({OUTPUT.stat().st_size//1024} KB)')
