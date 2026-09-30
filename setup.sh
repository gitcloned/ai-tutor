#!/usr/bin/env bash
# setup.sh — bootstrap and health-check Prodigy on Ubuntu
#
# Usage:
#   bash setup.sh          full install + build + start
#   bash setup.sh health   check if everything is properly set up

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()   { echo -e "${GREEN}[setup]${NC} $*"; }
info()  { echo -e "${CYAN}[info]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
die()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ── Load nvm so node/pnpm/pm2 are on PATH ────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
# Also try common system paths
export PATH="$HOME/.local/bin:$PATH"

# ── Read agent/.env into env (for MONGO_URL etc.) ────────────────────────────
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
  command -v pnpm    &>/dev/null && ok "pnpm $(pnpm -v)"                                          || fail "pnpm not found — run: bash setup.sh"
  command -v pm2     &>/dev/null && ok "pm2 $(pm2 -v 2>/dev/null)"                               || fail "pm2 not found — run: bash setup.sh"
  command -v python3 &>/dev/null && ok "Python $(python3 --version 2>&1 | awk '{print $2}')"     || fail "python3 not found"
  command -v nginx   &>/dev/null && ok "nginx $(nginx -v 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')" \
                                 || skip "nginx not installed (needed for HTTPS/reverse proxy)"

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
  [ -f "$REPO_DIR/agent/dist/agent.js" ]                              && ok "agent dist"       || fail "agent dist missing — cd agent && pnpm build"
  [ -f "$REPO_DIR/cms/packages/backend/dist/server.js" ]             && ok "cms-backend dist" || fail "cms-backend dist missing — cd cms && pnpm build"
  [ -f "$REPO_DIR/cms/packages/learning-progression/dist/server.js" ] && ok "lp-server dist"  || fail "lp-server dist missing — cd cms && pnpm build"
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
    check_pm2 canvas
  else
    fail "pm2 not installed — run: bash setup.sh"
  fi

  echo ""

  # --- HTTP endpoints ---
  echo "Endpoints:"
  check_http() {
    local label="$1" url="$2"
    curl -sf --max-time 3 "$url" &>/dev/null \
      && ok "$label  $url" \
      || fail "$label  $url — not responding"
  }
  check_http "CMS API" "http://localhost:32001/health"
  check_http "LP API " "http://localhost:32002/health"
  check_http "Canvas " "http://localhost:32000"

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

  if ! command -v nginx &>/dev/null; then
    log "Installing nginx..."
    sudo apt-get install -y nginx
    sudo systemctl enable nginx
  else
    log "nginx $(nginx -v 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+') — OK"
  fi

  if ! command -v mongod &>/dev/null; then
    warn "MongoDB not installed locally. Install manually if needed:"
    warn "  https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/"
    warn "Or set MONGO_URL in agent/.env to use a remote instance."
  else
    log "mongod — OK"
  fi

  echo ""

  # ── Node.js via nvm ──────────────────────────────────────────────────────────
  if ! command -v node &>/dev/null || [ "$(node -e "console.log(parseInt(process.version.slice(1)))")" -lt 18 ]; then
    log "Installing Node.js 20 via nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
    nvm install 20
    nvm use 20
    nvm alias default 20
  else
    log "Node.js $(node -v) — OK"
  fi

  # ── pnpm / pm2 ───────────────────────────────────────────────────────────────
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
    warn "Created agent/.env — fill in GEMINI_API_KEY and MONGO_URL before starting."
  else
    log "agent/.env exists — skipping"
  fi

  # Load .env so MONGO_URL is available when writing ecosystem config
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

  log "Building canvas..."
  cd "$REPO_DIR/canvas" && pnpm build

  echo ""

  # ── PM2 ecosystem — pass MONGO_URL + DB_NAME from .env ──────────────────────
  ECOSYSTEM="$REPO_DIR/ecosystem.config.cjs"
  MONGO_URL_VAL="${MONGO_URL:-mongodb://localhost:27017}"
  DB_NAME_VAL="${DB_NAME:-prodigy}"

  log "Writing ecosystem.config.cjs (MONGO_URL: $MONGO_URL_VAL)..."
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
      name: 'canvas',
      script: '$REPO_DIR/canvas/node_modules/.bin/vite',
      cwd: '$REPO_DIR/canvas',
      interpreter: 'none',
      env: { NODE_ENV: 'development' },
    },
  ],
};
ECOEOF

  # ── Start pm2 ────────────────────────────────────────────────────────────────
  log "Starting services with pm2..."
  cd "$REPO_DIR"
  pm2 stop ecosystem.config.cjs 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 save

  echo ""
  log "Setup complete!"
  echo ""
  info "Services running:"
  info "  Canvas UI   http://localhost:32000"
  info "  LP API      http://localhost:32002"
  info "  CMS API     http://localhost:32001"
  echo ""
  info "Start an agent session:"
  info "  cd agent"
  info "  node scripts/cli.mjs --concept <id> --medium canvas --port 32004"
  echo ""
  info "Enable auto-start on reboot:"
  info "  pm2 startup   (run the printed command, then: pm2 save)"
  echo ""
  info "Check everything is working:"
  info "  bash setup.sh health"
  echo ""
}

# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

case "${1:-install}" in
  health)     health  ;;
  install|"") install ;;
  *) die "Unknown command: $1  Usage: bash setup.sh [install|health]" ;;
esac
