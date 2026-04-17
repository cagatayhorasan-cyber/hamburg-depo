# Arşiv — tek seferlik / tarihli ETL scriptleri

Bu klasörde, bir defa çalışıp işini bitirmiş veya belirli bir tarih/veri geçişi için yazılmış scriptler durur. Ana `scripts/` klasörünü temiz tutmak için buraya alındılar.

Çalışır haldeler (silinmedi) — ileride benzer bir veri işi için referans olabilirler ama varsayılan olarak bir daha çağrılmamalı.

## Kategoriler

**Veri import (geçmiş)**
- `import-gelen-fatura.js` — eski gelen fatura import
- `import-gunay-series.js` — Günay ürün serisi ilk yüklemesi
- `import-split-price-list.js` — eski split fiyat listesi
- `import-fullproducts-xml.js` — full XML import
- `import-ithalat-history-balanced.js` — ithalat geçmişi balance
- `import-kassa-notes-docx.js` — kassa notları docx import
- `import-malzeme-csv.js` — malzeme CSV (eski format)
- `import-stock-germany-pdf-prices.js` — Almanya stok PDF fiyat
- `import-cashbook-opening-apr13.js` — 13 Nisan açılış bakiyesi
- `import-coded-initial-stock.js` — kodlu ilk stok
- `import-current-stock-list-apr13.js` — 13 Nisan stok listesi

**Fiyat / veri tamir**
- `fix-dcb31-import.js` — DCB31 ürün düzeltme
- `fill-derived-prices.js` — türetilmiş fiyat doldurma
- `estimate-missing-purchase-prices.js` — eksik alış fiyat tahmini
- `ensure-r290-gas.js` — R290 gazı var mı kontrol

**Diagnostic / inceleme**
- `check-dcb-equivalents.js`, `check-price-by-code.js`
- `compare-drc-man-github-vs-existing.js`
- `compare-stock-reference-to-catalog.py`

**Reconcile**
- `reconcile-ithalat-history-names.js`
- `reconcile-physical-stock-apr15.js`

**Build / toplam**
- `build-canonical-reference.py`
- `build-master-tech-inventory.js`
- `build-stock-cleanup-plan.py`
- `normalize-and-merge-items.js`
- `consolidate-source-docs.py`
- `categorize-pdfs.js`

**Root’tan taşınanlar**
- `price_comparison.js` — (tedarikçi fiyat karşılaştırma, hardcoded path)
- `update_prices_from_suppliers.js` — (tedarikçi fiyat güncelleme, hardcoded path)

## Bir tanesini çalıştırman gerekirse

```sh
# Önce scripti inceleyip gerekli env'lerin ayarlı olduğundan emin ol
node scripts/archive/NAME.js
```

Yeni bir işlem için aktif `scripts/` altında yeni dosya aç; arşivdekileri patch’leme alışkanlığı yapma.
