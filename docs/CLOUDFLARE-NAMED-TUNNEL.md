# Cloudflare Named Tunnel — Sabit URL Kurulum

Şu an: her açılışta yeni `https://*.trycloudflare.com` URL'i. Hedef: sabit `https://depo.drckaltetechnik.de`.

## Ön gereksinimler
- Cloudflare hesabında **drckaltetechnik.de** domain'i ekli olmalı (zaten var mı kontrol)
- `cloudflared` binary kurulu: ✅ `/opt/homebrew/bin/cloudflared` (kontrol edildi)

## 1. Cloudflare'a login
```bash
cloudflared tunnel login
```
Browser açılır → Cloudflare hesabına giriş → "drckaltetechnik.de" domain'ini seç → "Authorize"
- Bu komut `~/.cloudflared/cert.pem` oluşturur

## 2. Named tunnel oluştur
```bash
cloudflared tunnel create depo-hamburg
```
Çıktıdaki UUID'yi bir yere not al (örnek: `a1b2c3d4-5678-9abc-def0-123456789abc`).
- Bu komut `~/.cloudflared/<UUID>.json` credential dosyası oluşturur.

## 3. DNS route ekle
```bash
cloudflared tunnel route dns depo-hamburg depo.drckaltetechnik.de
```
Cloudflare DNS'inde otomatik CNAME oluşturur: `depo.drckaltetechnik.de → <UUID>.cfargotunnel.com`

## 4. Konfigürasyon dosyası
```bash
cat > ~/.cloudflared/config.yml <<'EOF'
tunnel: depo-hamburg
credentials-file: /Users/anilakbas/.cloudflared/<UUID>.json

ingress:
  - hostname: depo.drckaltetechnik.de
    service: http://localhost:3000
  - service: http_status:404
EOF
```
`<UUID>` yerine 2. adımdaki UUID'yi yaz.

## 5. launchd script güncelle
Mevcut `start_hamburg_depo_tunnel.sh` yerine:
```bash
cat > ~/Library/Application\ Support/HamburgDepo/start_hamburg_depo_tunnel.sh <<'EOF'
#!/bin/zsh
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
LOG_DIR="$HOME/Library/Logs/HamburgDepo"
mkdir -p "$LOG_DIR"
exec >>"$LOG_DIR/tunnel.stdout.log" 2>>"$LOG_DIR/tunnel.stderr.log"
echo "[$(date '+%F %T')] Named tunnel basliyor: depo.drckaltetechnik.de"
exec /opt/homebrew/bin/cloudflared tunnel --config "$HOME/.cloudflared/config.yml" run depo-hamburg
EOF
chmod +x ~/Library/Application\ Support/HamburgDepo/start_hamburg_depo_tunnel.sh
```

## 6. launchd restart
```bash
launchctl kickstart -k gui/501/com.hamburgdepo.tunnel
sleep 5
tail -20 ~/Library/Logs/HamburgDepo/tunnel.stderr.log
```

## 7. Test
```bash
curl -sS -m 10 https://depo.drckaltetechnik.de/api/health
# {"ok":true,...}
```

## 8. Eski public-url.txt artık gereksiz
`public-url.txt` dosyası random URL için tutuluyordu. Artık sabit URL kullanabiliriz. Frontend kodda hardcoded yerlere değil bu URL'i kullanmaya başla.

## Faydaları
- **Sabit URL**: müşteri/iletişim materyallerinde stabil link
- **HTTPS**: Cloudflare otomatik sertifika
- **DDoS koruması**: Cloudflare ağı
- **Cache**: Cloudflare CDN cache kullanılabilir
- **Watchdog daha basit**: artık URL değişimini izlemeye gerek yok
