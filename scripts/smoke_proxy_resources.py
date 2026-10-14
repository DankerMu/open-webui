"""Real-session resource grant admission, arrival attribution, and raw HEAD proof."""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import signal
import socket
import subprocess
import tempfile
import time

from smoke_proxy_support import (
    fail,
    http_raw,
    kill_tree,
    observations,
    private_hurl_variables,
    register_capabilities,
    run_hurl_files,
)

SANDBOX = 'sandbox allow-scripts allow-forms'


def values(headers, name):
    return [value for key, value in headers if key.lower() == name.lower()]


def assert_no_arrival(rows):
    if rows:
        fail('denied resource request contacted OCU')


def assert_arrival(smoke, rows, method, target, *, grant):
    identity = {'x-user-id': smoke.owner_id, 'x-user-email': smoke.owner_email, 'x-chat-id': smoke.chat_id}
    if len(rows) != 1 or (
        rows[0].get('method') != method
        or rows[0].get('target') != target
        or rows[0].get('identity') != identity
        or rows[0].get('token_ok') is not True
    ):
        fail('resource expected one correctly attributed ordinary-file arrival')
    if grant and rows[0].get('credential_headers') != []:
        fail('grant arrival carried browser or resource credentials')


def assert_contained(smoke, headers, raw, *, issuer=False):
    for name, value in headers:
        if issuer and name.lower() == 'location':
            tail = '/' + value.split('/', 4)[4]
            if any(secret in tail for secret in smoke.secrets if secret):
                fail('credential appeared outside the issued grant in resource Location')
            continue
        if any(secret in value for secret in smoke.secrets if secret):
            fail('credential appeared in resource response header')
        if name.lower() == 'x-echo-authorization':
            fail('public credential echo reached browser')
    if any(secret.encode() in raw for secret in smoke.secrets if secret):
        fail('credential appeared in resource response body')


def assert_redirect(smoke, status, headers, raw, chat, resource):
    for location in values(headers, 'location'):
        register_capabilities(location, smoke.secrets)
    if status != 302:
        fail(f'canonical resource issuer expected 302, got {status}')
    locations = values(headers, 'location')
    if len(locations) != 1:
        fail('canonical resource issuer requires one redirect target')
    location = locations[0]
    pattern = r'/ocu/f/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/' + re.escape(chat + '/' + resource)
    if not re.fullmatch(pattern, location):
        fail('canonical resource redirect target changed chat, path or raw query')
    if raw:
        fail('canonical resource redirect body must be empty')
    if values(headers, 'cache-control') != ['no-store'] or values(headers, 'referrer-policy') != ['no-referrer']:
        fail('canonical resource redirect lost exact no-store/no-referrer policy')
    assert_contained(smoke, headers, raw, issuer=True)
    for name in ('set-cookie', 'access-control-allow-origin', 'access-control-allow-credentials'):
        if values(headers, name):
            fail('canonical resource redirect set cookies or CORS authority')
    return location


def assert_response(smoke, status, headers, raw, *, origin=None, authorized=False):
    assert_contained(smoke, headers, raw)
    if values(headers, 'cache-control') != ['no-store'] or values(headers, 'referrer-policy') != ['no-referrer']:
        fail('grant response lost exact no-store/no-referrer policy')
    for name in ('set-cookie', 'access-control-allow-credentials'):
        if values(headers, name):
            fail('grant response set cookies or credentialed CORS')
    allowed_origin = ['null'] if origin == 'null' and authorized else []
    if values(headers, 'access-control-allow-origin') != allowed_origin:
        fail('grant response widened or lost exact opaque-origin CORS')
    vary = [part.strip().lower() for value in values(headers, 'vary') for part in value.split(',')]
    if allowed_origin and 'origin' not in vary:
        fail('opaque-origin response omitted Vary: Origin')
    if not allowed_origin and 'origin' in vary:
        fail('non-opaque or denied response acquired grant CORS Vary')
    mime = ';'.join(values(headers, 'content-type')).split(';', 1)[0].strip().lower()
    if status in (200, 403) and mime in (
        'text/html',
        'image/svg+xml',
        'application/xhtml+xml',
        'application/xml',
        'text/xml',
    ):
        if values(headers, 'content-security-policy') != [SANDBOX] or values(headers, 'x-content-type-options') != [
            'nosniff'
        ]:
            fail('generated grant response escaped single CSP/nosniff isolation')


