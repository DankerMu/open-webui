#!/usr/bin/env python3
"""Deterministic OCU HTTP stub for harness smoke. No Docker, no real OCU."""

from __future__ import annotations

import ast
import base64
import hashlib
import json
import logging
import mimetypes
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

log = logging.getLogger('ocu-stub')

PREFIX = os.environ.get('OCU_PUBLIC_PREFIX', '').rstrip('/')
EXPECTED_TOKEN = os.environ.get('OCU_INTERNAL_TOKEN', '')
RECORD_PATH = os.environ.get('OCU_STUB_RECORD', '')
FIXTURE_PATH = os.environ.get('OCU_STUB_FIXTURES', '')
ASSET_ROOT = Path(os.environ.get('OCU_STUB_ASSETS', ''))
VALID_OFFICE = Path(os.environ.get('OCU_STUB_DOCX', ''))
WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
# Upstream generated fixtures use a weaker CSP so the proxy's forced
# sandbox CSP is observable. Binary/download keep this upstream policy.
WEAK_CSP = "default-src 'self'"
FILES = {
    'page.html': (
        'text/html; charset=utf-8',
        b"""<!doctype html><html><head><title>ocu-stub page</title>
<link rel="stylesheet" href="style.css"><style>#inline{color:rgb(0,128,0)}</style></head><body>
<p id="inline">ocu-stub page</p><img id="image" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=">
<button id="run" onclick="document.querySelector('#clicked').textContent='clicked'">Run</button>
<span id="clicked"></span><span id="proof"></span>
<script>
let storage='blocked', parentAccess='blocked', cookie='blocked';
try { localStorage.getItem('token'); storage='leaked' } catch {}
try { window.parent.localStorage.getItem('token'); parentAccess='leaked' } catch {}
try { cookie=document.cookie || 'blocked' } catch {}
document.querySelector('#proof').textContent=[self.origin,storage,parentAccess,cookie].join('|');
window.parent.postMessage({type:'fixture-opaque',storage,parentAccess,cookie},'*');
</script></body></html>""",
    ),
    'report.html': ('text/html; charset=utf-8', b'<!doctype html><html><body>ocu-stub report</body></html>'),
    'final.html': ('text/html; charset=utf-8', b'<!doctype html><html><body>ocu-stub final report</body></html>'),
    'diagram.svg': (
        'image/svg+xml',
        b"""<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40">
<text id="proof" y="20">waiting</text><script><![CDATA[
let storage='blocked', parentAccess='blocked', cookie='blocked';
try { localStorage.getItem('token'); storage='leaked' } catch {}
try { window.parent.localStorage.getItem('token'); parentAccess='leaked' } catch {}
try { cookie=document.cookie || 'blocked' } catch {}
document.getElementById('proof').textContent=[self.origin,storage,parentAccess,cookie].join('|');
window.parent.postMessage({type:'fixture-svg',storage,parentAccess,cookie},'*');
]]></script></svg>""",
    ),
    'report.svg': ('image/svg+xml', b'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'),
    'data.xml': ('application/xml', b'<?xml version="1.0"?><root>ocu-stub</root>'),
    'report.xml': ('application/xml', b'<?xml version="1.0"?><root>ocu-stub-report</root>'),
    'plain.xml': ('text/xml; charset=utf-8', b'<?xml version="1.0"?><root>plain-xml</root>'),
    'page.xhtml': (
        'application/xhtml+xml; charset=UTF-8',
        b'<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>x</body></html>',
    ),
    'report.xhtml': (
        'application/xhtml+xml; charset=UTF-8',
        b'<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>r</body></html>',
    ),
    'blob.bin': ('application/octet-stream', b'\x00\x01\x02\x03'),
    'report.bin': ('application/octet-stream', b'\x00\x01\x02\x03'),
    'sub/report.bin': ('application/octet-stream', b'nested-bin'),
    'sub/space hash#plus+percent%.html': (
        'text/html; charset=utf-8',
        b'<!doctype html><html><body>encoded</body></html>',
    ),
    'sub/report.html': ('text/html; charset=utf-8', b'<!doctype html><html><body>nested</body></html>'),
    'backend-html403.html': ('TEXT/HTML; charset=utf-8', b'upstream error'),
}
STATIC = {
    'preview.js': ('text/javascript; charset=utf-8', b'export const ocuStub = true;\n'),
    'deep/preview.js': ('text/javascript; charset=utf-8', b'export const ocuStubDeep = true;\n'),
}

