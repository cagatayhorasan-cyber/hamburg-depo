# Bekleyen Schema Migration'lar

Supabase pooler'ın `statement_timeout` ayarı `ALTER TABLE` komutuna direkt bağlantıda izin vermiyor (~10s timeout). Bu migration'ları Supabase Dashboard SQL Editor'den çalıştır:

🔗 https://supabase.com/dashboard/project/jzdwwepybhxctasmkhmz/sql

## 1. Stok lokasyon (`storage_location`)

```sql
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS storage_location TEXT,
  ADD COLUMN IF NOT EXISTS storage_location_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_items_storage_location
  ON items (storage_location) WHERE storage_location IS NOT NULL;

COMMENT ON COLUMN items.storage_location IS
  'Depo lokasyon kodu, örnek: "HAM-A-12-3" = Hamburg deposu, koridor A, raf 12, seviye 3';
```

## 2. Çoklu depo (`warehouses` + `movements.warehouse_id`)

```sql
-- Warehouses tablosu
CREATE TABLE IF NOT EXISTS warehouses (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,        -- 'HAM' veya 'HAMM'
  name TEXT NOT NULL,                -- 'Hamburg Deposu'
  name_de TEXT,                      -- 'Hamburger Lager'
  address TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default veriler
INSERT INTO warehouses (code, name, name_de) VALUES
  ('HAM', 'Hamburg Deposu', 'Hamburger Lager'),
  ('HAMM', 'Hamm Deposu', 'Hammer Lager')
ON CONFLICT (code) DO NOTHING;

-- Movements'a warehouse_id ekle
ALTER TABLE movements ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id);

-- Mevcut tum movement'lar Hamburg deposunda (varsayılan)
UPDATE movements SET warehouse_id = (SELECT id FROM warehouses WHERE code = 'HAM')
  WHERE warehouse_id IS NULL;

-- Sorgulama hızı için index
CREATE INDEX IF NOT EXISTS idx_movements_warehouse_id ON movements(warehouse_id);

COMMENT ON TABLE warehouses IS 'Fiziksel depo lokasyonları (Hamburg, Hamm vb.)';
```

## 3. Order tracking (`shipments`)

```sql
CREATE TABLE IF NOT EXISTS shipments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  tracking_no TEXT,
  carrier TEXT,                     -- 'DHL', 'DPD', 'UPS' vs.
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  status TEXT,                       -- 'pending', 'shipped', 'in_transit', 'delivered', 'returned'
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
```

## 4. Doğrulama

Migration'lar sonrası:

```sql
-- Kolonlari kontrol
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND column_name IN ('storage_location', 'warehouse_id')
ORDER BY table_name;

-- Default veriler
SELECT * FROM warehouses;
```

## Backend kod entegrasyonu (migration sonrası)

`server/app.js`'de:

1. **`mapItemRow`** → return `storageLocation: row.storage_location`
2. **`queryItems`** → SELECT'e `storage_location` ekle
3. **POST /api/items** (admin item create) → `storage_location` accept et
4. **PUT /api/items/:id** (admin item edit) → `storage_location` update et
5. **`queryMovements`** → JOIN warehouses, return warehouse code+name
6. **POST /api/movements** → `warehouse_id` accept et (default Hamburg)

Frontend ([public/app.js, public/index.html](public/app.js)):

1. Item kart UI'a `📍 ${storageLocation}` satır ekle
2. Item edit form'a "Stok Lokasyonu" input
3. Movement form'a "Depo" select (warehouses listesi)
4. Filtre olarak depo dropdown

Bu işler migration tamamlandıktan sonra ~2 saat sürer.