def wire_head(port, target, headers):
    request = '\r\n'.join(
        [
            f'HEAD {target} HTTP/1.1',
            f'Host: 127.0.0.1:{port}',
            'Connection: close',
            *(f'{name}: {value}' for name, value in headers.items()),
            '',
            '',
        ]
    ).encode('ascii')
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=15) as sock:
            sock.sendall(request)
            chunks = []
            size = 0
            while True:
                chunk = sock.recv(65536)
                if not chunk:
                    break
                size += len(chunk)
                if size > 1024 * 1024:
                    fail('HEAD wire response exceeded bounded capture')
                chunks.append(chunk)
    except OSError as exc:
        fail(f'HEAD request transport error: {type(exc).__name__}')
    header, separator, raw = b''.join(chunks).partition(b'\r\n\r\n')
    if not separator:
        fail('HEAD wire response lacked header terminator')
    lines = header.decode('iso-8859-1').split('\r\n')
    try:
        status = int(lines[0].split(' ')[1])
        response_headers = [tuple(line.split(': ', 1)) for line in lines[1:]]
        if any(len(pair) != 2 for pair in response_headers):
            raise ValueError
    except (ValueError, IndexError):
        fail('HEAD wire response malformed')
    return status, response_headers, raw


def _retire_short_signer(process, owned, completed):
    retired = completed
    try:
        if owned is None:
            if process.poll() is None:
                process.kill()
            process.wait()
        else:
            mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM, signal.SIGHUP})
            try:
                kill_tree(process.pid)
                process.wait()
                owned.remove(process.pid)
                retired = True
            finally:
                signal.pthread_sigmask(signal.SIG_SETMASK, mask)
    finally:
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream is not None:
                stream.close()
    return retired


def _capture_short_session(smoke, env, code, lifetime, inherited_group):
    owned = None if inherited_group else smoke.owned
    mask = None
    if owned is not None:
        mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM, signal.SIGHUP})
    child = None
    process = None
    completed = retired = False
    try:
        child = tempfile.mkdtemp(prefix='short-session-', dir=getattr(smoke, 'scratch', None))
        env = dict(
            env,
            STATIC_DIR=os.path.join(child, 'static'),
            FONTS_DIR=os.path.join(child, 'static/fonts'),
            ENABLE_DB_MIGRATIONS='false',
        )
        process = subprocess.Popen(
            [
                'bash',
                '-c',
                'source scripts/dev-env.sh && exec uv run --no-sync --quiet python -c "$1"',
                'short-session',
                code,
            ],
            cwd=smoke.root,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=owned is not None,
        )
        if owned is not None:
            owned.append(process.pid)
        # Cancellation can resume only after registration; stdin gates backend/private work.
        if mask is not None:
            signal.pthread_sigmask(signal.SIG_SETMASK, mask)
            mask = None
        stdout, stderr = process.communicate(input=json.dumps({'id': smoke.owner_id, 'lifetime': lifetime}), timeout=60)
        completed = True
        return subprocess.CompletedProcess(process.args, process.returncode, stdout, stderr)
    finally:
        try:
            retired = process is None or _retire_short_signer(process, owned, completed)
        finally:
            if mask is not None:
                signal.pthread_sigmask(signal.SIG_SETMASK, mask)
            if retired and child is not None:
                shutil.rmtree(child)
            # Failed inherited chains and their scratch stay with the surviving browser-group owner.


