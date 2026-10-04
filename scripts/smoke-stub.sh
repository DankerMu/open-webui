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
record="$(mktemp "${TMPDIR:-/tmp}/ocu-stub-record.XXXXXX")"
export OCU_STUB_RECORD="$record"
stub_script="${OCU_STUB_SCRIPT:-$repo_root/scripts/ocu-stub.py}"
python3 "$stub_script" >"$log" 2>&1 &
stub_pid=$!
cleanup() {
  kill "$stub_pid" 2>/dev/null || true
  wait "$stub_pid" 2>/dev/null || true
  rm -f "$log" "$body" "$hdr" "$auth_cfg" "$record"
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

python3 - "$base" <<'PY'
import hashlib
import json
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

base = sys.argv[1]

def request(path, data=None, headers=None):
    req = urllib.request.Request(base + path, data=data, headers=headers or {})
    try:
        response = urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        return response.status, response.headers, response.read()

def listing(chat='upload-smoke', headers=None):
    status, response_headers, body = request('/api/outputs/' + quote(chat, safe=''), headers=headers)
    assert status == 200, (status, body)
    return json.loads(body), response_headers['ETag']

def upload(name, payload, chat='upload-smoke'):
    envelope = (b'--smoke-boundary\r\nContent-Disposition: form-data; name="file"; '
                b'filename="ignored.bin"\r\nContent-Type: application/octet-stream\r\n\r\n'
                + payload + b'\r\n--smoke-boundary--\r\n')
    status, _, body = request('/api/uploads/' + quote(chat, safe='') + '/' + quote(name, safe=''),
                             envelope, {'Content-Type': 'multipart/form-data; boundary=smoke-boundary'})
    assert status == 200, (status, body)
    result = json.loads(body)
    assert result['status'] == 'success', result
    assert result['size'] == len(payload) and result['md5'] == hashlib.md5(payload).hexdigest(), result
    return result['filename']

for name in ('manifest', 'list'):
    status, _, _ = request('/api/uploads/' + quote('upload-smoke', safe='') + '/' + quote(name, safe=''))
    assert status == 404, (name, status)
print('smoke-stub: retired upload GETs 404')

before, etag = listing()
other_before, _ = listing('other-chat')
payload = b'first document\x00\xff\r\n'
assert upload('report.docx', payload) == 'report.docx'
first, first_etag = listing(headers={'If-None-Match': etag})
entry = next(row for row in first['files'] if row['path'] == 'report.docx')
assert entry['file_id'] and entry['size'] == len(payload), entry
assert first['revision'] > before['revision'] and first_etag != etag
assert request('/files/' + quote('upload-smoke', safe='') + '/' + quote('report.docx', safe=''))[2] == payload
assert upload('report.docx', b'second document') == 'report (2).docx'
second, second_etag = listing()
assert second['revision'] > first['revision'] and second_etag != first_etag
assert next(row for row in second['files'] if row['path'] == 'report.docx') == entry
duplicate = next(row for row in second['files'] if row['path'] == 'report (2).docx')
assert duplicate['file_id'] != entry['file_id']
assert request('/files/' + quote('upload-smoke', safe='') + '/' + quote('report.docx', safe=''))[2] == payload
assert request('/files/' + quote('upload-smoke', safe='') + '/' + quote('report (2).docx', safe=''))[2] == b'second document'
assert request('/api/outputs/' + quote('upload-smoke', safe=''), headers={'If-None-Match': second_etag})[0] == 304
assert listing('other-chat')[0] == other_before
assert request('/files/' + quote('other-chat', safe='') + '/' + quote('report.docx', safe=''))[0] == 404
print('smoke-stub: report.docx and report (2).docx listed; first bytes/id/revision preserved')

original = request('/files/' + quote('upload-smoke', safe='') + '/' + quote('page.html', safe=''))[2]
assert upload('page.html', b'replacement') == 'page (2).html'
assert request('/files/' + quote('upload-smoke', safe='') + '/' + quote('page.html', safe=''))[2] == original
for name in ('manifest', 'list'):
    assert upload(name, name.encode()) == name
    assert request('/files/' + quote('upload-smoke', safe='') + '/' + quote(name, safe=''))[2] == name.encode()

with ThreadPoolExecutor(max_workers=4) as pool:
    names = list(pool.map(lambda n: upload('race.txt', str(n).encode()), range(4)))
assert set(names) == {'race.txt', 'race (2).txt', 'race (3).txt', 'race (4).txt'}, names
assert {request('/files/' + quote('upload-smoke', safe='') + '/' + quote(name, safe=''))[2] for name in names} == {b'0', b'1', b'2', b'3'}

unchanged, _ = listing()
status, _, _ = request('/api/uploads/' + quote('upload-smoke', safe='') + '/' + quote('broken.docx', safe=''), b'not multipart',
                       {'Content-Type': 'multipart/form-data; boundary=missing'})
assert 400 <= status < 500, status
assert listing()[0] == unchanged
print('smoke-stub: collision, chat isolation, ETag, concurrent claims and malformed multipart verified')
PY

python3 "$repo_root/scripts/smoke_stub_office.py" "$base" "$stub_script" || fail "office fixtures"

echo "smoke-stub: ok (port $port)"
