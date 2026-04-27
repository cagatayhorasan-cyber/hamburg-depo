#!/usr/bin/env bash
# Chunked retry: run script in 25-query chunks, restart between chunks so the
# in-process Postgres pool gets a fresh start. Exits when no more failed
# indexes remain to retry.
set -u
PROJ="/Users/anilakbas/Desktop/Hamburg depo stok programı "
LOG=/tmp/drcman-live-retry.log
PID_FILE=/tmp/drcman-live-retry.pid
DETAIL=/tmp/drcman-live-retry-detail.jsonl
ORIG=/tmp/drcman-live-1000-detail.jsonl

cd "$PROJ"

# Load .env
set -a; . ./.env; set +a
DATABASE_URL="${DATABASE_URL%\"}"
DATABASE_URL="${DATABASE_URL#\"}"
export DATABASE_URL
export SKIP_SECURITY_BLOCK=1
# Pool agresif kucultuldu: muadil/tr chunk'larinda pgbouncer max client conn
# limiti dolup FATAL aldigimiz icin (iter 18-22 chunk rc=1).
export PG_POOL_MAX=4
export PG_CONN_TIMEOUT_MS=120000
export LIVE_CONCURRENCY=1
export RETRY_CHUNK_SIZE=10

stamp() { date '+%H:%M:%S'; }
log()   { echo "[$(stamp)] [loop] $*" | tee -a "$LOG"; }

# How many failed remain?
remaining_count() {
  node -e '
    const fs=require("fs");
    const orig=fs.readFileSync("'"$ORIG"'","utf8").trim().split("\n").filter(Boolean).map(l=>JSON.parse(l));
    let preRetry=[];
    try { preRetry=fs.readFileSync("'"$DETAIL"'","utf8").trim().split("\n").filter(Boolean).map(l=>JSON.parse(l)); } catch(e){}
    const okFromRetry=new Set(preRetry.filter(r=>r.status===200&&r.provider&&r.provider!=="none").map(r=>r.i));
    const failed=orig.filter(r=>r.status!==200||!r.provider||r.provider==="none");
    const remain=failed.filter(r=>!okFromRetry.has(r.i)).length;
    console.log(remain);
  '
}

iteration=0
log "=== CHUNKED RETRY START ==="
while true; do
  iteration=$((iteration+1))
  rem=$(remaining_count)
  log "iteration $iteration starting; remaining=$rem"
  if [ "$rem" = "0" ]; then
    log "all done!"
    break
  fi
  log "running chunk (CHUNK_SIZE=$RETRY_CHUNK_SIZE concurrency=$LIVE_CONCURRENCY)"
  node scripts/drcman-live-retry.js >> "$LOG" 2>&1
  rc=$?
  log "chunk rc=$rc"
  # FATAL durumunda daha uzun sogut (pgbouncer pool flush)
  if [ "$rc" != "0" ]; then
    log "chunk failed (rc=$rc), 90s cool-down for pgbouncer pool"
    sleep 90
  else
    sleep 20
  fi
done
log "=== CHUNKED RETRY END ==="