_LOCK = threading.Lock()
_SEQ = 0
_states: dict[str, str] = {
    'running': 'running',
    'stopped': 'stopped',
    'never_created': 'never_created',
}

DESCRIBE_RE = re.compile(r'^/internal/describe/([^/]+)$')
LAUNCH_RE = re.compile(r'^/internal/launch/([^/]+)$')
OUTPUTS_RE = re.compile(r'^/api/outputs/([^/]+)$')
ARCHIVE_RE = re.compile(r'^/files/([^/]+)/archive$')
FILES_RE = re.compile(r'^/files/([^/]+)/(.+)$')
PREVIEW_RE = re.compile(r'^/preview/([^/]+)$')
UPLOAD_GET_RE = re.compile(r'^/api/uploads/([^/]+)/(manifest|list)$')
UPLOAD_POST_RE = re.compile(r'^/api/uploads/([^/]+)/(.+)$')
BROWSER_STATUS_RE = re.compile(r'^/browser/([^/]+)/status$')
BROWSER_JSON_VERSION_RE = re.compile(r'^/browser/([^/]+)/json/version$')
BROWSER_JSON_RE = re.compile(r'^/browser/([^/]+)/json$')
TERM_STATUS_RE = re.compile(r'^/terminal/([^/]+)/status$')
HEARTBEAT_RE = re.compile(r'^/terminal/([^/]+)/heartbeat$')
TERM_SESSIONS_RE = re.compile(r'^/terminal/([^/]+)/sessions$')
TERM_PROCESSES_RE = re.compile(r'^/terminal/([^/]+)/processes$')
TERM_ACTION_RE = re.compile(r'^/terminal/([^/]+)/(start-ttyd|stop-ttyd|restart-container|resurrect-container)$')
TERM_KILL_RE = re.compile(r'^/terminal/([^/]+)/processes/([0-9]+)/kill$')
TERM_WS_RE = re.compile(r'^/terminal/([^/]+)/ws$')
BROWSER_WS_RE = re.compile(r'^/browser/([^/]+)/devtools/page/([^/]+)$')
STATIC_RE = re.compile('^' + re.escape(PREFIX) + r'/static/(.+)$') if PREFIX else re.compile(r'^/static/(.+)$')


def _scenario(chat_id: str) -> str | None:
    if not FIXTURE_PATH:
        return None
    fixtures = json.loads(Path(FIXTURE_PATH).read_text(encoding='utf-8'))
    return fixtures.get(chat_id)


