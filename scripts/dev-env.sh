#!/usr/bin/env bash
# Shared development runtime policy; callers set ports, DATA_DIR and FRONTEND_BUILD_DIR.
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
  "$repo_root/.run/frontend-build") ;;
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
export DATA_DIR FRONTEND_BUILD_DIR
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
  mkdir -p "$FRONTEND_BUILD_DIR"
  rm -rf "$FRONTEND_BUILD_DIR/static" || return 1
  cp -R "$repo_root/static/static" "$FRONTEND_BUILD_DIR/static"
}
