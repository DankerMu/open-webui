"""HTTP, process, git-blob, and observation helpers for make smoke-proxy."""

from __future__ import annotations

import http.client
import json
import os
import shutil
import signal
import socket
import stat
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

GIT_ENV = {
    'PATH': os.environ.get('PATH', ''),
    'HOME': os.environ.get('HOME', ''),
    'GIT_CONFIG_NOSYSTEM': '1',
    'GIT_TERMINAL_PROMPT': '0',
}


class Fail(RuntimeError):
    pass


def fail(message: str) -> None:
    raise Fail(message)


def run(
    argv: list[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    check: bool = True,
    secret: bool = False,
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(argv, cwd=cwd, env=env, text=True, capture_output=True)
    if check and result.returncode:
        text = result.stderr.strip() or result.stdout.strip() or f'exit {result.returncode}'
        if secret:
            text = 'command failed'
        fail(f'{" ".join(argv[:3])}: {text}')
    return result


def git_run(argv: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return run(argv, cwd=cwd, env=GIT_ENV)


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return int(sock.getsockname()[1])


def distinct_ports() -> tuple[int, int]:
    first = free_port()
    second = free_port()
    if second == first:
        second = free_port()
    if second == first:
        fail('could not allocate distinct stub and proxy ports')
    return first, second


def wait_http(url: str, pid: int, timeout: float = 8.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if os.waitpid(pid, os.WNOHANG)[0]:
            fail(f'owned process {pid} exited before {url} was ready')
        try:
            urllib.request.urlopen(url, timeout=0.4)
            return
        except OSError:
            time.sleep(0.05)
    fail(f'timed out waiting for {url}')


def http_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    cookie: str | None = None,
) -> tuple[int, dict, dict[str, str], bytes]:
    req_headers = dict(headers or {})
    if cookie:
        req_headers['Cookie'] = cookie
    request = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read()
            hdrs = {k.lower(): v for k, v in response.headers.items()}
            payload = _decode_json(raw)
            return response.status, payload, hdrs, raw
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        hdrs = {k.lower(): v for k, v in exc.headers.items()}
        payload = _decode_json(raw)
        return exc.code, payload, hdrs, raw


def _decode_json(raw: bytes) -> dict:
    try:
        payload = json.loads(raw.decode()) if raw else {}
    except json.JSONDecodeError:
        payload = {}
    return payload if isinstance(payload, dict) else {}


def http_raw(
    host: str, port: int, method: str, target: str, *, headers: dict[str, str] | None = None, body: bytes | None = None
) -> tuple[int, list[tuple[str, str]], bytes]:
    conn = http.client.HTTPConnection(host, port, timeout=15)
    hdrs = dict(headers or {})
    try:
        conn.request(method, target, body=body, headers=hdrs)
        response = conn.getresponse()
        raw = response.read()
        hdrs_out = response.getheaders()
        status = response.status
    except (TimeoutError, OSError) as exc:
        fail(f'{method} {target} transport error: {exc}')
    finally:
        conn.close()
    return status, hdrs_out, raw


def observations(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding='utf-8').splitlines():
        if line:
            rows.append(json.loads(line))
    return rows


def redact(text: str, secrets: list[str]) -> str:
    out = text
    for secret in secrets:
        if secret:
            out = out.replace(secret, '[redacted]')
    return out


def kill_tree(pid: int) -> None:
    try:
        os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    deadline = time.time() + 3
    while time.time() < deadline:
        if os.waitpid(pid, os.WNOHANG)[0]:
            return
        time.sleep(0.05)
    try:
        os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        return
    os.waitpid(pid, 0)


def git_blob(checkout: Path, sha: str, rel: str) -> bytes:
    listed = git_run(['git', '-C', str(checkout), 'ls-tree', '-r', sha, '--', rel]).stdout
    if not listed.strip():
        fail(f'missing git blob for {rel} at {sha}')
    mode, kind, rest = listed.split(None, 2)
    oid, name = rest.split('\t', 1)
    if kind != 'blob' or name.strip() != rel:
        fail(f'{rel} at {sha} is not a regular git blob')
    if not mode.startswith('100'):
        fail(f'{rel} at {sha} is not a regular file mode')
    data = subprocess.run(
        ['git', '-C', str(checkout), 'cat-file', 'blob', oid],
        env=GIT_ENV,
        capture_output=True,
        check=False,
    )
    if data.returncode:
        fail(f'git cat-file failed for {rel}')
    return data.stdout


def materialize_git_files(checkout: Path, sha: str, dest: Path, rels: tuple[str, ...]) -> None:
    dest.mkdir(mode=0o700)
    for rel in rels:
        blob = git_blob(checkout, sha, rel)
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
        fd = os.open(target, flags, 0o600)
        try:
            os.write(fd, blob)
        finally:
            os.close(fd)
        info = os.lstat(target)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
            fail(f'staged {rel} is not a regular file')
        if Path(target).read_bytes() != blob:
            fail(f'staged {rel} is not byte-identical to git blob')


def ws_mask_frame(payload: bytes, opcode: int = 0x1) -> bytes:
    if len(payload) > 125:
        fail('websocket test payload too large')
    mask = b'\x37\xfa\x21\x3d'
    header = bytes((0x80 | opcode, 0x80 | len(payload))) + mask
    masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    return header + masked


def _frame_size(buf: bytes) -> int:
    if len(buf) < 2:
        return 2
    need = 2 + (buf[1] & 0x7F)
    if buf[1] & 0x80:
        need += 4
    return need


def _recv_frame(sock: socket.socket, buf: bytes, deadline: float) -> tuple[bytes, bytes]:
    try:
        while time.time() < deadline and len(buf) < 2:
            chunk = sock.recv(4096)
            if not chunk:
                break
            buf += chunk
        need = _frame_size(buf) if len(buf) >= 2 else 2
        while time.time() < deadline and len(buf) < need:
            chunk = sock.recv(need - len(buf))
            if not chunk:
                break
            buf += chunk
            need = _frame_size(buf)
    except (TimeoutError, OSError) as exc:
        fail(f'websocket frame exchange failed: {exc}')
    if len(buf) < 2:
        fail('websocket frame truncated')
    need = _frame_size(buf)
    if len(buf) < need:
        fail('websocket frame truncated')
    return buf[:need], buf[need:]


def ws_unmask_or_server(frame: bytes) -> tuple[int, bytes]:
    if len(frame) < 2:
        fail('websocket frame too short')
    opcode = frame[0] & 0x0F
    masked = bool(frame[1] & 0x80)
    size = frame[1] & 0x7F
    index = 2
    if masked:
        mask = frame[index : index + 4]
        index += 4
        payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(frame[index : index + size]))
    else:
        payload = frame[index : index + size]
    if len(payload) != size:
        fail('websocket frame truncated')
    return opcode, payload


def websocket_echo(
    host: str, port: int, path: str, headers: dict[str, str], payload: bytes, timeout: float = 8.0
) -> tuple[int, list[tuple[str, str]], bytes]:
    import base64

    key = base64.b64encode(b'websocket-test-key').decode()
    req = [
        f'GET {path} HTTP/1.1',
        f'Host: {host}:{port}',
        f'Cookie: {headers.get("Cookie", "")}',
        'Connection: Upgrade',
        'Upgrade: websocket',
        f'Origin: {headers.get("Origin", "")}',
        f'Sec-WebSocket-Key: {key}',
        'Sec-WebSocket-Version: 13',
        '',
        '',
    ]
    sock = socket.create_connection((host, port), timeout=timeout)
    sock.settimeout(timeout)
    try:
        sock.sendall('\r\n'.join(req).encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            chunk = sock.recv(4096)
            if not chunk:
                break
            buf += chunk
        head, rest = (buf.split(b'\r\n\r\n', 1) + [b''])[:2]
        status_line = head.split(b'\r\n', 1)[0].decode('latin1', 'replace')
        try:
            status = int(status_line.split()[1])
        except (IndexError, ValueError):
            status = 0
        hdrs: list[tuple[str, str]] = []
        for line in head.split(b'\r\n')[1:]:
            if b':' in line:
                name, value = line.split(b':', 1)
                hdrs.append((name.decode(), value.strip().decode()))
        if status != 101:
            return status, hdrs, rest
        deadline = time.time() + timeout
        _greeting, rest = _recv_frame(sock, rest, deadline)
        sock.sendall(ws_mask_frame(payload))
        echoed, _unused = _recv_frame(sock, rest, deadline)
        return status, hdrs, echoed
    finally:
        sock.close()


def scan_hurl_report(report: Path, token: str) -> None:
    raw_token = token.encode()
    for path in report.rglob('*'):
        if not path.is_file():
            continue
        raw = path.read_bytes()
        if raw_token in raw:
            fail(f'synthetic internal token appeared in hurl report {path.name}')
        if path.suffix != '.json':
            continue
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        _scan_hurl_json(payload, path, token)


def _scan_hurl_json(payload: object, path: Path, token: str) -> None:
    if isinstance(payload, dict):
        body = payload.get('body')
        if isinstance(body, str) and body.startswith('store/'):
            stored = path.parent / body
            if stored.is_file() and token.encode() in stored.read_bytes():
                fail('synthetic internal token appeared in a hurl response body')
        headers = payload.get('headers')
        if isinstance(headers, list):
            for header in headers:
                if isinstance(header, dict) and token in str(header.get('value', '')):
                    fail('synthetic internal token appeared in a hurl response header')
        for value in payload.values():
            _scan_hurl_json(value, path, token)
    elif isinstance(payload, list):
        for item in payload:
            _scan_hurl_json(item, path, token)


def _csp(resp: list[tuple[str, str]]) -> list[str]:
    return [v for n, v in resp if n.lower() == 'content-security-policy']


def _require_status(status: int, expected: int, label: str) -> None:
    if status != expected:
        fail(f'{label} expected {expected}, got {status}')


def _assert_forced_html_query(port: int, html: str, query: str, headers: dict[str, str], label: str) -> None:
    status, resp, _raw = http_raw('127.0.0.1', port, 'GET', html + query, headers=headers)
    _require_status(status, 200, label)
    if _csp(resp) != ['sandbox allow-scripts allow-forms']:
        fail(f'{label} HTML escaped forced isolation')


def _assert_binary_download(port: int, chat_id: str, headers: dict[str, str]) -> None:
    status, resp, raw = http_raw(
        '127.0.0.1',
        port,
        'GET',
        f'/ocu/files/{chat_id}/blob.bin?download=1',
        headers=headers,
    )
    _require_status(status, 200, 'binary download')
    if not any(n.lower() == 'content-disposition' and 'attachment' in v.lower() for n, v in resp):
        fail('binary download missing attachment')
    if _csp(resp) != ["default-src 'self'"]:
        fail('binary download lost upstream CSP')
    if raw != b'\x00\x01\x02\x03':
        fail('binary download body mismatch')


def _assert_text_xml(port: int, chat_id: str, headers: dict[str, str]) -> None:
    status, resp, raw = http_raw(
        '127.0.0.1',
        port,
        'GET',
        f'/ocu/files/{chat_id}/plain.xml',
        headers=headers,
    )
    _require_status(status, 200, 'text/xml')
    if _csp(resp) != ['sandbox allow-scripts allow-forms']:
        fail('text/xml missing forced isolation')
    if b'plain-xml' not in raw:
        fail('text/xml body mismatch')


def assert_download_variants(port: int, chat_id: str, cookie: str) -> None:
    headers = {'Cookie': cookie}
    html = f'/ocu/files/{chat_id}/page.html'
    _assert_forced_html_query(port, html, '?Download=1', headers, 'Download=1')
    _assert_forced_html_query(port, html, '?download=1&download=1', headers, 'duplicate download')
    _assert_binary_download(port, chat_id, headers)
    _assert_text_xml(port, chat_id, headers)


def note_cleanup_failure(code: int, logger) -> int:
    if code == 0:
        return 1
    return code


def run_owned_lifecycle(smoke, logger) -> int:
    def handle(_signum, _frame) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, handle)
    signal.signal(signal.SIGTERM, handle)
    signal.signal(signal.SIGHUP, handle)
    code = 1
    try:
        code = smoke.run()
    except Fail as cop:
        logger.error('smoke-proxy: %s', cop)
        code = 1
    except KeyboardInterrupt:
        logger.error('smoke-proxy: interrupted')
        code = 130
    except Exception:
        logger.exception('smoke-proxy: unexpected error')
        code = 1
    return _finish_owned_cleanup(smoke, logger, code)


def _finish_owned_cleanup(smoke, logger, code: int) -> int:
    try:
        smoke.cleanup_procs()
    except Exception:
        logger.exception('owned process cleanup failed')
        code = note_cleanup_failure(code, logger)
    try:
        smoke.cleanup_data()
    except Fail as cop:
        logger.error('smoke-proxy: %s', cop)
        code = note_cleanup_failure(code, logger)
    except Exception:
        logger.exception('owned data cleanup failed')
        code = note_cleanup_failure(code, logger)
    try:
        smoke.assert_sentinel()
    except Fail as cop:
        logger.error('smoke-proxy: %s', cop)
        code = note_cleanup_failure(code, logger)
    except Exception:
        logger.exception('sentinel assertion failed')
        code = note_cleanup_failure(code, logger)
    if smoke.scratch and smoke.scratch.exists():
        try:
            shutil.rmtree(smoke.scratch)
        except OSError as cop:
            logger.error('scratch removal failed: %s', cop)
            code = note_cleanup_failure(code, logger)
    return code
