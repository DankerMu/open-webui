"""Uploaded-skill registry tables, list-all/get/upsert/delete accessors and the add_ocu_skill migration."""

from __future__ import annotations

import importlib.util
import os
import time
from pathlib import Path

import pytest
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from open_webui.test.ocu_harness import configure_ocu_test_env
from sqlalchemy import create_engine, event, inspect, text

configure_ocu_test_env()

_MIGRATION_PATH = Path(__file__).resolve().parents[2] / 'migrations' / 'versions' / 'f7a8b9c0d1e2_add_ocu_skill.py'
_TABLES = ('ocu_skill', 'ocu_skill_user_disable')


def _engine():
    return create_engine(os.environ['DATABASE_URL'])


def _load_migration():
    spec = importlib.util.spec_from_file_location('add_ocu_skill', _MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _migrate(engine, *steps: str) -> None:
    module = _load_migration()
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            for step in steps:
                getattr(module, step)()


@pytest.fixture(scope='module', autouse=True)
def _registry_tables():
    from open_webui.models.access_grants import AccessGrant

    engine = _engine()
    # _empty_registry and OcuSkills.delete touch access_grant, which only the full alembic chain
    # (app import) creates; in the default full-suite order this module runs before any app import.
    AccessGrant.__table__.create(engine, checkfirst=True)
    if not set(_TABLES) <= set(inspect(engine).get_table_names()):
        _migrate(engine, 'upgrade')
    yield


@pytest.fixture
def _empty_registry():
    def wipe():
        with _engine().begin() as conn:
            conn.execute(text('DELETE FROM ocu_skill'))
            conn.execute(text('DELETE FROM ocu_skill_user_disable'))
            conn.execute(text("DELETE FROM access_grant WHERE resource_type = 'ocu_skill'"))

    wipe()
    yield
    wipe()


async def _seed(*names: str, now: int | None = None) -> None:
    from open_webui.internal.db import get_async_db
    from open_webui.models.ocu_skills import OcuSkill

    now = int(time.time()) if now is None else now
    async with get_async_db() as db:
        for name in names:
            db.add(
                OcuSkill(
                    name=name,
                    description=f'{name} description',
                    zip_sha256=f'sha-{name}',
                    size=4,
                    data=f'ZIP{name}'.encode(),
                    created_by='admin-id',
                    created_at=now,
                    updated_at=now,
                )
            )
        await db.commit()


async def _seed_grant_and_disable(name: str) -> None:
    from open_webui.internal.db import get_async_db
    from open_webui.models.access_grants import AccessGrants
    from open_webui.models.ocu_skills import OcuSkillUserDisable

    await AccessGrants.grant_access('ocu_skill', name, 'user', '*', 'read')
    async with get_async_db() as db:
        db.add(OcuSkillUserDisable(user_id='user-u', skill_name=name))
        await db.commit()


async def _grants_and_disables(name: str) -> tuple[list[tuple[str, str, str]], list[str]]:
    from open_webui.internal.db import get_async_db
    from open_webui.models.access_grants import AccessGrants
    from open_webui.models.ocu_skills import OcuSkillUserDisable
    from sqlalchemy import select

    grants = await AccessGrants.get_grants_by_resource('ocu_skill', name)
    async with get_async_db() as db:
        result = await db.execute(select(OcuSkillUserDisable.user_id).where(OcuSkillUserDisable.skill_name == name))
        disables = list(result.scalars().all())
    return [(g.principal_type, g.principal_id, g.permission) for g in grants], disables


class _SelectRecorder:
    """Records every statement the application engine sends while active."""

    def __init__(self):
        from open_webui.internal.db import async_engine

        self._engine = async_engine.sync_engine
        self.statements: list[str] = []

    def _record(self, _conn, _cursor, statement, _params, _context, _many):
        self.statements.append(statement)

    def __enter__(self):
        event.listen(self._engine, 'before_cursor_execute', self._record)
        return self

    def __exit__(self, *_exc):
        event.remove(self._engine, 'before_cursor_execute', self._record)
        return False


@pytest.mark.asyncio
@pytest.mark.usefixtures('_empty_registry')
async def test_list_all_returns_every_row_without_selecting_data():
    from open_webui.models.ocu_skills import OcuSkills

    await _seed('list-b', 'list-a')

    with _SelectRecorder() as recorder:
        rows = await OcuSkills.get_all()

    assert [row.name for row in rows] == ['list-a', 'list-b']
    assert [(row.description, row.zip_sha256, row.size, row.created_by) for row in rows] == [
        ('list-a description', 'sha-list-a', 4, 'admin-id'),
        ('list-b description', 'sha-list-b', 4, 'admin-id'),
    ]
    selects = [s for s in recorder.statements if s.lstrip().upper().startswith('SELECT') and 'ocu_skill' in s]
    assert selects, recorder.statements
    assert all('ocu_skill.data' not in s for s in selects), selects
    assert all('data' not in row.model_dump() for row in rows)


@pytest.mark.asyncio
@pytest.mark.usefixtures('_empty_registry')
async def test_get_by_name_loads_data_and_returns_none_for_unknown():
    from open_webui.models.ocu_skills import OcuSkills

    await _seed('get-a')

    # Positive control for the recorder: the one accessor that needs the bytes does select them.
    with _SelectRecorder() as recorder:
        row = await OcuSkills.get_by_name('get-a')

    assert row is not None
    assert (row.name, row.zip_sha256, row.data) == ('get-a', 'sha-get-a', b'ZIPget-a')
    assert any('ocu_skill.data' in s for s in recorder.statements), recorder.statements
    assert await OcuSkills.get_by_name('get-missing') is None


@pytest.mark.asyncio
@pytest.mark.usefixtures('_empty_registry')
async def test_delete_removes_row_grants_and_disables_with_one_commit():
    from unittest.mock import patch

    from open_webui.models.ocu_skills import OcuSkills
    from sqlalchemy.ext.asyncio import AsyncSession

    await _seed('del-a', 'del-b')
    for name in ('del-a', 'del-b'):
        await _seed_grant_and_disable(name)
    commits = []
    original_commit = AsyncSession.commit

    async def spy(self):
        commits.append(self)
        await original_commit(self)

    with patch.object(AsyncSession, 'commit', spy):
        existed = await OcuSkills.delete_with_grants_and_disables('del-a')

    assert existed is True
    assert len(commits) == 1
    assert await OcuSkills.get_by_name('del-a') is None
    assert await _grants_and_disables('del-a') == ([], [])
    assert (await OcuSkills.get_by_name('del-b')).data == b'ZIPdel-b'
    assert await _grants_and_disables('del-b') == ([('user', '*', 'read')], ['user-u'])


@pytest.mark.asyncio
@pytest.mark.usefixtures('_empty_registry')
async def test_delete_commit_failure_keeps_row_grants_and_disables():
    from unittest.mock import patch

    from open_webui.models.ocu_skills import OcuSkills
    from sqlalchemy.ext.asyncio import AsyncSession

    await _seed('del-a')
    await _seed_grant_and_disable('del-a')

    async def failing_commit(self):
        raise RuntimeError('injected commit failure')

    with patch.object(AsyncSession, 'commit', failing_commit):
        with pytest.raises(RuntimeError, match='injected commit failure'):
            await OcuSkills.delete_with_grants_and_disables('del-a')

    row = await OcuSkills.get_by_name('del-a')
    assert row is not None and row.data == b'ZIPdel-a'
    assert await _grants_and_disables('del-a') == ([('user', '*', 'read')], ['user-u'])


async def _seed_orphans(name: str) -> None:
    from open_webui.internal.db import get_async_db
    from open_webui.models.access_grants import AccessGrants
    from open_webui.models.ocu_skills import OcuSkillUserDisable

    await AccessGrants.grant_access('ocu_skill', name, 'group', 'group-a', 'read')
    async with get_async_db() as db:
        db.add(OcuSkillUserDisable(user_id='user-u', skill_name=name))
        await db.commit()


async def _insert(name: str):
    from open_webui.models.ocu_skills import OcuSkills

    return await OcuSkills.upsert(
        name=name, description=f'{name} description', data=b'PK-' + name.encode(), created_by='admin-id'
    )


@pytest.mark.asyncio
@pytest.mark.usefixtures('_empty_registry')
async def test_first_upsert_writes_row_and_replaces_orphans_with_one_wildcard_grant_in_one_commit():
    import hashlib
    from unittest.mock import patch

    from open_webui.models.ocu_skills import OcuSkills
    from sqlalchemy.ext.asyncio import AsyncSession

    await _seed_orphans('ins-a')
    commits = []
    original_commit = AsyncSession.commit

    async def spy(self):
        commits.append(self)
        await original_commit(self)

    with patch.object(AsyncSession, 'commit', spy):
        inserted = await _insert('ins-a')

    assert len(commits) == 1
    row = await OcuSkills.get_by_name('ins-a')
    assert row is not None and row.model_dump(exclude={'data'}) == inserted.model_dump()
    assert (row.data, row.zip_sha256, row.size) == (b'PK-ins-a', hashlib.sha256(b'PK-ins-a').hexdigest(), 8)
    assert (row.description, row.created_by, row.created_at) == ('ins-a description', 'admin-id', row.updated_at)
    assert await _grants_and_disables('ins-a') == ([('user', '*', 'read')], [])


@pytest.mark.asyncio
@pytest.mark.usefixtures('_empty_registry')
async def test_first_upsert_commit_failure_writes_nothing_and_keeps_orphans():
    from unittest.mock import patch

    from open_webui.models.ocu_skills import OcuSkills
    from sqlalchemy.ext.asyncio import AsyncSession

    await _seed_orphans('ins-a')
    before = await _grants_and_disables('ins-a')

    async def failing_commit(self):
        raise RuntimeError('injected commit failure')

    with patch.object(AsyncSession, 'commit', failing_commit):
        with pytest.raises(RuntimeError, match='injected commit failure'):
            await _insert('ins-a')

    assert await OcuSkills.get_all() == []
    assert await OcuSkills.get_by_name('ins-a') is None
    assert before == ([('group', 'group-a', 'read')], ['user-u'])
    assert await _grants_and_disables('ins-a') == before


async def _replace(name: str):
    from open_webui.models.ocu_skills import OcuSkills

    return await OcuSkills.upsert(name=name, description='replaced', data=b'PK-B', created_by='other-admin')


@pytest.mark.asyncio
@pytest.mark.usefixtures('_empty_registry')
async def test_upsert_of_existing_name_replaces_in_place_keeping_grants_and_disables_in_one_commit():
    import hashlib
    from unittest.mock import patch

    from open_webui.models.ocu_skills import OcuSkills
    from sqlalchemy.ext.asyncio import AsyncSession

    old = int(time.time()) - 100
    await _seed('rep-a', now=old)
    await _seed_orphans('rep-a')
    commits = []
    original_commit = AsyncSession.commit

    async def spy(self):
        commits.append(self)
        await original_commit(self)

    with _SelectRecorder() as recorder, patch.object(AsyncSession, 'commit', spy):
        replaced = await _replace('rep-a')

    assert len(commits) == 1
    skill_statements = [s.lstrip().upper() for s in recorder.statements if 'ocu_skill' in s]
    assert skill_statements[0].startswith('UPDATE OCU_SKILL'), recorder.statements
    assert not any('RETURNING' in s for s in skill_statements), recorder.statements
    assert not any(s.startswith('SELECT') and 'OCU_SKILL.DATA' in s for s in skill_statements), recorder.statements
    row = await OcuSkills.get_by_name('rep-a')
    assert row is not None and row.model_dump(exclude={'data'}) == replaced.model_dump()
    assert (row.data, row.zip_sha256, row.size, row.description) == (
        b'PK-B',
        hashlib.sha256(b'PK-B').hexdigest(),
        4,
        'replaced',
    )
    assert (row.created_by, row.created_at) == ('admin-id', old)
    assert row.updated_at >= old
    assert await _grants_and_disables('rep-a') == ([('group', 'group-a', 'read')], ['user-u'])


@pytest.mark.asyncio
@pytest.mark.usefixtures('_empty_registry')
async def test_upsert_replace_commit_failure_keeps_the_previous_row_grants_and_disables():
    from unittest.mock import patch

    from open_webui.models.ocu_skills import OcuSkills
    from sqlalchemy.ext.asyncio import AsyncSession

    await _seed('rep-a')
    await _seed_orphans('rep-a')
    before = (await OcuSkills.get_by_name('rep-a'), await _grants_and_disables('rep-a'))

    async def failing_commit(self):
        raise RuntimeError('injected commit failure')

    with patch.object(AsyncSession, 'commit', failing_commit):
        with pytest.raises(RuntimeError, match='injected commit failure'):
            await _replace('rep-a')

    after = (await OcuSkills.get_by_name('rep-a'), await _grants_and_disables('rep-a'))
    assert after == before
    assert (after[0].data, after[0].zip_sha256, after[0].size, after[0].description) == (
        b'ZIPrep-a',
        'sha-rep-a',
        4,
        'rep-a description',
    )


def test_registry_schema_matches_the_data_model():
    inspector = inspect(_engine())
    columns = {c['name'] for c in inspector.get_columns('ocu_skill')}
    assert columns == {'name', 'description', 'zip_sha256', 'size', 'data', 'created_by', 'created_at', 'updated_at'}
    assert inspector.get_pk_constraint('ocu_skill')['constrained_columns'] == ['name']
    assert {c['name'] for c in inspector.get_columns('ocu_skill_user_disable')} == {'user_id', 'skill_name'}
    assert inspector.get_pk_constraint('ocu_skill_user_disable')['constrained_columns'] == ['user_id', 'skill_name']


def _insert_grant(conn, grant_id: str, resource_type: str, resource_id: str) -> None:
    conn.execute(
        text(
            'INSERT INTO access_grant (id, resource_type, resource_id, principal_type, principal_id, permission,'
            " created_at) VALUES (:id, :rt, :rid, 'user', '*', 'read', 0)"
        ),
        {'id': grant_id, 'rt': resource_type, 'rid': resource_id},
    )


def test_migration_downgrade_drops_tables_and_only_ocu_skill_grants(tmp_path):
    from open_webui.models.access_grants import AccessGrant

    engine = create_engine(f'sqlite:///{tmp_path / "ocu_skill.db"}')
    with engine.begin() as conn:
        AccessGrant.__table__.create(conn)
    # The second upgrade proves the table guards: re-running on an upgraded DB is a no-op.
    _migrate(engine, 'upgrade', 'upgrade')
    assert set(_TABLES) <= set(inspect(engine).get_table_names())
    with engine.begin() as conn:
        _insert_grant(conn, 'g-ocu', 'ocu_skill', 'shared-name')
        _insert_grant(conn, 'g-decoy', 'skill', 'shared-name')

    _migrate(engine, 'downgrade')

    assert not set(_TABLES) & set(inspect(engine).get_table_names())
    with engine.connect() as conn:
        remaining = conn.execute(text('SELECT id, resource_type FROM access_grant ORDER BY id')).all()
    assert [tuple(r) for r in remaining] == [('g-decoy', 'skill')]

    _migrate(engine, 'upgrade')
    assert set(_TABLES) <= set(inspect(engine).get_table_names())
