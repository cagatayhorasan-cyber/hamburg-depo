#!/bin/zsh
set -eu

PROJECT_DIR="/Users/anilakbas/Desktop/Hamburg depo stok programı "
DRC_MAN_DIR="$HOME/Desktop/DRC_MAN"
LAUNCHD_DIR="$PROJECT_DIR/launchd"
APP_SUPPORT_DIR="$HOME/Library/Application Support/HamburgDepo"
RUNTIME_DIR="$APP_SUPPORT_DIR/runtime"
DRC_MAN_RUNTIME_DIR="$APP_SUPPORT_DIR/DRC_MAN"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs/HamburgDepo"
UID_VALUE="$(id -u)"

mkdir -p "$APP_SUPPORT_DIR" "$RUNTIME_DIR" "$DRC_MAN_RUNTIME_DIR" "$LAUNCH_AGENTS_DIR" "$LOG_DIR"

rsync -a --delete \
  --exclude '.git' \
  --exclude '.vercel' \
  --exclude 'launchd' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  --exclude '.env' \
  "$PROJECT_DIR/" "$RUNTIME_DIR/"

if [ -d "$DRC_MAN_DIR" ]; then
  rsync -a --delete \
    --exclude '.git' \
    --exclude '__pycache__' \
    --exclude '.DS_Store' \
    "$DRC_MAN_DIR/" "$DRC_MAN_RUNTIME_DIR/"
fi

if [ -f "$PROJECT_DIR/.env" ]; then
  cp "$PROJECT_DIR/.env" "$APP_SUPPORT_DIR/.env"
fi

cp "$PROJECT_DIR/scripts/start_hamburg_depo_server.sh" "$APP_SUPPORT_DIR/start_hamburg_depo_server.sh"
cp "$PROJECT_DIR/scripts/start_hamburg_depo_tunnel.sh" "$APP_SUPPORT_DIR/start_hamburg_depo_tunnel.sh"
cp "$PROJECT_DIR/scripts/start_hamburg_keep_awake.sh" "$APP_SUPPORT_DIR/start_hamburg_keep_awake.sh"
cp "$PROJECT_DIR/scripts/start_hamburg_tunnel_watchdog.sh" "$APP_SUPPORT_DIR/start_hamburg_tunnel_watchdog.sh"
chmod +x "$APP_SUPPORT_DIR/start_hamburg_depo_server.sh" "$APP_SUPPORT_DIR/start_hamburg_depo_tunnel.sh" "$APP_SUPPORT_DIR/start_hamburg_keep_awake.sh" "$APP_SUPPORT_DIR/start_hamburg_tunnel_watchdog.sh"

cp "$LAUNCHD_DIR/com.hamburgdepo.server.plist" "$LAUNCH_AGENTS_DIR/com.hamburgdepo.server.plist"
cp "$LAUNCHD_DIR/com.hamburgdepo.tunnel.plist" "$LAUNCH_AGENTS_DIR/com.hamburgdepo.tunnel.plist"
cp "$LAUNCHD_DIR/com.hamburgdepo.keepawake.plist" "$LAUNCH_AGENTS_DIR/com.hamburgdepo.keepawake.plist"
cp "$LAUNCHD_DIR/com.hamburgdepo.tunnel-watchdog.plist" "$LAUNCH_AGENTS_DIR/com.hamburgdepo.tunnel-watchdog.plist"

for label in com.hamburgdepo.server com.hamburgdepo.tunnel com.hamburgdepo.keepawake com.hamburgdepo.tunnel-watchdog; do
  plist="$LAUNCH_AGENTS_DIR/${label}.plist"
  launchctl bootout "gui/$UID_VALUE" "$plist" >/dev/null 2>&1 \
    || launchctl unload -w "$plist" >/dev/null 2>&1 \
    || true
  launchctl bootstrap "gui/$UID_VALUE" "$plist" >/dev/null 2>&1 \
    || launchctl load -w "$plist"
  launchctl kickstart -k "gui/$UID_VALUE/$label" >/dev/null 2>&1 || true
done

echo "Yerel sunucu yığını aktif edildi."
echo "Loglar: $LOG_DIR"
echo "Tünel adres dosyası: $APP_SUPPORT_DIR/public-url.txt"
