"""Per-chat ocu_chat_state accessor against the harness SQLite database."""

from __future__ import annotations

import importlib.util
import os
import uuid
from pathlib import Path

import pytest
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text

_REPO_ROOT = Path(__file__).resolve().parents[4]
_DATA_DIR = _REPO_ROOT / '.run' / 'data'
_DATA_DIR.mkdir(parents=True, exist_ok=True)
os.environ['DATA_DIR'] = str(_DATA_DIR)
os.environ['DATABASE_URL'] = f'sqlite:///{_DATA_DIR}/webui.db'
os.environ.setdefault('WEBUI_SECRET_KEY', 'dev-harness-secret')

_MIGRATION_PATH = Path(__file__).resolve().parents[2] / 'migrations' / 'versions' / 'e6f7a8b9c0d1_add_ocu_chat_state.py'


def _engine():
    return create_engine(os.environ['DATABASE_URL'])


def _load_migration():
    spec = importlib.util.spec_from_file_location('add_ocu_chat_state', _MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec is not None and spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _chat_id(prefix: str) -> str:
    return f'{prefix}-{uuid.uuid4()}'


def _count(chat_id: str) -> int:
    with _engine().connect() as conn:
        return conn.execute(
            text('SELECT COUNT(*) FROM ocu_chat_state WHERE chat_id = :chat_id'),
            {'chat_id': chat_id},
        ).scalar_one()


@pytest.fixture(scope='session', autouse=True)
def _ensure_ocu_chat_state_table():
    engine = _engine()
    if 'ocu_chat_state' in inspect(engine).get_table_names():
        return
    module = _load_migration()
    with engine.begin() as conn:
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            module.upgrade()


@pytest.mark.asyncio
async def test_prefs_upsert_get_round_trip():
    from open_webui.models.ocu_chat_state import OcuChatStates

    chat_id = _chat_id('C')
    prefs = {'view': 'terminal', 'selected_file_id': 'f1'}
    await OcuChatStates.upsert_prefs(chat_id, prefs)

    row = await OcuChatStates.get(chat_id)
    assert row is not None
    assert row.prefs == prefs
    assert row.last_seen_revision == 0
    assert row.updated_at != 0


@pytest.mark.asyncio
async def test_stale_advance_does_not_decrease_cursor():
    from open_webui.models.ocu_chat_state import OcuChatStates

    chat_id = _chat_id('cursor-stale')
    await OcuChatStates.advance_cursor(chat_id, 7)
    after_advance = await OcuChatStates.get(chat_id)
    assert after_advance is not None
    stored_at = after_advance.updated_at

    await OcuChatStates.advance_cursor(chat_id, 5)

    row = await OcuChatStates.get(chat_id)
    assert row is not None
    assert row.last_seen_revision == 7
    assert row.updated_at == stored_at


@pytest.mark.asyncio
async def test_advance_stores_higher_revision():
    from open_webui.models.ocu_chat_state import OcuChatStates

    chat_id = _chat_id('cursor-forward')
    await OcuChatStates.advance_cursor(chat_id, 5)
    await OcuChatStates.advance_cursor(chat_id, 7)

    row = await OcuChatStates.get(chat_id)
    assert row is not None
    assert row.last_seen_revision == 7


@pytest.mark.asyncio
async def test_equal_advance_is_noop():
    from open_webui.models.ocu_chat_state import OcuChatStates

    chat_id = _chat_id('cursor-equal')
    await OcuChatStates.advance_cursor(chat_id, 7)
    after_advance = await OcuChatStates.get(chat_id)
    assert after_advance is not None
    stored_at = after_advance.updated_at

    await OcuChatStates.advance_cursor(chat_id, 7)

    row = await OcuChatStates.get(chat_id)
    assert row is not None
    assert row.last_seen_revision == 7
    assert row.updated_at == stored_at


@pytest.mark.asyncio
async def test_upsert_prefs_replaces_object():
    from open_webui.models.ocu_chat_state import OcuChatStates

    chat_id = _chat_id('C-replace')
    await OcuChatStates.upsert_prefs(chat_id, {'view': 'files', 'open': True})
    await OcuChatStates.upsert_prefs(chat_id, {'view': 'terminal'})

    row = await OcuChatStates.get(chat_id)
    assert row is not None
    assert row.prefs == {'view': 'terminal'}


@pytest.mark.asyncio
async def test_get_missing_returns_none_and_does_not_insert():
    from open_webui.models.ocu_chat_state import OcuChatStates

    chat_id = _chat_id('missing')
    assert await OcuChatStates.get(chat_id) is None
    assert _count(chat_id) == 0


@pytest.mark.asyncio
async def test_writing_one_chat_does_not_create_another():
    from open_webui.models.ocu_chat_state import OcuChatStates

    chat_id = _chat_id('C-isolated')
    other_id = _chat_id('C2')
    await OcuChatStates.upsert_prefs(chat_id, {'view': 'files'})

    assert await OcuChatStates.get(other_id) is None
    assert _count(other_id) == 0


@pytest.mark.asyncio
async def test_advance_creates_row_at_revision_when_missing():
    from open_webui.models.ocu_chat_state import OcuChatStates

    chat_id = _chat_id('cursor-create')
    await OcuChatStates.advance_cursor(chat_id, 4)

    row = await OcuChatStates.get(chat_id)
    assert row is not None
    assert row.last_seen_revision == 4
    assert row.prefs == {}
    assert row.updated_at != 0


@pytest.mark.asyncio
async def test_get_returns_orphan_row_without_chat():
    from open_webui.models.ocu_chat_state import OcuChatStates

    chat_id = _chat_id('orphan-C')
    await OcuChatStates.upsert_prefs(chat_id, {'open': True})

    inspector = inspect(_engine())
    if 'chat' in inspector.get_table_names():
        with _engine().connect() as conn:
            chat_count = conn.execute(
                text('SELECT COUNT(*) FROM chat WHERE id = :chat_id'),
                {'chat_id': chat_id},
            ).scalar_one()
        assert chat_count == 0

    row = await OcuChatStates.get(chat_id)
    assert row is not None
    assert row.prefs == {'open': True}


def test_ocu_chat_state_has_no_foreign_key():
    inspector = inspect(_engine())
    columns = {column['name'] for column in inspector.get_columns('ocu_chat_state')}
    assert columns == {'chat_id', 'last_seen_revision', 'prefs', 'updated_at'}
    assert inspector.get_pk_constraint('ocu_chat_state')['constrained_columns'] == ['chat_id']
    assert inspector.get_foreign_keys('ocu_chat_state') == []


def test_add_ocu_chat_state_upgrade_is_idempotent_and_reversible(tmp_path):
    module = _load_migration()
    engine = create_engine(f'sqlite:///{tmp_path / "ocu_chat_state.db"}')
    with engine.begin() as conn:
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            module.upgrade()
            inspector = inspect(conn)
            assert 'ocu_chat_state' in inspector.get_table_names()
            assert inspector.get_foreign_keys('ocu_chat_state') == []
            module.upgrade()
            inspector.clear_cache()
            assert 'ocu_chat_state' in inspector.get_table_names()
            module.downgrade()
            inspector.clear_cache()
            assert 'ocu_chat_state' not in inspector.get_table_names()
            module.upgrade()
            inspector.clear_cache()
            assert 'ocu_chat_state' in inspector.get_table_names()
            assert inspector.get_foreign_keys('ocu_chat_state') == []
