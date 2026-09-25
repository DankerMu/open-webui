#!/usr/bin/env python3
"""Finite make smoke-proxy lifecycle: exact OCU pin, isolated render, Hurl matrix."""

from __future__ import annotations

import hashlib
import http.client
import json
import logging
import os
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path
from urllib.parse import quote

from smoke_proxy_support import (
    Fail,
    fail,
    free_port,
    http_json,
    http_raw,
    kill_tree,
    observations,
    redact,
    run,
    wait_http,
)

PINNED_FILES = (
    'deploy/proxy/.gitignore',
    'deploy/proxy/README.md',
    'deploy/proxy/nginx.conf.in',
    'deploy/proxy/render.py',
    'deploy/proxy/routes.json',
    'deploy/proxy/tests/fixture.py',
    'deploy/proxy/tests/test_native.py',
    'deploy/proxy/tests/test_render.py',
)
SHA_RE = re.compile(r'^[0-9a-f]{40}$')
TOKEN_RE = re.compile(r'^[!-~]+$')
NGINX_AUTH = '--with-http_auth_request_module'
HURL_GLOBS = (
    'smoke/proxy/auth.hurl',
    'smoke/proxy/deny.hurl',
    'smoke/proxy/files.hurl',
    'smoke/proxy/routes.hurl',
    'smoke/proxy/mutate.hurl',
)
log = logging.getLogger('smoke-proxy')
SENTINEL_EMAIL = 'proxy-owner-preexisting-sentinel@harness.local'


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def python_bin() -> str:
    pinned = Path.home() / '.local/share/uv/python/cpython-3.12.12-macos-aarch64-none/bin/python3.12'
    if pinned.is_file():
        return str(pinned)
    found = shutil.which('python3.12')
    if found:
        return found
    return sys.executable


def yaml_sha(path: Path) -> str:
    text = path.read_text(encoding='utf-8')
    match = re.search(r'(?m)^ocu_checkout:\n(?:  .*\n)*?  sha:\s*"([0-9a-f]{40})"', text)
    if match:
        return match.group(1)
    match = re.search(r'(?m)^  sha:\s*"([0-9a-f]{40})"', text)
    if not match:
        fail('constraints.yaml missing ocu_checkout.sha full SHA')
    return match.group(1)


def require_tools() -> str:
    nginx = shutil.which('nginx')
    if not nginx:
        fail('missing prerequisite: nginx')
    version = run([nginx, '-V'], check=False)
    probe = (version.stderr or '') + (version.stdout or '')
    if NGINX_AUTH not in probe:
        fail('missing prerequisite: nginx auth_request module')
    if not shutil.which('hurl'):
        fail('missing prerequisite: hurl')
    if not shutil.which('git'):
        fail('missing prerequisite: git')
    if not shutil.which('curl'):
        fail('missing prerequisite: curl')
    return nginx


