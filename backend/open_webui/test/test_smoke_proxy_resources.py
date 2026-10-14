"""Resource smoke rejects leaked credentials and misattributed gateway responses."""

from __future__ import annotations

import json
import socket
import threading
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def resources(monkeypatch, tmp_path):
    monkeypatch.syspath_prepend(str(ROOT / 'scripts'))
    import smoke_proxy_resources as resource
    import smoke_proxy_support as support

    smoke = SimpleNamespace(
        secrets=['internal-canary', 'session-canary'],
        token='internal-canary',
        owner_id='owner',
        owner_email='owner@example.test',
        chat_id='chat',
        record=tmp_path / 'arrivals.jsonl',
        proxy_port=0,
    )
    return resource, support, smoke


def test_redirect_registers_capability_before_rejecting_wrong_target(resources):
    resource, support, smoke = resources
    headers = [('Location', '/ocu/f/private.capability/wrong/page.html?x=%26')]
    with pytest.raises(support.Fail, match='redirect target'):
        resource.assert_redirect(smoke, 302, headers, b'', 'chat', 'page.html?x=%26')
    assert 'private.capability' in smoke.secrets
    assert '/ocu/f/private.capability/wrong/page.html?x=%26' in smoke.secrets


def test_redirect_requires_exact_raw_query_and_single_policy_headers(resources):
    resource, support, smoke = resources
    headers = [
        ('Location', '/ocu/f/private.capability/chat/page.html?download=1&%64ownload=0'),
        ('Cache-Control', 'no-store'),
        ('Referrer-Policy', 'no-referrer'),
    ]
    assert (
        resource.assert_redirect(smoke, 302, headers, b'', 'chat', 'page.html?download=1&%64ownload=0') == headers[0][1]
    )
    for changed in (
        [*headers, ('Cache-Control', 'no-store')],
        [('Location', headers[0][1].replace('%64ownload', 'download')), *headers[1:]],
    ):
        with pytest.raises(support.Fail):
            resource.assert_redirect(smoke, 302, changed, b'', 'chat', 'page.html?download=1&%64ownload=0')


def test_grant_arrival_rejects_wrong_identity_target_and_forwarded_credentials(resources):
    resource, support, smoke = resources
    row = {
        'method': 'GET',
        'target': '/files/chat/page.html?download=1&%64ownload=0',
        'token_ok': True,
        'identity': {'x-user-id': 'owner', 'x-user-email': 'owner@example.test', 'x-chat-id': 'chat'},
        'credential_headers': [],
    }
    resource.assert_arrival(smoke, [row], 'GET', row['target'], grant=True)
    for changed in (
        {**row, 'target': '/files/chat/page.html?download=1&download=0'},
        {**row, 'identity': {**row['identity'], 'x-user-id': 'holder'}},
        {**row, 'credential_headers': ['cookie']},
        {**row, 'token_ok': False},
        {key: value for key, value in row.items() if key != 'credential_headers'},
    ):
        with pytest.raises(support.Fail):
            resource.assert_arrival(smoke, [changed], 'GET', row['target'], grant=True)
    with pytest.raises(support.Fail):
        resource.assert_arrival(smoke, [row, row], 'GET', row['target'], grant=True)
    with pytest.raises(support.Fail, match='contacted OCU'):
        resource.assert_no_arrival([row])


def test_resource_policy_rejects_duplicate_nosniff_and_cors_on_denials(resources):
    resource, support, smoke = resources
    headers = [
        ('Cache-Control', 'no-store'),
        ('Referrer-Policy', 'no-referrer'),
        ('Content-Security-Policy', 'sandbox allow-scripts allow-forms'),
        ('X-Content-Type-Options', 'nosniff'),
        ('Content-Type', 'text/html'),
    ]
    resource.assert_response(smoke, 200, headers, b'page', origin=None)
    with pytest.raises(support.Fail):
        resource.assert_response(smoke, 200, [*headers, ('X-Content-Type-Options', 'nosniff')], b'page')
    with pytest.raises(support.Fail):
        resource.assert_response(smoke, 404, [*headers, ('Access-Control-Allow-Origin', 'null')], b'', origin='null')
    with pytest.raises(support.Fail):
        resource.assert_response(smoke, 200, [*headers, ('Set-Cookie', 'token=other')], b'page')
    with pytest.raises(support.Fail):
        resource.assert_response(smoke, 200, headers, b'session-canary')
    cors_headers = [*headers, ('Access-Control-Allow-Origin', 'null'), ('Vary', 'Origin')]
    resource.assert_response(smoke, 403, cors_headers, b'upstream error', origin='null', authorized=True)
    with pytest.raises(support.Fail):
        resource.assert_response(smoke, 403, cors_headers, b'upstream error', origin='null', authorized=False)


def test_unregistered_capability_is_redacted_from_partial_failure_output(resources):
    _, support, _ = resources
    text = 'GET http://localhost/ocu/f/unknown.capability/chat/page.html failed unknown.capability'
    redacted = support.redact(text, [])
    assert 'unknown.capability' not in redacted
    assert 'failed' in redacted


