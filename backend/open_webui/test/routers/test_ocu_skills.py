"""TestClient matrix for the uploaded-skill registry routes under /api/v1/ocu/skills."""

from __future__ import annotations

import asyncio
import time
import uuid

import pytest
from open_webui.test.ocu_harness import _delete_user, _insert_user, _session_headers, get_client

ADMIN_PATH = '/api/v1/ocu/skills/admin'
EVERYONE_READ = {'principal_type': 'user', 'principal_id': '*', 'permission': 'read'}


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
    from open_webui.models.access_grants import AccessGrants

    group_a = f'group-a-{uuid.uuid4()}'
    now = int(time.time())

    async def seed():
        await _seed_skill('a', updated_at=now)
        await _seed_skill('b', updated_at=now + 1)
        await AccessGrants.grant_access('ocu_skill', 'a', 'user', '*', 'read')
        await AccessGrants.grant_access('ocu_skill', 'b', 'group', group_a, 'read')
        # Decoy: a native skill grant on the same resource id must not leak into the listing.
        await AccessGrants.grant_access('skill', 'b', 'user', '*', 'read')

    asyncio.run(_wipe_registry())
    asyncio.run(seed())
    yield {'group_a': group_a, 'now': now}
    asyncio.run(AccessGrants.revoke_access('skill', 'b', 'user', '*', 'read'))
    asyncio.run(_wipe_registry())


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
    [('false', 'admin', 404), ('true', 'admin', 200), ('true', 'user', 401)],
    ids=['workspace-off-404', 'workspace-on-positive-control', 'workspace-on-user-401'],
)
def test_fresh_process_admin_listing_follows_workspace_mount(workspace, role, expected):
    from open_webui.test.ocu_office_flag_process import run_office_flag_process

    result = run_office_flag_process(office='true', workspace=workspace, skills_paths=['/admin'], skills_role=role)

    assert result['exit'] == 0, result['stderr'][-2000:]
    assert result['payload']['skills'] == {'/admin': expected}
    assert result['payload']['auth_workspace'] is (workspace == 'true')


def test_fresh_process_without_skills_paths_keeps_the_office_payload():
    from open_webui.test.ocu_office_flag_process import run_office_flag_process

    result = run_office_flag_process(office='true', workspace='false')

    assert result['exit'] == 0, result['stderr'][-2000:]
    assert result['stdout'].splitlines()[-1] == (
        '{"auth_office": true, "auth_workspace": false, "anon_office": false, "anon_workspace": false}'
    )


def test_skills_router_does_not_import_the_workspaces_router():
    from pathlib import Path

    import open_webui.routers.ocu_skills as ocu_skills

    assert 'ocu_workspaces' not in Path(ocu_skills.__file__).read_text()
