#!/usr/bin/env bash
# DRC Portal — Release Öncesi Güvenlik Checklist Ajanı
#
# Kullanım:
#   bash scripts/security-audit.sh             # repo durumunu denetle, çıkış kodu = severity
#   bash scripts/security-audit.sh --live      # canlı (Vercel) header'ları da test et
#   bash scripts/security-audit.sh --json      # makine-okunabilir JSON çıktı (CI için)
#
# Çıkış kodu:
#   0 = OK (sadece info)
#   1 = WARN var, FAIL yok
#   2 = FAIL var (deploy edilmemeli)
#
# Pre-push hook olarak da bağlanabilir:
#   ln -sf ../../scripts/security-audit.sh .git/hooks/pre-push
#
# DRCMAN audit'inin 5 maddesini otomatik kontrol eder + bonus kontroller.

set -uo pipefail

# Repo kökü — bu script scripts/ altında olduğu için ..
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

LIVE_MODE=0
JSON_MODE=0
LIVE_URL="https://drckaltetechnik.vercel.app"
for arg in "$@"; do
  case "$arg" in
    --live) LIVE_MODE=1 ;;
    --json) JSON_MODE=1 ;;
    --url=*) LIVE_URL="${arg#--url=}"; LIVE_MODE=1 ;;
  esac
done

FAIL_COUNT=0
WARN_COUNT=0
INFO_COUNT=0
declare -a RESULTS

emit() {
  local severity="$1"
  local check_id="$2"
  local message="$3"
  RESULTS+=("$severity|$check_id|$message")
  case "$severity" in
    FAIL) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
    WARN) WARN_COUNT=$((WARN_COUNT + 1)) ;;
    INFO) INFO_COUNT=$((INFO_COUNT + 1)) ;;
  esac
}

if [ "$JSON_MODE" -eq 0 ]; then
  echo "🔒 DRC Portal Güvenlik Denetimi"
  echo "   Repo: $REPO_DIR"
  [ "$LIVE_MODE" -eq 1 ] && echo "   Canlı URL: $LIVE_URL"
  echo ""
fi

# ============================================================================
# 1) CSP: 'unsafe-eval' production'da var mı? — KRİTİK
# ============================================================================
# Mantık: 'unsafe-eval' SADECE admin-tools (ternary'in TRUE dalı) içinde
# bulunmalı. Genel script-src'de (FALSE dalı) varsa FAIL.
# Yorum satırlarını (//, /*, *) atla.
if grep -qE "'unsafe-eval'" server/app.js 2>/dev/null; then
  UNSAFE_EVAL_LINES=$(grep -nE "'unsafe-eval'" server/app.js | grep -vE "^[0-9]+:\s*(//|\*|/\*)" | cut -d: -f1)
  SCOPED=1
  for ln in $UNSAFE_EVAL_LINES; do
    # Aynı satır + 3 önceki satır context'inde isAdminToolRequest var mı?
    CONTEXT=$(sed -n "$((ln - 3)),${ln}p" server/app.js)
    if ! echo "$CONTEXT" | grep -qE "isAdminToolRequest"; then
      SCOPED=0
      break
    fi
  done
  if [ "$SCOPED" -eq 1 ]; then
    emit INFO "csp-unsafe-eval-scoped" "'unsafe-eval' sadece /admin-tools scope'unda (3rd-party CDN için), genel script-src'de yok ✓"
  else
    emit FAIL "csp-unsafe-eval" "server/app.js'de 'unsafe-eval' geniş script-src'de bulundu"
  fi
fi

# ============================================================================
# 2) CSP: 'unsafe-inline' script-src'de — WARN
# ============================================================================
SCRIPT_INLINE_SERVER=$(grep -E "'unsafe-inline'" server/app.js | grep -c "script-src\|script-src.*unsafe" 2>/dev/null || true)
if grep -qE '"script-src": \[[^]]*"\047unsafe-inline\047"' server/app.js 2>/dev/null; then
  emit FAIL "csp-script-unsafe-inline-server" "server/app.js script-src'de 'unsafe-inline' var (XSS savunması zayıflar)"
else
  emit INFO "csp-script-inline-clean" "server CSP script-src 'unsafe-inline' içermiyor ✓"
fi
if grep -qE "script-src [^;]*'unsafe-inline'" vercel.json 2>/dev/null; then
  emit FAIL "csp-script-unsafe-inline-vercel" "vercel.json route'larında script-src 'unsafe-inline' var"
else
  emit INFO "csp-script-inline-vercel-clean" "vercel.json CSP script-src 'unsafe-inline' içermiyor ✓"