def test_report_scans_responses_not_private_requests(resources, tmp_path):
    _, support, smoke = resources
    report = tmp_path / 'report'
    report.mkdir()
    (report / 'body').write_bytes(b'normal response')
    location = '/ocu/f/private.capability/chat/page.html'
    response = {'status': 302, 'headers': [{'name': 'Location', 'value': location}], 'body': 'body'}
    payload = [
        {
            'entries': [
                {
                    'calls': [
                        {
                            'request': {
                                'headers': [{'name': 'Cookie', 'value': 'token=session-canary'}],
                                'url': 'http://proxy.invalid/ocu/files/chat/page.html',
                            },
                            'response': response,
                        }
                    ]
                }
            ]
        }
    ]
    path = report / 'report.json'
    path.write_text(json.dumps(payload))
    support.scan_hurl_report(report, smoke.token, smoke.secrets)
    assert 'private.capability' in smoke.secrets
    (report / 'body').write_bytes(b'private.capability')
    with pytest.raises(support.Fail, match='credential'):
        support.scan_hurl_report(report, smoke.token, smoke.secrets)
    (report / 'body').write_bytes(b'normal response')
    response['status'] = 200
    path.write_text(json.dumps(payload))
    with pytest.raises(support.Fail, match='credential'):
        support.scan_hurl_report(report, smoke.token, smoke.secrets)


@pytest.mark.parametrize('wire_body', [b'', b'forbidden-head-body'])
def test_head_observes_wire_body_instead_of_discarding_it(resources, wire_body):
    resource, _, smoke = resources
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        listener.listen()
        smoke.proxy_port = listener.getsockname()[1]

        def respond():
            conn, _ = listener.accept()
            with conn:
                request = conn.recv(4096)
                assert request.startswith(b'HEAD /page.html HTTP/1.1\r\n')
                conn.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 99\r\nConnection: close\r\n\r\n' + wire_body)

        thread = threading.Thread(target=respond)
        thread.start()
        try:
            status, headers, body = resource.wire_head(smoke.proxy_port, '/page.html', {})
        finally:
            thread.join(timeout=3)
        assert status == 200
        assert ('Content-Length', '99') in headers
        assert body == wire_body


def test_transport_failure_does_not_publish_target_or_capability(resources):
    _, support, _ = resources
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    target = '/ocu/f/transport.capability/chat/page.html'
    with pytest.raises(support.Fail, match='transport error') as raised:
        support.http_raw('127.0.0.1', port, 'GET', target)
    assert 'transport.capability' not in str(raised.value)
    assert target not in str(raised.value)


@pytest.mark.parametrize('echo', ['session-canary', 'private.capability'])
def test_issuer_location_exception_does_not_permit_credential_in_query(resources, tmp_path, echo):
    resource, support, smoke = resources
    target = 'page.html?echo=' + echo
    location = '/ocu/f/private.capability/chat/' + target
    headers = [('Location', location), ('Cache-Control', 'no-store'), ('Referrer-Policy', 'no-referrer')]
    with pytest.raises(support.Fail, match='credential'):
        resource.assert_redirect(smoke, 302, headers, b'', 'chat', target)
    (tmp_path / 'body').write_bytes(b'')
    (tmp_path / 'report.json').write_text(
        json.dumps(
            [
                {
                    'entries': [
                        {
                            'calls': [
                                {
                                    'request': {'url': 'http://proxy.invalid/ocu/files/chat/' + target},
                                    'response': {
                                        'status': 302,
                                        'headers': [{'name': name, 'value': value} for name, value in headers],
                                        'body': 'body',
                                    },
                                }
                            ]
                        }
                    ]
                }
            ]
        )
    )
    with pytest.raises(support.Fail, match='credential'):
        support.scan_hurl_report(tmp_path, smoke.token, smoke.secrets)


def test_resource_judge_rejects_forbidden_head_wire_bytes(resources):
    resource, support, smoke = resources
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        listener.listen()
        smoke.proxy_port = listener.getsockname()[1]

        def respond():
            conn, _ = listener.accept()
            with conn:
                conn.recv(4096)
                conn.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 9\r\nConnection: close\r\n\r\nforbidden')

        thread = threading.Thread(target=respond)
        thread.start()
        try:
            judge = resource.ResourceJudge(smoke, None)
            with pytest.raises(support.Fail, match='wire body'):
                judge.request('HEAD', '/page.html', grant=False)
        finally:
            thread.join(timeout=3)


def test_hurl_containment_refuses_missing_response_body_evidence(resources, tmp_path):
    _, support, smoke = resources
    (tmp_path / 'report.json').write_text(
        json.dumps(
            [
                {
                    'entries': [
                        {
                            'calls': [
                                {
                                    'response': {'status': 200, 'headers': [], 'body': 'missing-body'},
                                }
                            ]
                        }
                    ]
                }
            ]
        )
    )
    with pytest.raises(support.Fail, match='body evidence is missing'):
        support.scan_hurl_report(tmp_path, smoke.token, smoke.secrets)


@pytest.mark.parametrize(
    'report_content',
    [
        None,
        '[]',
        '{partial',
        '[{"entries":[{"calls":[{"response":{}}]}]}]',
        '[{"entries":[{"calls":[{"response":{"status":200,"headers":[]}},{"response":{}}]}]}]',
    ],
)
def test_successful_hurl_requires_readable_response_evidence(resources, tmp_path, report_content):
    _, support, smoke = resources
    if report_content is not None:
        (tmp_path / 'report.json').write_text(report_content)
    with pytest.raises(support.Fail, match='report'):
        support.scan_hurl_report(tmp_path, smoke.token, smoke.secrets, require_response=True)
