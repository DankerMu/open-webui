#!/usr/bin/env bash
# Shared development runtime policy; callers set ports, DATA_DIR, FRONTEND_BUILD_DIR and STATIC_DIR.
repo_root="$(git rev-parse --show-toplevel)" || exit 2
BACKEND_PORT="${BACKEND_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
export BACKEND_PORT FRONTEND_PORT
DATA_DIR="${DATA_DIR:-$repo_root/.run/data}"
FRONTEND_BUILD_DIR="${FRONTEND_BUILD_DIR:-$repo_root/.run/frontend-build}"
case "$DATA_DIR" in
  "$repo_root/.run/data") ;;
  "$repo_root/.run/data/workspace-ui-"*)
    suffix="${DATA_DIR#"$repo_root/.run/data/"}"
    [[ "$suffix" != */* ]] || { echo "DATA_DIR must be an owned workspace directory" >&2; return 2 2>/dev/null || exit 2; } ;;
  *) echo "DATA_DIR must stay under .run/data" >&2; return 2 2>/dev/null || exit 2 ;;
esac
case "$FRONTEND_BUILD_DIR" in
  "$repo_root/.run/frontend-build" | "$repo_root/.run/pytest/frontend-build") ;;
  "$repo_root/.run/workspace-ui-"*/frontend-build)
    suffix="${FRONTEND_BUILD_DIR#"$repo_root/.run/"}"
    suffix="${suffix%/frontend-build}"
    [[ "$suffix" != */* ]] || { echo "FRONTEND_BUILD_DIR must be owned" >&2; return 2 2>/dev/null || exit 2; } ;;
  *) echo "FRONTEND_BUILD_DIR must stay under .run" >&2; return 2 2>/dev/null || exit 2 ;;
esac
if [[ -L "$repo_root/.run" || -L "$repo_root/.run/data" || -L "$DATA_DIR" || -L "$FRONTEND_BUILD_DIR" ]]; then
  echo "Harness directories cannot be symlinks" >&2
  return 2 2>/dev/null || exit 2
fi
# config.py empties STATIC_DIR's top-level files at import and refills them from
# FRONTEND_BUILD_DIR/static; its default is the tracked backend/open_webui/static (#695).
STATIC_DIR="${STATIC_DIR:-${FRONTEND_BUILD_DIR%/frontend-build}/backend-static}"
# .run// resolves to .run itself; a data directory or the refill source would lose webui.db or
# the files the wipe is about to be refilled from.
case "$STATIC_DIR" in
  */./* | */. | */../* | */.. | *//*) echo "STATIC_DIR cannot contain empty, . or .. components" >&2; return 2 2>/dev/null || exit 2 ;;
  "$repo_root/.run/data" | "$repo_root/.run/data/" | "$DATA_DIR" | "$DATA_DIR/" | "$FRONTEND_BUILD_DIR/static" | "$FRONTEND_BUILD_DIR/static/")
    echo "STATIC_DIR cannot be a data directory or FRONTEND_BUILD_DIR/static" >&2; return 2 2>/dev/null || exit 2 ;;
  "$repo_root/.run/"?*) ;;
  *) echo "STATIC_DIR must stay under .run" >&2; return 2 2>/dev/null || exit 2 ;;
esac
static_path="${STATIC_DIR%/}"
while [[ "$static_path" != "$repo_root/.run" ]]; do
  [[ ! -L "$static_path" ]] || { echo "STATIC_DIR cannot pass through a symlink" >&2; return 2 2>/dev/null || exit 2; }
  static_path="${static_path%/*}"
done
unset static_path
export DATA_DIR FRONTEND_BUILD_DIR STATIC_DIR
# An inherited DATABASE_URL, DATABASE_* set or UV_ENV_FILE would move import-time migrations
# and harness writes off $DATA_DIR (#549); pin the validated directory's database silently.
unset DATABASE_TYPE DATABASE_USER DATABASE_PASSWORD DATABASE_HOST DATABASE_PORT DATABASE_NAME UV_ENV_FILE
export DATABASE_URL="sqlite:///$DATA_DIR/webui.db"
# Provenance for runtime receipts (#452): label the inherited flag before the override below
# hides it. Only allowlisted labels are printed; any other value, empty included, is "other".
if [[ -z "${PYTHON_DOTENV_DISABLED+x}" ]]; then
  parent_dotenv_label='unset'
else
  case "$PYTHON_DOTENV_DISABLED" in
    false) parent_dotenv_label='false' ;;
    1) parent_dotenv_label='1' ;;
    *) parent_dotenv_label='other' ;;
  esac
fi
echo "harness-env: parent PYTHON_DOTENV_DISABLED=$parent_dotenv_label" >&2
unset parent_dotenv_label
# Prevent dotenv content from injecting harness configuration; discovery can still run.
export PYTHON_DOTENV_DISABLED=1
export WEBUI_SECRET_KEY="${WEBUI_SECRET_KEY:-dev-harness-secret}"
export ENABLE_OLLAMA_API="${ENABLE_OLLAMA_API:-false}"
export OPENAI_API_BASE_URLS="${OPENAI_API_BASE_URLS:-}"
export ENABLE_OPENAI_API="${ENABLE_OPENAI_API:-false}"
export ENABLE_OCU_WORKSPACE=true
export ENABLE_OCU_OFFICE_EDIT=true
export OCU_INTERNAL_URL="${OCU_INTERNAL_URL:-http://127.0.0.1:9}"
export OCU_INTERNAL_TOKEN="${OCU_INTERNAL_TOKEN:-harness-no-ocu}"
export RAG_EMBEDDING_ENGINE="${RAG_EMBEDDING_ENGINE:-openai}"
export ENABLE_VERSION_UPDATE_CHECK="${ENABLE_VERSION_UPDATE_CHECK:-false}"
export OFFLINE_MODE="${OFFLINE_MODE:-true}"
if [[ -z "${CORS_ALLOW_ORIGIN:-}" ]]; then
  CORS_ALLOW_ORIGIN="http://localhost:${FRONTEND_PORT};http://localhost:${BACKEND_PORT}"
fi
export CORS_ALLOW_ORIGIN
export WEBUI_BACKEND_URL="${WEBUI_BACKEND_URL:-http://localhost:${BACKEND_PORT}}"

stage_frontend_assets() {
  mkdir -p "$FRONTEND_BUILD_DIR" "$STATIC_DIR" || return 1
  rm -rf "$FRONTEND_BUILD_DIR/static" || return 1
  cp -R "$repo_root/static/static" "$FRONTEND_BUILD_DIR/static" || return 1
  # The backend reads assets/, fonts/ and swagger-ui/ from STATIC_DIR at runtime; config.py
  # replaces only top-level files, so seed the tracked tree read-only, without deleting.
  cp -R "$repo_root/backend/open_webui/static/." "$STATIC_DIR/"
}
