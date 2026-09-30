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

echo ""
echo -e "${CYAN}=== External Connectivity Check ===${NC}"
echo ""

# ── TCP port reachability (by IP) ─────────────────────────────────────────────

echo "Ports ($HOST):"

check_port() {
  local label="$1" port="$2"
  if nc -z -w "$TIMEOUT" "$HOST" "$port" 2>/dev/null; then
    ok "$label  :$port  open"
  else
    fail "$label  :$port  not reachable — check AWS security group / ufw"
  fi
}

check_port "SSH    " 22
check_port "HTTP   " 80
check_port "HTTPS  " 443

echo ""

# ── HTTP/HTTPS via domain ─────────────────────────────────────────────────────

echo "Domain ($DOMAIN):"

check_http() {
  local label="$1" url="$2" expected_min="$3"
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

check_http "Canvas  " "https://$DOMAIN"
check_http "CMS API " "https://$DOMAIN/api/content/health"
check_http "HTTP→HTTPS redirect" "http://$DOMAIN" ""

echo ""

# ── WebSocket agent port (only open during active session) ────────────────────

echo "WebSocket:"
if nc -z -w "$TIMEOUT" "$HOST" 32004 2>/dev/null; then
  ok "Agent WS  wss://$DOMAIN/ws  (port 32004 open — session running)"
else
  skip "Agent WS  wss://$DOMAIN/ws  (port 32004 closed — normal when no session active)"
  skip "Agent connects through nginx at wss://$DOMAIN/ws — no direct port needed"
fi

echo ""

# ── SSL cert check ────────────────────────────────────────────────────────────

echo "SSL:"
if command -v openssl &>/dev/null; then
  CERT_INFO=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || true)
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
  echo "  HTTPS not working     → bash environments/dev/setup.sh ssl"
  echo "  Services down         → bash environments/dev/setup.sh health"
  exit 1
fi
echo ""
