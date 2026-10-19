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
from email import policy
from email.parser import BytesParser
from pathlib import Path
from urllib.parse import quote

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


@pytest.mark.parametrize(
    'name,expected_leaf',
    [
        pytest.param('a"b.txt', 'a"b.txt', id='quote'),
        pytest.param(r'a\b.txt', r'a\b.txt', id='backslash'),
        pytest.param(r'a\"b.txt', r'a\"b.txt', id='combined'),
        pytest.param(r'nested/a\"b.txt', r'a\"b.txt', id='nested'),
        pytest.param('ordinary.txt', 'ordinary.txt', id='ordinary'),
    ],
)
@pytest.mark.parametrize('query,mode', [('', 'inline'), ('?download=1', 'attachment')], ids=['inline', 'download'])
def test_uploaded_quoted_filename_survives_content_disposition(stub_server, query, mode, name, expected_leaf):
    base, _record = stub_server
    chat = 'quoted-upload'
    payload = b'quoted upload\r\n\x00\xffpayload\n'
    envelope = (
        b'--quoted-upload-boundary\r\nContent-Disposition: form-data; name="file"; '
        b'filename="ignored.bin"\r\nContent-Type: application/octet-stream\r\n\r\n'
        + payload
        + b'\r\n--quoted-upload-boundary--\r\n'
    )
    request = urllib.request.Request(
        f'{base}/api/uploads/{chat}/{quote(name, safe="")}',
        data=envelope,
        headers={'Content-Type': 'multipart/form-data; boundary=quoted-upload-boundary'},
    )
    with urllib.request.urlopen(request, timeout=3) as response:
        assert response.status == 200
        assert json.loads(response.read())['filename'] == name
    status, _headers, listing = _get(f'{base}/api/outputs/{chat}', {})
    assert status == 200
    stored = [entry for entry in json.loads(listing)['files'] if entry['path'] == name]
    assert len(stored) == 1
    assert stored[0]['name'] == name

    port = int(base.rsplit(':', 1)[1])
    target = f'/files/{chat}/{quote(name, safe="")}{query}'
    with socket.create_connection(('127.0.0.1', port), timeout=3) as conn:
        conn.sendall(f'GET {target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'.encode())
        chunks = []
        while chunk := conn.recv(65536):
            chunks.append(chunk)
    header, separator, wire_body = b''.join(chunks).partition(b'\r\n\r\n')
    assert separator == b'\r\n\r\n'
    lines = header.split(b'\r\n')
    assert int(lines[0].split()[1]) == 200
    assert all(
        b':' in line and not line.startswith((b' ', b'\t')) and b'\r' not in line and b'\n' not in line
        for line in lines[1:]
    )
    disposition_fields = [line for line in lines[1:] if line.split(b':', 1)[0].lower() == b'content-disposition']
    assert len(disposition_fields) == 1
    assert wire_body == payload
    message = BytesParser(policy=policy.default).parsebytes(b'\r\n'.join(lines[1:]) + b'\r\n\r\n')
    assert message.get_all('Content-Length') == [str(len(payload))]
    assert message.get_content_disposition() == mode
    assert message.get_filename() == expected_leaf
    assert message.defects == []
    assert message['Content-Disposition'].defects == ()


@pytest.mark.parametrize('name', ['page.html', 'blob.bin', 'plain.xml', 'backend-html403.html'])
def test_ordinary_head_preserves_get_metadata_without_wire_body(stub_server, name):
    base, _record = stub_server
    get_status, get_headers, _body = _get(f'{base}/files/running/{name}', {})
    port = int(base.rsplit(':', 1)[1])
    with socket.create_connection(('127.0.0.1', port), timeout=3) as conn:
        conn.sendall(f'HEAD /files/running/{name} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'.encode())
        chunks = []
        while chunk := conn.recv(65536):
            chunks.append(chunk)
    header, _, wire_body = b''.join(chunks).partition(b'\r\n\r\n')
    lines = header.decode().split('\r\n')
    assert int(lines[0].split()[1]) == get_status
    headers = {name.lower(): value for name, value in (line.split(': ', 1) for line in lines[1:])}
    for key in (
        'content-type',
        'content-length',
        'content-disposition',
        'content-security-policy',
        'x-content-type-options',
    ):
        assert headers.get(key) == get_headers.get(key)
    assert wire_body == b''


def test_archive_head_remains_refused(stub_server):
    base, _record = stub_server
    request = urllib.request.Request(f'{base}/files/running/archive', method='HEAD')
    with pytest.raises(urllib.error.HTTPError) as raised:
        urllib.request.urlopen(request, timeout=3)
    assert raised.value.code == 404


def test_observation_records_credential_presence_without_values(stub_server):
    base, record = stub_server
    _get(
        f'{base}/files/running/page.html',
        {
            'Authorization': 'Bearer synthetic-stub-token',
            'Cookie': 'token=presence-cookie-canary',
            'Referer': 'presence-referer-canary',
            'X-Ocu-Grant': 'presence-grant-canary',
            'X-Ocu-Resource-Path': 'presence-path-canary',
            'X-Ocu-Auth-Mode': 'presence-mode-canary',
        },
    )
    rows = [json.loads(line) for line in record.read_text().splitlines()]
    assert rows[-1]['credential_headers'] == [
        'cookie',
        'referer',
        'x-ocu-auth-mode',
        'x-ocu-grant',
        'x-ocu-resource-path',
    ]
    assert rows[-1]['token_ok'] is True
    assert 'presence-' not in record.read_text()


@pytest.mark.parametrize(
    'name,expected',
    [
        ('sub/archive', b'ordinary nested archive filename'),
        ('office/source/file', b'ordinary control-like filename'),
    ],
)
def test_ordinary_control_like_filenames_have_resource_bytes(stub_server, name, expected):
    base, _record = stub_server
    status, _headers, body = _get(f'{base}/files/running/{name}', {})
    assert status == 200
    assert body == expected


@pytest.mark.parametrize(
    'name,mime,signature',
    [
        ('style.css', 'text/css', b'#inline {'),
        ('module.js', 'text/javascript', b'export const resourceProof'),
        ('font.ttf', 'font/ttf', b'\x00\x01\x00\x00'),
    ],
)
def test_relative_resource_fixtures_have_ordinary_content(stub_server, name, mime, signature):
    base, _record = stub_server
    status, headers, body = _get(f'{base}/files/running/{name}', {})
    assert status == 200
    assert headers['content-type'] == mime
    assert body.startswith(signature)