def _fixture_file(chat_id: str, name: str, revision: int = 1) -> dict:
    kind, mime = (
        ('docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        if name.endswith('.docx')
        else (
            ('html', 'text/html')
            if name.endswith('.html')
            else ('image', 'image/svg+xml')
            if name.endswith('.svg')
            else ('text', 'text/plain')
        )
    )
    file_id = 'fixture-report' if name in ('report.html', 'final.html') else f'fixture-{name}'
    return {
        'file_id': file_id,
        'path': name,
        'name': name,
        'url': f'{PREFIX}/files/{chat_id}/{name}',
        'type': kind,
        'mime': mime,
        'revision': revision,
        'size': 128,
        'mtime_ns': 1,
        'hash': 'fixture',
        'modified': False,
    }


def _state_of(chat_id: str) -> str:
    scenario = _scenario(chat_id)
    if scenario is not None:
        return 'stopped' if scenario == 'stopped' else 'running'
    with _LOCK:
        return _states.get(chat_id, 'never_created')


def _launch(chat_id: str) -> tuple[int, dict]:
    with _LOCK:
        if _states.get(chat_id, 'never_created') == 'never_created':
            return 409, {'reason': 'never_created'}
        _states[chat_id] = 'running'
    return 200, {'state': 'running'}


def _outputs(chat_id: str, query: dict | None = None) -> dict:
    scenario = _scenario(chat_id)
    if scenario is None:
        names = ('page.html', 'diagram.svg', 'data.xml', 'blob.bin')
        return {
            'revision': 1,
            'files': [
                {'path': name, 'url': f'{PREFIX}/files/{chat_id}/{name}', 'file_id': f'fixture-{name}', 'revision': 1}
                for name in names
            ],
        }
    revision = 2 if scenario in ('deleted_after', 'renamed', 'partial_after') else 1
    names = {
        'empty': [],
        'valid': ['page.html', 'valid.docx'],
        'corrupt': ['page.html', 'corrupt.docx'],
        'deleted': ['report.html', 'page.html'],
        'deleted_after': ['page.html'],
        'renamed': ['final.html', 'page.html'],
        'partial': ['report.html'] + [f'item-{index:03d}.txt' for index in range(100)],
        'partial_after': [f'item-{index:03d}.txt' for index in range(101)],
        'large': ['page.html'] + [f'item-{index:03d}.txt' for index in range(100)],
    }.get(scenario, ['page.html', 'diagram.svg', 'report.html'])
    offset = int((query or {}).get('cursor', ['0'])[0])
    if scenario == 'partial_after' and offset > 0:
        raise ValueError('fixture later page is inaccessible')
    window = names[offset : offset + 100]
    next_cursor = str(offset + 100) if offset + 100 < len(names) else None
    return {
        'chat_id': chat_id,
        'revision': revision,
        'files': [_fixture_file(chat_id, name, revision) for name in window],
        'total': len(names),
        'timestamp': 1,
        'next_cursor': next_cursor,
    }


def _file_headers(name: str, query: dict) -> dict[str, str]:
    extra: dict[str, str] = {
        'Content-Security-Policy': WEAK_CSP,
        'X-Content-Type-Options': 'other',
    }
    download = query.get('download') == ['1']
    if download:
        extra['Content-Disposition'] = f'attachment; filename="{name.rsplit("/", 1)[-1]}"'
        return extra
    extra['Content-Disposition'] = f'inline; filename="{name.rsplit("/", 1)[-1]}"'
    return extra


def _preview_html(chat_id: str) -> bytes:
    if ASSET_ROOT.is_dir() and FIXTURE_PATH:
        source = (ASSET_ROOT.parent / 'app.py').read_text(encoding='utf-8')
        definition = next(
            node
            for node in ast.parse(source).body
            if isinstance(node, ast.FunctionDef) and node.name == '_generate_preview_html'
        )
        namespace = {'OCU_PUBLIC_PREFIX': PREFIX, 'json': json}
        exec(
            compile(ast.Module(body=[definition], type_ignores=[]), str(ASSET_ROOT.parent / 'app.py'), 'exec'),
            namespace,
        )
        return namespace['_generate_preview_html'](
            chat_id, f'{PREFIX}/api/outputs/{chat_id}', f'{PREFIX}/files/{chat_id}'
        ).encode()
    return (
        '<!doctype html><html><head>'
        f'<script type="module" src="{PREFIX}/static/preview.js"></script>'
        '</head><body>'
        f'<div id="ocu-stub-preview" data-chat-id="{chat_id}"'
        f' data-api-url="{PREFIX}/api/outputs/{chat_id}"'
        f' data-files-base="{PREFIX}/files/{chat_id}"'
        f' data-describe-url="/api/v1/ocu/workspaces/{chat_id}"></div>'
        f'<script>fetch("{PREFIX}/terminal/{chat_id}/heartbeat")</script>'
        '</body></html>'
    ).encode()


def _observe(handler: BaseHTTPRequestHandler, extra: dict | None = None) -> None:
    if not RECORD_PATH:
        return
    global _SEQ
    auth = handler.headers.get('Authorization', '')
    expected = f'Bearer {EXPECTED_TOKEN}' if EXPECTED_TOKEN else ''
    entry = {
        'id': None,
        'method': handler.command,
        'target': handler.path,
        'identity': {
            'x-user-id': handler.headers.get('X-User-Id', ''),
            'x-user-email': handler.headers.get('X-User-Email', ''),
            'x-chat-id': handler.headers.get('X-Chat-Id', ''),
        },
        'token_ok': bool(expected) and auth == expected,
        'upgrade': handler.headers.get('Upgrade', ''),
    }
    if extra:
        entry.update(extra)
    with _LOCK:
        _SEQ += 1
        entry['id'] = _SEQ
        fd = os.open(RECORD_PATH, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, 'a', encoding='utf-8') as stream:
            stream.write(json.dumps(entry) + '\n')


class StubHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def _ws_without_upgrade(self, _match: re.Match[str], _query: dict) -> None:
        self._not_found()

    def log_message(self, fmt: str, *args) -> None:
        log.info('%s - %s', self.address_string(), fmt % args)

    def _internal(self) -> bool:
        return urlparse(self.path).path.startswith('/internal/')

    def _echo_headers(self) -> None:
        if not self._internal():
            return
        auth = self.headers.get('Authorization')
        if auth is not None:
            self.send_header('X-Echo-Authorization', auth)
        requested = self.headers.get('X-Requested-With')
        if requested is not None:
            self.send_header('X-Echo-X-Requested-With', requested)

    def _write(self, status: int, body: bytes, content_type: str, extra: dict[str, str] | None = None) -> None:
        self.close_connection = True
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        self._echo_headers()
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _json(self, status: int, payload: dict) -> None:
        self._write(status, json.dumps(payload).encode(), 'application/json; charset=utf-8')

    def _ok(self, match: re.Match[str], _query: dict) -> None:
        self._json(200, {'ok': True, 'chat': match.group(1)})

    def _not_found(self) -> None:
        self._write(404, b'not found', 'text/plain; charset=utf-8')

    def _describe(self, match: re.Match[str], _query: dict) -> None:
        if _scenario(match.group(1)) == 'unreachable':
            self.close_connection = True
            return
        state = _state_of(match.group(1))
        views = ['files', 'browser', 'terminal'] if state == 'running' else ['files']
        self._json(200, {'state': state, 'revision': 1, 'views': views})

    def _launch_route(self, match: re.Match[str], _query: dict) -> None:
        self._json(*_launch(match.group(1)))

    def _outputs_route(self, match: re.Match[str], query: dict) -> None:
        try:
            self._json(200, _outputs(match.group(1), query))
        except ValueError:
            self._json(503, {'reason': 'listing_incomplete'})

    def _archive(self, match: re.Match[str], _query: dict) -> None:
        self._json(200, {'chat': match.group(1), 'archive': True})

    def _uploads_list(self, match: re.Match[str], _query: dict) -> None:
        self._json(200, {'chat': match.group(1), 'kind': match.group(2), 'files': []})

    def _serve_file(self, match: re.Match[str], query: dict) -> None:
        name = unquote(match.group(2))
        if name == 'backend403':
            self._write(403, b'backend 403', 'text/plain; charset=utf-8')
            return
        if name == 'backend409':
            self._write(409, b'backend 409', 'text/plain; charset=utf-8')
            return
        if name == 'backend-html403.html':
            extra = {
                'Content-Security-Policy': WEAK_CSP,
                'X-Content-Type-Options': 'other',
            }
            self._write(403, b'upstream error', 'TEXT/HTML; charset=utf-8', extra)
            return
        fixture = FILES.get(name)
        scenario = _scenario(match.group(1))
        if scenario in ('deleted_after', 'partial_after') and name == 'report.html':
            self._not_found()
            return
        if scenario == 'corrupt' and name == 'corrupt.docx':
            self._write(
                200,
                b'not a ZIP document',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                _file_headers(name, query),
            )
            return
        if scenario == 'valid' and name == 'valid.docx':
            self._write(
                200,
                VALID_OFFICE.read_bytes(),
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                _file_headers(name, query),
            )
            return
        if scenario is not None and re.fullmatch(r'item-[0-9]{3}\.txt', name):
            self._write(200, name.encode(), 'text/plain; charset=utf-8', _file_headers(name, query))
            return
        if fixture is None:
            self._not_found()
            return
        content_type, body = fixture
        self._write(200, body, content_type, _file_headers(name, query))

    def _preview(self, match: re.Match[str], _query: dict) -> None:
        extra = {} if FIXTURE_PATH else {'Content-Security-Policy': WEAK_CSP}
        self._write(200, _preview_html(match.group(1)), 'text/html; charset=utf-8', extra)

    def _heartbeat(self, match: re.Match[str], _query: dict) -> None:
        self._write(200, b'', 'text/plain; charset=utf-8')

    def _upload_post(self, match: re.Match[str], _query: dict) -> None:
        self._json(200, {'stored': unquote(match.group(2)), 'chat': match.group(1)})

    def _serve_static(self, match: re.Match[str], _query: dict) -> None:
        if ASSET_ROOT.is_dir() and FIXTURE_PATH:
            target = ASSET_ROOT / unquote(match.group(1))
            if target.is_file() and target.resolve().is_relative_to(ASSET_ROOT.resolve()):
                mime = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
                self._write(200, target.read_bytes(), mime)
                return
        fixture = STATIC.get(unquote(match.group(1)))
        if fixture is None:
            self._not_found()
            return
        content_type, body = fixture
        self._write(200, body, content_type)

    def _websocket(self, _match: re.Match[str], _query: dict) -> None:
        key = self.headers.get('Sec-WebSocket-Key', '')
        digest = base64.b64encode(hashlib.sha1((key + WS_GUID).encode('ascii')).digest()).decode('ascii')
        self.send_response(101, 'Switching Protocols')
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', digest)
        self.end_headers()
        self.wfile.write(b'\x81\x02ok')
        self.wfile.flush()
        while True:
            header = self.rfile.read(2)
            if len(header) != 2:
                return
            opcode, size = header
            if not size & 0x80 or size & 0x7F > 125:
                return
            mask = self.rfile.read(4)
            payload = self.rfile.read(size & 0x7F)
            decoded = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
            if opcode & 0x0F == 9:
                self.wfile.write(bytes((0x8A, len(decoded))) + decoded)
                self.wfile.flush()
                continue
            self.wfile.write(bytes((0x81, len(decoded))) + decoded)
            self.wfile.flush()
            return

    def _read_body(self) -> bytes:
        length = int(self.headers.get('Content-Length', '0') or '0')
        return self.rfile.read(length) if length else b''

    def _serve_http(self, method: str) -> None:
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        for verb, regex, fn in _ROUTES:
            if verb != method:
                continue
            match = regex.match(parsed.path)
            if match:
                fn(self, match, query)
                return
        self._not_found()

    def _dispatch(self, method: str) -> None:
        extra: dict = {}
        if method == 'POST':
            payload = self._read_body()
            extra['body_sha256'] = hashlib.sha256(payload).hexdigest()
            extra['body_length'] = len(payload)
        _observe(self, extra or None)
        try:
            if self.headers.get('Upgrade', '').lower() == 'websocket':
                parsed = urlparse(self.path)
                for regex in (TERM_WS_RE, BROWSER_WS_RE):
                    match = regex.match(parsed.path)
                    if match:
                        self._websocket(match, {})
                        return
                self._not_found()
                return
            self._serve_http(method)
        except Exception:
            log.exception('stub handler failed for %s %s', method, self.path)
            if not self.wfile.closed:
                try:
                    self._write(500, b'stub error', 'text/plain; charset=utf-8')
                except Exception:
                    pass

    def do_GET(self) -> None:
        self._dispatch('GET')

    def do_HEAD(self) -> None:
        self._dispatch('HEAD')

    def do_POST(self) -> None:
        self._dispatch('POST')


_ROUTES = (
    ('GET', DESCRIBE_RE, StubHandler._describe),
    ('POST', LAUNCH_RE, StubHandler._launch_route),
    ('GET', OUTPUTS_RE, StubHandler._outputs_route),
    ('GET', ARCHIVE_RE, StubHandler._archive),
    ('GET', FILES_RE, StubHandler._serve_file),
    ('GET', PREVIEW_RE, StubHandler._preview),
    ('GET', UPLOAD_GET_RE, StubHandler._uploads_list),
    ('POST', UPLOAD_POST_RE, StubHandler._upload_post),
    ('GET', BROWSER_JSON_VERSION_RE, StubHandler._ok),
    ('GET', BROWSER_JSON_RE, StubHandler._ok),
    ('GET', BROWSER_STATUS_RE, StubHandler._ok),
    ('GET', TERM_STATUS_RE, StubHandler._ok),
    ('GET', HEARTBEAT_RE, StubHandler._heartbeat),
    ('GET', TERM_SESSIONS_RE, StubHandler._ok),
    ('GET', TERM_PROCESSES_RE, StubHandler._ok),
    ('POST', TERM_ACTION_RE, StubHandler._ok),
    ('POST', TERM_KILL_RE, StubHandler._ok),
    ('GET', TERM_WS_RE, StubHandler._ws_without_upgrade),
    ('GET', BROWSER_WS_RE, StubHandler._ws_without_upgrade),
    ('GET', STATIC_RE, StubHandler._serve_static),
    ('HEAD', STATIC_RE, StubHandler._serve_static),
)


class StubServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> int:
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    raw_port = os.environ.get('OCU_STUB_PORT', '8090')
    try:
        port = int(raw_port)
    except ValueError:
        log.error('OCU_STUB_PORT must be an integer, got %r', raw_port)
        return 2
    server = StubServer(('127.0.0.1', port), StubHandler)
    log.info('ocu-stub listening on http://127.0.0.1:%s', server.server_address[1])
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
