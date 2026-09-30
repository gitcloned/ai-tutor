#!/usr/bin/env bash
# check-external.sh — verify dev server is reachable from this machine
#
# Run from your local machine (not on the server):
#   bash environments/dev/check-external.sh

set -euo pipefail

HOST="${DEV_HOST:-10.0.65.166}"
DOMAIN="dev-prodigy.leadschool.in"
TIMEOUT=5

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}OK${NC}    $*"; }
fail() { echo -e "  ${RED}FAIL${NC}  $*"; FAILED=1; }
skip() { echo -e "  ${YELLOW}INFO${NC}  $*"; }
FAILED=0

check_port() {
  local label="$1" host="$2" port="$3"
  if nc -z -w "$TIMEOUT" "$host" "$port" 2>/dev/null; then
    ok "$label  $host:$port  open"
  else
    fail "$label  $host:$port  not reachable"
  fi
}

# Accepts 2xx and 3xx as OK (3xx = redirect, which is expected for HTTP→HTTPS)
check_http() {
  local label="$1" url="$2"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
  if [ "$status" = "000" ]; then
    fail "$label  $url  (no response)"
  elif [[ "$status" =~ ^[23] ]]; then
    ok "$label  $url  (HTTP $status)"
  else
    fail "$label  $url  (HTTP $status)"
  fi
}

# Follows redirects — checks final destination returns 2xx
check_http_follow() {
  local label="$1" url="$2"
  local status
  status=$(curl -sL --max-redirs 5 -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null) || true
  [ -z "$status" ] && status="000"
  if [ "$status" = "000" ]; then
    fail "$label  $url  (no response)"
  elif [[ "$status" =~ ^2 ]]; then
    ok "$label  $url  (HTTP $status)"
  elif [ "$status" = "301" ] || [ "$status" = "302" ]; then
    fail "$label  $url  (redirect loop — nginx may need HTTP-only config, run: bash environments/dev/setup.sh on server)"
  else
    fail "$label  $url  (HTTP $status)"
  fi
}

echo ""
echo -e "${CYAN}=== External Connectivity Check ===${NC}"
echo ""

# ── By IP ─────────────────────────────────────────────────────────────────────

echo "By IP ($HOST):"
check_port "SSH  " "$HOST" 22
check_port "HTTP " "$HOST" 80
# HTTPS on direct IP is optional — ALB handles SSL termination
if nc -z -w "$TIMEOUT" "$HOST" 443 2>/dev/null; then
  ok "HTTPS  $HOST:443  open"
else
  skip "HTTPS  $HOST:443  closed (OK — ALB handles SSL, EC2 only needs port 80)"
fi

echo ""

# ── By Domain ─────────────────────────────────────────────────────────────────

echo "By Domain ($DOMAIN):"

# DNS — any resolution is OK; note if it's ALB vs direct
RESOLVED=$(dig +short "$DOMAIN" 2>/dev/null | grep -v '\.$' | tail -1 || true)
RESOLVED_CNAME=$(dig +short "$DOMAIN" 2>/dev/null | grep '\.$' | head -1 | sed 's/\.$//' || true)
if [ -z "$RESOLVED" ] && [ -z "$RESOLVED_CNAME" ]; then
  fail "DNS   $DOMAIN  — not resolving"
elif [ -n "$RESOLVED_CNAME" ]; then
  ok "DNS   $DOMAIN  → ALB ($RESOLVED_CNAME)"
elif [ "$RESOLVED" = "$HOST" ]; then
  ok "DNS   $DOMAIN  → $RESOLVED (direct)"
else
  ok "DNS   $DOMAIN  → $RESOLVED (via ALB)"
fi

check_port "HTTP " "$DOMAIN" 80
check_port "HTTPS" "$DOMAIN" 443

# HTTP should redirect to HTTPS (301 is correct)
check_http "HTTP→HTTPS redirect" "http://$DOMAIN"

# HTTPS should serve canvas (follow redirects to final 200)
check_http_follow "Canvas  " "https://$DOMAIN"

# API health endpoints (go through nginx → Vite proxy → services)
check_http_follow "CMS API " "https://$DOMAIN/api/content/health"

echo ""

# ── SSL cert ──────────────────────────────────────────────────────────────────

echo "SSL:"
if command -v openssl &>/dev/null; then
  CERT_INFO=$(echo | timeout "$TIMEOUT" openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null \
    | openssl x509 -noout -dates 2>/dev/null || true)
  if [ -n "$CERT_INFO" ]; then
    EXPIRY=$(echo "$CERT_INFO" | grep notAfter | cut -d= -f2)
    ok "Cert valid until $EXPIRY"
  else
    skip "Could not retrieve SSL cert"
  fi
else
  skip "openssl not found — skipping cert check"
fi

echo ""

# ── WebSocket ─────────────────────────────────────────────────────────────────

echo "WebSocket:"
if nc -z -w "$TIMEOUT" "$HOST" 32004 2>/dev/null; then
  ok "Agent session active  ws://$HOST:32004  open"
else
  skip "No agent session running  ws://$HOST:32004  closed (normal)"
fi
skip "wss://$DOMAIN/ws  — start an agent session to test live"

echo ""

# ── Summary ───────────────────────────────────────────────────────────────────

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}All checks passed.${NC}"
  echo ""
  echo -e "  Canvas:    ${CYAN}https://$DOMAIN${NC}"
  echo -e "  Agent WS:  ${CYAN}wss://$DOMAIN/ws${NC}"
else
  echo -e "${RED}Some checks failed — see above.${NC}"
  echo ""
  echo "Common fixes:"
  echo "  Ports 80/443 blocked → open in AWS security group / ALB listener"
  echo "  DNS not resolving    → add DNS record for $DOMAIN"
  echo "  Services down        → bash environments/dev/setup.sh health  (run on server)"
  exit 1
fi
echo ""
