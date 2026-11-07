"""TestClient matrix for the uploaded-skill registry routes under /api/v1/ocu/skills."""

from __future__ import annotations

import asyncio
import time
import uuid

import pytest
from open_webui.test.ocu_harness import _delete_user, _insert_user, _session_headers, get_client

SKILLS_PATH = '/api/v1/ocu/skills'
ADMIN_PATH = f'{SKILLS_PATH}/admin'
EVERYONE_READ = {'principal_type': 'user', 'principal_id': '*', 'permission': 'read'}
USER_U = 'user-u'
DECOY_NAMES = ('a', 'b')


async def _wipe_registry() -> None:
    from open_webui.internal.db import get_async_db
    from open_webui.models.access_grants import AccessGrant
    from open_webui.models.ocu_skills import OcuSkill, OcuSkillUserDisable
    from sqlalchemy import delete

    async with get_async_db() as db:
        await db.execute(delete(OcuSkill))
        await db.execute(delete(OcuSkillUserDisable))
        await db.execute(delete(AccessGrant).where(AccessGrant.resource_type == 'ocu_skill'))
        await db.commit()


async def _seed_skill(name: str, *, updated_at: int) -> None:
    from open_webui.internal.db import get_async_db
    from open_webui.models.ocu_skills import OcuSkill

    async with get_async_db() as db:
        db.add(
            OcuSkill(
                name=name,
                description=f'{name} description',
                zip_sha256=f'sha-{name}',
                size=len(name) + 10,
                data=b'PK\x03\x04' + name.encode(),
                created_by='admin-creator',
                created_at=updated_at - 5,
                updated_at=updated_at,
            )
        )
        await db.commit()


@pytest.fixture
def registry():
    asyncio.run(_wipe_registry())
    yield
    asyncio.run(_wipe_registry())


@pytest.fixture
def admin():
    user = asyncio.run(_insert_user(role='admin', prefix='skills-admin'))
    yield user
    asyncio.run(_delete_user(user.id))


@pytest.fixture
def member():
    user = asyncio.run(_insert_user(role='user', prefix='skills-user'))
    yield user
    asyncio.run(_delete_user(user.id))


@pytest.fixture
def seeded_grants():
    from open_webui.internal.db import get_async_db
    from open_webui.models.access_grants import AccessGrants
    from open_webui.models.ocu_skills import OcuSkillUserDisable

    group_a = f'group-a-{uuid.uuid4()}'
    now = int(time.time())

    async def seed():
        await _seed_skill('a', updated_at=now)
        await _seed_skill('b', updated_at=now + 1)
        await AccessGrants.grant_access('ocu_skill', 'a', 'user', '*', 'read')
        # A stored write grant: the admin listing and access route must only ever show read grants.
        await AccessGrants.grant_access('ocu_skill', 'a', 'group', group_a, 'write')
        await AccessGrants.grant_access('ocu_skill', 'b', 'group', group_a, 'read')
        # Decoys: native skill grants on the same resource ids must never be read or written.
        for name in DECOY_NAMES:
            await AccessGrants.grant_access('skill', name, 'user', '*', 'read')
        async with get_async_db() as db:
            db.add_all([OcuSkillUserDisable(user_id=USER_U, skill_name=name) for name in ('a', 'b')])
            await db.commit()

    asyncio.run(_wipe_registry())
    asyncio.run(seed())
    yield {'group_a': group_a, 'now': now}
    for name in DECOY_NAMES:
        asyncio.run(AccessGrants.revoke_access('skill', name, 'user', '*', 'read'))
    asyncio.run(_wipe_registry())


def _grants(resource_type: str, name: str) -> list[tuple[str, str, str]]:
    from open_webui.models.access_grants import AccessGrants

    grants = asyncio.run(AccessGrants.get_grants_by_resource(resource_type, name))
    return sorted((g.principal_type, g.principal_id, g.permission) for g in grants)


def _disables(name: str) -> list[str]:
    from open_webui.internal.db import get_async_db
    from open_webui.models.ocu_skills import OcuSkillUserDisable
    from sqlalchemy import select

    async def query():
        async with get_async_db() as db:
            result = await db.execute(select(OcuSkillUserDisable.user_id).where(OcuSkillUserDisable.skill_name == name))
            return sorted(result.scalars().all())

    return asyncio.run(query())


def _registry_state() -> dict:
    from open_webui.models.ocu_skills import OcuSkills

    names = [skill.name for skill in asyncio.run(OcuSkills.get_all())]
    return {
        'names': names,
        'grants': {name: _grants('ocu_skill', name) for name in ('a', 'b')},
        'disables': {name: _disables(name) for name in ('a', 'b')},
        'decoys': {name: _grants('skill', name) for name in DECOY_NAMES},
    }


