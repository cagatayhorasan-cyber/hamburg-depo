#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT_DIR/data}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
DB_PATH="${SQLITE_PATH:-$DATA_DIR/hamburg-depo.sqlite}"

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_PATH" ]]; then
  echo "Veritabani bulunamadi: $DB_PATH" >&2
  exit 1
fi

STAMP="$(date +"%Y-%m-%d_%H-%M-%S")"
TARGET="$BACKUP_DIR/hamburg-depo-$STAMP.sqlite"

cp "$DB_PATH" "$TARGET"
gzip -f "$TARGET"

echo "Yedek olusturuldu: $TARGET.gz"
