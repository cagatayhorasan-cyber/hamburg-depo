#!/bin/zsh
set -eu

APP_SUPPORT_DIR="$HOME/Library/Application Support/HamburgDepo"
PROJECT_DIR="$APP_SUPPORT_DIR/runtime"
DRC_MAN_RUNTIME_DIR="$APP_SUPPORT_DIR/DRC_MAN"
LOG_DIR="$HOME/Library/Logs/HamburgDepo"
ENV_FILE="$APP_SUPPORT_DIR/.env"
NPM_BIN="/opt/homebrew/bin/npm"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$LOG_DIR"
exec >>"$LOG_DIR/server.stdout.log" 2>>"$LOG_DIR/server.stderr.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Hamburg Depo yerel sunucu basliyor."

if [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r key value || [ -n "${key:-}" ]; do
    if [ -z "${key:-}" ] || [[ "$key" == \#* ]]; then
      continue
    fi
    export "$key=$value"
  done < "$ENV_FILE"
fi

export DRC_MAN_DIR="$DRC_MAN_RUNTIME_DIR"
export QUOTES_DIR="${QUOTES_DIR:-$APP_SUPPORT_DIR/Teklifler}"
mkdir -p "$QUOTES_DIR"

if [ ! -x "$NPM_BIN" ]; then
  NPM_BIN="$(command -v npm)"
fi

cd "$PROJECT_DIR"
exec "$NPM_BIN" start
