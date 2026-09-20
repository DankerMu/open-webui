#!/usr/bin/env bash
# scripts/seed.sh — deterministic seed for the harness: the first signup on a
# fresh DB becomes admin (routers/auths.py signup: num_users == 1 -> admin).
# Idempotent: signin is tried first because upstream auto-disables signup once
# an admin exists (a second signup returns 403, not "email taken").
set -u
BASE_URL="${BASE_URL:-http://localhost:8080}"
SEED_EMAIL="${SEED_EMAIL:-admin@harness.local}"
SEED_PASSWORD="${SEED_PASSWORD:-harness-admin-pw}"
SEED_NAME="${SEED_NAME:-Harness Admin}"
body="$(mktemp "${TMPDIR:-/tmp}/seed.XXXXXX")"; trap 'rm -f "$body"' EXIT

post() { curl -sS -o "$body" -w '%{http_code}' -X POST "$BASE_URL/api/v1/auths/$1" \
  -H 'Content-Type: application/json' -d "$2"; }
role() { sed -n 's/.*"role":"\([a-z]*\)".*/\1/p' "$body"; }

status="$(post signin "{\"email\":\"$SEED_EMAIL\",\"password\":\"$SEED_PASSWORD\"}")"
if [ "$status" = "200" ]; then echo "seed: $SEED_EMAIL already exists (role: $(role), ok)"; exit 0; fi

status="$(post signup "{\"name\":\"$SEED_NAME\",\"email\":\"$SEED_EMAIL\",\"password\":\"$SEED_PASSWORD\"}")"
case "$status" in
  200) echo "seed: created $SEED_EMAIL (role: $(role))" ;;
  *) echo "seed: signin failed and signup rejected ($status): $(cat "$body")" >&2; exit 1 ;;
esac
