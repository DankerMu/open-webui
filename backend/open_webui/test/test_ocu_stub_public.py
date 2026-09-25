"""Public stub routes must not echo credentials; internal echo stays."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
STUB = ROOT / 'scripts/ocu-stub.py'


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return int(sock.getsockname()[1])


def _get(url: str, headers: dict[str, str]) -> tuple[int, dict[str, str], bytes]:
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return response.status, {k.lower(): v for k, v in response.headers.items()}, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, {k.lower(): v for k, v in exc.headers.items()}, exc.read()


@pytest.fixture
def stub_server(tmp_path):
    port = _free_port()
    record = tmp_path / 'record.jsonl'
    env = os.environ.copy()
    env.update(
        {
            'OCU_STUB_PORT': str(port),
            'OCU_PUBLIC_PREFIX': '/ocu',
            'OCU_INTERNAL_TOKEN': 'synthetic-stub-token',
            'OCU_STUB_RECORD': str(record),
        }
    )
    proc = subprocess.Popen([os.environ.get('PYTHON', 'python3'), str(STUB)], env=env, start_new_session=True)
    deadline = time.time() + 5
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/internal/describe/running', timeout=0.2)
            break
        except OSError:
            if proc.poll() is not None:
                raise RuntimeError('stub exited')
            time.sleep(0.05)
    else:
        proc.kill()
        raise RuntimeError('stub not ready')
    yield f'http://127.0.0.1:{port}', record
    proc.terminate()
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        proc.kill()


def test_public_file_does_not_echo_authorization(stub_server):
    base, record = stub_server
    status, headers, body = _get(
        f'{base}/files/running/page.html',
        {'Authorization': 'Bearer synthetic-stub-token', 'Cookie': 'token=secret'},
    )
    assert status == 200
    assert 'x-echo-authorization' not in headers
    assert b'synthetic-stub-token' not in body
    assert 'synthetic-stub-token' not in str(headers)
    rows = [json.loads(line) for line in record.read_text().splitlines() if line]
    assert rows and rows[-1]['token_ok'] is True
    assert rows[-1]['target'].startswith('/files/running/page.html')


def test_internal_describe_still_echoes_authorization(stub_server):
    base, _record = stub_server
    status, headers, _body = _get(
        f'{base}/internal/describe/running',
        {'Authorization': 'StubEcho stub-token', 'X-Requested-With': 'ocu-workspace'},
    )
    assert status == 200
    assert headers.get('x-echo-authorization') == 'StubEcho stub-token'
    assert headers.get('x-echo-x-requested-with') == 'ocu-workspace'