def _listing(client, admin) -> dict[str, dict]:
    response = client.get(ADMIN_PATH, headers=_session_headers(admin.id))
    assert response.status_code == 200, response.text
    return {item['name']: item for item in response.json()}


def test_admin_listing_returns_each_skill_with_its_read_grant_set(admin, seeded_grants):
    response = get_client().get(ADMIN_PATH, headers=_session_headers(admin.id))

    assert response.status_code == 200, response.text
    now = seeded_grants['now']
    assert response.json() == [
        {
            'name': 'a',
            'description': 'a description',
            'zip_sha256': 'sha-a',
            'size': 11,
            'created_by': 'admin-creator',
            'updated_at': now,
            'access_grants': [EVERYONE_READ],
        },
        {
            'name': 'b',
            'description': 'b description',
            'zip_sha256': 'sha-b',
            'size': 11,
            'created_by': 'admin-creator',
            'updated_at': now + 1,
            'access_grants': [
                {'principal_type': 'group', 'principal_id': seeded_grants['group_a'], 'permission': 'read'}
            ],
        },
    ]
    assert b'PK\x03\x04' not in response.content


@pytest.mark.usefixtures('registry')
def test_admin_listing_is_empty_without_skills(admin):
    response = get_client().get(ADMIN_PATH, headers=_session_headers(admin.id))

    assert response.status_code == 200
    assert response.json() == []


def test_admin_listing_refuses_user_role_and_no_session(member, seeded_grants):
    client = get_client()

    assert client.get(ADMIN_PATH, headers=_session_headers(member.id)).status_code == 401
    assert client.get(ADMIN_PATH).status_code == 401


@pytest.mark.parametrize(
    'workspace,role,expected',
    [
        ('false', 'admin', {'/admin': 404, 'POST /a/access': 404, 'DELETE /a': 404}),
        ('true', 'admin', {'/admin': 200}),
        ('true', 'user', {'/admin': 401, 'POST /a/access': 401, 'DELETE /a': 401}),
    ],
    ids=['workspace-off-404', 'workspace-on-positive-control', 'workspace-on-user-401'],
)
def test_fresh_process_admin_routes_follow_workspace_mount(workspace, role, expected):
    from open_webui.test.ocu_office_flag_process import run_office_flag_process

    result = run_office_flag_process(office='true', workspace=workspace, skills_paths=list(expected), skills_role=role)

    assert result['exit'] == 0, result['stderr'][-2000:]
    assert result['payload']['skills'] == expected
    assert result['payload']['auth_workspace'] is (workspace == 'true')


def test_fresh_process_without_skills_paths_keeps_the_office_payload():
    from open_webui.test.ocu_office_flag_process import run_office_flag_process

    result = run_office_flag_process(office='true', workspace='false')

    assert result['exit'] == 0, result['stderr'][-2000:]
    assert result['stdout'].splitlines()[-1] == (
        '{"auth_office": true, "auth_workspace": false, "anon_office": false, "anon_workspace": false}'
    )


def _group_read(group_id: str) -> dict:
    return {'principal_type': 'group', 'principal_id': group_id, 'permission': 'read'}


def test_access_update_narrows_to_group_a(admin, seeded_grants):
    client = get_client()
    group_a = seeded_grants['group_a']
    before = _registry_state()
    assert before['grants']['a'] == [('group', group_a, 'write'), ('user', '*', 'read')]
    assert _listing(client, admin)['a']['access_grants'] == [EVERYONE_READ]

    response = client.post(
        f'{SKILLS_PATH}/a/access',
        json={'access_grants': [_group_read(group_a)]},
        headers=_session_headers(admin.id),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        'name': 'a',
        'description': 'a description',
        'zip_sha256': 'sha-a',
        'size': 11,
        'created_by': 'admin-creator',
        'updated_at': seeded_grants['now'],
        'access_grants': [_group_read(group_a)],
    }
    after = _registry_state()
    assert after['grants']['a'] == [('group', group_a, 'read')]
    assert _listing(client, admin)['a'] == response.json()
    assert {**after, 'grants': {**after['grants'], 'a': before['grants']['a']}} == before


def test_access_update_of_unknown_name_is_404_and_writes_nothing(admin, seeded_grants):
    response = get_client().post(
        f'{SKILLS_PATH}/ghost/access',
        json={'access_grants': [EVERYONE_READ]},
        headers=_session_headers(admin.id),
    )

    assert response.status_code == 404
    assert _grants('ocu_skill', 'ghost') == []


