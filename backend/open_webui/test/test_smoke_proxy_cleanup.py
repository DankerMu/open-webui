"""Owned smoke data cleanup continues failures without widening deletion authority."""

from __future__ import annotations

import io
import json
import logging
import os
import re
import runpy
import signal
import subprocess
import sys
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
OWNER_QUERY = '/api/v1/users/?query=owner%2Bcurrent%40harness.local'
FOREIGN_QUERY = '/api/v1/users/?query=foreign%2Bcurrent%40harness.local'
OWNED_REQUESTS = [
    ('DELETE', '/api/v1/chats/chat-current'),
    ('DELETE', '/api/v1/chats/foreign-chat-current'),
    ('DELETE', '/api/v1/chats/office-chat-current'),
    ('DELETE', '/api/v1/users/owner-current'),
    ('DELETE', '/api/v1/users/foreign-current'),
    ('GET', OWNER_QUERY),
    ('DELETE', '/api/v1/users/owner-fallback-first'),
    ('DELETE', '/api/v1/users/owner-fallback-second'),
    ('GET', FOREIGN_QUERY),
    ('DELETE', '/api/v1/users/foreign-fallback-first'),
    ('DELETE', '/api/v1/users/foreign-fallback-second'),
]
PRIVATE_DETAIL = 'private response and transport detail'


@pytest.fixture
def cleanup(monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT / 'scripts'))
    module = runpy.run_path(str(ROOT / 'scripts/smoke-proxy.py'))
    support = sys.modules['smoke_proxy_support']
    smoke = module['Smoke']()
    smoke.webui = 'http://cleanup.invalid'
    smoke.admin_cookie = 'token=private-admin-token'
    smoke.created = {
        'chat': 'chat-current',
        'foreign_chat': 'foreign-chat-current',
        'office_chat': 'office-chat-current',
        'owner': 'owner-current',
        'foreign': 'foreign-current',
        'unrelated': 'unowned-user',
    }
    smoke.owner_email_raw = 'owner+current@harness.local'
    smoke.foreign_email_raw = 'foreign+current@harness.local'
    requests = []
    faults = {}
    responses = {}
    for query, email, prefix in (
        (OWNER_QUERY, smoke.owner_email_raw, 'owner'),
        (FOREIGN_QUERY, smoke.foreign_email_raw, 'foreign'),
    ):
        responses[('GET', query)] = {
            'users': [
                {'id': f'{prefix}-fallback-first', 'email': email},
                {'id': 'sentinel-user', 'email': module['SENTINEL_EMAIL']},
                {'id': 'partial-email-user', 'email': email + '.unowned'},
                {'id': 'other-run-user', 'email': email.replace('current', 'previous')},
                {'id': '', 'email': email},
                {'id': f'{prefix}-fallback-second', 'email': email},
            ]
        }

    def urlopen(request, timeout):
        key = (request.get_method(), request.selector)
        requests.append(key)
        status = faults.get(key, 200)
        if isinstance(status, Exception):
            raise status
        raw = json.dumps(responses.get(key, {'detail': PRIVATE_DETAIL})).encode()
        if status >= 400:
            raise urllib.error.HTTPError(request.full_url, status, PRIVATE_DETAIL, {}, io.BytesIO(raw))
        response = io.BytesIO(raw)
        response.status = status
        response.headers = {}
        return response

    monkeypatch.setattr(urllib.request, 'urlopen', urlopen)
    return smoke, support, requests, faults, responses


def assert_redacted(error, smoke):
    message = str(error)
    for secret in (
        smoke.webui,
        smoke.admin_cookie,
        'private-admin-token',
        smoke.owner_email_raw,
        smoke.foreign_email_raw,
        'sentinel-user',
        'unowned-user',
        PRIVATE_DETAIL,
        *smoke.created.values(),
        'owner-fallback-first',
        'owner-fallback-second',
        'foreign-fallback-first',
        'foreign-fallback-second',
        '/api/v1/',
    ):
        assert secret not in message
    return message


@pytest.mark.parametrize('fault', [500, urllib.error.URLError(PRIVATE_DETAIL)], ids=['http-500', 'transport'])
@pytest.mark.parametrize(
    'target,kind',
    [
        (('DELETE', '/api/v1/chats/chat-current'), 'chat delete'),
        (('DELETE', '/api/v1/users/owner-current'), 'user delete'),
        (('GET', OWNER_QUERY), 'email lookup'),
        (('DELETE', '/api/v1/users/owner-fallback-first'), 'user delete'),
    ],
    ids=['first-chat', 'known-user', 'fallback-lookup', 'fallback-result'],
)
def test_failed_owned_operation_does_not_skip_remaining_targets(cleanup, target, kind, fault):
    smoke, support, requests, faults, _ = cleanup
    faults[target] = fault
    with pytest.raises(support.Fail) as raised:
        smoke.cleanup_data()
    expected = list(OWNED_REQUESTS)
    if target == ('GET', OWNER_QUERY):
        expected.remove(('DELETE', '/api/v1/users/owner-fallback-first'))
        expected.remove(('DELETE', '/api/v1/users/owner-fallback-second'))
    assert Counter(requests) == Counter(expected)
    message = assert_redacted(raised.value, smoke)
    assert kind in message
    assert ('HTTP 500' if fault == 500 else 'URLError') in message


