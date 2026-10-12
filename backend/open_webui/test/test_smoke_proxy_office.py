"""Office credentials stay private across retained and anonymous requests."""

from __future__ import annotations

import json
import logging
import os
import runpy
import stat
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def office(monkeypatch, tmp_path):
    monkeypatch.syspath_prepend(str(ROOT / 'scripts'))
    module = runpy.run_path(str(ROOT / 'scripts/smoke_proxy_office.py'))
    scratch = tmp_path / 'owned-scratch'
    scratch.mkdir(mode=0o700)
    smoke = SimpleNamespace(
        root=ROOT,
        scratch=scratch,
        hurl_vars=scratch / 'hurl.env',
        record=scratch / 'arrivals.jsonl',
        token='internal-office-token-canary',
        office_chat='office-chat',
        origin='http://office.invalid',
        owner_cookie='token=owner-office-cookie-canary',
        foreign_cookie='token=foreign-office-cookie-canary',
        owner_jwt='owner-office-jwt-canary',
        secrets=[],
    )
    base_variables = {
        'proxy_url': 'http://proxy.invalid',
        'origin': 'http://office.invalid',
        'owner_cookie': smoke.owner_cookie,
        'foreign_cookie': smoke.foreign_cookie,
        'owner_jwt': smoke.owner_jwt,
    }
    fd = os.open(smoke.hurl_vars, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        stream.write('\n'.join(f'{name}={value}' for name, value in base_variables.items()) + '\n')
    judge = module['OfficeJudge'](
        smoke,
        ROOT / 'smoke/proxy/office.hurl',
        scratch / 'reports',
        logging.getLogger('smoke-proxy-office-test'),
    )
    return judge, smoke


def test_office_credentials_remain_private_through_retained_and_anonymous_requests(office, monkeypatch):
    judge, smoke = office
    base_bytes = smoke.hurl_vars.read_bytes()
    request_paths = []
    credentials = (
        smoke.owner_cookie,
        smoke.foreign_cookie,
        smoke.owner_jwt,
        smoke.owner_cookie.removeprefix('token='),
        smoke.foreign_cookie.removeprefix('token='),
    )

    def launch(argv, *, cwd, text, capture_output, env):
        # Check exposure before inspecting the private-file transport so RED names the leak.
        if any(secret in argument for secret in credentials for argument in argv):
            raise AssertionError('Office child argv exposed a managed credential')
        variable_files = [Path(argv[index + 1]) for index, arg in enumerate(argv) if arg == '--variables-file']
        dedicated_files = [path for path in variable_files if path != smoke.hurl_vars]
        assert len(dedicated_files) == 1
        request_file = dedicated_files[0]
        assert request_file.parent == smoke.scratch
        assert stat.S_IMODE(smoke.scratch.stat().st_mode) == 0o700
        assert stat.S_IMODE(request_file.stat().st_mode) == 0o600
        assert request_file not in request_paths
        request_paths.append(request_file)
        request_variables = dict(line.split('=', 1) for line in request_file.read_text(encoding='utf-8').splitlines())
        if request_variables.get('office_cookie') != expected_cookie:
            raise AssertionError('Private request file supplied an incorrect current cookie')
        effective_variables = {}
        for variable_file in variable_files:
            effective_variables.update(
                line.split('=', 1) for line in variable_file.read_text(encoding='utf-8').splitlines()
            )
        if effective_variables.get('office_cookie') != expected_cookie:
            raise AssertionError('Effective Office cookie did not preserve the current request value')
        destination = Path(argv[argv.index('--report-json') + 1])
        (destination / 'body.json').write_text('{}', encoding='utf-8')
        (destination / 'report.json').write_text(
            json.dumps([{'entries': [{'calls': [{'response': {'body': 'body.json'}}]}]}]), encoding='utf-8'
        )
        return subprocess.CompletedProcess(argv, 0, '', '')

    monkeypatch.setattr(subprocess, 'run', launch)
    transitions = (
        ('owner', smoke.owner_cookie, {'office_cookie': smoke.owner_cookie}),
        ('retained owner', smoke.owner_cookie, {}),
        ('foreign', smoke.foreign_cookie, {'office_cookie': smoke.foreign_cookie}),
        ('anonymous', '', {'office_cookie': ''}),
        ('retained anonymous', '', {}),
    )
    for label, expected_cookie, variables in transitions:
        judge.request(8, 'GET', '/pending', label, allowed=False, **variables)
        assert not request_paths[-1].exists()
        if smoke.hurl_vars.read_bytes() != base_bytes:
            raise AssertionError('Office request changed the base credential file')
        assert stat.S_IMODE(smoke.hurl_vars.stat().st_mode) == 0o600
    assert len(request_paths) == len(transitions)
    assert len(set(request_paths)) == len(transitions)


@pytest.mark.parametrize('failure', ['nonzero-status', 'launch-error', 'interruption'])
def test_office_request_file_is_removed_without_swallowing_child_failure(office, monkeypatch, failure):
    judge, smoke = office
    support = sys.modules['smoke_proxy_support']
    base_bytes = smoke.hurl_vars.read_bytes()
    request_paths = []
    child_error = None
    if failure == 'launch-error':
        child_error = OSError('synthetic Office launch failure')
    elif failure == 'interruption':
        child_error = KeyboardInterrupt('synthetic Office interruption')

    def launch(argv, *, cwd, text, capture_output, env):
        variable_files = [Path(argv[index + 1]) for index, arg in enumerate(argv) if arg == '--variables-file']
        dedicated_files = [path for path in variable_files if path != smoke.hurl_vars]
        assert len(dedicated_files) == 1
        request_file = dedicated_files[0]
        assert request_file.parent == smoke.scratch
        assert stat.S_IMODE(smoke.scratch.stat().st_mode) == 0o700
        assert stat.S_IMODE(request_file.stat().st_mode) == 0o600
        request_paths.append(request_file)
        if child_error is not None:
            raise child_error
        return subprocess.CompletedProcess(argv, 1, '', '')

    monkeypatch.setattr(subprocess, 'run', launch)
    expected_error = type(child_error) if child_error is not None else support.Fail
    with pytest.raises(expected_error) as raised:
        judge.request(8, 'GET', '/pending', failure, allowed=False, office_cookie=smoke.owner_cookie)
    if child_error is not None and raised.value is not child_error:
        raise AssertionError('Office request replaced the original child failure')
    [request_file] = request_paths
    assert not request_file.exists()
    if smoke.hurl_vars.read_bytes() != base_bytes:
        raise AssertionError('Failed Office request changed the base credential file')
    assert stat.S_IMODE(smoke.hurl_vars.stat().st_mode) == 0o600
