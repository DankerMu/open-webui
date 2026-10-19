#!/usr/bin/env bash
# scripts/db-verify.sh — migration round-trip on the harness DB:
# reset -> upgrade head -> downgrade -1 -> upgrade head. Exit non-zero on any step.
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"; cd "$repo_root"
# Dotenv DATABASE_* could rebuild DATABASE_URL and point Alembic outside .run/data;
# this blocks dotenv content only, discovery still runs.
# Set here too: the child reset's export does not reach this shell's Alembic steps.
export PYTHON_DOTENV_DISABLED=1
# A complete DATABASE_* set from the shell or a uv env-file would also rebuild DATABASE_URL.
unset DATABASE_TYPE DATABASE_USER DATABASE_PASSWORD DATABASE_HOST DATABASE_PORT DATABASE_NAME
bash scripts/db-reset.sh
export DATA_DIR="$repo_root/.run/data"
export DATABASE_URL="sqlite:///$DATA_DIR/webui.db"
export WEBUI_SECRET_KEY="${WEBUI_SECRET_KEY:-dev-harness-secret}"
cd backend/open_webui
echo "--- roll back latest ---"; uv run --quiet --no-env-file alembic downgrade -1
echo "--- re-apply up ---";     uv run --quiet --no-env-file alembic upgrade head
echo "db-verify passed"
