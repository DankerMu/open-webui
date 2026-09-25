#!/usr/bin/env bash
# scripts/smoke-stub.sh — start the OCU stub, assert describe/launch/files/outputs/echo, stop.
# Not on the smoke/*.hurl glob; `make smoke` does not invoke this.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
probe_token="$(python3 -c 'import secrets; print("Tok!" + secrets.token_hex(12) + "#$%")')"
export OCU_STUB_PORT="$port"
export OCU_PUBLIC_PREFIX="/ocu"
base="http://127.0.0.1:${port}"
log="$(mktemp "${TMPDIR:-/tmp}/ocu-stub.XXXXXX")"
body="$(mktemp "${TMPDIR:-/tmp}/ocu-stub-body.XXXXXX")"
hdr="$(mktemp "${TMPDIR:-/tmp}/ocu-stub-hdr.XXXXXX")"
auth_cfg="$(mktemp "${TMPDIR:-/tmp}/ocu-stub-auth.XXXXXX")"
python3 "$repo_root/scripts/ocu-stub.py" >"$log" 2>&1 &
stub_pid=$!
cleanup() {
  kill "$stub_pid" 2>/dev/null || true
  wait "$stub_pid" 2>/dev/null || true
  rm -f "$log" "$body" "$hdr" "$auth_cfg"
}
trap cleanup EXIT

fail() { echo "smoke-stub: $*" >&2; exit 1; }

ready=0
for _ in $(seq 1 50); do
  if curl -fsS "$base/internal/describe/running" >/dev/null 2>&1; then ready=1; break; fi
  if ! kill -0 "$stub_pid" 2>/dev/null; then
    echo "smoke-stub: stub exited before ready:" >&2
    cat "$log" >&2
    exit 1
  fi
  sleep 0.1
done
[ "$ready" -eq 1 ] || { echo "smoke-stub: stub not ready:" >&2; cat "$log" >&2; exit 1; }

json_field() {
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d[sys.argv[2]]==sys.argv[3], d' "$1" "$2" "$3"
}
json_views_files_only() {
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["views"]==["files"], d' "$1"
}

json_views_running() {
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); v=d["views"]; assert "browser" in v and "terminal" in v, d' "$1"
}

code="$(curl -sS -o "$body" -w '%{http_code}' "$base/internal/describe/running")"
[ "$code" = "200" ] || fail "describe running HTTP $code"
json_field "$body" state running
json_views_running "$body"

code="$(curl -sS -o "$body" -w '%{http_code}' "$base/internal/describe/stopped")"
[ "$code" = "200" ] || fail "describe stopped HTTP $code"
json_field "$body" state stopped
json_views_files_only "$body"

code="$(curl -sS -o "$body" -w '%{http_code}' "$base/internal/describe/unknown-id")"
[ "$code" = "200" ] || fail "describe unknown HTTP $code"
json_field "$body" state never_created
json_views_files_only "$body"

code="$(curl -sS -o "$body" -w '%{http_code}' "$base/internal/describe/never_created")"
[ "$code" = "200" ] || fail "describe never_created HTTP $code"
json_field "$body" state never_created
json_views_files_only "$body"

code="$(curl -sS -o "$body" -w '%{http_code}' -X POST "$base/internal/launch/stopped")"
[ "$code" = "200" ] || fail "launch stopped HTTP $code"
code="$(curl -sS -o "$body" -w '%{http_code}' "$base/internal/describe/stopped")"
[ "$code" = "200" ] || fail "describe after launch HTTP $code"
json_field "$body" state running
json_views_running "$body"


code="$(curl -sS -o "$body" -w '%{http_code}' -X POST "$base/internal/launch/never_created")"
[ "$code" = "409" ] || fail "launch never_created HTTP $code"
json_field "$body" reason never_created

code="$(curl -sS -o "$body" -w '%{http_code}' "$base/files/running/page.html")"
[ "$code" = "200" ] || fail "files page.html HTTP $code"
grep -q '<html' "$body" || fail "page.html is not HTML"

code="$(curl -sS -D "$hdr" -o "$body" -w '%{http_code}' "$base/files/running/page.html?download=1")"
[ "$code" = "200" ] || fail "download HTTP $code"
grep -qi 'Content-Disposition: attachment' "$hdr" || fail "download is not attachment"

code="$(curl -sS -D "$hdr" -o "$body" -w '%{http_code}' "$base/files/running/diagram.svg")"
[ "$code" = "200" ] || fail "files diagram.svg HTTP $code"
grep -qi 'image/svg+xml' "$hdr" || fail "diagram.svg missing svg content-type"

code="$(curl -sS -o "$body" -w '%{http_code}' "$base/files/running/data.xml")"
[ "$code" = "200" ] || fail "files data.xml HTTP $code"
code="$(curl -sS -o "$body" -w '%{http_code}' "$base/files/running/blob.bin")"
[ "$code" = "200" ] || fail "files blob.bin HTTP $code"

code="$(curl -sS -o "$body" -w '%{http_code}' "$base/api/outputs/running")"
[ "$code" = "200" ] || fail "outputs HTTP $code"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["files"][0]["url"].startswith("/ocu/files/"), d' "$body"

code="$(curl -sS -D "$hdr" -o "$body" -w '%{http_code}' \
  -H 'Authorization: StubEcho stub-token' \
  -H 'X-Requested-With: ocu-workspace' \
  "$base/internal/describe/running")"
[ "$code" = "200" ] || fail "echo describe HTTP $code"
grep -q 'X-Echo-Authorization: StubEcho stub-token' "$hdr" || fail "missing X-Echo-Authorization"
grep -q 'X-Echo-X-Requested-With: ocu-workspace' "$hdr" || fail "missing X-Echo-X-Requested-With"

code="$(curl -sS -o "$body" -w '%{http_code}' "$base/preview/running")"
[ "$code" = "200" ] || fail "preview HTTP $code"
grep -q '/ocu/static/preview.js' "$body" || fail "preview missing prefixed static"

code="$(curl -sS -o "$body" -w '%{http_code}' "$base/ocu/static/preview.js")"
[ "$code" = "200" ] || fail "static HTTP $code"

umask 077
: >"$auth_cfg"
chmod 0600 "$auth_cfg"
auth_kind=Bearer
printf 'header = "Authorization: %s %s"\n' "$auth_kind" "$probe_token" >"$auth_cfg"
code="$(curl -sS -D "$hdr" -o "$body" -w '%{http_code}' \
  -K "$auth_cfg" \
  "$base/files/running/page.html")"
[ "$code" = "200" ] || fail "public files HTTP $code"
if grep -qi 'X-Echo-Authorization' "$hdr"; then fail "public files echoed Authorization"; fi
if grep -Fq "$probe_token" "$hdr" "$body"; then fail "public files leaked token"; fi

code="$(curl -sS -o "$body" -w '%{http_code}' "$base/terminal/running/heartbeat")"
[ "$code" = "200" ] || fail "heartbeat HTTP $code"

echo "smoke-stub: ok (port $port)"
