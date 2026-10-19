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
fixture_map="$(mktemp "${TMPDIR:-/tmp}/ocu-stub-fixtures.XXXXXX")"
large_chat='pagination-large-smoke'
partial_after_chat='pagination-partial-after-smoke'
stub_pid=''
cleanup() {
  kill "$stub_pid" 2>/dev/null || true
  wait "$stub_pid" 2>/dev/null || true
  rm -f "$log" "$body" "$hdr" "$auth_cfg" "$record" "$fixture_map"
}
trap cleanup EXIT

printf '{"%s":"large","%s":"partial_after"}\n' "$large_chat" "$partial_after_chat" >"$fixture_map"
# A fixture map with an empty asset root selects cwd/app.py instead of the placeholder preview.
OCU_STUB_FIXTURES="$fixture_map" OCU_STUB_ASSETS="${OCU_STUB_ASSETS:-/nonexistent-ocu-smoke-assets}" \
  python3 "$stub_script" >"$log" 2>&1 &
stub_pid=$!

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
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert isinstance(d.get("detail"), dict) and d["detail"].get("reason")=="never_created", d' "$body" \
  || fail "launch never_created body lacks OCU envelope detail.reason"

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

python3 - "$base" "$large_chat" "$partial_after_chat" <<'PY'
import hashlib
import json
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote, urlsplit

base = sys.argv[1]
large_chat = sys.argv[2]
partial_after_chat = sys.argv[3]

def request(path, data=None, headers=None):
    req = urllib.request.Request(base + path, data=data, headers=headers or {})
    try:
        response = urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        return response.status, response.headers, response.read()

def listing(chat='upload-smoke', headers=None, cursor=None):
    path = '/api/outputs/' + quote(chat, safe='')
    if cursor is not None:
        path += '?cursor=' + quote(str(cursor), safe='')
    status, response_headers, body = request(path, headers=headers)
    assert status == 200, f'{chat} cursor={cursor!r}: expected listing HTTP 200, got {(status, body)!r}'
    return json.loads(body), response_headers['ETag']

def upload_response(name, payload, chat='upload-smoke', encoded_name=None):
    envelope = (b'--smoke-boundary\r\nContent-Disposition: form-data; name="file"; '
                b'filename="ignored.bin"\r\nContent-Type: application/octet-stream\r\n\r\n'
                + payload + b'\r\n--smoke-boundary--\r\n')
    route_name = quote(name, safe='') if encoded_name is None else encoded_name
    return request('/api/uploads/' + quote(chat, safe='') + '/' + route_name,
                   envelope, {'Content-Type': 'multipart/form-data; boundary=smoke-boundary'})

def upload(name, payload, chat='upload-smoke'):
    status, _, body = upload_response(name, payload, chat)
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

chat = 'reserved-errors-smoke'
for name, expected_name, payload, error_status, error_body in (
    ('backend403', 'backend403 (2)', b'uploaded 403\x00\xff\r\n', 403, b'backend 403'),
    ('backend409', 'backend409 (2)', b'uploaded 409\x00\xfe\r\n', 409, b'backend 409'),
    ('backend-html403.html', 'backend-html403 (2).html',
     b'uploaded HTML403\x00\xfd\r\n', 403, b'upstream error'),
):
    stored_name = upload(name, payload, chat=chat)
    assert stored_name == expected_name, (
        f'{name}: expected allocated name {expected_name!r}, got {stored_name!r}')
    status, headers, body = request('/files/' + quote(chat, safe='') + '/' + quote(name, safe=''))
    assert (status, body) == (error_status, error_body), (
        f'{name}: expected bare error {(error_status, error_body)!r}, got {(status, body)!r}')
    if name == 'backend-html403.html':
        assert headers.get_content_type() == 'text/html', (
            f'{name}: expected HTML error, got Content-Type {headers.get("Content-Type")!r}')
    status, _, body = request('/files/' + quote(chat, safe='') + '/' + quote(stored_name, safe=''))
    assert (status, body) == (200, payload), (
        f'{stored_name}: expected uploaded response {(200, payload)!r}, got {(status, body)!r}')
