#!/usr/bin/env bash
# Deploy Firebase Canvas using the dev backend's public API endpoints.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOMAIN="dev-prodigy.leadschool.in"
export VITE_AGENT_API_URL="https://$DOMAIN/api/agent"
export VITE_ERP_API_URL="https://$DOMAIN/api/erp"
export VITE_CMS_API_URL="https://$DOMAIN/api/cms"
export VITE_LEARNING_API_URL="https://$DOMAIN/api/lp"
export VITE_TUTOR_WS_URL="wss://$DOMAIN/ws"
cd "$REPO_DIR/canvas"
# Firebase's predeploy hook rebuilds with these variables before uploading.
npm run deploy
