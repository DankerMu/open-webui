#!/usr/bin/env bash
# scripts/seed.sh — deterministic seed for the harness: the first signup on a
# fresh DB becomes admin (routers/auths.py signup: num_users == 1 -> admin).
# Idempotent: signin is tried first because upstream auto-disables signup once
# an admin exists (a second signup returns 403, not "email taken").

seed_cleanup() {
  local result=$? attempt
  trap '' INT TERM HUP
  [ "$seed_interrupted" -eq 0 ] || result=$seed_interrupted
  if [ -n "$seed_child" ]; then
    kill "$seed_child" 2>/dev/null || :
    for ((attempt = 0; attempt < 20; attempt++)); do
      kill -0 "$seed_child" 2>/dev/null || break
      sleep 0.05
    done
    kill -KILL "$seed_child" 2>/dev/null || :
    wait "$seed_child" 2>/dev/null || :
  fi
  if [ -n "$seed_scratch" ]; then
    rm -rf -- "$seed_scratch" || { [ "$result" -ne 0 ] || result=1; }
    [ ! -e "$seed_scratch" ] || { [ "$result" -ne 0 ] || result=1; }
  fi
  exit "$result"
}

seed_check_interrupt() {
  [ "$seed_interrupted" -eq 0 ] || exit "$seed_interrupted"
}

seed_begin() {
  set -u
  umask 077
  BASE_URL="${BASE_URL:-http://localhost:8080}"
  SEED_EMAIL="${SEED_EMAIL:-admin@harness.local}"
  SEED_PASSWORD="${SEED_PASSWORD:-harness-admin-pw}"
  SEED_NAME="${SEED_NAME:-Harness Admin}"
  seed_child= seed_scratch= seed_interrupted=0
  trap seed_cleanup EXIT
  # Defer exit until allocations and child PID assignment have completed.
  trap 'seed_interrupted=130' INT
  trap 'seed_interrupted=143' TERM
  trap 'seed_interrupted=129' HUP
  seed_scratch="$(mktemp -d "${TMPDIR:-/tmp}/seed.XXXXXX")" || return $?
  seed_check_interrupt
  local file
  for file in request response status; do
    : > "$seed_scratch/$file" || return $?
  done
}

seed_transport() {
  seed_check_interrupt
  "$@" &
  seed_child=$!
  seed_check_interrupt
  wait "$seed_child"
  local result=$?
  seed_check_interrupt
  seed_child=
  return "$result"
}

seed_post() {
  seed_transport curl -sS -o "$seed_scratch/response" -w '%{http_code}' \
    -X POST "$BASE_URL/api/v1/auths/$1" -H 'Content-Type: application/json' \
    --data-binary "@$seed_scratch/request" > "$seed_scratch/status" || return $?
  IFS= read -r seed_status < "$seed_scratch/status" || :
}

seed_role() {
  sed -n 's/.*"role":"\([a-z]*\)".*/\1/p' "$seed_scratch/response"
}

seed_account() {
  printf '{"email":"%s","password":"%s"}' "$SEED_EMAIL" "$SEED_PASSWORD" \
    > "$seed_scratch/request" || return $?
  seed_post signin || return $?
  if [ "$seed_status" = 200 ]; then
    echo "seed: $SEED_EMAIL already exists (role: $(seed_role), ok)"
    return 0
  fi
  printf '{"name":"%s","email":"%s","password":"%s"}' "$SEED_NAME" "$SEED_EMAIL" \
    "$SEED_PASSWORD" > "$seed_scratch/request" || return $?
  seed_post signup || return $?
  case "$seed_status" in
    200) echo "seed: created $SEED_EMAIL (role: $(seed_role))" ;;
    *) echo "seed: signin failed and signup rejected ($seed_status)" >&2; return 1 ;;
  esac
}

seed_main() {
  seed_begin || return $?
  seed_account
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  seed_main
  exit $?
fi