@pytest.mark.parametrize('case', ['three-grants', 'empty'])
def test_access_update_replaces_the_grant_set(admin, seeded_grants, case):
    group_a = seeded_grants['group_a']
    grants = {
        'three-grants': [EVERYONE_READ, _group_read(group_a), {**EVERYONE_READ, 'principal_id': USER_U}],
        'empty': [],
    }[case]

    response = get_client().post(
        f'{SKILLS_PATH}/a/access', json={'access_grants': grants}, headers=_session_headers(admin.id)
    )

    assert response.status_code == 200, response.text
    expected = sorted((g['principal_type'], g['principal_id'], g['permission']) for g in grants)
    assert _grants('ocu_skill', 'a') == expected
    assert sorted(response.json()['access_grants'], key=lambda g: tuple(g.values())) == sorted(
        grants, key=lambda g: tuple(g.values())
    )


@pytest.mark.parametrize(
    'invalid',
    [
        {'principal_type': 'group', 'principal_id': 'GROUP_A', 'permission': 'write'},
        {'principal_type': 'anyone', 'principal_id': '*', 'permission': 'read'},
        {'principal_type': 'user', 'principal_id': '', 'permission': 'read'},
    ],
    ids=['write', 'anyone', 'empty-principal-id'],
)
def test_access_update_rejects_a_grant_that_cannot_take_effect(admin, seeded_grants, invalid):
    group_a = seeded_grants['group_a']
    invalid = {k: group_a if v == 'GROUP_A' else v for k, v in invalid.items()}
    before = _registry_state()

    response = get_client().post(
        f'{SKILLS_PATH}/a/access',
        json={'access_grants': [_group_read(group_a), invalid]},
        headers=_session_headers(admin.id),
    )

    assert response.status_code == 422, response.text
    assert _registry_state() == before


def test_delete_removes_only_that_skill_with_its_grants_and_disables(admin, seeded_grants):
    from open_webui.models.ocu_skills import OcuSkills

    client = get_client()
    before = _registry_state()

    response = client.delete(f'{SKILLS_PATH}/a', headers=_session_headers(admin.id))

    assert response.status_code == 200, response.text
    assert response.json() is True
    assert asyncio.run(OcuSkills.get_by_name('a')) is None
    assert list(_listing(client, admin)) == ['b']
    assert _registry_state() == {
        'names': ['b'],
        'grants': {'a': [], 'b': before['grants']['b']},
        'disables': {'a': [], 'b': [USER_U]},
        'decoys': before['decoys'],
    }


def test_delete_of_unknown_name_is_404_and_purges_orphans(admin, seeded_grants):
    from open_webui.internal.db import get_async_db
    from open_webui.models.access_grants import AccessGrants
    from open_webui.models.ocu_skills import OcuSkillUserDisable

    async def seed_orphans():
        await AccessGrants.grant_access('ocu_skill', 'ghost', 'group', seeded_grants['group_a'], 'read')
        async with get_async_db() as db:
            db.add(OcuSkillUserDisable(user_id=USER_U, skill_name='ghost'))
            await db.commit()

    asyncio.run(seed_orphans())
    before = _registry_state()

    response = get_client().delete(f'{SKILLS_PATH}/ghost', headers=_session_headers(admin.id))

    assert response.status_code == 404
    assert (_grants('ocu_skill', 'ghost'), _disables('ghost')) == ([], [])
    assert _registry_state() == before


ADMIN_WRITES = {
    'access': ('POST', '/a/access', {'access_grants': [EVERYONE_READ]}),
    # The admin dependency runs before body validation: a non-admin learns nothing about the form.
    'access-invalid-body': ('POST', '/a/access', {'access_grants': [{**EVERYONE_READ, 'permission': 'write'}]}),
    'delete': ('DELETE', '/a', None),
}


@pytest.mark.parametrize('route', list(ADMIN_WRITES))
@pytest.mark.parametrize('caller', ['user-role', 'no-session'])
def test_admin_writes_refuse_non_admins_and_change_nothing(member, seeded_grants, route, caller):
    method, path, body = ADMIN_WRITES[route]
    headers = _session_headers(member.id) if caller == 'user-role' else {}
    before = _registry_state()

    response = get_client().request(method, f'{SKILLS_PATH}{path}', json=body, headers=headers)

    assert response.status_code == 401
    assert _registry_state() == before


def test_skills_router_does_not_import_the_workspaces_router():
    from pathlib import Path

    import open_webui.routers.ocu_skills as ocu_skills

    assert 'ocu_workspaces' not in Path(ocu_skills.__file__).read_text()
