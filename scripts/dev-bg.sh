#!/usr/bin/env bash
# scripts/dev-bg.sh — dev-server lifecycle for agents: backend (uvicorn :8080)
# and frontend (vite :5173) detached, each in its own process group with a
# pidfile under .run/. Data goes to .run/data so smoke/seed/db-reset never touch
# backend/data (Forbidden: 删除/重建真实数据库).
# Only processes whose working directory resolves to this checkout's repository
# root are signalled or trusted; any other listener on the ports is left running
# and named (#667).
# usage: scripts/dev-bg.sh start|stop|status|logs|stage
set -u
repo_root="$(git rev-parse --show-toplevel)" || exit 2
cd "$repo_root" || exit 2
source scripts/dev-env.sh || exit 2
case "${1:-}" in
  start|stop|status)
    # Listener ownership comes from lsof. Without it every port reads as free, so stop
    # would skip the harness and start/status would trust a foreign server (#667).
    command -v lsof >/dev/null 2>&1 || { echo "dev-bg: '$1' requires lsof to tell this checkout's listeners from others; install lsof" >&2; exit 2; } ;;
esac
mkdir -p "$DATA_DIR"
HEALTH_URL="http://localhost:${BACKEND_PORT}/health"

# owned PID — the process's working directory resolves to this checkout's root. Another
# worktree (sibling, nested or sharing a path prefix), no repository, or an unreadable
# working directory is foreign. git prints physical paths on both sides.
owned() {
  local line cwd="" top
  while IFS= read -r line; do
    case "$line" in n*) cwd="${line#n}" ;; esac
  done < <(lsof -w -a -p "$1" -d cwd -Fn 2>/dev/null)
  [ -n "$cwd" ] || return 1
  top="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)" || return 1
  [ "$top" = "$repo_root" ]
}

alive() { local pid; [ -f "$1" ] && pid="$(cat "$1")" && kill -0 "$pid" 2>/dev/null && owned "$pid"; }

start_one() { # start_one NAME PIDFILE LOG CMD...
  name="$1"; pidfile="$2"; log="$3"; shift 3
  if alive "$pidfile"; then echo "$name already running (pid $(cat "$pidfile"))"; return 0; fi
  set -m
  "$@" > "$log" 2>&1 &
  echo $! > "$pidfile"
  set +m
}

# listeners PORT — pids listening on PORT. -w silences warnings, so any other output is an
# lsof failure, which must not read as "port free".
listeners() {
  local out
  out="$(lsof -w -nP -tiTCP:"$1" -sTCP:LISTEN 2>&1)"
  case "$out" in *[!0-9$'\n']*) echo "dev-bg: lsof failed on port $1: $out" >&2; return 2 ;; esac
  printf '%s' "$out"
}

classify() { # classify PORT — sets owned_pids and foreign_pids (space-separated)
  local pids p
  owned_pids=""; foreign_pids=""
  pids="$(listeners "$1")" || return 2
  for p in $pids; do
    if owned "$p"; then owned_pids="$owned_pids $p"; else foreign_pids="$foreign_pids $p"; fi
  done
}

describe() { printf 'port %s, pid %s (%s)' "$1" "$2" "$(ps -o command= -p "$2" 2>/dev/null)"; }

name_foreign() { # name_foreign PORT PREFIX — one stderr line per foreign listener; 1 when any
  local p
  for p in $foreign_pids; do echo "$2: foreign listener on $(describe "$1" "$p")" >&2; done
  [ -z "$foreign_pids" ]
}

stop_one() { # stop_one NAME PIDFILE PORT
  local name="$1" pidfile="$2" port="$3" pid pgid i
  if [ -f "$pidfile" ]; then
    pid="$(cat "$pidfile")"
    if owned "$pid"; then
      pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')" || pgid=""
      if [ -n "$pgid" ] && [ "$pgid" != "0" ]; then kill -- "-$pgid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      else kill "$pid" 2>/dev/null || true; fi
    else echo "$name: stale pidfile (pid $pid is not a process of this checkout) — removed, nothing signalled" >&2; fi
    rm -f "$pidfile"
  else echo "$name: no pidfile — not running (or started outside dev-bg)"; fi
  # Orphan sweep by port, not argv: `uv run` / `npx` re-spawn the real server outside
  # the tracked process group on some platforms. Only owned listeners are signalled;
  # wait for them to go (<=10s), escalate to SIGKILL, and fail loud if one survives.
  for i in $(seq 1 21); do
    classify "$port" || return 2
    if [ -z "$owned_pids" ] || [ "$i" -gt 20 ]; then break; fi
    # shellcheck disable=SC2086 # owned_pids is a space-separated pid list
    if [ "$i" -ge 10 ]; then kill -9 $owned_pids 2>/dev/null || true; else kill $owned_pids 2>/dev/null || true; fi
    sleep 0.5
  done
  name_foreign "$port" "$name: leaving running" || true
  if [ -n "$owned_pids" ]; then echo "$name: port $port still held by pid(s)$owned_pids" >&2; return 1; fi
  echo "$name stopped (port $port free of this checkout's listeners)"
}

case "${1:-}" in
  stage) stage_frontend_assets || exit 2 ;;
  start)
    # Preflight before staging or starting anything: a foreign holder of either port
    # refuses the start; an owned listener without a live pidfile is an orphan to sweep.
    refused=""
    classify "$BACKEND_PORT" || exit 2; backend_owned="$owned_pids"; name_foreign "$BACKEND_PORT" "dev-bg: refusing to start" || refused=1
    classify "$FRONTEND_PORT" || exit 2; frontend_owned="$owned_pids"; name_foreign "$FRONTEND_PORT" "dev-bg: refusing to start" || refused=1
    [ -z "$refused" ] || exit 1
    if [ -n "$backend_owned" ] && ! alive .run/backend.pid; then stop_one backend .run/backend.pid "$BACKEND_PORT" || exit 1; fi
    if [ -n "$frontend_owned" ] && ! alive .run/frontend.pid; then stop_one frontend .run/frontend.pid "$FRONTEND_PORT" || exit 1; fi
    stage_frontend_assets || exit 2
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
    # A server this checkout did not start is never reported healthy (#667).
    foreign=""
    for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
      classify "$port" || exit 2
      for p in $foreign_pids; do echo "health: foreign listener on $port (pid $p)"; foreign=1; done
    done
    [ -z "$foreign" ] || exit 1
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then echo "health: OK ($HEALTH_URL)"; else echo "health: UNREACHABLE ($HEALTH_URL)"; exit 1; fi ;;
  logs) tail -n 100 -f .run/backend.log .run/frontend.log ;;
  *) echo "usage: $0 start|stop|status|logs|stage" >&2; exit 2 ;;
esac