outputs, _ = listing(chat)
paths = {row['path'] for row in outputs['files']}
expected_paths = {'backend403 (2)', 'backend409 (2)', 'backend-html403 (2).html'}
assert expected_paths <= paths, (
    f'{chat}: missing uploaded paths {expected_paths - paths!r}; listed paths {paths!r}')
assert not {'backend403', 'backend409'} & paths, (
    f'{chat}: reserved bare error names listed as uploads; listed paths {paths!r}')
print('smoke-stub: reserved backend errors, uploaded binary bytes/listing and HTML403 preserved')

def raw_file_response(path):
    origin = urlsplit(base)
    deadline = time.monotonic() + 5
    wire = bytearray()
    with socket.create_connection((origin.hostname, origin.port), timeout=5) as connection:
        connection.sendall(
            ('GET ' + path + ' HTTP/1.1\r\nHost: ' + origin.netloc
             + '\r\nConnection: close\r\n\r\n').encode('ascii'))
        while True:
            remaining = deadline - time.monotonic()
            assert remaining > 0, f'{path!r}: raw response timed out'
            connection.settimeout(remaining)
            chunk = connection.recv(4096)
            if not chunk:
                break
            wire.extend(chunk)
            assert len(wire) <= 65536, f'{path!r}: raw response exceeds 64 KiB'
    header_block, separator, body = bytes(wire).partition(b'\r\n\r\n')
    assert separator, f'{path!r}: missing HTTP header terminator'
    lines = header_block.split(b'\r\n')
    assert all(not any(byte < 32 or byte == 127 for byte in line) for line in lines), (
        f'{path!r}: raw control byte inside a header line: {header_block!r}')
    status_line = lines[0].split(b' ', 2)
    assert len(status_line) == 3 and status_line[0] == b'HTTP/1.1', (
        f'{path!r}: malformed status line {lines[0]!r}')
    assert len(status_line[1]) == 3 and status_line[1].isdigit(), status_line
    fields = {}
    for line in lines[1:]:
        name, colon, value = line.partition(b':')
        assert colon and re.fullmatch(rb"[!#$%&'*+\-.^_`|~0-9A-Za-z]+", name), (
            f'{path!r}: malformed header line {line!r}')
        assert value.startswith(b' '), f'{path!r}: malformed header value {line!r}'
        fields.setdefault(name.lower(), []).append(value[1:])
    assert b'x-stub-injected' not in fields, f'{path!r}: injected header {fields!r}'
    lengths = fields.get(b'content-length', [])
    assert len(lengths) == 1 and lengths[0].isdigit(), (
        f'{path!r}: invalid Content-Length fields {lengths!r}')
    assert b'transfer-encoding' not in fields, f'{path!r}: unexpected transfer framing'
    assert len(body) == int(lengths[0]), (
        f'{path!r}: expected {lengths[0]!r} body bytes, got {len(body)}')
    return int(status_line[1]), fields, body

chat = 'filename-controls-smoke'
ordinary_name = 'nested dir/report 100%25.bin'
ordinary_payload = b'filename control bytes\x00\xff\r\n\x7f'
assert upload(ordinary_name, ordinary_payload, chat=chat) == ordinary_name
ordinary_listing, _ = listing(chat)
ordinary_entry = next(row for row in ordinary_listing['files'] if row['path'] == ordinary_name)
assert ordinary_entry['size'] == len(ordinary_payload), ordinary_entry
ordinary_path = '/files/' + quote(chat, safe='') + '/' + quote(ordinary_name, safe='')
for query, expected_disposition in (
    ('', b'inline; filename="report 100%25.bin"'),
    ('?download=1', b'attachment; filename="report 100%25.bin"'),
):
    status, headers, body = raw_file_response(ordinary_path + query)
    assert (status, body) == (200, ordinary_payload), (
        f'{ordinary_name!r}{query}: expected exact uploaded binary bytes, got {(status, body)!r}')
    assert headers.get(b'content-disposition', []) == [expected_disposition], (
        f'{ordinary_name!r}{query}: unexpected disposition fields {headers!r}')
