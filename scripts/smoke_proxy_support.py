"""HTTP, process, and observation helpers for make smoke-proxy."""

from __future__ import annotations

import http.client
import json
import os
import signal
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path


class Fail(RuntimeError):
    pass


def fail(message: str) -> None:
    raise Fail(message)



def run(argv: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None,
        check: bool = True, secret: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(argv, cwd=cwd, env=env, text=True, capture_output=True)
    if check and result.returncode:
        text = result.stderr.strip() or result.stdout.strip() or f'exit {result.returncode}'
        if secret:
            text = 'command failed'
        fail(f'{" ".join(argv[:3])}: {text}')
    return result


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return int(sock.getsockname()[1])


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


def http_json(method: str, url: str, *, headers: dict[str, str] | None = None,
              body: bytes | None = None, cookie: str | None = None) -> tuple[int, dict, dict[str, str], bytes]:
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


def http_raw(host: str, port: int, method: str, target: str, *, headers: dict[str, str] | None = None,
             body: bytes | None = None) -> tuple[int, list[tuple[str, str]], bytes]:
    conn = http.client.HTTPConnection(host, port, timeout=15)
    hdrs = dict(headers or {})
    conn.request(method, target, body=body, headers=hdrs)
    response = conn.getresponse()
    raw = response.read()
    hdrs_out = response.getheaders()
    conn.close()
    return response.status, hdrs_out, raw


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
