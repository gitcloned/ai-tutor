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
skip() { echo -e "  ${YELLOW}WARN${NC}  $*"; }
FAILED=0

check_port() {
  local label="$1" host="$2" port="$3"
  if nc -z -w "$TIMEOUT" "$host" "$port" 2>/dev/null; then
    ok "$label  $host:$port  open"
  else
    fail "$label  $host:$port  not reachable"
  fi
}

check_http() {
  local label="$1" url="$2"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
  if [ "$status" = "000" ]; then
    fail "$label  $url  (no response)"
  elif [[ "$status" =~ ^[23] ]]; then
    ok "$label  $url  (HTTP $status)"
  else
    skip "$label  $url  (HTTP $status)"
  fi
}

echo ""
echo -e "${CYAN}=== External Connectivity Check ===${NC}"
echo ""

# ── By IP ─────────────────────────────────────────────────────────────────────

echo "By IP ($HOST):"
check_port "SSH  " "$HOST" 22
check_port "HTTP " "$HOST" 80
check_port "HTTPS" "$HOST" 443
check_http "HTTP " "http://$HOST"
check_http "HTTPS" "https://$HOST"

echo ""

# ── By Domain ─────────────────────────────────────────────────────────────────

echo "By Domain ($DOMAIN):"

# DNS resolution
RESOLVED_IP=$(dig +short "$DOMAIN" 2>/dev/null | head -1 || true)
if [ -z "$RESOLVED_IP" ]; then
  fail "DNS   $DOMAIN  — not resolving"
elif [ "$RESOLVED_IP" = "$HOST" ]; then
  ok "DNS   $DOMAIN  → $RESOLVED_IP"
else
  skip "DNS   $DOMAIN  → $RESOLVED_IP (expected $HOST)"
fi

check_port "SSH  " "$DOMAIN" 22
check_port "HTTP " "$DOMAIN" 80
check_port "HTTPS" "$DOMAIN" 443
check_http "HTTP " "http://$DOMAIN"
check_http "HTTPS" "https://$DOMAIN"
check_http "CMS  " "https://$DOMAIN/api/content/health"
check_http "LP   " "https://$DOMAIN/api/lp/health"

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
    skip "Could not retrieve SSL cert — HTTPS may not be set up yet (run: bash setup.sh ssl)"
  fi
else
  skip "openssl not found — skipping cert check"
fi

echo ""

# ── WebSocket ─────────────────────────────────────────────────────────────────

echo "WebSocket (agent — only open during active session):"
if nc -z -w "$TIMEOUT" "$HOST" 32004 2>/dev/null; then
  ok "Direct  ws://$HOST:32004  open"
else
  skip "Direct  ws://$HOST:32004  closed (normal when no session active)"
fi
skip "Via nginx  wss://$DOMAIN/ws  (start agent session to test)"

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
  echo "  Ports 80/443 blocked  → open in AWS security group"
  echo "  DNS not resolving     → point $DOMAIN → $HOST in DNS settings"
  echo "  HTTPS not working     → bash environments/dev/setup.sh ssl"
  echo "  Services down         → bash environments/dev/setup.sh health  (run on server)"
  exit 1
fi
echo ""
