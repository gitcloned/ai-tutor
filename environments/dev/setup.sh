#!/usr/bin/env bash
# setup.sh — bootstrap and health-check Prodigy on Ubuntu
#
# Usage:
#   bash setup.sh            full install + build + start
#   bash setup.sh health     check if everything is properly set up
#   bash setup.sh ssl        configure HTTPS (auto-detects ALB vs direct — run after install)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

DOMAIN="dev-prodigy.leadschool.in"
SSL_EMAIL="admin@leadschool.in"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()   { echo -e "${GREEN}[setup]${NC} $*"; }
info()  { echo -e "${CYAN}[info]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
die()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ── Load nvm so node/pnpm/pm2 are on PATH ────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
export PATH="$HOME/.local/bin:$PATH"

# ── Read agent/.env into env ─────────────────────────────────────────────────
load_dotenv() {
  local env_file="$REPO_DIR/agent/.env"
  [ -f "$env_file" ] || return 0
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]]           && continue
    local key="${line%%=*}"
    local val="${line#*=}"
    [ -n "$key" ] && export "$key"="$val"
  done < "$env_file"
}

# ── Write nginx config ────────────────────────────────────────────────────────
write_nginx_config() {
  sudo tee /etc/nginx/sites-available/prodigy > /dev/null <<NGINXEOF
# Prodigy — managed by setup.sh
# HTTP: certbot ACME + redirect to HTTPS once cert exists

server {
    listen 80;
    server_name $DOMAIN;

    # Let's Encrypt ACME challenge (needed for certbot)
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Agent WebSocket (ws://)
    location /ws {
        proxy_pass         http://localhost:32004;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # LP Admin UI  →  /lp-admin
    location /lp-admin {
        rewrite ^/lp-admin(/.*)?$ /admin$1 break;
        proxy_pass         http://localhost:32002;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }

    # Canvas
    location / {
        proxy_pass         http://localhost:32000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}
NGINXEOF

  sudo ln -sf /etc/nginx/sites-available/prodigy /etc/nginx/sites-enabled/prodigy
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl reload nginx
  log "nginx config written and reloaded"
}

# ─────────────────────────────────────────────────────────────────────────────
# HEALTH CHECK
# ─────────────────────────────────────────────────────────────────────────────

health() {
  load_dotenv
  HEALTH_FAIL=0
  ok()   { echo -e "  ${GREEN}OK${NC}    $*"; }
  fail() { echo -e "  ${RED}FAIL${NC}  $*"; HEALTH_FAIL=1; }
  skip() { echo -e "  ${YELLOW}WARN${NC}  $*"; }

  echo ""
  echo -e "${CYAN}=== Prodigy Health Check ===${NC}"
  echo ""

  # --- Tools ---
  echo "Tools:"
  if command -v node &>/dev/null; then
    NODE_MAJOR=$(node -e "console.log(parseInt(process.version.slice(1)))")
    [ "$NODE_MAJOR" -ge 18 ] && ok "Node.js $(node -v)" || fail "Node.js $(node -v) — need >= 18"
  else
    fail "Node.js not found — run: bash setup.sh"
  fi
  command -v pnpm    &>/dev/null && ok "pnpm $(pnpm -v)"                                              || fail "pnpm not found — run: bash setup.sh"
  command -v pm2     &>/dev/null && ok "pm2 $(pm2 -v 2>/dev/null)"                                   || fail "pm2 not found — run: bash setup.sh"
  command -v python3 &>/dev/null && ok "Python $(python3 --version 2>&1 | awk '{print $2}')"         || fail "python3 not found"
  command -v nginx   &>/dev/null && ok "nginx $(nginx -v 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')" || fail "nginx not installed — run: bash setup.sh"
  command -v certbot &>/dev/null && ok "certbot $(certbot --version 2>&1 | awk '{print $2}')"        || skip "certbot not installed — run: bash setup.sh ssl"

  echo ""

  # --- nginx ---
  echo "nginx:"
  if sudo nginx -t 2>/dev/null; then
    ok "config valid"
  else
    fail "config invalid — sudo nginx -t for details"
  fi
  if [ -f /etc/nginx/sites-enabled/prodigy ]; then
    ok "prodigy site enabled"
  else
    fail "prodigy site not enabled — run: bash setup.sh"
  fi
  # SSL — check via ALB (cert lives on ALB, not on this server)
  if curl -sf --max-time 3 "https://$DOMAIN" &>/dev/null; then
    ok "HTTPS reachable via ALB → https://$DOMAIN"
  elif [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    EXPIRY=$(sudo openssl x509 -enddate -noout -in "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null | cut -d= -f2)
    ok "SSL cert (local) valid until $EXPIRY"
  else
    skip "HTTPS not reachable yet — run: bash setup.sh ssl  for AWS steps"
  fi

  echo ""

  # --- MongoDB ---
  echo "MongoDB:"
  if pgrep -x mongod &>/dev/null 2>&1; then
    ok "mongod running locally"
  elif [ -n "${MONGO_URL:-}" ]; then
    ok "MONGO_URL set → ${MONGO_URL}"
  else
    skip "mongod not running and MONGO_URL not set — backends will fail to connect"
  fi

  echo ""

  # --- Builds ---
  echo "Builds:"
  [ -f "$REPO_DIR/agent/dist/agent.js" ]                               && ok "agent dist"       || fail "agent dist missing — cd agent && pnpm build"
  [ -f "$REPO_DIR/cms/packages/backend/dist/server.js" ]              && ok "cms-backend dist" || fail "cms-backend dist missing — cd cms && pnpm build"
  [ -f "$REPO_DIR/cms/packages/learning-progression/dist/server.js" ] && ok "lp-server dist"  || fail "lp-server dist missing — cd cms && pnpm build"
  [ -f "$REPO_DIR/cms/packages/erp/dist/server.js" ]                  && ok "erp dist"         || fail "erp dist missing — cd cms/packages/erp && pnpm build"
  [ -d "$REPO_DIR/canvas/dist" ] && ok "canvas dist" || skip "canvas dist not built (OK — vite dev is used)"

  echo ""

  # --- Config ---
  echo "Config:"
  ENV_FILE="$REPO_DIR/agent/.env"
  if [ -f "$ENV_FILE" ]; then
    ok "agent/.env exists"
    grep -q "^GEMINI_API_KEY=.\+" "$ENV_FILE" && ok "GEMINI_API_KEY set" || fail "GEMINI_API_KEY missing or empty in agent/.env"
  else
    fail "agent/.env not found — run: bash setup.sh"
  fi

  echo ""

  # --- pm2 processes ---
  echo "Processes (pm2):"
  if command -v pm2 &>/dev/null; then
    check_pm2() {
      local name="$1"
      if pm2 show "$name" 2>/dev/null | grep -q "online"; then
        ok "$name online"
      elif pm2 show "$name" 2>/dev/null | grep -qE "stopped|errored"; then
        fail "$name stopped/errored — pm2 restart $name  (logs: pm2 logs $name --lines 30)"
      else
        fail "$name not in pm2 — run: bash setup.sh"
      fi
    }
    check_pm2 cms-backend
    check_pm2 lp-server
    check_pm2 erp-server
    check_pm2 canvas
  else
    fail "pm2 not installed — run: bash setup.sh"
  fi

  echo ""

  # --- Endpoints ---
  echo "Endpoints (local):"
  check_http() {
    local label="$1" url="$2"
    curl -sf --max-time 3 "$url" &>/dev/null \
      && ok "$label  $url" \
      || fail "$label  $url — not responding"
  }
  check_http "CMS API" "http://localhost:32001/health"
  check_http "LP API " "http://localhost:32002/health"
  check_http "ERP API" "http://localhost:32005/health"
  check_http "Canvas " "http://localhost:32000"

  echo ""
  echo "Endpoints (public):"
  if curl -sf --max-time 5 "https://$DOMAIN" &>/dev/null; then
    ok "https://$DOMAIN"
  elif curl -sf --max-time 5 "http://$DOMAIN" &>/dev/null; then
    skip "http://$DOMAIN (SSL not set up — run: bash setup.sh ssl)"
  else
    fail "$DOMAIN not reachable (DNS / firewall)"
  fi

  echo ""

  if [ "$HEALTH_FAIL" -eq 0 ]; then
    echo -e "${GREEN}All checks passed.${NC}"
  else
    echo -e "${RED}Some checks failed — see above.${NC}"
    exit 1
  fi
  echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# SSL — ALB-aware HTTPS setup
# ─────────────────────────────────────────────────────────────────────────────

# Returns true if domain resolves to an ALB (CNAME) rather than a direct IP
is_alb() {
  local resolved
  resolved=$(dig +short "$DOMAIN" 2>/dev/null | tail -1 || true)
  # ALB endpoints are CNAMEs ending in .elb.amazonaws.com or similar
  [[ "$resolved" == *.amazonaws.com* ]] || [[ "$resolved" == *.elb.* ]]
}

run_ssl() {
  echo ""
  log "Detecting SSL setup for $DOMAIN..."

  if is_alb; then
    echo ""
    echo -e "${CYAN}=== ALB Detected — SSL is terminated at the load balancer ===${NC}"
    echo ""
    echo "Your domain resolves to an AWS ALB. SSL is handled there — no certbot needed."
    echo "nginx on this server stays on HTTP port 80; ALB does HTTPS → HTTP."
    echo ""
    echo "Steps to complete in AWS Console:"
    echo ""
    echo "  1. EC2 → Target Groups → Create target group"
    echo "     - Type:        Instances (or IP)"
    echo "     - Protocol:    HTTP  Port: 80"
    echo "     - Health check path: /"
    echo "     - Register:    this EC2 ($(hostname -I | awk '{print $1}'))"
    echo ""
    echo "  2. EC2 → Load Balancers → alb-vpc01-test-leadschool-apps"
    echo "     → Listeners → HTTPS :443 → View/edit rules"
    echo "     → Add rule:"
    echo "       IF   Host header = $DOMAIN"
    echo "       THEN Forward to  <target group from step 1>"
    echo ""
    echo "  3. EC2 security group for this instance:"
    echo "     - Allow inbound TCP 80 from ALB security group (not 0.0.0.0/0)"
    echo "     - Port 443 does NOT need to be open on this instance"
    echo ""
    echo "  4. For WebSocket (wss://$DOMAIN/ws):"
    echo "     - ALB supports WebSocket natively — no extra config needed"
    echo "     - Ensure ALB idle timeout >= 3600s (for long agent sessions)"
    echo "       Load Balancer → Attributes → Idle timeout"
    echo ""
    echo "Once done, test with:"
    echo "  bash environments/dev/check-external.sh"
    echo ""
  else
    # Direct IP — use certbot
    log "Direct IP detected — using Let's Encrypt (certbot)..."
    command -v certbot &>/dev/null || {
      log "Installing certbot..."
      sudo apt-get update -qq
      sudo apt-get install -y certbot python3-certbot-nginx
    }
    log "Requesting Let's Encrypt cert for $DOMAIN..."
    sudo certbot --nginx \
      -d "$DOMAIN" \
      --non-interactive \
      --agree-tos \
      --email "$SSL_EMAIL" \
      --redirect
    sudo systemctl reload nginx
    echo ""
    log "SSL enabled!"
    info "  Canvas   https://$DOMAIN"
    info "  Agent WS wss://$DOMAIN/ws"
    echo ""
    info "Cert auto-renews via systemd timer. Check: sudo certbot renew --dry-run"
    echo ""
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# INSTALL (Ubuntu / apt-get)
# ─────────────────────────────────────────────────────────────────────────────

install() {
  [ "$(uname -s)" = "Linux" ] || die "This script is for Ubuntu/Linux. Detected: $(uname -s)"

  log "Repo: $REPO_DIR"
  echo ""

  # ── System packages ──────────────────────────────────────────────────────────
  log "Updating apt..."
  sudo apt-get update -qq

  command -v curl    &>/dev/null || sudo apt-get install -y curl
  command -v python3 &>/dev/null || { log "Installing Python 3..."; sudo apt-get install -y python3 python3-pip; }
  log "Python $(python3 --version 2>&1 | awk '{print $2}') — OK"

  # nginx + certbot
  if ! command -v nginx &>/dev/null; then
    log "Installing nginx..."
    sudo apt-get install -y nginx
    sudo systemctl enable nginx
  else
    log "nginx $(nginx -v 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+') — OK"
  fi

  if ! command -v certbot &>/dev/null; then
    log "Installing certbot..."
    sudo apt-get install -y certbot python3-certbot-nginx
  else
    log "certbot $(certbot --version 2>&1 | awk '{print $2}') — OK"
  fi

  # Write nginx config (HTTP only — run 'bash setup.sh ssl' to add HTTPS)
  log "Configuring nginx..."
  write_nginx_config

  # MongoDB
  if ! command -v mongod &>/dev/null; then
    log "Installing MongoDB 7.x..."
    UBUNTU_CODENAME=$(lsb_release -cs 2>/dev/null || grep -oP '(?<=UBUNTU_CODENAME=)\w+' /etc/os-release || echo "jammy")
    case "$UBUNTU_CODENAME" in
      noble|mantic)   MONGO_CODENAME="jammy"  ;;
      jammy|focal)    MONGO_CODENAME="$UBUNTU_CODENAME" ;;
      *)              MONGO_CODENAME="jammy"  ;;
    esac
    sudo apt-get install -y gnupg
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
      | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
https://repo.mongodb.org/apt/ubuntu ${MONGO_CODENAME}/mongodb-org/7.0 multiverse" \
      | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
    sudo apt-get update -qq
    sudo apt-get install -y mongodb-org
    sudo systemctl enable mongod
    sudo systemctl start mongod
    log "MongoDB 7 installed and started"
  else
    log "mongod — OK"
    pgrep -x mongod &>/dev/null || sudo systemctl start mongod
  fi

  echo ""

  # ── Node.js via nvm ──────────────────────────────────────────────────────────
  if ! command -v node &>/dev/null || [ "$(node -e "console.log(parseInt(process.version.slice(1)))")" -lt 18 ]; then
    log "Installing Node.js 20 via nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
    nvm install 20 && nvm use 20 && nvm alias default 20
  else
    log "Node.js $(node -v) — OK"
  fi

  command -v pnpm &>/dev/null || { log "Installing pnpm..."; npm install -g pnpm; }
  command -v pm2  &>/dev/null || { log "Installing pm2...";  npm install -g pm2;  }
  log "pnpm $(pnpm -v) — OK"
  log "pm2 $(pm2 -v 2>/dev/null) — OK"

  echo ""

  # ── agent/.env ──────────────────────────────────────────────────────────────
  ENV_FILE="$REPO_DIR/agent/.env"
  if [ ! -f "$ENV_FILE" ]; then
    log "Creating agent/.env template..."
    cat > "$ENV_FILE" <<'ENVEOF'
# Required — Gemini API key (used by the agent LLM)
GEMINI_API_KEY=

# Optional — TTS via Inworld
# INWORLD_API_KEY=
# INWORLD_VOICE_ID=

# Optional — Groq fallback
# GROQ_API_KEY=

# Optional — MongoDB (default: mongodb://localhost:27017)
# MONGO_URL=mongodb://localhost:27017
# DB_NAME=prodigy

# Optional — override service base URLs
# LP_URL=http://localhost:32002
# CMS_URL=http://localhost:32001
ENVEOF
    warn "Created agent/.env — fill in GEMINI_API_KEY before starting."
  else
    log "agent/.env exists — skipping"
  fi

  load_dotenv

  echo ""

  # ── Install dependencies ─────────────────────────────────────────────────────
  log "Installing agent dependencies..."
  cd "$REPO_DIR/agent" && pnpm install

  log "Installing canvas dependencies..."
  cd "$REPO_DIR/canvas" && pnpm install

  log "Installing cms dependencies..."
  cd "$REPO_DIR/cms" && pnpm install

  echo ""

  # ── Build ────────────────────────────────────────────────────────────────────
  log "Building agent..."
  cd "$REPO_DIR/agent" && pnpm build

  log "Building cms packages..."
  cd "$REPO_DIR/cms" && pnpm build

  log "Building erp..."
  cd "$REPO_DIR/cms/packages/erp" && pnpm build

  log "Building canvas..."
  cd "$REPO_DIR/canvas" && pnpm build

  echo ""

  # ── PM2 ecosystem ────────────────────────────────────────────────────────────
  ECOSYSTEM="$REPO_DIR/ecosystem.config.cjs"
  MONGO_URL_VAL="${MONGO_URL:-mongodb://localhost:27017}"
  DB_NAME_VAL="${DB_NAME:-prodigy}"

  log "Writing ecosystem.config.cjs..."
  cat > "$ECOSYSTEM" <<ECOEOF
// ecosystem.config.cjs — managed by setup.sh (re-run setup.sh to regenerate)
module.exports = {
  apps: [
    {
      name: 'cms-backend',
      script: 'dist/server.js',
      cwd: '$REPO_DIR/cms/packages/backend',
      env: {
        PORT: 32001,
        NODE_ENV: 'production',
        MONGO_URL: '$MONGO_URL_VAL',
        DB_NAME:   '$DB_NAME_VAL',
      },
    },
    {
      name: 'lp-server',
      script: 'dist/server.js',
      cwd: '$REPO_DIR/cms/packages/learning-progression',
      env: {
        PORT: 32002,
        NODE_ENV: 'production',
        MONGO_URL: '$MONGO_URL_VAL',
        DB_NAME:   '$DB_NAME_VAL',
      },
    },
    {
      name: 'erp-server',
      script: 'dist/server.js',
      cwd: '$REPO_DIR/cms/packages/erp',
      env: {
        PORT: 32005,
        NODE_ENV: 'production',
        MONGO_URL: '$MONGO_URL_VAL',
        DB_NAME:   '$DB_NAME_VAL',
        LP_URL:    'http://localhost:32002',
        CMS_URL:   'http://localhost:32001',
      },
    },
    {
      name: 'canvas',
      script: '$REPO_DIR/canvas/node_modules/.bin/vite',
      cwd: '$REPO_DIR/canvas',
      interpreter: 'none',
      env: {
        NODE_ENV: 'development',
        VITE_TUTOR_WS_URL: 'wss://$DOMAIN/ws',
      },
    },
  ],
};
ECOEOF

  log "Starting services with pm2..."
  cd "$REPO_DIR"
  pm2 stop ecosystem.config.cjs 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 save

  echo ""
  log "Setup complete!"
  echo ""
  info "Services running:"
  info "  Canvas     http://$DOMAIN  (or http://localhost:32000)"
  info "  CMS API    http://localhost:32001"
  info "  LP API     http://localhost:32002"
  info "  LP Admin   https://$DOMAIN/lp-admin"
  info "  ERP API    http://localhost:32005"
  echo ""
  info "Next step — enable HTTPS:"
  info "  bash environments/dev/setup.sh ssl"
  echo ""
  info "After SSL, connect agent at:  wss://$DOMAIN/ws"
  echo ""
  info "Start an agent session:"
  info "  cd agent"
  info "  node scripts/cli.mjs --concept <id> --medium canvas --port 32004"
  echo ""
  info "Enable auto-start on reboot:"
  info "  pm2 startup   (run the printed command, then: pm2 save)"
  echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

case "${1:-install}" in
  health)     health   ;;
  ssl)        run_ssl  ;;
  install|"") install  ;;
  *) die "Unknown command: $1  Usage: bash setup.sh [install|health|ssl]" ;;
esac
