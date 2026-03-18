# Hamburg Depo Yonetim Merkezi

Bu uygulama stok, hareket, masraf, kasa ve teklif yonetimi icin web tabanli bir paneldir. Artik yerel kullanim disinda internetten erisilebilir tek sunucu kurulumuna da hazirdir.

## Mevcut ozellikler

- Cok kullanicili giris sistemi
- `admin` ve `operator` rol ayrimi
- Stok kartlari, stok giris-cikis, masraf ve kasa kayitlari
- Barkod onizleme
- Teklif olusturma ve PDF indirme
- Teklifleri sunucuda klasore kaydetme
- Excel ve PDF rapor disa aktarma
- Docker ve Nginx ile uzak sunucuya kurulum

## Varsayilan kullanicilar

- `admin / admin123`
- `operator / operator123`

## Yerelde calistirma

```bash
npm install
npm start
```

Ardindan [http://127.0.0.1:3000](http://127.0.0.1:3000) adresini acin.

## Supabase / Postgres kullanimi

Uygulama artik iki modda calisabilir:

- `SQLite` yerel mod
- `Postgres` / Supabase modu

Supabase kullanmak icin `.env` dosyasina su alanlari ekleyin:

```env
DATABASE_URL=postgresql://postgres:SIFRENIZ@db.PROJECT_REF.supabase.co:5432/postgres
PGSSL=require
```

Sonra veriyi SQLite'dan Supabase'e tasimak icin:

```bash
DATABASE_URL="postgresql://postgres:SIFRENIZ@db.PROJECT_REF.supabase.co:5432/postgres" PGSSL=require node scripts/migrate-sqlite-to-postgres.js
```

Ardindan uygulamayi Postgres modunda baslatmak icin:

```bash
DATABASE_URL="postgresql://postgres:SIFRENIZ@db.PROJECT_REF.supabase.co:5432/postgres" PGSSL=require npm start
```

Not:

- `service_role key` gerekmez
- uygulama dogrudan Postgres baglantisi ile calisir
- Supabase tablolari daha once SQL Editor icinde olusturulmus olmali

## Internetten erisim icin sunucu kurulumu

Bu kurulum tek bir Linux sunucuda, Docker ile calisacak sekilde hazirlandi. SQLite halen kullaniliyor; yani tek sunucu icin uygundur. Birden fazla uygulama sunucusuna cikilacaksa sonraki adim PostgreSQL gecisidir.

### 1. Sunucuda gerekli kurulum

- Ubuntu 22.04 veya 24.04
- Docker
- Docker Compose eklentisi
- Alan adi

### 2. Projeyi sunucuya kopyalayin

```bash
git clone <repo-adresi>
cd "Hamburg depo stok programı "
```

Repo kullanmiyorsaniz klasoru dogrudan sunucuya kopyalayin.

### 3. Ortam ayarlari

`.env.example` dosyasini `.env` olarak kopyalayin:

```bash
cp .env.example .env
```

Sonra en az su alanlari degistirin:

- `SESSION_SECRET`
- `APP_DOMAIN`

Ornek:

```env
PORT=3000
HOST=0.0.0.0
SESSION_SECRET=cok-guclu-ve-uzun-bir-sifre
TRUST_PROXY=1
DATA_DIR=/app/data
SQLITE_PATH=/app/data/hamburg-depo.sqlite
QUOTES_DIR=/app/exports/quotes
APP_DOMAIN=depo.firmaniz.com
```

### 4. Uygulamayi ayaga kaldirin

```bash
docker compose up -d --build
```

Bu komut:

- Node uygulamasini `app` konteynerinde
- reverse proxy katmanini `nginx` konteynerinde

calistirir.

### 5. HTTP test edin

Sunucunun IP adresinde acin:

```text
http://SUNUCU-IP
```

### 6. HTTPS ekleyin

Bu repoda Nginx ters proxy hazir. SSL icin iki pratik yol var:

1. Cloudflare proxy + SSL
2. Sunucuda Certbot ile Let’s Encrypt

En hizli ve daha az operasyon yuklu cozum Cloudflare kullanmaktir.

## Veri ve ciktilar

- SQLite veritabani: `data/hamburg-depo.sqlite`
- Kaydedilen teklif PDF dosyalari: `exports/quotes`
- Yedekler: `backups`

## Yedek alma

Elle yedek icin:

```bash
bash scripts/backup-sqlite.sh
```

Sunucuda gunluk cron ornegi:

```bash
0 2 * * * cd /opt/hamburg-depo && bash scripts/backup-sqlite.sh
```

## Kontrol

```bash
npm run check
```

## Notlar

- `HOST` varsayilan olarak artik `0.0.0.0` gelir; bu sayede Docker ve uzak sunucuda dis erisim acilabilir.
- `TRUST_PROXY=1` oldugunda oturum cerezleri HTTPS ters proxy arkasinda guvenli modda calisir.
- Tek sunucu kullanimi icin mevcut mimari uygundur.
- Buyuk olcekte veya coklu uygulama sunucusunda bir sonraki adim `PostgreSQL` + paylasimli session store gecisidir.
