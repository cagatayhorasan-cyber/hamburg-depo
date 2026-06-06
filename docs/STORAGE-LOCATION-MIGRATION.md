# Stok Lokasyon Sistemi — Migration Notu

Hamburg deposundaki 17K ürünün hangi rafta/koridorda olduğunu kaydetmek için `storage_location` alanı eklenecek.

## Neden manuel migration?

Supabase pooler'ın `statement_timeout` ayarı `ALTER TABLE items ADD COLUMN` komutuna izin vermiyor. Migration'ı Supabase Dashboard SQL Editor'den çalıştır.

## Migration SQL

Supabase Dashboard → Project → SQL Editor → New query:

```sql
-- 1. Yeni kolonlar
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS storage_location TEXT,
  ADD COLUMN IF NOT EXISTS storage_location_updated_at TIMESTAMPTZ;

-- 2. Index (sadece dolu olan satırlar için)
CREATE INDEX IF NOT EXISTS idx_items_storage_location
  ON items (storage_location) WHERE storage_location IS NOT NULL;

-- 3. Yorum (DB documentation)
COMMENT ON COLUMN items.storage_location IS
  'Depo lokasyon kodu, örnek: "HAM-A-12-3" = Hamburg deposu, koridor A, raf 12, seviye 3';
```

## Önerilen format

```
{DEPO}-{KORİDOR}-{RAF}-{SEVİYE}

Hamburg deposu:
  HAM-A-01-1  (Koridor A, Raf 1, Alt seviye)
  HAM-A-01-2  (Koridor A, Raf 1, Üst seviye)
  HAM-B-15-3  (Koridor B, Raf 15, 3. seviye)

Hamm (eklendiğinde):
  HAMM-...
```

## Sonraki adım: Frontend entegrasyonu

Migration tamamlandıktan sonra:
1. `mapItemRow()` returns `storageLocation`
2. Stok kart UI'a "📍 HAM-A-12-3" satır eklenir
3. Search'te lokasyon bazlı filtre (`?location=HAM-A`)
4. Admin form'a "Stok Lokasyonu" input alanı
5. Toplu lokasyon güncelleme CSV upload (bulk-price-wizard pattern'ı ile)
6. Mobil barkod tarama: barkod oku → lokasyon güncelle (saha workflow)