print('smoke-stub: ordinary nested ASCII bytes and raw inline/download dispositions verified', flush=True)

# These targets are already encoded; request() sends them without dot-segment normalization.
for route_name in (
    '/leading.bin', 'nested//repeated.bin', 'nested/trailing/',
    '.', '..', './dot.bin', 'nested/./dot.bin', '../dotdot.bin', 'nested/../dotdot.bin',
    '%2fleading.bin', 'nested%2f%2frepeated.bin', 'nested%2f',
    '%2e', '%2e%2e', '%2e/dot.bin', 'nested/%2e/dot.bin',
    '%2e%2e/dotdot.bin', 'nested/%2e%2e/dotdot.bin',
):
    unchanged = listing(chat)
    status, _, body = upload_response(None, b'traversal must not publish', chat, encoded_name=route_name)
    assert status == 400, f'{route_name!r}: expected traversal 400, got {(status, body)!r}'
    assert json.loads(body) == {'detail': 'Invalid filename'}, (route_name, body)
    assert listing(chat) == unchanged, f'{route_name!r}: traversal rejection mutated the full listing'
print('smoke-stub: filename traversal controls GREEN (400/Invalid filename; full listing unchanged)', flush=True)

unsafe_names = [f'control-{code:02x}-{chr(code)}.bin' for code in (*range(32), 127)]
unsafe_names.append('header\r\nX-Stub-Injected: yes\r\n.bin')
for name in unsafe_names:
    unchanged = listing(chat)
    status, _, body = upload_response(name, b'controls must not publish', chat)
    assert status == 400, f'{name!r}: expected invalid-filename 400, got {(status, body)!r}'
    assert json.loads(body) == {'detail': 'Invalid filename'}, (name, body)
    assert listing(chat) == unchanged, f'{name!r}: control rejection mutated the full listing'
    path = '/files/' + quote(chat, safe='') + '/' + quote(name, safe='')
    for query in ('', '?download=1'):
        status, headers, _ = raw_file_response(path + query)
        assert status == 404, f'{name!r}{query}: rejected name is retrievable with HTTP {status}'
        assert headers.get(b'content-disposition', []) == [], (
            f'{name!r}{query}: rejected GET has disposition fields {headers!r}')
print('smoke-stub: all 33 ASCII controls and CRLF injection rejected; raw inline/download 404 headers intact')

large_original_paths = ['page.html'] + [f'item-{index:03d}.txt' for index in range(100)]
large_before, _ = listing(large_chat)
large_first_paths = [row['path'] for row in large_before['files']]
assert large_before['total'] == 101, (
    f'large: expected 101 fixture rows, got {large_before["total"]!r}')
assert large_first_paths == large_original_paths[:100], (
    f'large: expected first 100 original paths, got {large_first_paths!r}')
assert large_before['next_cursor'] == '100', (
    f'large: expected initial next cursor "100", got {large_before["next_cursor"]!r}')
large_remaining, _ = listing(large_chat, cursor=100)
large_remaining_paths = [row['path'] for row in large_remaining['files']]
assert large_remaining_paths == ['item-099.txt'], (
    f'large: expected remaining fixture path ["item-099.txt"], got {large_remaining_paths!r}')
assert large_remaining['total'] == 101 and large_remaining['next_cursor'] is None, (
    f'large: expected total 101 and no further cursor, got {large_remaining!r}')

