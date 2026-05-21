#!/bin/bash
# Hamburg Depo PostgreSQL günlük yedek scripti
# launchd com.hamburgdepo.backup tarafından her gün 03:00'te çalıştırılır.
# 30 günden eski yedekleri otomatik temizler.

set -u

APP_DIR="$HOME/Library/Application Support/HamburgDepo"
BACKUP_DIR="$APP_DIR/backups"
LOG_FILE="$APP_DIR/runtime/pg_backup.log"
FAIL_FLAG="$APP_DIR/runtime/pg_backup.last_fail"
ENV_FILE="$APP_DIR/.env"
PG_DUMP="/opt/homebrew/opt/libpq/bin/pg_dump"

mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" >> "$LOG_FILE"; }

log "=== Backup başlıyor ==="

if [ ! -f "$ENV_FILE" ]; then
  log "HATA: .env bulunamadı: $ENV_FILE"
  exit 1
fi

if [ ! -x "$PG_DUMP" ]; then
  log "HATA: pg_dump bulunamadı veya çalıştırılamıyor: $PG_DUMP"
  exit 1
fi

# .env içinden DATABASE_URL değerini çek (tırnaklar dahil temizle)
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//; s/^'\''//; s/'\''$//')

if [ -z "$DATABASE_URL" ]; then
  log "HATA: DATABASE_URL .env içinde bulunamadı"
  exit 1
fi

DATE_STAMP=$(date '+%Y%m%d_%H%M%S')
DUMP_FILE="$BACKUP_DIR/hamburg_depo_${DATE_STAMP}.dump"

log "Dump hedefi: $DUMP_FILE"

# Custom format (-Fc) — daha kompakt + parallel restore destekler
"$PG_DUMP" \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --compress=9 \
  --file="$DUMP_FILE" \
  >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ] && [ -s "$DUMP_FILE" ]; then
  SIZE=$(du -h "$DUMP_FILE" | cut -f1)
  log "OK: dump tamamlandı ($SIZE)"
  # Basari sonrasi fail flag'i temizle
  rm -f "$FAIL_FLAG"
else
  log "HATA: pg_dump exit=$EXIT_CODE  size=$( [ -f "$DUMP_FILE" ] && du -h "$DUMP_FILE" | cut -f1 || echo 'yok' )"
  rm -f "$DUMP_FILE"
  # Fail flag'i guncelle (kac defa art arda fail oldu)
  PREV_FAILS=0
  if [ -f "$FAIL_FLAG" ]; then
    PREV_FAILS=$(cat "$FAIL_FLAG" 2>/dev/null | head -1)
    PREV_FAILS=${PREV_FAILS:-0}
  fi
  CONSECUTIVE_FAILS=$((PREV_FAILS + 1))
  echo "$CONSECUTIVE_FAILS" > "$FAIL_FLAG"
  echo "$(ts)" >> "$FAIL_FLAG"
  if [ "$CONSECUTIVE_FAILS" -ge 2 ]; then
    log "⚠️  UYARI: $CONSECUTIVE_FAILS gun art arda backup fail. Lutfen kontrol edin!"
    # macOS bildirim — login sirasinda admin gorsun
    /usr/bin/osascript -e "display notification \"$CONSECUTIVE_FAILS gun art arda backup fail. Log: $LOG_FILE\" with title \"DRC Backup Uyarisi\" sound name \"Sosumi\"" 2>/dev/null || true
  fi
  exit $EXIT_CODE
fi

# 30 günden eski yedekleri sil
DELETED=$(find "$BACKUP_DIR" -name "hamburg_depo_*.dump" -type f -mtime +30 -print -delete | wc -l | tr -d ' ')
log "Temizlik: 30+ günlük $DELETED dosya silindi"

# Toplam kullanım
TOTAL=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
COUNT=$(ls -1 "$BACKUP_DIR"/hamburg_depo_*.dump 2>/dev/null | wc -l | tr -d ' ')
log "Klasör durumu: $COUNT yedek, toplam $TOTAL"

log "=== Backup tamamlandı ==="
exit 0
