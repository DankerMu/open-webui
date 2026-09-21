#!/usr/bin/env bash
# scripts/dev-bg.sh — dev-server lifecycle for agents: backend (uvicorn :8080)
# and frontend (vite :5173) detached, each in its own process group with a
# pidfile under .run/. Data goes to .run/data so smoke/seed/db-reset never touch
# backend/data (Forbidden: 删除/重建真实数据库).
# usage: scripts/dev-bg.sh start|stop|status|logs
set -u
repo_root="$(git rev-parse --show-toplevel)" || exit 2
cd "$repo_root" || exit 2
mkdir -p .run/data
BACKEND_PORT="${BACKEND_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
HEALTH_URL="http://localhost:${BACKEND_PORT}/health"
export DATA_DIR="$repo_root/.run/data"
export WEBUI_SECRET_KEY="${WEBUI_SECRET_KEY:-dev-harness-secret}"
export ENABLE_OLLAMA_API="${ENABLE_OLLAMA_API:-false}"
export OPENAI_API_BASE_URLS="${OPENAI_API_BASE_URLS:-}"
export ENABLE_OPENAI_API="${ENABLE_OPENAI_API:-false}"
# No model downloads at startup: the default local sentence-transformers embedder
# pulls ~90 MB from HuggingFace on first boot, which hangs offline (LAN) and
# blows the readiness budget. Smoke tests do not need embeddings.
export RAG_EMBEDDING_ENGINE="${RAG_EMBEDDING_ENGINE:-openai}"
export ENABLE_VERSION_UPDATE_CHECK="${ENABLE_VERSION_UPDATE_CHECK:-false}"
export OFFLINE_MODE="${OFFLINE_MODE:-true}"
export CORS_ALLOW_ORIGIN="http://localhost:${FRONTEND_PORT};http://localhost:${BACKEND_PORT}"
export WEBUI_BACKEND_URL="http://localhost:${BACKEND_PORT}"

alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

start_one() { # start_one NAME PIDFILE LOG CMD...
  name="$1"; pidfile="$2"; log="$3"; shift 3
  if alive "$pidfile"; then echo "$name already running (pid $(cat "$pidfile"))"; return 0; fi
  set -m
  "$@" > "$log" 2>&1 &
  echo $! > "$pidfile"
  set +m
}

listeners() { lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; }

stop_one() { # stop_one NAME PIDFILE PORT
  name="$1"; pidfile="$2"; port="$3"
  if [ -f "$pidfile" ]; then
    pid="$(cat "$pidfile")"
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')" || pgid=""
    if [ -n "$pgid" ] && [ "$pgid" != "0" ]; then kill -- "-$pgid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    else kill "$pid" 2>/dev/null || true; fi
    rm -f "$pidfile"
  else echo "$name: no pidfile — not running (or started outside dev-bg)"; fi
  # Orphan sweep by port, not argv: `uv run` / `npx` re-spawn the real server outside
  # the tracked process group on some platforms. Wait for the port to free (<=10s),
  # escalate to SIGKILL, and fail loud if it is still held.
  for i in $(seq 1 20); do
    pids="$(listeners "$port")"; [ -z "$pids" ] && break
    [ "$i" -ge 10 ] && kill -9 $pids 2>/dev/null || kill $pids 2>/dev/null || true
    sleep 0.5
  done
  if [ -n "$(listeners "$port")" ]; then echo "$name: port $port still held by pid(s) $(listeners "$port" | tr '\n' ' ')" >&2; return 1; fi
  echo "$name stopped (port $port free)"
}

case "${1:-}" in
  start)
    # config.py wipes backend/open_webui/static/ at import and refills it from
    # FRONTEND_BUILD_DIR/static; with no frontend build the avatar and favicon
    # routes 500 (seen in CI once `uv sync` stopped building the wheel, whose
    # hatch hook ran `npm run build` as a side effect). The harness never builds
    # the SPA (vite serves it), so stage the source assets under .run/ instead.
    export FRONTEND_BUILD_DIR="$repo_root/.run/frontend-build"
    rm -rf "$FRONTEND_BUILD_DIR/static" && mkdir -p "$FRONTEND_BUILD_DIR" \
      && cp -R "$repo_root/static/static" "$FRONTEND_BUILD_DIR/static" || exit 2
    start_one backend .run/backend.pid .run/backend.log \
      sh -c "cd backend && exec uv run --quiet uvicorn open_webui.main:app --host 127.0.0.1 --port $BACKEND_PORT"
    for i in $(seq 1 180); do
      if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then echo "backend ready (pid $(cat .run/backend.pid)) — $HEALTH_URL"; break; fi
      if ! alive .run/backend.pid; then echo "backend exited before readiness; last log lines:" >&2; tail -n 20 .run/backend.log >&2; exit 1; fi
      sleep 1
      [ "$i" -eq 180 ] && { echo "backend not ready after 180s; last log lines:" >&2; tail -n 20 .run/backend.log >&2; stop_one backend .run/backend.pid "$BACKEND_PORT"; exit 1; }
    done
    start_one frontend .run/frontend.pid .run/frontend.log \
      sh -c "exec npx --no-install vite dev --port $FRONTEND_PORT --strictPort"
    for i in $(seq 1 60); do
      if curl -fsS "http://localhost:${FRONTEND_PORT}/" >/dev/null 2>&1; then echo "frontend ready (pid $(cat .run/frontend.pid)) — http://localhost:${FRONTEND_PORT}"; exit 0; fi
      if ! alive .run/frontend.pid; then echo "frontend exited before readiness; last log lines:" >&2; tail -n 20 .run/frontend.log >&2; exit 1; fi
      sleep 1
    done
    echo "frontend not ready after 60s; last log lines:" >&2; tail -n 20 .run/frontend.log >&2; exit 1 ;;
  stop) stop_one frontend .run/frontend.pid "$FRONTEND_PORT"; stop_one backend .run/backend.pid "$BACKEND_PORT" ;;
  status)
    for n in backend frontend; do
      if alive ".run/$n.pid"; then echo "$n: pid $(cat ".run/$n.pid") (running)"; else echo "$n: not running"; fi
    done
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then echo "health: OK ($HEALTH_URL)"; else echo "health: UNREACHABLE ($HEALTH_URL)"; exit 1; fi ;;
  logs) tail -n 100 -f .run/backend.log .run/frontend.log ;;
  *) echo "usage: $0 start|stop|status|logs" >&2; exit 2 ;;
esac