def mint_short_session(smoke, *, service_env=None, lifetime=5, inherited_group=False):
    """Mint privately; inherited_group borrows the browser harness's registered process group."""
    if type(lifetime) is not int or not 1 <= lifetime <= 60:
        fail('short-session prerequisite: lifetime must be an integer from 1 to 60 seconds')
    code = (
        'import json,signal,sys; '
        'signal.pthread_sigmask(signal.SIG_UNBLOCK,{signal.SIGINT,signal.SIGTERM,signal.SIGHUP}); '
        'config=json.load(sys.stdin); from datetime import timedelta; '
        'from open_webui.utils.auth import create_token,decode_token; '
        'token=create_token({"id":config["id"]},timedelta(seconds=config["lifetime"])); '
        'print("OCU_SHORT_SESSION="+json.dumps({"token":token,"exp":decode_token(token)["exp"]}))'
    )
    env = {key: os.environ[key] for key in ('PATH', 'HOME', 'TMPDIR', 'WEBUI_SECRET_KEY') if key in os.environ}
    env.update(
        {
            'PYTHON_DOTENV_DISABLED': '1',
            'PYTHONPATH': str(smoke.root / 'backend'),
            'DATA_DIR': str(smoke.root / '.run/data'),
            'FRONTEND_BUILD_DIR': str(smoke.root / '.run/frontend-build'),
        }
    )
    if service_env is not None:
        env = dict(service_env, PYTHONPATH=str(smoke.root / 'backend'), PYTHON_DOTENV_DISABLED='1')
    try:
        result = _capture_short_session(smoke, env, code, lifetime, inherited_group)
    except (OSError, subprocess.TimeoutExpired):
        fail('short-session prerequisite: canonical backend interpreter unavailable')
    for token in re.findall(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', result.stdout + result.stderr):
        smoke.secrets.append(token)
    if result.returncode:
        fail('short-session prerequisite: canonical create_token failed')
    try:
        lines = [line for line in result.stdout.splitlines() if line.startswith('OCU_SHORT_SESSION=')]
        if len(lines) != 1:
            raise ValueError
        payload = json.loads(lines[0].split('=', 1)[1])
        token, expiry = payload['token'], payload['exp']
        if isinstance(token, str):
            smoke.secrets.append(token)
        if (
            not isinstance(token, str)
            or not re.fullmatch(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', token)
            or type(expiry) not in (int, float)
            or not math.isfinite(expiry)
            or not time.time() < expiry <= time.time() + lifetime + 1
        ):
            raise ValueError
    except (StopIteration, KeyError, ValueError, TypeError):
        fail('short-session prerequisite: invalid captured token/expiry metadata')
    return token, expiry


class ResourceJudge:
    def __init__(self, smoke, logger):
        self.smoke = smoke
        self.logger = logger
        self.counter = 0
        self.base = ''

    def issue(self, resource, *, method='GET', cookie=None):
        smoke = self.smoke
        before = len(observations(smoke.record))
        target = f'/ocu/files/{smoke.chat_id}/{resource}'
        headers = {'Cookie': smoke.owner_cookie if cookie is None else cookie}
        response = (
            wire_head(smoke.proxy_port, target, headers)
            if method == 'HEAD'
            else http_raw('127.0.0.1', smoke.proxy_port, method, target, headers=headers)
        )
        for location in values(response[1], 'location'):
            register_capabilities(location, smoke.secrets)
        assert_no_arrival(observations(smoke.record)[before:])
        return assert_redirect(smoke, *response, smoke.chat_id, resource)

    def request(self, method, target, *, expected=200, headers=None, upstream=None, grant=True):
        smoke = self.smoke
        before = len(observations(smoke.record))
        headers = headers or {}
        response = (
            wire_head(smoke.proxy_port, target, headers)
            if method == 'HEAD'
            else http_raw('127.0.0.1', smoke.proxy_port, method, target, headers=headers)
        )
        for location in values(response[1], 'location'):
            register_capabilities(location, smoke.secrets)
        status, resp, raw = response
        if status != expected:
            fail(f'resource {method} expected {expected}, got {status}')
        rows = observations(smoke.record)[before:]
        if upstream is None:
            assert_no_arrival(rows)
        else:
            assert_arrival(smoke, rows, method, upstream, grant=grant)
        if grant:
            assert_response(smoke, status, resp, raw, origin=headers.get('Origin'), authorized=upstream is not None)
        else:
            assert_contained(smoke, resp, raw)
        if method == 'HEAD' and raw:
            fail('HEAD resource response sent wire body bytes')
        return response

    def fetch(self, canonical):
        prefix = f'/ocu/files/{self.smoke.chat_id}/'
        if not canonical.startswith(prefix):
            fail('resource fetch requires this owner canonical path')
        resource = canonical.removeprefix(prefix)
        location = self.issue(resource)
        return self.request('GET', location, upstream=f'/files/{self.smoke.chat_id}/{resource}')

    def hurl(self, path, report):
        smoke = self.smoke
        resources = (
            'page.html?download=1&%64ownload=0',
            'page.html',
            'diagram.svg',
            'data.xml',
            'page.xhtml',
            'blob.bin',
            'page.html?download=1',
            'page.html?revision=7&download=1',
            'page.html?Download=1',
            'page.html?download=1&download=1',
            'blob.bin?download=1',
            'plain.xml',
            'backend-html403.html',
            'style.css',
            'backend403',
            'backend409',
        )
        for entry, resource in enumerate(resources, 1):
            self.counter += 1
            destination = report / str(self.counter)
            destination.mkdir(mode=0o700, parents=True)
            canonical = entry in (1, 7, 8, 11, 14)
            variables = {'resource_base': self.base}
            before = len(observations(smoke.record))
            with private_hurl_variables(smoke, variables, prefix='resource-') as options:
                run_hurl_files(
                    smoke,
                    [str(path)],
                    destination,
                    self.logger,
                    [
                        '--from-entry',
                        str(entry),
                        '--to-entry',
                        str(entry),
                        *options,
                    ],
                )
            report_path = destination / '0/report.json'
            response = json.loads(report_path.read_text())[0]['entries'][0]['calls'][0]['response']
            headers = [(header['name'], header['value']) for header in response['headers']]
            raw = (report_path.parent / response['body']).read_bytes()
            rows = observations(smoke.record)[before:]
            if entry == 1:
                location = assert_redirect(smoke, response['status'], headers, raw, smoke.chat_id, resource)
                assert_no_arrival(rows)
                self.base = location.split('/' + smoke.chat_id + '/', 1)[0] + '/' + smoke.chat_id
                self.request('GET', location, upstream=f'/files/{smoke.chat_id}/{resource}')
                continue
            if entry == 14:
                assert_no_arrival(rows)
            else:
                assert_arrival(smoke, rows, 'GET', f'/files/{smoke.chat_id}/{resource}', grant=not canonical)
                if not canonical:
                    assert_response(smoke, response['status'], headers, raw, authorized=True)
                else:
                    assert_contained(smoke, headers, raw)

    def run(self):
        smoke = self.smoke
        resource = 'page.html?download=1&%64ownload=0'
        location = self.issue(resource)
        get = self.request('GET', location, upstream=f'/files/{smoke.chat_id}/{resource}')
        if len(values(get[1], 'content-disposition')) != 1 or not values(get[1], 'content-disposition')[0].startswith(
            'inline;'
        ):
            fail('encoded duplicate query did not retain inline disposition')
        head_location = self.issue(resource, method='HEAD')
        head = self.request('HEAD', head_location, upstream=f'/files/{smoke.chat_id}/{resource}')
        for name in (
            'content-type',
            'content-length',
            'content-disposition',
            'content-security-policy',
            'x-content-type-options',
            'cache-control',
            'referrer-policy',
        ):
            if values(get[1], name) != values(head[1], name):
                fail('grant HEAD metadata differs from GET')
        for origin in ('null', None, smoke.origin, 'Null'):
            headers = {} if origin is None else {'Origin': origin}
            self.request('GET', location, headers=headers, upstream=f'/files/{smoke.chat_id}/{resource}')
            self.request('HEAD', location, headers=headers, upstream=f'/files/{smoke.chat_id}/{resource}')
        self.request(
            'GET',
            location.split('page.html', 1)[0] + 'backend-html403.html',
            expected=403,
            headers={'Origin': 'null'},
            upstream=f'/files/{smoke.chat_id}/backend-html403.html',
        )
        forged = {
            'Cookie': smoke.foreign_cookie,
            'Authorization': 'Bearer ' + smoke.foreign_cookie.partition('=')[2],
            'X-User-Id': 'forged',
            'X-User-Email': 'forged@example.test',
            'X-Chat-Id': smoke.foreign_chat,
            'X-Ocu-Grant': 'forged-grant',
            'X-Ocu-Auth-Mode': 'session',
            'X-Ocu-Resource-Path': 'archive',
            'X-Ocu-Resource-Query': 'download=1',
            'X-Ocu-Resource-Method': 'POST',
            'Referer': location,
        }
        smoke.secrets.append(forged['X-Ocu-Grant'])
        self.request('GET', location, headers=forged, upstream=f'/files/{smoke.chat_id}/{resource}')
        grant = location.split('/')[3]
        base = self._assert_grant_denials(location, grant, forged)
        for name in ('sub/archive', 'office/source/file'):
            self.request('GET', base + name, upstream=f'/files/{smoke.chat_id}/{name}')
        for name, mime, signature in (
            ('style.css', 'text/css', b'#inline {'),
            ('module.js', 'text/javascript', b'export const resourceProof'),
            ('font.ttf', 'font/ttf', b'\x00\x01\x00\x00'),
        ):
            _status, headers, raw = self.request(
                'GET', base + name, headers={'Origin': 'null'}, upstream=f'/files/{smoke.chat_id}/{name}'
            )
            if values(headers, 'content-type') != [mime] or not raw.startswith(signature):
                fail('ordinary stylesheet/module/font response differs from resource fixture')
        for cookie, status in (('', 401), (smoke.foreign_cookie, 404), ('token=' + grant, 401)):
            self.request(
                'GET', f'/ocu/files/{smoke.chat_id}/page.html', expected=status, headers={'Cookie': cookie}, grant=False
            )
        for header in ({'Cookie': 'token=' + grant}, {'Authorization': 'Bearer ' + grant}):
            self.request('GET', f'/ocu/api/outputs/{smoke.chat_id}', expected=401, headers=header, grant=False)
        self.expiry()
        self.logger.info(
            'Resources: real-owner grants, exact query, raw HEAD, holder independence, denials and expiry passed'
        )

    def _assert_grant_denials(self, location, grant, forged):
        smoke = self.smoke
        payload, signature = grant.split('.', 1)
        tampered = payload + '.' + ('A' if signature[0] != 'A' else 'B') + signature[1:]
        smoke.secrets.append(tampered)
        denied = [
            location.replace(grant, tampered, 1),
            location.replace('/' + smoke.chat_id + '/', '/' + smoke.foreign_chat + '/', 1),
            location.replace(grant, smoke.owner_jwt, 1),
        ]
        base = f'/ocu/f/{grant}/{smoke.chat_id}/'
        for name in (
            'archive',
            '%61rchive',
            'archive/',
            '../page.html',
            '%2e%2e/page.html',
            'sub%2Fpage.html',
            'sub%5Cpage.html',
            'sub/%252e%252e/page.html',
            'page.html%00',
            '',
        ):
            denied.append(base + name)
        for query in ('download=1', 'revision=7&download=1', 'download=1&x=1&x=2', 'download=1&x=', 'download=1&x=%26'):
            denied.append(base + 'page.html?' + query)
        for target in denied:
            register_capabilities(target, smoke.secrets)
            for method in ('GET', 'HEAD'):
                self.request(
                    method,
                    target,
                    expected=400 if target == base + 'page.html%00' else 404,
                    headers={**forged, 'Cookie': smoke.owner_cookie, 'X-Ocu-Grant': grant, 'Origin': 'null'},
                )
        for method in ('POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'):
            self.request(method, location, expected=404, headers=forged)
        return base

    def expiry(self):
        smoke = self.smoke
        token, expiry = mint_short_session(smoke)
        try:
            location = self.issue('page.html', cookie='token=' + token)
        except Exception:
            fail('short-session prerequisite: real issuer rejected canonical harness session')
        self.request('GET', location, upstream=f'/files/{smoke.chat_id}/page.html')
        remaining = expiry - time.time()
        if remaining <= 0:
            fail('short-session prerequisite: session expired before fresh resource proof')
        time.sleep(remaining + 0.15)
        if time.time() <= expiry:
            fail('short-session expiry wait did not cross actual session expiry')
        self.request(
            'GET',
            f'/ocu/files/{smoke.chat_id}/page.html',
            expected=401,
            headers={'Cookie': 'token=' + token},
            grant=False,
        )
        self.request('GET', location, expected=404, headers={'Origin': 'null'})
