"""TestClient matrix for the OCU-facing internal registry routes: user-config and download."""

from __future__ import annotations

import hashlib
import uuid
from unittest.mock import patch

import pytest
from open_webui.test.ocu_harness import _SelectRecorder, _session_headers, get_client
from open_webui.test.routers import test_ocu_skill_user_routes, test_ocu_skills
from open_webui.test.routers.test_ocu_skill_user_routes import MATRIX, _set_bypass, _toggle, _user_listing
from open_webui.test.routers.test_ocu_skills import (
    DESCRIPTION_B,
    INVOICE,
    SKILLS_PATH,
    _registry_state,
    _skill_zip_for,
    _upload,
)

# Shared fixtures, bound by name so pytest resolves them here; their modules own their definitions.
user_matrix = test_ocu_skill_user_routes.user_matrix
admin = test_ocu_skills.admin
stored_invoice = test_ocu_skills.stored_invoice

INTERNAL_PATH = f'{SKILLS_PATH}/api/internal'
KEY_HEADER = 'X-Internal-Api-Key'


@pytest.fixture
def internal_key(monkeypatch):
    # Set after the app import: the routes must read the token per request, not at import.
    key = f'internal-{uuid.uuid4()}'
    monkeypatch.setenv('OCU_INTERNAL_TOKEN', key)
    return key


def _user_config_path(email: str) -> str:
    return f'{INTERNAL_PATH}/user-config/{email}'


def _download_path(name: str) -> str:
    return f'{INTERNAL_PATH}/skills/{name}/download'


def _user_config(email: str, key: str) -> dict:
    response = get_client().get(_user_config_path(email), headers={KEY_HEADER: key})
    assert response.status_code == 200, response.text
    assert b'PK\x03\x04' not in response.content
    return response.json()


def _config_names(email: str, key: str) -> list[str]:
    return [item['name'] for item in _user_config(email, key)['enabled_skills']]


def _download(name: str, key: str):
    return get_client().get(_download_path(name), headers={KEY_HEADER: key})


def _item(name: str, sha: str | None = None) -> dict:
    return {
        'name': name,
        'description': f'{name} description',
        'category': 'user',
        'zip_sha256': sha or f'sha-{name}',
    }


REJECTIONS = [
    'no-header',
    'wrong-value',
    'case-differs',
    'non-ascii',
    'admin-bearer-only',
    'admin-cookie-only',
    'empty-token-empty-header',
    'unset-token-no-header',
]


def _rejected_request(monkeypatch, case: str, key: str, admin_id: str) -> dict:
    """Headers for one rejection case; adjusts the configured token for the last two."""
    session = _session_headers(admin_id)
    if case == 'empty-token-empty-header':
        monkeypatch.setenv('OCU_INTERNAL_TOKEN', '')
        return {KEY_HEADER: ''}
    if case == 'unset-token-no-header':
        monkeypatch.delenv('OCU_INTERNAL_TOKEN', raising=False)
        return {}
    return {
        'no-header': {},
        'wrong-value': {KEY_HEADER: f'{key}-wrong'},
        'case-differs': {KEY_HEADER: key.upper()},
        # Starlette decodes header bytes as latin-1; a str compare_digest would raise TypeError (500).
        'non-ascii': {KEY_HEADER: 'é'.encode('latin-1')},
        'admin-bearer-only': session,
        'admin-cookie-only': {'Cookie': f'token={session["Authorization"].removeprefix("Bearer ")}'},
    }[case]


@pytest.mark.parametrize('route', ['user-config', 'download-existing', 'download-unknown'])
@pytest.mark.parametrize('case', REJECTIONS)
def test_internal_routes_refuse_every_request_without_the_key(user_matrix, internal_key, monkeypatch, route, case):
    headers = _rejected_request(monkeypatch, case, internal_key, user_matrix['X'].id)
    path = {
        'user-config': _user_config_path(user_matrix['M'].email),
        'download-existing': _download_path('open'),
        'download-unknown': _download_path('ghost'),
    }[route]
    before = _registry_state(MATRIX)

    with _SelectRecorder() as recorder:
        response = get_client().get(path, headers=headers)

    # Same 401 for an existing and an unknown name: a bad key learns nothing, and no query ran.
    assert (response.status_code, response.content) == (401, b'')
    assert recorder.statements == []
    assert _registry_state(MATRIX) == before


def test_internal_key_is_read_at_request_time(user_matrix, internal_key, monkeypatch):
    email = user_matrix['M'].email
    assert _config_names(email, internal_key) == ['open', 'team']

    rotated = f'rotated-{uuid.uuid4()}'
    monkeypatch.setenv('OCU_INTERNAL_TOKEN', rotated)

    stale = get_client().get(_user_config_path(email), headers={KEY_HEADER: internal_key})
    assert (stale.status_code, stale.content) == (401, b'')
    assert _config_names(email, rotated) == ['open', 'team']


def test_user_config_returns_the_ocu_contract_shape(user_matrix, internal_key):
    email = user_matrix['M'].email

    with _SelectRecorder() as recorder:
        config = _user_config(email, internal_key)

    assert config == {'email': email, 'enabled_skills': [_item('open'), _item('team')]}
    recorder.assert_no_skill_data_select()


