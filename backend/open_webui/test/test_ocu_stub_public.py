"""Public stub routes must not echo credentials; internal echo stays."""

from __future__ import annotations

import json
import os
import runpy
import socket
import subprocess
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
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
    fixtures = tmp_path / 'fixtures.json'
    fixtures.write_text(json.dumps({'drawio-owner': 'drawio'}), encoding='utf-8')
    env = os.environ.copy()
    env.update(
        {
            'OCU_STUB_PORT': str(port),
            'OCU_PUBLIC_PREFIX': '/ocu',
            'OCU_INTERNAL_TOKEN': 'synthetic-stub-token',
            'OCU_STUB_RECORD': str(record),
            'OCU_STUB_FIXTURES': str(fixtures),
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


def test_late_ws_close_does_not_hide_denied_or_unknown_arrivals(tmp_path):
    support = runpy.run_path(str(ROOT / 'scripts/smoke_proxy_support.py'))
    observations = support['observations']
    record = tmp_path / 'arrivals.jsonl'
    owner = {'record_type': 'arrival', 'method': 'GET', 'target': '/browser/owner/ws'}
    lifecycle = {
        'record_type': 'ws_lifecycle',
        'method': 'GET',
        'upgrade': 'websocket',
        'ws_event': 'close',
        'request_target': '/browser/owner/ws',
        'target': '/ws-events/browser/owner/ws',
    }
    denied = {'record_type': 'arrival', 'method': 'GET', 'target': '/browser/foreign/ws'}
    unknown = {'record_type': 'future_record', 'method': 'GET', 'target': '/unknown'}
    record.write_text(''.join(json.dumps(row) + '\n' for row in (owner, lifecycle)))
    assert observations(record) == [owner]
    record.write_text(''.join(json.dumps(row) + '\n' for row in (owner, lifecycle, denied, unknown)))
    assert observations(record) == [owner, denied, unknown]
    invalid = {**lifecycle, 'ws_event': 'unrecognized'}
    record.write_text(json.dumps(invalid) + '\n')
    with pytest.raises(support['Fail']):
        observations(record)


def test_drawio_fixture_lists_and_serves_renderer_document(stub_server):
    base, _record = stub_server
    status, _headers, body = _get(f'{base}/api/outputs/drawio-owner', {})
    assert status == 200
    files = json.loads(body)['files']
    assert len(files) == 1
    listed = files[0]
    assert listed['file_id'] == 'fixture-diagram.drawio'
    assert listed['path'] == 'diagram.drawio'
    assert listed['url'] == '/ocu/files/drawio-owner/diagram.drawio'
    assert listed['type'] == 'drawio'
    assert listed['mime'] == 'application/xml'
    status, headers, document = _get(f'{base}/files/drawio-owner/diagram.drawio', {})
    assert status == 200
    assert headers.get('content-type', '').split(';')[0].strip() == 'application/xml'
    assert 'x-echo-authorization' not in headers
    assert headers.get('content-security-policy') == "default-src 'self'"
    root = ET.fromstring(document)
    model = root.find('.//mxGraphModel')
    assert model is not None
    assert model.get('math') == '1'
    cells = {cell.get('id'): cell.attrib.get('style', '') for cell in model.findall('root/mxCell')}
    assert 'img/telecommunication/Cellphone_128x128.png' in cells['phone']
    assert 'mxgraph.electrical.logic_gates.and' in cells['and']