def test_multiple_failures_are_reported_in_one_redacted_aggregate(cleanup):
    smoke, support, requests, faults, _ = cleanup
    faults.update(
        {
            ('DELETE', '/api/v1/chats/chat-current'): 500,
            ('DELETE', '/api/v1/users/owner-current'): urllib.error.URLError(PRIVATE_DETAIL),
            ('DELETE', '/api/v1/users/owner-fallback-first'): 503,
            ('GET', FOREIGN_QUERY): 502,
        }
    )
    with pytest.raises(support.Fail) as raised:
        smoke.cleanup_data()
    expected = list(OWNED_REQUESTS)
    expected.remove(('DELETE', '/api/v1/users/foreign-fallback-first'))
    expected.remove(('DELETE', '/api/v1/users/foreign-fallback-second'))
    assert Counter(requests) == Counter(expected)
    message = assert_redacted(raised.value, smoke)
    failures = re.findall(r'(chat delete|user delete|email lookup) (HTTP \d+|URLError)', message)
    assert Counter(failures) == Counter(
        [
            ('chat delete', 'HTTP 500'),
            ('user delete', 'URLError'),
            ('user delete', 'HTTP 503'),
            ('email lookup', 'HTTP 502'),
        ]
    )


@pytest.mark.parametrize('status', [200, 204, 404])
def test_successful_deletes_only_touch_recorded_ids_and_exact_emails(cleanup, status):
    smoke, _, requests, faults, _ = cleanup
    faults.update({key: status for key in OWNED_REQUESTS if key[0] == 'DELETE'})
    smoke.cleanup_data()
    assert Counter(requests) == Counter(OWNED_REQUESTS)


def test_missing_email_lookup_does_not_prevent_other_email_cleanup(cleanup):
    smoke, _, requests, faults, responses = cleanup
    faults[('GET', OWNER_QUERY)] = 404
    responses[('GET', OWNER_QUERY)] = {}
    smoke.cleanup_data()
    expected = list(OWNED_REQUESTS)
    expected.remove(('DELETE', '/api/v1/users/owner-fallback-first'))
    expected.remove(('DELETE', '/api/v1/users/owner-fallback-second'))
    assert Counter(requests) == Counter(expected)


def test_without_admin_cookie_cleanup_makes_no_data_requests(cleanup):
    smoke, _, requests, _, _ = cleanup
    smoke.admin_cookie = ''
    smoke.cleanup_data()
    assert requests == []


@pytest.mark.parametrize('code,expected_code', [(0, 1), (1, 1), (130, 130)])
@pytest.mark.parametrize('fault', [500, urllib.error.URLError(PRIVATE_DETAIL)], ids=['http-500', 'transport'])
def test_cleanup_failure_preserves_verdict_process_sentinel_and_scratch_cleanup(
    cleanup, tmp_path, caplog, code, expected_code, fault, monkeypatch
):
    smoke, support, requests, faults, responses = cleanup
    scratch = tmp_path / 'owned-scratch'
    scratch.mkdir()
    (scratch / 'credentials').write_text('private-admin-token')
    smoke.scratch = scratch
    smoke.sentinel_id = 'sentinel-user'
    sentinel_request = ('GET', '/api/v1/users/sentinel-user')
    responses[sentinel_request] = {
        'id': 'sentinel-user',
        'email': 'proxy-owner-preexisting-sentinel@harness.local',
    }
    faults[('DELETE', '/api/v1/chats/chat-current')] = fault
    proc = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'], start_new_session=True)
    smoke.owned.append(proc.pid)
    urlopen = urllib.request.urlopen

    def observe_resource_order(request, timeout):
        assert proc.poll() is not None
        assert scratch.exists()
        return urlopen(request, timeout)

    monkeypatch.setattr(urllib.request, 'urlopen', observe_resource_order)
    try:
        with caplog.at_level(logging.ERROR, logger='smoke-proxy-cleanup-test'):
            result = support._finish_owned_cleanup(smoke, logging.getLogger('smoke-proxy-cleanup-test'), code)
        assert result == expected_code
        assert Counter(requests) == Counter([*OWNED_REQUESTS, sentinel_request])
        assert requests[-1] == sentinel_request
        assert proc.poll() is not None
        assert smoke.owned == []
        assert not scratch.exists()
        records = [row for row in caplog.records if row.name == 'smoke-proxy-cleanup-test']
        assert len(records) == 1
        assert records[0].exc_info is None
        message = assert_redacted(records[0].getMessage(), smoke)
        assert 'chat delete' in message
        assert ('HTTP 500' if fault == 500 else 'URLError') in message
    finally:
        if proc.poll() is None:
            os.killpg(proc.pid, signal.SIGKILL)
        proc.wait(timeout=5)
