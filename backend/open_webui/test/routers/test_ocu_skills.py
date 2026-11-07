"""TestClient matrix for the uploaded-skill registry routes under /api/v1/ocu/skills."""

from __future__ import annotations

import asyncio
import hashlib
import re
import time
import uuid
from unittest.mock import patch

import pytest
from open_webui.test.ocu_harness import _delete_user, _insert_user, _session_headers, get_client, skill_zip

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


def _registry_state(names: tuple[str, ...] = ('a', 'b')) -> dict:
    from open_webui.models.ocu_skills import OcuSkills

    return {
        'names': [skill.name for skill in asyncio.run(OcuSkills.get_all())],
        'grants': {name: _grants('ocu_skill', name) for name in names},
        'disables': {name: _disables(name) for name in names},
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
        ('false', 'admin', {'/admin': 404, 'POST /a/access': 404, 'DELETE /a': 404, 'POST /upload': 404}),
        ('true', 'admin', {'/admin': 200}),
        ('true', 'user', {'/admin': 401, 'POST /a/access': 401, 'DELETE /a': 401, 'POST /upload': 401}),
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


UPLOAD_PATH = f'{SKILLS_PATH}/upload'
INVOICE = 'invoice-builder'
MB = 1024 * 1024
DESCRIPTION_B = 'invoice-builder skill B'


def _skill_zip_for(name: str, *extra, description: str | None = None) -> bytes:
    skill_md = f'---\nname: {name}\ndescription: {description or f"{name} skill"}\n---\nBody\n'
    return skill_zip([(f'{name}/SKILL.md', skill_md), (f'{name}/run.py', 'print(1)'), *extra])


def _upload(user, body: bytes):
    headers = {**_session_headers(user.id), 'Content-Type': 'application/zip'}
    return get_client().post(UPLOAD_PATH, content=body, headers=headers)


async def _seed_disable(name: str) -> None:
    from open_webui.internal.db import get_async_db
    from open_webui.models.ocu_skills import OcuSkillUserDisable

    async with get_async_db() as db:
        db.add(OcuSkillUserDisable(user_id=USER_U, skill_name=name))
        await db.commit()


async def _seed_orphans(name: str, group_id: str) -> None:
    from open_webui.models.access_grants import AccessGrants

    await AccessGrants.grant_access('ocu_skill', name, 'group', group_id, 'read')
    await _seed_disable(name)


@pytest.mark.usefixtures('registry')
def test_first_upload_creates_the_skill_with_one_wildcard_grant(admin):
    from open_webui.models.ocu_skills import OcuSkills

    body = _skill_zip_for(INVOICE)

    response = _upload(admin, body)

    assert response.status_code == 200, response.text
    sha = hashlib.sha256(body).hexdigest()
    assert response.json() == {'name': INVOICE, 'description': f'{INVOICE} skill', 'zip_sha256': sha, 'size': len(body)}
    listed = _listing(get_client(), admin)[INVOICE]
    assert (listed['created_by'], listed['zip_sha256'], listed['access_grants']) == (admin.id, sha, [EVERYONE_READ])
    assert asyncio.run(OcuSkills.get_by_name(INVOICE)).data == body


@pytest.mark.usefixtures('registry')
def test_first_upload_replaces_orphaned_grants_and_disables(admin):
    asyncio.run(_seed_orphans(INVOICE, f'group-a-{uuid.uuid4()}'))

    response = _upload(admin, _skill_zip_for(INVOICE))

    assert response.status_code == 200, response.text
    assert _grants('ocu_skill', INVOICE) == [('user', '*', 'read')]
    assert _disables(INVOICE) == []


@pytest.fixture
def stored_invoice(admin):
    """ZIP A uploaded by `admin`, narrowed to group A read, and disabled by user U."""
    from open_webui.models.ocu_skills import OcuSkills

    asyncio.run(_wipe_registry())
    body = _skill_zip_for(INVOICE)
    assert _upload(admin, body).status_code == 200
    group_a = f'group-a-{uuid.uuid4()}'
    narrowed = get_client().post(
        f'{SKILLS_PATH}/{INVOICE}/access',
        json={'access_grants': [_group_read(group_a)]},
        headers=_session_headers(admin.id),
    )
    assert narrowed.status_code == 200, narrowed.text
    asyncio.run(_seed_disable(INVOICE))
    state = _registry_state((INVOICE,))
    assert state['grants'][INVOICE] == [('group', group_a, 'read')] and state['disables'][INVOICE] == [USER_U]
    yield {'body': body, 'group_a': group_a, 'skill': asyncio.run(OcuSkills.get_by_name(INVOICE)), 'state': state}
    asyncio.run(_wipe_registry())


@pytest.fixture
def second_admin():
    user = asyncio.run(_insert_user(role='admin', prefix='skills-admin-b'))
    yield user
    asyncio.run(_delete_user(user.id))


def test_replace_keeps_narrowed_grants_and_disables(admin, second_admin, stored_invoice):
    from open_webui.models.ocu_skills import OcuSkills

    a = stored_invoice['skill']
    body = _skill_zip_for(INVOICE, (f'{INVOICE}/notes.md', 'B'), description=DESCRIPTION_B)
    assert body != stored_invoice['body']

    response = _upload(second_admin, body)

    assert response.status_code == 200, response.text
    sha = hashlib.sha256(body).hexdigest()
    assert response.json() == {'name': INVOICE, 'description': DESCRIPTION_B, 'zip_sha256': sha, 'size': len(body)}
    b = asyncio.run(OcuSkills.get_by_name(INVOICE))
    assert (b.data, b.zip_sha256, b.size, b.description) == (body, sha, len(body), DESCRIPTION_B)
    assert (b.created_by, b.created_at) == (admin.id, a.created_at)
    assert b.updated_at >= a.updated_at
    assert _registry_state((INVOICE,)) == stored_invoice['state']
    listed = _listing(get_client(), admin)[INVOICE]
    assert (listed['zip_sha256'], listed['access_grants']) == (sha, [_group_read(stored_invoice['group_a'])])


def test_replace_commit_failure_keeps_the_previous_skill(admin, stored_invoice):
    from open_webui.internal.db import async_engine
    from open_webui.models.ocu_skills import OcuSkills
    from sqlalchemy import event
    from sqlalchemy.ext.asyncio import AsyncSession

    statements = []

    def record(_conn, _cursor, statement, *_args):
        statements.append(statement.lstrip().upper())

    async def failing_commit(self):
        raise RuntimeError('injected commit failure')

    event.listen(async_engine.sync_engine, 'before_cursor_execute', record)
    try:
        with patch.object(AsyncSession, 'commit', failing_commit):
            with pytest.raises(RuntimeError, match='injected commit failure'):
                _upload(admin, _skill_zip_for(INVOICE, description=DESCRIPTION_B))
    finally:
        event.remove(async_engine.sync_engine, 'before_cursor_execute', record)

    # Proves the replace's UPDATE ran inside the failed transaction and was rolled back with it.
    assert any(s.startswith('UPDATE OCU_SKILL') for s in statements), statements
    assert asyncio.run(OcuSkills.get_by_name(INVOICE)) == stored_invoice['skill']
    assert _registry_state((INVOICE,)) == stored_invoice['state']
    assert _listing(get_client(), admin)[INVOICE]['zip_sha256'] == hashlib.sha256(stored_invoice['body']).hexdigest()


@pytest.mark.parametrize('case', ['path-traversal', 'body-51-mb'])
def test_rejected_replace_keeps_the_stored_skill(admin, stored_invoice, case):
    from open_webui.models.ocu_skills import OcuSkills

    build, expected, reason = REJECTED_UPLOADS[case]

    response = _upload(admin, build())

    assert response.status_code == expected, response.text
    assert re.search(reason, response.json()['detail'])
    assert asyncio.run(OcuSkills.get_by_name(INVOICE)) == stored_invoice['skill']
    assert _registry_state((INVOICE,)) == stored_invoice['state']


def test_upload_integrity_error_is_409_and_changes_nothing(admin, seeded_grants):
    import sqlite3

    from open_webui.models.ocu_skills import OcuSkills
    from sqlalchemy.exc import IntegrityError

    # Only a concurrent first upload between the UPDATE and the INSERT can raise this (Postgres).
    conflict = IntegrityError(
        'INSERT INTO ocu_skill (name) VALUES (?)', (INVOICE,), sqlite3.IntegrityError('UNIQUE constraint failed')
    )
    names = ('a', 'b', INVOICE)
    before = _registry_state(names)

    with patch.object(OcuSkills, 'upsert', side_effect=conflict):
        response = _upload(admin, _skill_zip_for(INVOICE))

    assert response.status_code == 409
    assert f"'{INVOICE}'" in response.json()['detail']
    assert _registry_state(names) == before


REJECTED_UPLOADS = {
    'reserved-docx': (lambda: _skill_zip_for('docx'), 400, 'reserved'),
    'reserved-internal-comms': (lambda: _skill_zip_for('internal-comms'), 400, 'reserved'),
    'path-traversal': (lambda: _skill_zip_for(INVOICE, ('../../evil.sh', 'x')), 400, r'\.\.'),
    'zip-bomb': (lambda: _skill_zip_for(INVOICE, ('zeros', 200 * MB + 1)), 400, '200 MB'),
    'not-a-zip': (lambda: b'not a zip', 400, 'not a readable ZIP'),
    'invalid-name': (lambda: _skill_zip_for('Invoice'), 400, 'name'),
    # The cap is on bytes read: exactly 50 MB is read whole and fails validation, one byte more is 413.
    'body-at-cap': (lambda: b'\0' * (50 * MB), 400, 'not a readable ZIP'),
    'body-51-mb': (lambda: b'\0' * (51 * MB), 413, '50 MB'),
}


@pytest.mark.parametrize('case', list(REJECTED_UPLOADS))
def test_rejected_upload_changes_nothing(admin, seeded_grants, case):
    build, expected, reason = REJECTED_UPLOADS[case]
    names = ('a', 'b', INVOICE, 'docx', 'internal-comms')
    before = _registry_state(names)

    response = _upload(admin, build())

    assert response.status_code == expected, response.text
    assert re.search(reason, response.json()['detail'])
    assert _registry_state(names) == before


def _chunked_body(chunks: int):
    """An HTTP request with no content-length whose receive() hands out 1 MB chunks, counting calls."""
    from starlette.requests import Request

    calls = []

    async def receive():
        calls.append(None)
        return {'type': 'http.request', 'body': b'\0' * MB, 'more_body': len(calls) < chunks}

    return Request({'type': 'http', 'method': 'POST', 'headers': []}, receive), calls


def test_capped_body_stops_reading_one_chunk_past_50_mb():
    from fastapi import HTTPException
    from open_webui.routers.ocu_skills import _read_capped_body

    request, calls = _chunked_body(60)

    with pytest.raises(HTTPException) as raised:
        asyncio.run(_read_capped_body(request))

    assert (raised.value.status_code, len(calls)) == (413, 51)


def test_capped_body_reads_exactly_50_mb_whole():
    from open_webui.routers.ocu_skills import _read_capped_body

    request, calls = _chunked_body(50)

    assert (asyncio.run(_read_capped_body(request)), len(calls)) == (b'\0' * (50 * MB), 50)


@pytest.mark.usefixtures('registry')
def test_first_upload_commit_failure_writes_nothing_and_keeps_orphans(admin):
    from open_webui.models.ocu_skills import OcuSkill, OcuSkills
    from sqlalchemy.ext.asyncio import AsyncSession

    asyncio.run(_seed_orphans(INVOICE, f'group-a-{uuid.uuid4()}'))
    before = _registry_state((INVOICE,))
    reached_insert = []

    async def failing_commit(self):
        # Proves the failure hit the upload's own commit, not an earlier one in the request.
        reached_insert.append(any(isinstance(obj, OcuSkill) for obj in self.new))
        raise RuntimeError('injected commit failure')

    with patch.object(AsyncSession, 'commit', failing_commit):
        with pytest.raises(RuntimeError, match='injected commit failure'):
            _upload(admin, _skill_zip_for(INVOICE))

    assert True in reached_insert
    assert asyncio.run(OcuSkills.get_by_name(INVOICE)) is None
    assert _registry_state((INVOICE,)) == before
    assert ('user', '*', 'read') not in before['grants'][INVOICE] and before['disables'][INVOICE] == [USER_U]


@pytest.mark.usefixtures('registry')
def test_skill_survives_reset_uploads_and_delete_all_files(admin):
    # Destructive on the shared harness DB: every file row and the vector DB are reset.
    from pathlib import Path

    from open_webui.config import UPLOAD_DIR
    from open_webui.models.ocu_skills import OcuSkills

    client = get_client()
    headers = _session_headers(admin.id)
    body = _skill_zip_for(INVOICE)
    assert _upload(admin, body).status_code == 200
    canary = Path(UPLOAD_DIR) / f'canary-{uuid.uuid4()}'

    for method, path, expected in [
        ('POST', '/api/v1/retrieval/reset/uploads', True),
        ('DELETE', '/api/v1/files/all', {'message': 'All files deleted successfully'}),
    ]:
        canary.write_bytes(b'canary')
        response = client.request(method, path, headers=headers)
        assert (response.status_code, response.json()) == (200, expected), response.text
        assert not canary.exists()

    assert INVOICE in _listing(client, admin)
    skill = asyncio.run(OcuSkills.get_by_name(INVOICE))
    assert (skill.data, skill.zip_sha256) == (body, hashlib.sha256(body).hexdigest())


ADMIN_WRITES = {
    'access': ('POST', '/a/access', {'access_grants': [EVERYONE_READ]}),
    # The admin dependency runs before body validation: a non-admin learns nothing about the form.
    'access-invalid-body': ('POST', '/a/access', {'access_grants': [{**EVERYONE_READ, 'permission': 'write'}]}),
    'delete': ('DELETE', '/a', None),
    'upload': ('POST', '/upload', _skill_zip_for(INVOICE)),
}


@pytest.mark.parametrize('route', list(ADMIN_WRITES))
@pytest.mark.parametrize('caller', ['user-role', 'no-session'])
def test_admin_writes_refuse_non_admins_and_change_nothing(member, seeded_grants, route, caller):
    method, path, body = ADMIN_WRITES[route]
    headers = _session_headers(member.id) if caller == 'user-role' else {}
    before = _registry_state()

    payload = {'content': body} if isinstance(body, bytes) else {'json': body}

    response = get_client().request(method, f'{SKILLS_PATH}{path}', headers=headers, **payload)

    assert response.status_code == 401
    assert _registry_state() == before


def test_skills_router_does_not_import_the_workspaces_router():
    from pathlib import Path

    import open_webui.routers.ocu_skills as ocu_skills

    assert 'ocu_workspaces' not in Path(ocu_skills.__file__).read_text()
