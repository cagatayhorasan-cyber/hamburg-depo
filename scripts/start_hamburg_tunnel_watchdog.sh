#!/bin/zsh
set -eu

RUNTIME_DIR="$HOME/Library/Application Support/HamburgDepo"
LOG_DIR="$HOME/Library/Logs/HamburgDepo"
URL_FILE="$RUNTIME_DIR/public-url.txt"
LOCAL_HEALTH_URL="http://127.0.0.1:3000/api/health"
LABEL="com.hamburgdepo.tunnel"
UID_VALUE="$(id -u)"

mkdir -p "$RUNTIME_DIR" "$LOG_DIR"
exec >>"$LOG_DIR/tunnel-watchdog.stdout.log" 2>>"$LOG_DIR/tunnel-watchdog.stderr.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Tunnel watchdog basliyor."

check_url() {
  local url="$1"
  curl -s --max-time 8 "$url" >/dev/null 2>&1
}

while true; do
  sleep 30

  if ! check_url "$LOCAL_HEALTH_URL"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Yerel sunucu erisilemedi, tünel kontrolu atlaniyor."
    continue
  fi

  public_url=""
  if [ -f "$URL_FILE" ]; then
    public_url="$(tr -d '\r' < "$URL_FILE" | head -n 1)"
  fi

  if [ -z "$public_url" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Public URL yok, tünel yeniden baslatiliyor."
    launchctl kickstart -k "gui/$UID_VALUE/$LABEL" >/dev/null 2>&1 || true
    continue
  fi

  if ! check_url "$public_url/api/health"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Public URL yanit vermiyor ($public_url), tünel yeniden baslatiliyor."
    rm -f "$URL_FILE"
    launchctl kickstart -k "gui/$UID_VALUE/$LABEL" >/dev/null 2>&1 || true
  fi
done