class Smoke:
    def __init__(self) -> None:
        self.root = repo_root()
        self.python = python_bin()
        self.owned: list[int] = []
        self.scratch: Path | None = None
        self.created: dict[str, str] = {}
        self.webui = 'http://127.0.0.1:8080'
        self.origin = 'http://127.0.0.1:8080'
        self.token = ''
        self.admin_cookie = ''
        self.owner_cookie = ''
        self.foreign_cookie = ''
        self.owner_jwt = ''
        self.owner_id = ''
        self.owner_email = ''
        self.chat_id = ''
        self.owner_email_raw = ''
        self.foreign_email_raw = ''
        self.sentinel_id = ''
        self.foreign_chat = ''
        self.record = Path()
        self.hurl_vars = Path()
        self.secrets: list[str] = []
        self.checkout = Path()
        self.stage = Path()
        self.stub_port = 0
        self.proxy_port = 0

    def status(self) -> None:
        try:
            urllib.request.urlopen(f'{self.webui}/health', timeout=2)
        except OSError:
            fail('WebUI harness is not healthy; run make dev-bg first')

    def pin(self) -> str:
        sha = yaml_sha(self.root / 'constraints.yaml')
        if not SHA_RE.fullmatch(sha):
            fail(f'constraints.yaml ocu_checkout.sha is not a full SHA: {sha}')
        return sha

    def verify_checkout(self, checkout: Path, sha: str) -> None:
        if not checkout.is_dir():
            fail(f'missing prerequisite: OCU checkout {checkout}')
        git_dir = checkout / '.git'
        if git_dir.exists():
            head = run(['git', '-C', str(checkout), 'rev-parse', 'HEAD']).stdout.strip()
            if head != sha:
                fail(f'OCU checkout HEAD {head} does not match pinned {sha}')
            dirty = run(['git', '-C', str(checkout), 'status', '--porcelain', '--untracked-files=no']).stdout
            tracked_dirty = [line for line in dirty.splitlines() if line and line[:2] not in {'??'}]
            if tracked_dirty:
                fail('OCU tracked source is modified; refusing to mutate checkout')
        else:
            recorded = checkout / 'OCU_SHA'
            if not recorded.is_file() or recorded.read_text().strip() != sha:
                fail('OCU checkout has no git HEAD and no matching OCU_SHA pin record')
        for rel in PINNED_FILES:
            if not (checkout / rel).is_file():
                fail(f'missing prerequisite: {rel}')
        renderer = checkout / 'deploy/proxy/render.py'
        table = checkout / 'deploy/proxy/routes.json'
        if not renderer.is_file() or not table.is_file():
            fail('missing prerequisite: renderer/table')

    def stage_copy(self, checkout: Path) -> Path:
        assert self.scratch is not None
        dest = self.scratch / 'ocu'
        dest.mkdir(mode=0o700)
        (dest / 'deploy/proxy/tests').mkdir(parents=True, mode=0o700)
        for rel in PINNED_FILES:
            src = checkout / rel
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, target)
            if src.read_bytes() != target.read_bytes():
                fail(f'staged {rel} is not byte-identical')
        os.chmod(dest / 'deploy/proxy', 0o700)
        return dest

    def render(self, nginx: str) -> None:
        env = {
            'PATH': os.environ.get('PATH', ''),
            'HOME': os.environ.get('HOME', ''),
            'OCU_INTERNAL_TOKEN': self.token,
            'OCU_WEBUI_ORIGIN': self.origin,
            'OCU_WEBUI_UPSTREAM': self.webui,
            'OCU_PROXY_UPSTREAM': f'http://127.0.0.1:{self.stub_port}',
            'OCU_PROXY_LISTEN': f'127.0.0.1:{self.proxy_port}',
        }
        run([self.python, str(self.stage / 'deploy/proxy/render.py')], cwd=self.stage, env=env, secret=True)
        conf = self.stage / 'deploy/proxy/nginx.conf'
        if not conf.is_file():
            fail('renderer did not produce nginx.conf')

    def start_owned(self, argv: list[str], env: dict[str, str], ready: str | None,
                    log_path: Path | None = None) -> int:
        sink = open(log_path, 'w', encoding='utf-8') if log_path else subprocess.DEVNULL
        proc = subprocess.Popen(
            argv,
            cwd=self.root,
            env=env,
            stdout=sink,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        self.owned.append(proc.pid)
        if ready:
            wait_http(ready, proc.pid)
        return proc.pid

    def provision(self) -> None:
        stamp = secrets.token_hex(4)
        owner_email = f'proxy-owner-{stamp}@harness.local'
        foreign_email = f'proxy-foreign-{stamp}@harness.local'
        self.owner_email_raw = owner_email
        self.foreign_email_raw = foreign_email
        password = f'Proxy-{secrets.token_hex(8)}!'
        admin_email = os.environ.get('SEED_EMAIL', 'admin@harness.local')
        admin_password = os.environ.get('SEED_PASSWORD', 'harness-admin-pw')
        status, admin, _, _ = http_json(
            'POST',
            f'{self.webui}/api/v1/auths/signin',
            headers={'Content-Type': 'application/json'},
            body=json.dumps({'email': admin_email, 'password': admin_password}).encode(),
        )
        if status != 200 or 'token' not in admin:
            fail('seed admin signin failed')
        self.admin_cookie = f'token={admin["token"]}'
        admin_auth = {'Authorization': f'Bearer {admin["token"]}', 'Content-Type': 'application/json'}
        self.ensure_sentinel(admin_auth)
        status, owner, _, _ = http_json(
            'POST',
            f'{self.webui}/api/v1/auths/add',
            headers=admin_auth,
            body=json.dumps({
                'name': 'Proxy Owner',
                'email': owner_email,
                'password': password,
                'role': 'user',
            }).encode(),
        )
        if status != 200 or 'id' not in owner:
            fail('owner provision failed')
        self.created['owner'] = owner['id']
        status, foreign, _, _ = http_json(
            'POST',
            f'{self.webui}/api/v1/auths/add',
            headers=admin_auth,
            body=json.dumps({
                'name': 'Proxy Foreign',
                'email': foreign_email,
                'password': password,
                'role': 'user',
            }).encode(),
        )
        if status != 200 or 'id' not in foreign:
            fail('non-owner provision failed')
        self.created['foreign'] = foreign['id']
        status, owner_session, _, _ = http_json(
            'POST',
            f'{self.webui}/api/v1/auths/signin',
            headers={'Content-Type': 'application/json'},
            body=json.dumps({'email': owner_email, 'password': password}).encode(),
        )
        if status != 200:
            fail('owner signin failed')
        self.owner_jwt = owner_session['token']
        self.owner_cookie = f'token={owner_session["token"]}'
        self.owner_id = owner_session['id']
        self.owner_email = quote(owner_session['email'], safe='@.')
        status, foreign_session, _, _ = http_json(
            'POST',
            f'{self.webui}/api/v1/auths/signin',
            headers={'Content-Type': 'application/json'},
            body=json.dumps({'email': foreign_email, 'password': password}).encode(),
        )
        if status != 200:
            fail('non-owner signin failed')
        self.foreign_cookie = f'token={foreign_session["token"]}'
        status, chat, _, _ = http_json(
            'POST',
            f'{self.webui}/api/v1/chats/new',
            headers={'Authorization': f'Bearer {self.owner_jwt}', 'Content-Type': 'application/json'},
            body=json.dumps({'chat': {'title': f'proxy-owner-{stamp}'}}).encode(),
        )
        if status != 200 or 'id' not in chat:
            fail('owner chat create failed')
        self.chat_id = chat['id']
        self.created['chat'] = chat['id']
        status, other, _, _ = http_json(
            'POST',
            f'{self.webui}/api/v1/chats/new',
            headers={'Authorization': f'Bearer {foreign_session["token"]}', 'Content-Type': 'application/json'},
            body=json.dumps({'chat': {'title': f'proxy-foreign-{stamp}'}}).encode(),
        )
        if status != 200 or 'id' not in other:
            fail('foreign chat create failed')
        self.foreign_chat = other['id']
        self.created['foreign_chat'] = other['id']
        self.secrets = [self.token, self.owner_jwt, owner_session.get('token', ''),
                        foreign_session.get('token', ''), admin.get('token', ''), password]

    def write_hurl_vars(self) -> None:
        assert self.scratch is not None
        self.hurl_vars = self.scratch / 'hurl.env'
        lines = [
            f'proxy_url=http://127.0.0.1:{self.proxy_port}',
            f'webui_url={self.webui}',
            f'origin={self.origin}',
            f'chat_id={self.chat_id}',
            f'foreign_chat={self.foreign_chat}',
            f'owner_id={self.owner_id}',
            f'owner_email={self.owner_email}',
            f'owner_cookie={self.owner_cookie}',
            f'foreign_cookie={self.foreign_cookie}',
            f'owner_jwt={self.owner_jwt}',
        ]
        fd = os.open(self.hurl_vars, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write('\n'.join(lines) + '\n')

    def alternate_header_control(self) -> None:
        before = len(observations(self.record))
        status, _, headers, _ = http_json(
            'GET',
            f'{self.webui}/api/v1/ocu/auth',
            headers={'x-api-key': self.owner_jwt, 'X-Chat-Id': self.chat_id},
        )
        if status != 200 or headers.get('x-user-id') != self.owner_id:
            fail('inactive-header prerequisite: direct WebUI x-api-key owner auth did not return 200 identity')
        proxy = f'http://127.0.0.1:{self.proxy_port}'
        for path in (f'/ocu/api/outputs/{self.chat_id}', '/ocu/static/preview.js'):
            status, _, _, _ = http_json('GET', proxy + path, headers={'x-api-key': self.owner_jwt})
            if status != 401:
                fail(f'x-api-key-only proxy {path} expected 401, got {status}')
        if observations(self.record)[before:]:
            fail('x-api-key-only proxy requests contacted OCU')

    def hurl(self) -> None:
        assert self.scratch is not None
        report = self.scratch / 'hurl-report'
        report.mkdir(mode=0o700)
        files = [str(self.root / rel) for rel in HURL_GLOBS]
        result = subprocess.run(
            ['hurl', '--test', '--variables-file', str(self.hurl_vars),
             '--report-json', str(report), *files],
            cwd=self.root,
            text=True,
            capture_output=True,
            env={'PATH': os.environ.get('PATH', ''), 'HOME': os.environ.get('HOME', ''), 'TERM': 'dumb'},
        )
        if result.returncode:
            log.error('%s', redact(result.stdout + result.stderr, self.secrets))
            stub_log = self.scratch / 'stub.log'
            if stub_log.is_file():
                log.error('%s', redact(stub_log.read_text(encoding='utf-8')[-4000:], self.secrets))
            fail('hurl matrix failed')
        self.scan_report(report)


    def scan_report(self, report: Path) -> None:
        for path in report.rglob('*'):
            if path.is_file() and self.token.encode() in path.read_bytes():
                fail('synthetic internal token appeared in an exercised response')


    def assert_private(self) -> None:
        rows = observations(self.record)
        if not rows:
            fail('stub recorded no arrivals')
        token_hits = [row for row in rows if row.get('token_ok')]
        if not token_hits:
            fail('no allowed request received the internal token')
        self._assert_arrivals(rows, token_hits)
        self.containment_probe()

    def _assert_arrivals(self, rows: list[dict], token_hits: list[dict]) -> None:
        uploads = [row for row in rows if row.get('method') == 'POST' and '/api/uploads/' in row.get('target', '')]
        if not uploads:
            fail('no upload arrival recorded')
        if not any('space%20hash%23plus%2Bpercent%25.html' in row.get('target', '') for row in rows):
            fail('encoded nested file was not observed upstream')
        if not any(row.get('target', '').startswith('/ocu/static/deep/preview.js') for row in rows):
            fail('nested static prefix was not preserved upstream')
        forbidden = (
            '/ocu/health', '/ocu/docs', '/ocu/mcp', '/internal/launch/',
            '/ocu/api/runtime/cli', '/_ocu_chat_auth',
        )
        joined = '\n'.join(row.get('target', '') for row in rows)
        for needle in forbidden:
            if needle in joined:
                fail('unlisted path contacted OCU')
        self._assert_identities(token_hits)

    def _assert_identities(self, token_hits: list[dict]) -> None:
        for row in token_hits:
            ident = row.get('identity') or {}
            target = row.get('target', '')
            if target.startswith('/ocu/static/') or target.startswith('/static/'):
                if ident.get('x-user-id') or ident.get('x-chat-id'):
                    fail('static arrival carried chat identity')
                continue
            if ident.get('x-user-id') and ident.get('x-user-id') != self.owner_id:
                fail('owner request forwarded forged identity')
            if ident.get('x-chat-id') and ident.get('x-chat-id') != self.chat_id:
                fail('arrival used unexpected chat identity')



    def extra_matrix(self) -> None:
        self._encoded_file()
        mutation = {
            'Cookie': self.owner_cookie,
            'Origin': self.origin,
            'X-Requested-With': 'ocu-workspace',
            'Content-Type': 'application/octet-stream',
        }
        json_headers = {
            'Cookie': self.owner_cookie,
            'Origin': self.origin,
            'X-Requested-With': 'ocu-workspace',
            'Content-Type': 'application/json',
        }
        payload = b'proxy-upload-bytes'
        chains = (
            (f'/ocu/api/uploads/{self.chat_id}/manifest', mutation, payload,
             f'/ocu/api/uploads/{self.chat_id}/manifest', {'Cookie': self.owner_cookie}),
            (f'/ocu/api/uploads/{self.chat_id}/list', mutation, payload,
             f'/ocu/api/uploads/{self.chat_id}/list', {'Cookie': self.owner_cookie}),
            (f'/ocu/api/uploads/{self.chat_id}/owner.bin', mutation, payload,
             f'/ocu/preview/{self.chat_id}', {'Cookie': self.owner_cookie}),
            (f'/ocu/terminal/{self.chat_id}/start-ttyd', json_headers, b'{"ok":true}',
             f'/ocu/terminal/{self.chat_id}/status', {'Cookie': self.owner_cookie}),
            (f'/ocu/terminal/{self.chat_id}/stop-ttyd', json_headers, b'{}',
             f'/ocu/terminal/{self.chat_id}/heartbeat',
             {'Cookie': self.owner_cookie, 'Origin': self.origin, 'X-Requested-With': 'ocu-workspace'}),
        )
        for path, headers, body, follow, follow_headers in chains:
            self._post_then_get(path, headers, body, follow, follow_headers)
        self._denied_uploads(mutation, payload)

    def _encoded_file(self) -> None:
        encoded = f'/ocu/files/{self.chat_id}/sub/space%20hash%23plus%2Bpercent%25.html?revision=7'
        before = len(observations(self.record))
        status, headers, raw = http_raw(
            '127.0.0.1', self.proxy_port, 'GET', encoded,
            headers={'Cookie': self.owner_cookie},
        )
        if status != 200:
            fail(f'encoded nested file expected 200, got {status}')
        if [v for n, v in headers if n.lower() == 'content-security-policy'] != ['sandbox allow-scripts allow-forms']:
            fail('encoded nested file missing forced CSP')
        if b'encoded' not in raw:
            fail('encoded nested file body mismatch')
        if not any('space%20hash%23plus%2Bpercent%25.html' in row.get('target', '')
                   for row in observations(self.record)[before:]):
            fail('encoded nested file was not observed upstream')

    def _post_then_get(self, path: str, headers: dict[str, str], body: bytes,
                       follow: str, follow_headers: dict[str, str]) -> None:
        before = len(observations(self.record))
        status, resp_headers, raw = http_raw(
            '127.0.0.1', self.proxy_port, 'POST', path, headers=headers, body=body,
        )
        if status != 200:
            fail(f'POST {path} expected 200, got {status}')
        if self.token.encode() in raw or any(self.token in f'{n}:{v}' for n, v in resp_headers):
            fail(f'{path} leaked internal token')
        if '/uploads/' in path:
            seen = observations(self.record)[before:]
            if not any(row.get('body_sha256') == hashlib.sha256(body).hexdigest() for row in seen):
                fail(f'{path} upload digest mismatch')
        status, follow_headers_out, follow_raw = http_raw(
            '127.0.0.1', self.proxy_port, 'GET', follow, headers=follow_headers,
        )
        if status != 200:
            fail(f'POST {path} then GET {follow} expected 200, got {status}')
        if self.token.encode() in follow_raw or any(self.token in f'{n}:{v}' for n, v in follow_headers_out):
            fail(f'follow-up {follow} leaked internal token')

    def _denied_uploads(self, mutation: dict[str, str], payload: bytes) -> None:
        before = len(observations(self.record))
        status, _, _ = http_raw(
            '127.0.0.1', self.proxy_port, 'POST',
            f'/ocu/api/uploads/{self.chat_id}/manifest',
            headers={**mutation, 'Origin': 'null'}, body=payload,
        )
        if status != 403:
            fail(f'opaque-origin upload expected 403, got {status}')
        if observations(self.record)[before:]:
            fail('opaque-origin upload contacted OCU')
        before = len(observations(self.record))
        status, _, _ = http_raw(
            '127.0.0.1', self.proxy_port, 'POST',
            f'/ocu/api/uploads/{self.chat_id}/owner.bin',
            headers={'Cookie': self.foreign_cookie, 'Origin': self.origin,
                     'X-Requested-With': 'ocu-workspace',
                     'Content-Type': 'application/octet-stream'},
            body=payload,
        )
        if status != 404:
            fail(f'foreign upload expected 404, got {status}')
        if observations(self.record)[before:]:
            fail('foreign upload contacted OCU')









    def containment_probe(self) -> None:
        proxy = f'http://127.0.0.1:{self.proxy_port}'
        cookie = self.owner_cookie
        paths = (
            f'/ocu/api/outputs/{self.chat_id}',
            f'/ocu/files/{self.chat_id}/page.html',
            f'/ocu/files/{self.chat_id}/diagram.svg',
            f'/ocu/files/{self.chat_id}/blob.bin',
            f'/ocu/files/{self.chat_id}/page.html?download=1',
            f'/ocu/preview/{self.chat_id}',
            '/ocu/static/preview.js',
            '/ocu/health',
        )
        for path in paths:
            status, _payload, headers, raw = http_json('GET', proxy + path, cookie=cookie)
            blob = raw + '\n'.join(f'{k}:{v}' for k, v in headers.items()).encode()
            if self.token.encode() in blob:
                fail(f'response containment failed on {path} status {status}')
            if b'x-echo-authorization' in blob.lower():
                fail(f'public echo header reached browser on {path}')



    def websocket(self) -> None:
        import base64

        def handshake(cookie: str, path: str) -> tuple[int, bytes, list[tuple[str, str]]]:
            key = base64.b64encode(b'websocket-test-key').decode()
            conn = http.client.HTTPConnection('127.0.0.1', self.proxy_port, timeout=8)
            conn.request('GET', path, headers={
                'Cookie': cookie,
                'Connection': 'Upgrade',
                'Upgrade': 'websocket',
                'Origin': self.origin,
                'Sec-WebSocket-Key': key,
                'Sec-WebSocket-Version': '13',
            })
            response = conn.getresponse()
            body = response.read(16)
            headers = response.getheaders()
            conn.close()
            return response.status, body, headers

        for path, upstream in (
            (f'/ocu/terminal/{self.chat_id}/ws', f'/terminal/{self.chat_id}/ws'),
            (f'/ocu/browser/{self.chat_id}/devtools/page/PAGE-1',
             f'/browser/{self.chat_id}/devtools/page/PAGE-1'),
        ):
            before = len(observations(self.record))
            status, body, headers = handshake(self.owner_cookie, path)
            if status != 101:
                fail(f'owner WS {path} expected 101, got {status}')
            if self.token.encode() in body or any(self.token in f'{n}:{v}' for n, v in headers):
                fail(f'WS {path} leaked internal token')
            seen = [row for row in observations(self.record)[before:] if row.get('target') == upstream]
            if len(seen) != 1 or not seen[0].get('token_ok'):
                fail(f'WS {path} missing attributed token receipt')
            before = len(observations(self.record))
            status, _, _ = handshake(self.foreign_cookie, path)
            if status != 404:
                fail(f'foreign WS {path} expected 404, got {status}')
            if observations(self.record)[before:]:
                fail(f'foreign WS {path} contacted OCU')



    def ensure_sentinel(self, admin_auth: dict[str, str]) -> None:
        status, payload, _, _ = http_json(
            'GET',
            f'{self.webui}/api/v1/users/?query={quote(SENTINEL_EMAIL)}',
            headers=admin_auth,
        )
        users = payload.get('users', []) if isinstance(payload, dict) else []
        for user in users:
            if user.get('email') == SENTINEL_EMAIL and user.get('id'):
                self.sentinel_id = user['id']
                return
        status, created, _, _ = http_json(
            'POST',
            f'{self.webui}/api/v1/auths/add',
            headers=admin_auth,
            body=json.dumps({
                'name': 'Proxy Owner Sentinel',
                'email': SENTINEL_EMAIL,
                'password': f'Proxy-sentinel-{secrets.token_hex(8)}!',
                'role': 'user',
            }).encode(),
        )
        if status != 200 or 'id' not in created:
            fail('preexisting sentinel provision failed')
        self.sentinel_id = created['id']

    def _owned_user_ids(self) -> set[str]:
        return {uid for uid in (self.created.get('owner'), self.created.get('foreign')) if uid}

    def _owned_user_emails(self) -> set[str]:
        return {email for email in (self.owner_email_raw, self.foreign_email_raw) if email}

    def _delete_exact_email(self, email: str, auth: dict[str, str], skip: set[str]) -> None:
        status, payload, _, _ = http_json(
            'GET',
            f'{self.webui}/api/v1/users/?query={quote(email)}',
            headers=auth,
        )
        users = payload.get('users', []) if isinstance(payload, dict) else []
        for user in users:
            uid = user.get('id')
            if uid and uid not in skip and user.get('email') == email:
                http_json('DELETE', f'{self.webui}/api/v1/users/{uid}', headers=auth)

    def cleanup_data(self) -> None:
        if not self.admin_cookie:
            return
        admin_token = self.admin_cookie.split('=', 1)[-1]
        auth = {'Authorization': f'Bearer {admin_token}'}
        for key in ('chat', 'foreign_chat'):
            if key in self.created:
                http_json('DELETE', f'{self.webui}/api/v1/chats/{self.created[key]}', headers=auth)
        owned_ids = self._owned_user_ids()
        for uid in owned_ids:
            http_json('DELETE', f'{self.webui}/api/v1/users/{uid}', headers=auth)
        for email in self._owned_user_emails():
            self._delete_exact_email(email, auth, owned_ids)

    def assert_sentinel(self) -> None:
        if not self.admin_cookie or not self.sentinel_id:
            return
        admin_token = self.admin_cookie.split('=', 1)[-1]
        auth = {'Authorization': f'Bearer {admin_token}'}
        status, payload, _, _ = http_json(
            'GET', f'{self.webui}/api/v1/users/{self.sentinel_id}', headers=auth,
        )
        if status != 200 or payload.get('email') != SENTINEL_EMAIL:
            fail('preexisting similarly prefixed sentinel user was deleted')



    def cleanup_procs(self) -> None:
        for pid in reversed(self.owned):
            kill_tree(pid)
        self.owned.clear()

    def run(self) -> int:
        nginx = require_tools()
        self.status()
        sha = self.pin()
        checkout = Path(os.environ.get('OCU_CHECKOUT', str(self.root.parent / 'open-computer-use'))).resolve()
        self.checkout = checkout
        self.verify_checkout(checkout, sha)
        if not (self.root / 'scripts/proxy-dev.sh').is_file():
            fail('missing prerequisite: scripts/proxy-dev.sh')
        (self.root / '.run').mkdir(mode=0o700, exist_ok=True)
        self.scratch = Path(tempfile.mkdtemp(prefix='smoke-proxy-', dir=str(self.root / '.run')))
        os.chmod(self.scratch, 0o700)
        self.record = self.scratch / 'stub.jsonl'
        self.token = 'Tok!' + secrets.token_hex(12) + '#$%'
        if not TOKEN_RE.fullmatch(self.token):
            fail('generated token outside visible ASCII')
        self.stub_port = free_port()
        self.proxy_port = free_port()
        self.origin = f'http://127.0.0.1:{self.proxy_port}'
        self.stage = self.stage_copy(checkout)
        self.render(nginx)
        stub_env = {
            'PATH': os.environ.get('PATH', ''),
            'HOME': os.environ.get('HOME', ''),
            'OCU_STUB_PORT': str(self.stub_port),
            'OCU_PUBLIC_PREFIX': '/ocu',
            'OCU_INTERNAL_TOKEN': self.token,
            'OCU_STUB_RECORD': str(self.record),
        }
        stub_log = self.scratch / 'stub.log'
        self.start_owned([self.python, str(self.root / 'scripts/ocu-stub.py')], stub_env,
                         f'http://127.0.0.1:{self.stub_port}/internal/describe/running', stub_log)
        launcher_env = {
            'PATH': os.environ.get('PATH', ''),
            'HOME': os.environ.get('HOME', ''),
            'OCU_CHECKOUT': str(self.stage),
        }
        self.start_owned(['bash', str(self.root / 'scripts/proxy-dev.sh')], launcher_env, None)
        wait_http(f'http://127.0.0.1:{self.proxy_port}/health', self.owned[-1], timeout=8.0)
        self.provision()
        self.write_hurl_vars()
        self.alternate_header_control()
        self.extra_matrix()
        self.hurl()
        self.websocket()
        self.assert_private()
        log.info('smoke-proxy: ok')
        return 0



def main() -> int:
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    smoke = Smoke()

    def handle(_signum, _frame) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, handle)
    signal.signal(signal.SIGTERM, handle)
    code = 1
    try:
        code = smoke.run()
    except Fail as exc:
        log.error('smoke-proxy: %s', exc)
        code = 1
    except KeyboardInterrupt:
        log.error('smoke-proxy: interrupted')
        code = 130
    finally:
        smoke.cleanup_procs()
        try:
            smoke.cleanup_data()
        except Exception:
            log.exception('owned data cleanup failed')
        try:
            smoke.assert_sentinel()
        except Fail as exc:
            log.error('smoke-proxy: %s', exc)
            if code == 0:
                code = 1
        if smoke.scratch and smoke.scratch.exists():
            shutil.rmtree(smoke.scratch, ignore_errors=True)
    return code



if __name__ == '__main__':
    raise SystemExit(main())
