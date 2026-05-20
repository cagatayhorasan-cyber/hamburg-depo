# Müşteri kılavuzu — gerçek ekran görüntüleri

Bu klasör müşteri kılavuzundaki (`/help/customer.html`) **gerçek ekran görüntüleri**
için ayrıldı. Şu an kılavuzda inline SVG mockup'lar var (her bölüm için bir tane);
buraya PNG/JPG ekleyince HTML'de `<figure>` içine direkt çağırabilirsiniz.

## Önerilen dosya isimleri

| Bölüm | Dosya | Çözünürlük | Kapsam |
|---|---|---|---|
| 1. Kayıt / Giriş | `01_login_register.png` | ~960×540 | Login ekranı + kayıt modali |
| 2. Portal turu | `02_nav_bar.png` | ~1280×120 | Üst navigation barı |
| 3. Katalog | `03_catalog_card.png` | ~720×420 | Filtre + 1 ürün kartı |
| 4. Sepet | `04_cart.png` | ~960×540 | Sepet sekmesi |
| 5. Sipariş takibi | `05_orders_list.png` | ~960×400 | Siparişler listesi (pill'lerle) |
| 6. ColdRoomPro | `06_coldroompro.png` | ~1280×720 | Hesaplama ekranı |
| 7. Teklif | `07_quote_pdf.png` | ~960×600 | PDF önizleme + aksiyon butonları |
| 8. Hesabım | `08_account.png` | ~960×480 | Profil + dil + şifre |

## Nasıl çekilir

1. Tarayıcıda **canlı portal**a (`https://drckaltetechnik.vercel.app`)
   müşteri hesabıyla gir.
2. Tarayıcı zoom %100, pencere boyu en az 1280px.
3. **Cmd+Shift+4** (Mac) veya **Win+Shift+S** (Windows) ile ilgili
   alanı kes.
4. Bu klasöre yukarıdaki dosya isimleriyle kaydet.
5. Bir önceki commit'te HTML'i güncelle (örnek: `<img src="/help/screenshots/01_login_register.png">`),
   mockup'ı çıkar veya yanına ekle.

## Mockup'lar ile karşılaştırma

Mockup'lar hızlı görsel verir ama gerçek arabirimi göstermez.
Müşteri "bu sayfada ne göreceğim?" sorusunun cevabı için gerçek
ekran görüntüsü daha güçlü. Ekran görüntüsü ekledikten sonra
inline SVG'leri silebilirsiniz (kılavuz yine de okunaklı kalır).
