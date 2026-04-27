#!/bin/zsh
set -eu

PROJECT_DIR="$HOME/Library/Application Support/HamburgDepo/runtime"
RUNTIME_DIR="$HOME/Library/Application Support/HamburgDepo"
LOG_DIR="$HOME/Library/Logs/HamburgDepo"
URL_FILE="$RUNTIME_DIR/public-url.txt"
CLOUDFLARED_BIN="/opt/homebrew/bin/cloudflared"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$RUNTIME_DIR" "$LOG_DIR"
exec >>"$LOG_DIR/tunnel.stdout.log" 2>>"$LOG_DIR/tunnel.stderr.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cloudflare quick tunnel basliyor."
rm -f "$URL_FILE"

if [ ! -x "$CLOUDFLARED_BIN" ]; then
  CLOUDFLARED_BIN="$(command -v cloudflared)"
fi

cd "$PROJECT_DIR"
"$CLOUDFLARED_BIN" tunnel \
  --url http://127.0.0.1:3000 \
  --no-autoupdate \
  --ha-connections 1 \
  --edge-ip-version 4 \
  --protocol http2 \
  2>&1 | while IFS= read -r line; do
  echo "$line"
  url="$(printf '%s\n' "$line" | grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' || true)"
  if [ -n "$url" ]; then
    printf '%s\n' "$url" > "$URL_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Public URL: $url"
  fi
done
