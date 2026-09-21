#!/usr/bin/env python3
"""Deterministic OCU HTTP stub for harness smoke. No Docker, no real OCU."""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

log = logging.getLogger('ocu-stub')

PREFIX = os.environ.get('OCU_PUBLIC_PREFIX', '').rstrip('/')
HTMLISH = frozenset(
    {
        'text/html',
        'image/svg+xml',
        'application/xml',
        'text/xml',
        'application/xhtml+xml',
    }
)
FILES = {
    'page.html': ('text/html; charset=utf-8', b'<!doctype html><html><body>ocu-stub page</body></html>'),
    'diagram.svg': ('image/svg+xml', b'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'),
    'data.xml': ('application/xml', b'<?xml version="1.0"?><root>ocu-stub</root>'),
    'blob.bin': ('application/octet-stream', b'\x00\x01\x02\x03'),
}
STATIC = {
    'preview.js': ('text/javascript; charset=utf-8', b'export const ocuStub = true;\n'),
}

_LOCK = threading.Lock()
_states: dict[str, str] = {
    'running': 'running',
    'stopped': 'stopped',
    'never_created': 'never_created',
}

DESCRIBE_RE = re.compile(r'^/internal/describe/([^/]+)$')
LAUNCH_RE = re.compile(r'^/internal/launch/([^/]+)$')
OUTPUTS_RE = re.compile(r'^/api/outputs/([^/]+)$')
FILES_RE = re.compile(r'^/files/([^/]+)/([^/]+)$')
PREVIEW_RE = re.compile(r'^/preview/([^/]+)$')
HEARTBEAT_RE = re.compile(r'^/terminal/([^/]+)/heartbeat$')
STATIC_RE = re.compile('^' + re.escape(PREFIX) + r'/static/([^/]+)$')


def _state_of(chat_id: str) -> str:
    with _LOCK:
        return _states.get(chat_id, 'never_created')


def _launch(chat_id: str) -> tuple[int, dict]:
    with _LOCK:
        if _states.get(chat_id, 'never_created') == 'never_created':
            return 409, {'reason': 'never_created'}
        _states[chat_id] = 'running'
    return 200, {'state': 'running'}


def _outputs(chat_id: str) -> dict:
    return {
        'revision': 1,
        'files': [
            {
                'path': name,
                'url': f'{PREFIX}/files/{chat_id}/{name}',
                'file_id': f'fixture-{name}',
                'revision': 1,
            }
            for name in FILES
        ],
    }


def _file_headers(name: str, content_type: str, query: dict) -> dict[str, str]:
    extra: dict[str, str] = {}
    if query.get('download') == ['1']:
        extra['Content-Disposition'] = f'attachment; filename="{name}"'
        return extra
    if content_type.split(';', 1)[0].strip() in HTMLISH:
        extra['Content-Security-Policy'] = 'sandbox allow-scripts allow-forms'
        extra['X-Content-Type-Options'] = 'nosniff'
    return extra


def _preview_html(chat_id: str) -> bytes:
    return (
        '<!doctype html><html><head>'
        f'<script type="module" src="{PREFIX}/static/preview.js"></script>'
        '</head><body>'
        f'<div id="ocu-stub-preview" data-chat-id="{chat_id}"'
        f' data-api-url="{PREFIX}/api/outputs/{chat_id}"'
        f' data-files-base="{PREFIX}/files/{chat_id}"></div>'
        f'<script>fetch("{PREFIX}/terminal/{chat_id}/heartbeat")</script>'
        '</body></html>'
    ).encode()


class StubHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        log.info('%s - %s', self.address_string(), fmt % args)

    def _echo_headers(self) -> None:
        auth = self.headers.get('Authorization')
        if auth is not None:
            self.send_header('X-Echo-Authorization', auth)
        requested = self.headers.get('X-Requested-With')
        if requested is not None:
            self.send_header('X-Echo-X-Requested-With', requested)

    def _write(self, status: int, body: bytes, content_type: str, extra: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self._echo_headers()
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, payload: dict) -> None:
        self._write(status, json.dumps(payload).encode(), 'application/json; charset=utf-8')

    def _not_found(self) -> None:
        self._write(404, b'not found', 'text/plain; charset=utf-8')

    def _describe(self, match: re.Match[str], _query: dict) -> None:
        self._json(
            200,
            {'state': _state_of(match.group(1)), 'revision': 1, 'views': ['files', 'browser', 'terminal']},
        )

    def _launch_route(self, match: re.Match[str], _query: dict) -> None:
        self._json(*_launch(match.group(1)))

    def _outputs_route(self, match: re.Match[str], _query: dict) -> None:
        self._json(200, _outputs(match.group(1)))

    def _serve_file(self, match: re.Match[str], query: dict) -> None:
        name = unquote(match.group(2))
        fixture = FILES.get(name)
        if fixture is None:
            self._not_found()
            return
        content_type, body = fixture
        self._write(200, body, content_type, _file_headers(name, content_type, query))

    def _preview(self, match: re.Match[str], _query: dict) -> None:
        self._write(200, _preview_html(match.group(1)), 'text/html; charset=utf-8')

    def _heartbeat(self, _match: re.Match[str], _query: dict) -> None:
        self._write(200, b'', 'text/plain; charset=utf-8')

    def _serve_static(self, match: re.Match[str], _query: dict) -> None:
        fixture = STATIC.get(unquote(match.group(1)))
        if fixture is None:
            self._not_found()
            return
        content_type, body = fixture
        self._write(200, body, content_type)

    def _dispatch(self, method: str) -> None:
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

    def do_GET(self) -> None:
        self._dispatch('GET')

    def do_POST(self) -> None:
        self._dispatch('POST')


_ROUTES = (
    ('GET', DESCRIBE_RE, StubHandler._describe),
    ('POST', LAUNCH_RE, StubHandler._launch_route),
    ('GET', OUTPUTS_RE, StubHandler._outputs_route),
    ('GET', FILES_RE, StubHandler._serve_file),
    ('GET', PREVIEW_RE, StubHandler._preview),
    ('GET', HEARTBEAT_RE, StubHandler._heartbeat),
    ('GET', STATIC_RE, StubHandler._serve_static),
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
