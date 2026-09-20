#!/usr/bin/env bash
# scripts/db-verify.sh — migration round-trip on the harness DB:
# reset -> upgrade head -> downgrade -1 -> upgrade head. Exit non-zero on any step.
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"; cd "$repo_root"
bash scripts/db-reset.sh
export DATA_DIR="$repo_root/.run/data"
export DATABASE_URL="sqlite:///$DATA_DIR/webui.db"
export WEBUI_SECRET_KEY="${WEBUI_SECRET_KEY:-dev-harness-secret}"
cd backend/open_webui
echo "--- roll back latest ---"; uv run --quiet alembic downgrade -1
echo "--- re-apply up ---";     uv run --quiet alembic upgrade head
echo "db-verify passed"
