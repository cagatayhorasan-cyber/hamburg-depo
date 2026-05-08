#!/usr/bin/env python3
"""
Banner görsellerinden ölçü annotasyonlarını kırp.
"""
from PIL import Image
import os

PHOTOS = '/Users/anilakbas/Desktop/Hamburg depo stok programı /public/assets/photos'

# 1) bornsen-depo.png — sağdaki TABELLA MAßE panelini ve alttaki feature strip'i kes
src = os.path.join(PHOTOS, 'bornsen-depo.png')
img = Image.open(src)
w, h = img.size
print(f'Original bornsen: {w}×{h}')

# Sağdaki ölçü paneli yaklaşık %22 (sağ) — koyu siyah arka planlı bölüm
# Alttaki 5 feature strip yaklaşık alttaki 130px (1024 → 894)
# Banner ile bina cephesi: x=0..1180, y=0..880
crop_box = (0, 0, 1180, 880)
cropped = img.crop(crop_box)
cw, ch = cropped.size
print(f'Cropped bornsen: {cw}×{ch}')

# 16:9 oranına biraz yaklaştır (genişlet veya kes)
# 1180 / 880 = 1.34 (4:3 gibi)
out_path = os.path.join(PHOTOS, 'bornsen-depo-clean.png')
cropped.save(out_path, optimize=True)
print(f'✓ Kaydedildi: {out_path}')

# 2) drc-tanitim-banner.png — üstteki "3,50 m" / "2,50 m" yazıları ve solda "2,00 m" yazısı
src2 = os.path.join(PHOTOS, 'drc-tanitim-banner.png')
img2 = Image.open(src2)
w2, h2 = img2.size
print(f'\nOriginal banner: {w2}×{h2}')

# Üstteki ölçü yazıları daha aşağıda (~140px), sol/sağ ölçüler ~100px
# Daha agresif kırp: y=140 başla, x=100..1450
crop_box2 = (100, 140, 1450, 990)
cropped2 = img2.crop(crop_box2)
print(f'Cropped banner: {cropped2.size}')
out_path2 = os.path.join(PHOTOS, 'drc-tanitim-banner-clean.png')
cropped2.save(out_path2, optimize=True)
print(f'✓ Kaydedildi: {out_path2}')

# Sadece soldaki ana banner (3.50×2.00) — yatay, ana içerik
# x=100..900, y=140..990
crop_box3 = (100, 140, 920, 990)
cropped3 = img2.crop(crop_box3)
print(f'Cropped main banner: {cropped3.size}')
out_path3 = os.path.join(PHOTOS, 'drc-banner-main.png')
cropped3.save(out_path3, optimize=True)
print(f'✓ Kaydedildi: {out_path3}')
