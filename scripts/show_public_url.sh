#!/bin/zsh
set -eu

URL_FILE="$HOME/Library/Application Support/HamburgDepo/public-url.txt"
LOG_FILE="$HOME/Library/Logs/HamburgDepo/tunnel.stdout.log"

if [ -f "$URL_FILE" ]; then
  cat "$URL_FILE"
  exit 0
fi

if [ -f "$LOG_FILE" ]; then
  grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' "$LOG_FILE" | tail -n 1
  exit 0
fi

echo "Tunnel URL henuz hazir degil."
