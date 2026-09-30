#!/usr/bin/env bash
# db-sync.sh — dump local MongoDB, upload to dev server, restore
#
# Usage:
#   bash environments/dev/db-sync.sh                 dump + upload + restore
#   bash environments/dev/db-sync.sh dump            dump only (no upload/restore)
#   bash environments/dev/db-sync.sh upload          upload last dump + restore (no new dump)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── Config ────────────────────────────────────────────────────────────────────

SSH_KEY="$SCRIPT_DIR/ashish-prodigy-dev-server"
SSH_USER="ubuntu"
SSH_HOST="${DEV_HOST:-10.0.65.166}"

LOCAL_MONGO="${MONGO_URL:-mongodb://localhost:27017}"
DB_NAME="${DB_NAME:-prodigy}"

DUMP_BASE="$REPO_DIR/environments/dev/dumps"
REMOTE_DUMP_DIR="/home/ubuntu/dumps"

# ── Colours ───────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[db-sync]${NC} $*" >&2; }
info() { echo -e "${CYAN}[info]${NC}   $*" >&2; }
warn() { echo -e "${YELLOW}[warn]${NC}   $*" >&2; }
die()  { echo -e "${RED}[error]${NC}  $*" >&2; exit 1; }

# ── Helpers ───────────────────────────────────────────────────────────────────

require_host() {
  [ -n "$SSH_HOST" ] || die "SSH_HOST is empty — set DEV_HOST env var or edit SSH_HOST in this script."
}

require_cmd() {
  command -v "$1" &>/dev/null || die "$1 not found. Install MongoDB Database Tools: https://www.mongodb.com/try/download/database-tools"
}

# IST timestamp: UTC+5:30
ist_timestamp() {
  TZ='Asia/Kolkata' date +"%Y-%m-%d_%H-%M-%S_IST"
}

ssh_run() {
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$SSH_HOST" "$@"
}

# ── Dump ─────────────────────────────────────────────────────────────────────

do_dump() {
  require_cmd mongodump

  TIMESTAMP="$(ist_timestamp)"
  DUMP_DIR="$DUMP_BASE/$TIMESTAMP"
  mkdir -p "$DUMP_DIR"

  log "Dumping $DB_NAME from $LOCAL_MONGO..."
  mongodump \
    --uri="$LOCAL_MONGO" \
    --db="$DB_NAME" \
    --out="$DUMP_DIR" \
    --quiet

  DUMP_ARCHIVE="$DUMP_BASE/${DB_NAME}_${TIMESTAMP}.tar.gz"
  log "Compressing → $(basename "$DUMP_ARCHIVE")"
  COPYFILE_DISABLE=1 tar -czf "$DUMP_ARCHIVE" -C "$DUMP_BASE" "$TIMESTAMP"
  rm -rf "$DUMP_DIR"

  info "Dump saved: $DUMP_ARCHIVE"
  echo "$DUMP_ARCHIVE"   # return path for use by upload step
}

# ── Upload + Restore ──────────────────────────────────────────────────────────

do_upload() {
  local archive="$1"
  require_host
  require_cmd mongodump  # confirms tools are present

  local fname
  fname="$(basename "$archive")"

  log "Uploading $fname → $SSH_USER@$SSH_HOST:$REMOTE_DUMP_DIR/"
  ssh_run "mkdir -p $REMOTE_DUMP_DIR"
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
    "$SSH_USER@$SSH_HOST" "cat > $REMOTE_DUMP_DIR/$fname" < "$archive"

  log "Restoring on dev server..."
  ssh_run bash <<REMOTE
set -e
cd $REMOTE_DUMP_DIR
echo "Extracting $fname..."
tar -xzf "$fname"
EXTRACT_DIR="\$(tar -tzf '$fname' | head -1 | cut -d/ -f1)"
echo "Running mongorestore (db: $DB_NAME)..."
mongorestore \
  --uri="mongodb://localhost:27017" \
  --db="$DB_NAME" \
  --drop \
  --quiet \
  "\$EXTRACT_DIR/$DB_NAME"
echo "Restore complete."
REMOTE

  info "Done. Dev server MongoDB ($DB_NAME) is now in sync with local."
}

# ── Latest dump helper ────────────────────────────────────────────────────────

latest_dump() {
  ls -t "$DUMP_BASE"/*.tar.gz 2>/dev/null | head -1
}

# ── Entry point ───────────────────────────────────────────────────────────────

MODE="${1:-all}"

mkdir -p "$DUMP_BASE"

case "$MODE" in
  dump)
    do_dump
    ;;
  upload)
    LATEST="$(latest_dump)"
    [ -n "$LATEST" ] || die "No dump found in $DUMP_BASE — run:  bash environments/dev/db-sync.sh dump"
    log "Using latest dump: $(basename "$LATEST")"
    do_upload "$LATEST"
    ;;
  all|"")
    ARCHIVE="$(do_dump)"
    do_upload "$ARCHIVE"
    ;;
  *)
    die "Unknown command: $MODE  Usage: bash db-sync.sh [dump|upload|all]"
    ;;
esac