large_name = 'large-upload.bin'
large_payload = b'large page-two upload\x00\xff\r\n'
large_stored = upload(large_name, large_payload, chat=large_chat)
assert large_stored == large_name, (
    f'large: expected unique upload name {large_name!r}, got {large_stored!r}')
large_after, _ = listing(large_chat)
large_after_paths = [row['path'] for row in large_after['files']]
assert large_stored not in large_after_paths, (
    f'large: upload {large_stored!r} appeared on page one: {large_after_paths!r}')
assert large_after_paths == large_first_paths, (
    f'large: upload changed first 100 original paths: {large_after_paths!r}')
assert large_after['next_cursor'] == '100', (
    f'large: expected next cursor "100" after upload, got {large_after["next_cursor"]!r}')
large_later, _ = listing(large_chat, cursor=100)
large_later_paths = [row['path'] for row in large_later['files']]
assert large_later_paths.count(large_stored) == 1, (
    f'large: expected uploaded path exactly once on cursor 100, got {large_later_paths!r}')
assert large_later_paths == ['item-099.txt', large_stored], (
    f'large: expected upload after remaining fixture path, got {large_later_paths!r}')
status, _, body = request('/files/' + quote(large_chat, safe='') + '/' + quote(large_stored, safe=''))
assert (status, body) == (200, large_payload), (
    f'large: expected HTTP 200 and exact uploaded bytes, got {(status, body)!r}')
print('smoke-stub: large upload pagination passed (101 fixtures; upload only on cursor 100; exact bytes)', flush=True)

partial_original_paths = [f'item-{index:03d}.txt' for index in range(100)]
partial_before, _ = listing(partial_after_chat)
partial_first_paths = [row['path'] for row in partial_before['files']]
assert partial_before['total'] == 101, (
    f'partial_after: expected 101 fixture rows, got {partial_before["total"]!r}')
assert partial_first_paths == partial_original_paths, (
    f'partial_after: expected first 100 original paths, got {partial_first_paths!r}')
assert partial_before['next_cursor'] == '100', (
    f'partial_after: expected initial next cursor "100", got {partial_before["next_cursor"]!r}')

partial_name = 'partial-after-upload.bin'
partial_payload = b'partial listing upload\x00\xfe\r\n'
partial_stored = upload(partial_name, partial_payload, chat=partial_after_chat)
assert partial_stored == partial_name, (
    f'partial_after: expected unique upload name {partial_name!r}, got {partial_stored!r}')
partial_after, _ = listing(partial_after_chat)
partial_after_paths = [row['path'] for row in partial_after['files']]
assert partial_stored not in partial_after_paths, (
    f'partial_after: upload {partial_stored!r} appeared on page one: {partial_after_paths!r}')
assert partial_after_paths == partial_first_paths, (
    f'partial_after: upload changed first 100 original paths: {partial_after_paths!r}')
assert partial_after['next_cursor'] == '100', (
    f'partial_after: expected next cursor "100" after upload, got {partial_after["next_cursor"]!r}')
status, _, body = request('/api/outputs/' + quote(partial_after_chat, safe='') + '?cursor=100')
assert status == 503, (
    f'partial_after: expected intentional cursor-100 HTTP 503, got {(status, body)!r}')
partial_error = json.loads(body)
assert partial_error.get('reason') == 'listing_incomplete', (
    f'partial_after: expected listing_incomplete reason, got {partial_error!r}')
status, _, body = request('/files/' + quote(partial_after_chat, safe='') + '/' + quote(partial_stored, safe=''))
assert (status, body) == (200, partial_payload), (
    f'partial_after: expected HTTP 200 and exact uploaded bytes after listing failure, got {(status, body)!r}')
print('smoke-stub: partial_after upload pagination passed (cursor 100 listing_incomplete; exact bytes after 503)', flush=True)
PY

python3 "$repo_root/scripts/smoke_stub_office.py" "$base" "$stub_script" || fail "office fixtures"

echo "smoke-stub: ok (port $port)"