fi

# ============================================================================
# 3) Inline onclick/onload attribute (HTML) — WARN
# ============================================================================
# Tek dosya — multi-file grep -c kaosu çıkmaz
INLINE_HANDLERS=$( { grep -cE 'on(click|change|input|submit|load|error|focus|blur|mouseover|mouseout)="' public/index.html 2>/dev/null || echo 0; } | head -1)
INLINE_HANDLERS=${INLINE_HANDLERS:-0}
if [ "$INLINE_HANDLERS" -gt 0 ] 2>/dev/null; then
  emit WARN "html-inline-handlers" "public/index.html'de $INLINE_HANDLERS inline event handler (onclick=…) var — CSP'yi zayıflatır"
else
  emit INFO "html-inline-handlers-clean" "Inline event handler attribute yok ✓"
fi

# ============================================================================
# 4) Bundle Secret Sızıntısı — KRİTİK
# ============================================================================
SECRET_PATTERNS=(
  "service_role"
  "service-role"
  "SUPABASE_SERVICE_ROLE_KEY"
  "jwt_secret"
  "JWT_SECRET"
  "private_key"
  "PRIVATE_KEY"
  "sk_live_"
  "sk_test_"
  "stripe_secret"
  "OPENAI_API_KEY"
  "AKIA[0-9A-Z]{16}"
)
PUBLIC_FILES=$(ls public/*.js public/*.html 2>/dev/null | tr '\n' ' ')
LEAK_HITS=0
for pattern in "${SECRET_PATTERNS[@]}"; do
  # Tek-shot toplam eşleşme (multi-file grep -c ile per-line "file:count" sorununu önler)
  HITS=$( { cat public/*.js public/*.html 2>/dev/null | grep -cE "$pattern"; } | head -1)
  HITS=${HITS:-0}
  if [ "$HITS" -gt 0 ] 2>/dev/null; then
    emit FAIL "secret-leak-$pattern" "Frontend bundle'da '$pattern' pattern eşleşmesi ($HITS satır)"
    LEAK_HITS=$((LEAK_HITS + HITS))
  fi
done
if [ "$LEAK_HITS" -eq 0 ]; then
  emit INFO "secret-leak-clean" "Frontend bundle'da bilinen secret pattern'i bulunamadı ✓"
fi

# DATABASE_URL ÖZEL: frontend'de OLMAMALI
if cat public/*.js public/*.html 2>/dev/null | grep -qE 'DATABASE_URL'; then
  emit FAIL "db-url-frontend" "DATABASE_URL referansı frontend bundle'da bulundu"
else
  emit INFO "db-url-not-leaked" "DATABASE_URL frontend bundle'da yok ✓"
fi

# ============================================================================
# 5) localStorage / sessionStorage'da auth pattern — KRİTİK
# ============================================================================
# Çok özel pattern'ler: gerçek auth-benzeri storage key'leri.
# "session" tek başına çok geniş (drc_session_id telemetri gibi şeyleri yakalıyordu).
# Bu yüzden 'session_token' / 'access_token' / 'jwt' / 'auth_token' kombinasyonlarına bakılır.
AUTH_STORAGE=$( { cat public/*.js 2>/dev/null | grep -cE '(localStorage|sessionStorage)\.setItem\([^)]*(access_token|auth_token|session_token|jwt_token|password|api_secret|service_role|bearer_token)'; } | head -1)
AUTH_STORAGE=${AUTH_STORAGE:-0}
if [ "$AUTH_STORAGE" -gt 0 ] 2>/dev/null; then
  emit FAIL "storage-auth-leak" "localStorage/sessionStorage'da auth-token pattern ($AUTH_STORAGE yer)"
else
  emit INFO "storage-auth-clean" "localStorage/sessionStorage'da auth-token pattern yok ✓"
fi

# ============================================================================
# 6) Service Worker — /api/ network-only mi?
# ============================================================================
if [ -f public/sw.js ]; then
  if grep -qE 'pathname\.startsWith\("/api/"\)' public/sw.js && grep -qE 'return;' public/sw.js; then
    emit INFO "sw-api-network-only" "Service Worker /api/ rotalarını cache etmiyor ✓"
  else
    emit FAIL "sw-api-may-cache" "Service Worker /api/ rotalarını cache ediyor olabilir (auth response leakage riski)"
  fi
else
  emit WARN "sw-missing" "public/sw.js bulunamadı (PWA yok)"
fi

# ============================================================================
# 7) Vercel HSTS + güvenlik header'ları (vercel.json)
# ============================================================================
if [ -f vercel.json ]; then
  HSTS_COUNT=$(grep -cE 'Strict-Transport-Security' vercel.json || echo 0)
  if [ "$HSTS_COUNT" -lt 1 ]; then
    emit FAIL "vercel-hsts-missing" "vercel.json'da HSTS header'ı yok"
  else
    emit INFO "vercel-hsts" "vercel.json HSTS var ($HSTS_COUNT route'ta)"
  fi

  for required in "X-Content-Type-Options" "X-Frame-Options" "Referrer-Policy" "Permissions-Policy"; do
    if ! grep -qE "$required" vercel.json; then
      emit WARN "vercel-header-missing-$required" "vercel.json'da $required eksik"
    fi
  done
fi

# ============================================================================
# 8) .env dosyası git'e commit edilmemiş mi?
# ============================================================================
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  emit FAIL "env-committed" ".env dosyası git'e commit edilmiş (secret sızıntı riski)"
else
  emit INFO "env-not-tracked" ".env dosyası git tracked değil ✓"
fi

# ============================================================================
# 9) Canlı header testi (--live mode)
# ============================================================================
if [ "$LIVE_MODE" -eq 1 ]; then
  if ! command -v curl >/dev/null; then
    emit WARN "live-curl-missing" "curl bulunamadı, canlı test atlandı"
  else
    HEADERS=$(curl -sI -m 10 "$LIVE_URL/" 2>/dev/null || true)
    if [ -z "$HEADERS" ]; then
      emit WARN "live-unreachable" "$LIVE_URL erişilemedi (network/timeout)"
    else
      if echo "$HEADERS" | grep -qi "strict-transport-security"; then
        emit INFO "live-hsts" "Canlıda HSTS gönderiliyor ✓"
      else
        emit FAIL "live-hsts-missing" "Canlıda HSTS header'ı YOK"
      fi
      if echo "$HEADERS" | grep -qi "content-security-policy"; then
        if echo "$HEADERS" | grep -i "content-security-policy" | grep -qE "script-src[^;]*unsafe-inline"; then
          emit WARN "live-csp-script-inline" "Canlı CSP script-src'de 'unsafe-inline' var"
        else
          emit INFO "live-csp-script-strict" "Canlı CSP script-src 'unsafe-inline' içermiyor ✓"
        fi
      else
        emit FAIL "live-csp-missing" "Canlıda Content-Security-Policy header'ı yok"
      fi
      for h in "X-Content-Type-Options" "X-Frame-Options" "Referrer-Policy"; do
        if ! echo "$HEADERS" | grep -qi "$h"; then
          emit WARN "live-header-missing-$h" "Canlıda $h header'ı yok"
        fi
      done
    fi
  fi
fi

# ============================================================================
# Rapor
# ============================================================================
if [ "$JSON_MODE" -eq 1 ]; then
  printf '{"fail":%d,"warn":%d,"info":%d,"results":[' "$FAIL_COUNT" "$WARN_COUNT" "$INFO_COUNT"
  FIRST=1
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r sev cid msg <<< "$r"
    [ $FIRST -eq 0 ] && printf ','
    FIRST=0
    printf '{"severity":"%s","check":"%s","message":%s}' "$sev" "$cid" "$(printf '%s' "$msg" | python3 -c 'import sys,json;print(json.dumps(sys.stdin.read()))')"
  done
  printf "]}\n"
else
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r sev cid msg <<< "$r"
    case "$sev" in
      FAIL) printf "  ❌ FAIL  [%s] %s\n" "$cid" "$msg" ;;
      WARN) printf "  ⚠️  WARN  [%s] %s\n" "$cid" "$msg" ;;
      INFO) printf "  ✅ OK    [%s] %s\n" "$cid" "$msg" ;;
    esac
  done
  echo ""
  echo "📊 Özet:  FAIL: $FAIL_COUNT  ·  WARN: $WARN_COUNT  ·  OK: $INFO_COUNT"
  if [ "$FAIL_COUNT" -gt 0 ]; then
    echo ""
    echo "🛑 FAIL var — production deploy ÖNERİLMEZ"
  elif [ "$WARN_COUNT" -gt 0 ]; then
    echo ""
    echo "🟡 WARN var ama FAIL yok — deploy edilebilir, takipte kalın"
  else
    echo ""
    echo "🟢 Tüm kontroller geçti — production'a hazır"
  fi
fi

if [ "$FAIL_COUNT" -gt 0 ]; then exit 2; fi
if [ "$WARN_COUNT" -gt 0 ]; then exit 1; fi
exit 0
