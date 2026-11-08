"""TestClient matrix for the per-user uploaded-skill routes: GET / and POST /{name}/toggle."""

from __future__ import annotations

import asyncio
import time

import pytest
from open_webui.test.ocu_harness import _delete_user, _insert_user, _SelectRecorder, _session_headers, get_client
from open_webui.test.routers.test_ocu_skills import (
    SKILLS_PATH,
    _disables,
    _registry_state,
    _seed_disable,
    _seed_skill,
    _wipe_registry,
)

MATRIX = ('hidden', 'open', 'team')


@pytest.fixture
def user_matrix():
    """Skills open (user:* read), team (group A read) and hidden (no grant); M in group A, N and admin X not."""
    from open_webui.models.access_grants import AccessGrants
    from open_webui.models.groups import GroupForm, Groups

    async def seed():
        users = {
            'M': await _insert_user(role='user', prefix='skills-m'),
            'N': await _insert_user(role='user', prefix='skills-n'),
            'X': await _insert_user(role='admin', prefix='skills-x'),
            'P': await _insert_user(role='pending', prefix='skills-p'),
        }
        group = await Groups.insert_new_group(users['X'].id, GroupForm(name='skills-group-a', description='A'))
        assert group is not None and await Groups.add_users_to_group(group.id, [users['M'].id]) is not None
        for name in MATRIX:
            await _seed_skill(name, updated_at=int(time.time()))
        await AccessGrants.grant_access('ocu_skill', 'open', 'user', '*', 'read')
        await AccessGrants.grant_access('ocu_skill', 'team', 'group', group.id, 'read')
        return users, group

    asyncio.run(_wipe_registry())
    users, group = asyncio.run(seed())
    yield users
    for user in users.values():
        asyncio.run(_delete_user(user.id))
    asyncio.run(Groups.delete_group_by_id(group.id))
    asyncio.run(_wipe_registry())


def _user_item(name: str, enabled: bool = True) -> dict:
    return {'name': name, 'description': f'{name} description', 'enabled': enabled}


def _user_listing(user) -> list[dict]:
    response = get_client().get(f'{SKILLS_PATH}/', headers=_session_headers(user.id))
    assert response.status_code == 200, response.text
    assert b'PK\x03\x04' not in response.content
    return response.json()


def _toggle(user, name: str, enabled):
    path, headers = f'{SKILLS_PATH}/{name}/toggle', _session_headers(user.id)
    return get_client().post(path, json={'enabled': enabled}, headers=headers)


def _set_bypass(monkeypatch, bypass: bool) -> None:
    import open_webui.routers.ocu_skills as ocu_skills

    monkeypatch.setattr(ocu_skills, 'BYPASS_ADMIN_ACCESS_CONTROL', bypass)


@pytest.mark.parametrize(
    'caller,bypass,expected',
    [
        ('M', True, ['open', 'team']),
        ('N', True, ['open']),
        ('X', True, ['hidden', 'open', 'team']),
        ('X', False, ['open']),
    ],
    ids=['member', 'non-member', 'admin-bypass-on', 'admin-bypass-off'],
)
def test_user_listing_shows_exactly_the_readable_skills(user_matrix, monkeypatch, caller, bypass, expected):
    _set_bypass(monkeypatch, bypass)

    with _SelectRecorder() as recorder:
        listing = _user_listing(user_matrix[caller])

    assert listing == [_user_item(name) for name in expected]
    recorder.assert_no_skill_data_select()


def test_disable_affects_only_the_caller_and_enable_removes_the_row(user_matrix):
    m, n = user_matrix['M'], user_matrix['N']

    with _SelectRecorder() as recorder:
        response = _toggle(m, 'open', False)

    assert (response.status_code, response.json()) == (200, _user_item('open', False))
    recorder.assert_no_skill_data_select()
    assert _user_listing(m) == [_user_item('open', False), _user_item('team')]
    assert _user_listing(n) == [_user_item('open')]
    assert _disables('open') == [m.id]
    assert (_toggle(m, 'open', False).status_code, _disables('open')) == (200, [m.id])

    asyncio.run(_seed_disable('open', user_id=n.id))
    for _ in range(2):
        response = _toggle(m, 'open', True)
        assert (response.status_code, response.json()) == (200, _user_item('open'))
        assert _disables('open') == [n.id]
    assert _user_listing(m) == [_user_item('open'), _user_item('team')]
    assert _user_listing(n) == [_user_item('open', False)]


def test_disable_of_an_existing_row_inserts_and_returns_200(user_matrix):
    m = user_matrix['M']
    asyncio.run(_seed_disable('open', user_id=m.id))

    with _SelectRecorder() as recorder:
        response = _toggle(m, 'open', False)

    assert (response.status_code, response.json()) == (200, _user_item('open', False))
    assert any(s.lstrip().upper().startswith('INSERT INTO OCU_SKILL_USER_DISABLE') for s in recorder.statements)
    assert _disables('open') == [m.id]


def test_toggle_without_read_access_is_404_with_identical_bodies(user_matrix):
    n = user_matrix['N']
    before = _registry_state((*MATRIX, 'ghost'))

    ungranted, unknown = _toggle(n, 'team', False), _toggle(n, 'ghost', False)

    assert (ungranted.status_code, unknown.status_code) == (404, 404)
    assert ungranted.content == unknown.content
    assert _registry_state((*MATRIX, 'ghost')) == before


@pytest.mark.parametrize('bypass,expected,disables', [(False, 404, []), (True, 200, ['X'])], ids=['off', 'on'])
def test_admin_toggle_of_a_group_skill_follows_bypass(user_matrix, monkeypatch, bypass, expected, disables):
    _set_bypass(monkeypatch, bypass)

    response = _toggle(user_matrix['X'], 'team', False)

    assert response.status_code == expected, response.text
    assert _disables('team') == [user_matrix[key].id for key in disables]


@pytest.mark.parametrize('enabled', ['false', 0, None, 'missing'])
def test_toggle_rejects_a_non_boolean_enabled(user_matrix, enabled):
    before = _registry_state(MATRIX)
    body = {} if enabled == 'missing' else {'enabled': enabled}

    response = get_client().post(f'{SKILLS_PATH}/open/toggle', json=body, headers=_session_headers(user_matrix['M'].id))

    assert response.status_code == 422, response.text
    assert _registry_state(MATRIX) == before


@pytest.mark.parametrize('route', ['GET /', 'POST /open/toggle'])
@pytest.mark.parametrize('caller', ['no-session', 'pending'])
def test_user_routes_refuse_no_session_and_pending(user_matrix, route, caller):
    method, path = route.split(' ')
    headers = _session_headers(user_matrix['P'].id) if caller == 'pending' else {}
    before = _registry_state(MATRIX)

    response = get_client().request(method, f'{SKILLS_PATH}{path}', headers=headers, json={'enabled': False})

    assert response.status_code == 401
    assert _registry_state(MATRIX) == before
