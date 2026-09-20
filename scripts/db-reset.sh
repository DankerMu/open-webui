#!/usr/bin/env bash
# scripts/db-reset.sh — wipe the HARNESS database only (.run/data/webui.db) and
# re-create the schema via alembic. Refuses to touch anything outside .run/.
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"; cd "$repo_root"
export DATA_DIR="$repo_root/.run/data"
case "$DATA_DIR" in "$repo_root/.run/"*) ;; *) echo "db-reset: refusing to reset $DATA_DIR (only .run/data is resettable)" >&2; exit 2 ;; esac
mkdir -p "$DATA_DIR"
rm -f "$DATA_DIR/webui.db" "$DATA_DIR/webui.db-wal" "$DATA_DIR/webui.db-shm"
export DATABASE_URL="sqlite:///$DATA_DIR/webui.db"
export WEBUI_SECRET_KEY="${WEBUI_SECRET_KEY:-dev-harness-secret}"
(cd backend/open_webui && uv run --quiet alembic upgrade head)
echo "db-reset: $DATA_DIR/webui.db recreated at alembic head"
