# DRC Kältetechnik Portal — Sistem Durumu (2026-04-17)

Canlı: https://drckaltetechnik.vercel.app
Repo: https://github.com/cagatayhorasan-cyber/hamburg-depo (branch: `codex/publish`)

---

## Roller

| Rol | Kim | Görebildikleri |
|---|---|---|
| admin | Cagatay, Ramazan, Anıl, Durmuş, admin | Her şey |
| staff | Tuncay, Personel1, Personel2 | Stok + Satış + Kasa + Siparişler + Projeler + ColdRoomPro |
| operator | Depo Operator | Staff gibi (normalize) |
| customer | Yılmaz, Musteri1-3 | Sipariş Ver (katalog + sepet) + Projeler + Proje Araçları (ColdRoomPro) + Admin'e Yaz |

Rol görünürlük JS toggle + CSS savunma katmanı (`body[data-role="..."]`) ile çift güvenceli.

---

## Ana modüller

### 1. Stok & Ürün (`items`, `movements`)
- 10 200+ aktif ürün, 39 kategori.
- Son temizlik: "Soğutma Malzemeleri" 984 → 109'a indi; 5 yeni kategori açıldı (Hat Aksesuarları, Yağ Ayırıcılar, Eşanjörler, Kapiler Hortumlar ve Rakorlar, Kondenserler).
- Hareketler `entry` / `exit` tipli; stok = sum(entry) − sum(exit).

### 2. Satış & Teklif (`quotes`, `quote_items`)
- Staff/admin POS'u: müşteri dropdown + datalist, KDV %19 / ihracat 0, quote_no otomatik.
- "Teklif olarak kaydet" stoğu değiştirmez; "Direkt satış" stok düşer + kasa kaydı.

### 3. Müşteri sipariş (`orders`, `order_items`)
- Müşteri kataloğu (`current_stock > 0` filtreli, limitsiz, arama: Türkçe locale + diakritik + boşluksuz varyant).
- KDV hesaplı sepet özeti + sipariş onay modali.
- Admin siparişler: fiyat düzenle + ödeme + stok düş + teklife çevir tek modal.
- `orders.unit_price` (her satırda admin override), `payment_type`, `payment_status`, `paid_amount`, `stock_deducted_at`, `quote_id`.

### 4. Ödeme & Kasa
- Sipariş onaylandığında/hazırlandığında/tamamlandığında: `stock_deducted_at` yoksa → `movements` `exit` otomatik.
- Ödeme güncellendiğinde: `paid_amount` artıkça `cashbook` `type='in'` otomatik (senkronizasyon, idempotent).
- Kasa formunda "Müşteri + Sipariş" dropdown — elden tahsilat seçilen siparişe `paid_amount += amount` ve `payment_status` yeniden hesaplar.
- Müşteri Hesapları modalı: her müşteri için sipariş sayısı / ödenmemiş # / toplam / ödenen / **bakiye**.

### 5. Projeler (`projects`, `project_items`) — Faz 4
- CRUD + BOM + teklife/siparişe çevir.
- **ColdRoomPro köprüsü**: iframe içindeki "📤 DRC Projeye Kaydet" butonu parent'a postMessage → `POST /api/projects` + items.
- Kaynak: `admin-tools/coldroompro-source/` (Vite build → `admin-tools/coldroompro/`).

### 6. Yardımcı araçlar
- **DRC MAN** (admin): yerel LLM bridge'i + eğitim veri bankası.
- **Soğuk Oda Çizim Pro** (iframe).
- Rapor export (XLSX/PDF, admin).

---

## Dosya iskeleti

```
.
├── server/
│   ├── app.js            (≈ 3100 satır, tüm route/middleware)
│   └── db.js             (Postgres + SQLite dual adaptörü, migration)
├── server.js             (entrypoint)
├── api/index.js          (Vercel serverless)
├── public/
│   ├── index.html        (SPA shell)
│   ├── app.js            (≈ 6500 satır, tüm frontend)
│   ├── styles.css
│   ├── shared-admin-catalog.json (~3MB, coldroompro senkron)
│   └── assets/
├── admin-tools/
│   ├── coldroompro/              (Vite build output — deploy'a girer)
│   ├── coldroompro-source/       (React/Vite kaynağı)
│   └── soguk-oda-cizim/
├── scripts/
│   ├── lib/                      (paylaşılan DB araçları)
│   ├── archive/                  (bir kez kullanılmış ETL scriptleri)
│   ├── sync-live-postgres-to-sqlite.js
│   ├── refresh-local-sqlite-from-live.js
│   ├── report-database-integrity.js
│   ├── fix-catalog-pricing-apr15.js     (npm run db:fix-catalog-prices)
│   ├── export-shared-admin-catalog.js   (npm run sync:shared-admin-catalog)
│   ├── export-bilingual-stock-tech-catalog.js
│   ├── import-coldroompro-catalogs.js
│   ├── sync-coldroompro-material-prices.js
│   ├── train-drc-man-all.js             (npm run train:drcman)
│   ├── generate_drc_man_*.js            (drcman eğitim üretici)
│   └── ...
├── data/                         (SQLite cache, gitignored)
├── launchd/                      (macOS daemon tanımları)
├── electron/                     (masaüstü wrapper)
└── STATE.md                      (bu dosya)
```

---

## Önemli env / ayarlar

- `DATABASE_URL` — Postgres (Supabase)
- `BOOTSTRAP_ITEM_LIMIT` — admin/staff için başlangıçta yüklenecek ürün sayısı (default 60, warmup ile hepsi)
- Vercel: `hamburg-depo-3bgu` projesi, production = `drckaltetechnik.vercel.app`

---

## Açık konular / sonraki fazlar

- [ ] **Faz 5: PDF upload** — tedarikçi fiyat listesi parse, yeni ürün katalog, dosya arşivi (Supabase Storage)
- [ ] Tek/Çift fanlı Kondenser (Genel) yer tutucu ürünler silindi; gerçek marka/model gerekirse yeniden.
- [ ] Fiyat 0 olan ürünler için "fiyat sorun" akışı + admin uyarı kuyruğu
- [ ] Müşteri hesap detay drill-down (modal içinde sipariş geçmişi)
- [ ] Sipariş satırında `item_id` NULL olanlar için stok düşüm eşlemesi (ColdRoomPro kaynaklı BOM)
- [ ] E-posta tarayıcı testleri — `sendOrderStatusEmail` SMTP credentials doğru mu

---

## Test rolleri (hızlı smoke)

| Test | Rol | Beklenti |
|---|---|---|
| Giriş | Yılmaz | Sidebar: Sipariş Ver, Projeler, Proje Araçları, Admin'e Yaz |
| Arama | Yılmaz | "dcb100" → DCB100 Plus bulunur |
| Sipariş | Yılmaz | Sepet + KDV özeti + onay modal → kayıt olur |
| Fiyat Düzenle | Admin | Satırlar önerili fiyatla dolu; ödeme+onay tek kaydet |
| Kasa elden | Admin | Müşteri+sipariş seç → `paid_amount` güncellenir, bakiye düşer |
| ColdRoomPro | Yılmaz | "DRC Projeye Kaydet" → kendi projesi oluşur |
| Onayla | Admin | `stock_deducted_at` dolmayan siparişi onaylarsın → exit hareketleri yaratılır |
