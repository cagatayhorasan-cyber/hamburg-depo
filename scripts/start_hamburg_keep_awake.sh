#!/bin/zsh
set -eu

LOG_DIR="$HOME/Library/Logs/HamburgDepo"
mkdir -p "$LOG_DIR"
exec >>"$LOG_DIR/keepawake.stdout.log" 2>>"$LOG_DIR/keepawake.stderr.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Keep-awake gorevi basliyor."
exec /usr/bin/caffeinate -dimsu