def test_user_config_excludes_the_callers_disabled_skill(user_matrix, internal_key):
    m = user_matrix['M']

    assert _toggle(m, 'open', False).status_code == 200

    assert _user_config(m.email, internal_key)['enabled_skills'] == [_item('team')]
    assert _user_listing(m) == [
        {'name': 'open', 'description': 'open description', 'enabled': False},
        {'name': 'team', 'description': 'team description', 'enabled': True},
    ]
    assert _config_names(user_matrix['N'].email, internal_key) == ['open']


@pytest.mark.parametrize(
    'caller,bypass,expected',
    [
        ('M', True, ['open', 'team']),
        ('M', False, ['open', 'team']),
        ('N', True, ['open']),
        ('N', False, ['open']),
        ('X', True, ['hidden', 'open', 'team']),
        ('X', False, ['open']),
        # No role filter: a pending user gets the wildcard grant, and bypass is admin-only.
        ('P', True, ['open']),
    ],
)
def test_user_config_matches_the_users_own_enabled_listing(
    user_matrix, internal_key, monkeypatch, caller, bypass, expected
):
    _set_bypass(monkeypatch, bypass)
    user = user_matrix[caller]

    names = _config_names(user.email, internal_key)

    assert names == expected
    if caller != 'P':
        assert names == [item['name'] for item in _user_listing(user) if item['enabled']]


def test_user_config_email_lookup_is_case_insensitive_and_echoes_the_path(user_matrix, internal_key):
    upper = user_matrix['M'].email.upper()
    assert upper != user_matrix['M'].email

    config = _user_config(upper, internal_key)

    assert config == {'email': upper, 'enabled_skills': [_item('open'), _item('team')]}


def test_user_config_of_an_unknown_email_is_an_empty_list(user_matrix, internal_key):
    assert _user_config('nobody@harness.local', internal_key) == {'email': 'nobody@harness.local', 'enabled_skills': []}


def test_download_returns_the_bytes_user_config_advertises(admin, stored_invoice, internal_key, monkeypatch):
    # stored_invoice is narrowed to a group the admin is not in: bypass makes it the admin's.
    _set_bypass(monkeypatch, True)
    [advertised] = _user_config(admin.email, internal_key)['enabled_skills']

    response = _download(INVOICE, internal_key)

    assert response.status_code == 200
    assert response.headers['content-type'].startswith('application/zip')
    assert response.content == stored_invoice['body']
    assert advertised == {
        'name': INVOICE,
        'description': f'{INVOICE} skill',
        'category': 'user',
        'zip_sha256': hashlib.sha256(response.content).hexdigest(),
    }


def test_download_after_a_failed_replace_returns_the_previous_bytes(admin, stored_invoice, internal_key, monkeypatch):
    from sqlalchemy.ext.asyncio import AsyncSession

    _set_bypass(monkeypatch, True)
    [before] = _user_config(admin.email, internal_key)['enabled_skills']

    async def failing_commit(self):
        raise RuntimeError('injected commit failure')

    with patch.object(AsyncSession, 'commit', failing_commit):
        with pytest.raises(RuntimeError, match='injected commit failure'):
            _upload(admin, _skill_zip_for(INVOICE, description=DESCRIPTION_B))

    response = _download(INVOICE, internal_key)
    assert response.status_code == 200
    assert response.content == stored_invoice['body']
    assert hashlib.sha256(response.content).hexdigest() == before['zip_sha256']
    assert _user_config(admin.email, internal_key)['enabled_skills'] == [before]


def test_download_of_an_unknown_or_deleted_skill_is_404(user_matrix, internal_key, monkeypatch):
    x = user_matrix['X']
    assert _download('open', internal_key).status_code == 200

    deleted = get_client().delete(f'{SKILLS_PATH}/open', headers=_session_headers(x.id))
    assert deleted.status_code == 200, deleted.text

    for name in ('open', 'ghost'):
        response = _download(name, internal_key)
        assert response.status_code == 404
        assert response.headers['content-type'].startswith('application/json')
    for bypass in (True, False):
        _set_bypass(monkeypatch, bypass)
        for user in user_matrix.values():
            assert 'open' not in _config_names(user.email, internal_key)


@pytest.mark.parametrize(
    'workspace,expected',
    [
        ('false', {'/api/internal/user-config/nobody@harness.local': 404, '/api/internal/skills/a/download': 404}),
        ('true', {'/api/internal/user-config/nobody@harness.local': 200}),
    ],
    ids=['workspace-off-404', 'workspace-on-positive-control'],
)
def test_fresh_process_internal_routes_follow_workspace_mount(workspace, expected):
    from open_webui.test.ocu_office_flag_process import run_office_flag_process

    key = f'fresh-{uuid.uuid4()}'
    result = run_office_flag_process(office='true', workspace=workspace, skills_paths=list(expected), skills_key=key)

    assert result['exit'] == 0, result['stderr'][-2000:]
    assert result['payload']['skills'] == expected
    assert key not in result['stdout'] + result['stderr']
