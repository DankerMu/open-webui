"""Every WebUI chat-deletion path requests OCU sandbox deletion for exactly the deleted chats."""

from __future__ import annotations

import asyncio
import logging
import threading
import time

import pytest
from open_webui.test.ocu_harness import (
    _insert_chat,
    _insert_user,
    _session_headers,
    _StubSession,
    get_client,
)

DISTINCTIVE_TOKEN = 'ocu-internal-token-UNIQUE-route-9c4e'
LOGGER = 'open_webui.utils.ocu_sandbox_cleanup'


class _RecordingOcu:
    """Stands in for OcuClient at the network boundary and records requested sandbox deletes."""

    def __init__(self):
        self._lock = threading.Lock()
        self.deleted: list[str] = []
        self.constructed = 0

    def factory(self):
        with self._lock:
            self.constructed += 1
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _tb):
        return False

    async def delete_sandbox(self, chat_id: str):
        with self._lock:
            self.deleted.append(chat_id)
        return {'container': True, 'volume': True, 'data': True}


def _cleanup_module():
    import open_webui.utils.ocu_sandbox_cleanup as cleanup

    return cleanup


def _wait_for_cleanup(timeout: float = 5.0) -> None:
    """Background tasks run on the TestClient's portal loop; wait until all have finished."""
    cleanup = _cleanup_module()
    deadline = time.monotonic() + timeout
    while len(cleanup._background_tasks):
        assert time.monotonic() < deadline, 'sandbox cleanup did not finish'
        time.sleep(0.01)


@pytest.fixture
def ocu(monkeypatch):
    cleanup = _cleanup_module()
    recorder = _RecordingOcu()
    monkeypatch.setenv('ENABLE_OCU_WORKSPACE', 'true')
    monkeypatch.setattr(cleanup, 'OcuClient', recorder.factory)
    yield recorder
    _wait_for_cleanup()


@pytest.fixture
def users():
    created: list[str] = []
    yield created

    async def purge():
        from open_webui.models.users import Users

        for user_id in created:
            await Users.delete_user_by_id(user_id)
        cleanup = _cleanup_module()
        while cleanup._background_tasks:
            await asyncio.gather(*list(cleanup._background_tasks))

    asyncio.run(purge())


def _user(users: list[str], role: str = 'user'):
    user = asyncio.run(_insert_user(role=role, prefix=f'sandbox-cleanup-{role}'))
    users.append(user.id)
    return user


def _chat(owner_id: str, *, folder_id: str | None = None, parent_id: str | None = None) -> str:
    async def insert():
        if parent_id is None:
            return await _insert_chat(owner_id, folder_id=folder_id)
        from open_webui.models.chats import ChatForm, Chats
        from open_webui.test.ocu_harness import _unique

        return await Chats.insert_new_chat(
            _unique('chat'),
            owner_id,
            ChatForm(chat={'title': 'internal child'}),
            internal_meta={'internal': True, 'parent_chat_id': parent_id},
        )

    return asyncio.run(insert()).id


def _folder(owner_id: str, *, parent_id: str | None = None) -> str:
    from open_webui.models.folders import FolderForm, Folders
    from open_webui.test.ocu_harness import _unique

    folder = asyncio.run(Folders.insert_new_folder(owner_id, FolderForm(name=_unique('folder')), parent_id))
    assert folder is not None
    return folder.id


def _existing(chat_ids) -> set[str]:
    from open_webui.models.chats import Chats

    async def lookup():
        return {chat_id for chat_id in chat_ids if await Chats.get_chat_by_id(chat_id) is not None}

    return asyncio.run(lookup())


def _wrap_failing(monkeypatch, name: str, should_fail):
    """Simulate a database delete that reports failure (its own contract: return False) for chosen calls."""
    from open_webui.models.chats import Chats

    original = getattr(Chats, name)

    async def wrapped(*args, **kwargs):
        if should_fail(*args):
            return False
        return await original(*args, **kwargs)

    monkeypatch.setattr(Chats, name, wrapped)


# DELETE /api/v1/chats/{id}


def test_single_delete_removes_sandboxes_of_chat_and_internal_children(users, ocu):
    owner = _user(users)
    parent = _chat(owner.id)
    children = [_chat(owner.id, parent_id=parent), _chat(owner.id, parent_id=parent)]
    bystander = _chat(owner.id)

    response = get_client().delete(f'/api/v1/chats/{parent}', headers=_session_headers(owner.id))
    _wait_for_cleanup()

    assert response.status_code == 200 and response.json() is True
    assert sorted(ocu.deleted) == sorted([parent, *children])
    assert _existing([parent, *children, bystander]) == {bystander}


def test_single_delete_skips_an_internal_child_whose_delete_failed(users, ocu, monkeypatch):
    owner = _user(users)
    parent = _chat(owner.id)
    kept_child = _chat(owner.id, parent_id=parent)
    deleted_child = _chat(owner.id, parent_id=parent)
    _wrap_failing(monkeypatch, 'delete_chat_by_id_and_user_id', lambda chat_id, *_: chat_id == kept_child)

    response = get_client().delete(f'/api/v1/chats/{parent}', headers=_session_headers(owner.id))
    _wait_for_cleanup()

    assert response.status_code == 200 and response.json() is True
    assert sorted(ocu.deleted) == sorted([parent, deleted_child])
    assert _existing([parent, kept_child, deleted_child]) == {kept_child}


def test_single_delete_that_fails_in_the_database_requests_nothing(users, ocu, monkeypatch):
    owner = _user(users)
    chat = _chat(owner.id)
    _wrap_failing(monkeypatch, 'delete_chat_by_id_and_user_id', lambda chat_id, *_: chat_id == chat)

    response = get_client().delete(f'/api/v1/chats/{chat}', headers=_session_headers(owner.id))
    _wait_for_cleanup()

    assert response.status_code == 200 and response.json() is False
    assert ocu.deleted == []
    assert _existing([chat]) == {chat}


def test_single_delete_of_a_foreign_chat_is_404_and_requests_nothing(users, ocu):
    owner = _user(users)
    stranger = _user(users)
    chat = _chat(owner.id)

    response = get_client().delete(f'/api/v1/chats/{chat}', headers=_session_headers(stranger.id))
    _wait_for_cleanup()

    assert response.status_code == 404
    assert ocu.deleted == []
    assert _existing([chat]) == {chat}


@pytest.mark.parametrize('path', ['/api/v1/chats/{chat}', '/api/v1/chats/'])
def test_unauthenticated_delete_is_401_and_requests_nothing(users, ocu, path):
    owner = _user(users)
    chat = _chat(owner.id)

    response = get_client().delete(path.format(chat=chat))
    _wait_for_cleanup()

    assert response.status_code == 401
    assert ocu.deleted == []
    assert _existing([chat]) == {chat}


def test_disabled_workspace_requests_no_sandbox_delete(users, ocu, monkeypatch):
    monkeypatch.setenv('ENABLE_OCU_WORKSPACE', 'false')
    owner = _user(users)
    chat = _chat(owner.id)

    response = get_client().delete(f'/api/v1/chats/{chat}', headers=_session_headers(owner.id))
    _wait_for_cleanup()

    assert response.status_code == 200 and response.json() is True
    assert ocu.constructed == 0
    assert ocu.deleted == []


def test_unreachable_ocu_still_deletes_the_chat_and_logs_chat_id_without_token(users, monkeypatch, caplog):
    from open_webui.utils.ocu_client import OcuClient

    cleanup = _cleanup_module()
    session = _StubSession(error=TimeoutError())
    monkeypatch.setenv('ENABLE_OCU_WORKSPACE', 'true')
    monkeypatch.setenv('OCU_INTERNAL_URL', 'http://ocu.example/')
    monkeypatch.setenv('OCU_INTERNAL_TOKEN', DISTINCTIVE_TOKEN)
    monkeypatch.setattr(cleanup, 'OcuClient', lambda: OcuClient(session=session))
    caplog.set_level(logging.DEBUG)
    owner = _user(users)
    chat = _chat(owner.id)

    response = get_client().delete(f'/api/v1/chats/{chat}', headers=_session_headers(owner.id))
    _wait_for_cleanup()

    assert response.status_code == 200 and response.json() is True
    assert _existing([chat]) == set()
    assert [call['path'] for call in session.calls] == [f'/internal/sandbox/{chat}']
    warnings = [r.getMessage() for r in caplog.records if r.name == LOGGER and r.levelno == logging.WARNING]
    assert len(warnings) == 1 and chat in warnings[0]
    logged = '\n'.join(f'{r.getMessage()} {r.exc_text or ""}' for r in caplog.records)
    assert DISTINCTIVE_TOKEN not in logged


# DELETE /api/v1/chats/


def test_delete_all_removes_sandboxes_of_every_chat_of_the_user(users, ocu):
    owner = _user(users)
    other = _user(users)
    parent = _chat(owner.id)
    owned = [parent, _chat(owner.id, parent_id=parent), _chat(owner.id, folder_id=_folder(owner.id))]
    foreign = _chat(other.id)

    response = get_client().delete('/api/v1/chats/', headers=_session_headers(owner.id))
    _wait_for_cleanup()

    assert response.status_code == 200 and response.json() is True
    assert sorted(ocu.deleted) == sorted(owned)
    assert _existing([*owned, foreign]) == {foreign}


def test_delete_all_that_fails_in_the_database_requests_nothing(users, ocu, monkeypatch):
    owner = _user(users)
    chat = _chat(owner.id)
    _wrap_failing(monkeypatch, 'delete_chats_by_user_id', lambda *_: True)

    response = get_client().delete('/api/v1/chats/', headers=_session_headers(owner.id))
    _wait_for_cleanup()

    assert response.status_code == 200 and response.json() is False
    assert ocu.deleted == []
    assert _existing([chat]) == {chat}


# DELETE /api/v1/folders/{id}


def test_folder_delete_removes_sandboxes_of_chats_in_the_folder_tree(users, ocu):
    owner = _user(users, role='admin')
    top = _folder(owner.id)
    sub = _folder(owner.id, parent_id=top)
    inside = [_chat(owner.id, folder_id=top), _chat(owner.id, folder_id=top), _chat(owner.id, folder_id=sub)]
    outside = _chat(owner.id, folder_id=_folder(owner.id))

    response = get_client().delete(f'/api/v1/folders/{top}', headers=_session_headers(owner.id))
    _wait_for_cleanup()

    assert response.status_code == 200 and response.json() is True
    assert sorted(ocu.deleted) == sorted(inside)
    assert _existing([*inside, outside]) == {outside}


def test_folder_delete_without_contents_moves_chats_and_requests_nothing(users, ocu):
    owner = _user(users, role='admin')
    top = _folder(owner.id)
    chat = _chat(owner.id, folder_id=top)

    response = get_client().delete(f'/api/v1/folders/{top}?delete_contents=false', headers=_session_headers(owner.id))
    _wait_for_cleanup()

    assert response.status_code == 200 and response.json() is True
    assert ocu.deleted == []
    assert _existing([chat]) == {chat}


def test_folder_delete_failing_after_an_earlier_folder_committed_requests_only_that_folder(users, ocu, monkeypatch):
    from open_webui.models.access_grants import AccessGrants

    owner = _user(users, role='admin')
    top = _folder(owner.id)
    sub = _folder(owner.id, parent_id=top)
    committed = [_chat(owner.id, folder_id=top), _chat(owner.id, folder_id=top)]
    kept = _chat(owner.id, folder_id=sub)
    _wrap_failing(
        monkeypatch, 'delete_chats_by_user_id_and_folder_id', lambda _user_id, folder_id, *_: folder_id == sub
    )
    original_revoke = AccessGrants.revoke_all_access

    async def revoke(resource_type, resource_id, *args, **kwargs):
        if resource_id == sub:
            raise RuntimeError('simulated failure after the first folder committed')
        return await original_revoke(resource_type, resource_id, *args, **kwargs)

    monkeypatch.setattr(AccessGrants, 'revoke_all_access', revoke)

    response = get_client().delete(f'/api/v1/folders/{top}', headers=_session_headers(owner.id))
    _wait_for_cleanup()

    assert response.status_code == 400
    assert sorted(ocu.deleted) == sorted(committed)
    assert _existing([*committed, kept]) == {kept}


def test_folder_delete_by_a_non_owner_is_refused_and_requests_nothing(users, ocu):
    owner = _user(users)
    stranger = _user(users)
    top = _folder(owner.id)
    chat = _chat(owner.id, folder_id=top)

    response = get_client().delete(f'/api/v1/folders/{top}', headers=_session_headers(stranger.id))
    _wait_for_cleanup()

    assert response.status_code == 403
    assert ocu.deleted == []
    assert _existing([chat]) == {chat}


# DELETE /api/v1/users/{id} (Users.delete_user_by_id)


def test_user_delete_removes_sandboxes_of_every_chat_of_the_user(users, ocu):
    admin = _user(users, role='admin')
    member = _user(users)
    parent = _chat(member.id)
    owned = [parent, _chat(member.id, parent_id=parent), _chat(member.id, folder_id=_folder(member.id))]
    foreign = _chat(admin.id)

    response = get_client().delete(f'/api/v1/users/{member.id}', headers=_session_headers(admin.id))
    _wait_for_cleanup()

    assert response.status_code == 200 and response.json() is True
    assert sorted(ocu.deleted) == sorted(owned)
    assert _existing([*owned, foreign]) == {foreign}


def test_user_delete_whose_chat_delete_fails_requests_nothing(users, ocu, monkeypatch):
    admin = _user(users, role='admin')
    member = _user(users)
    chat = _chat(member.id)
    _wrap_failing(monkeypatch, 'delete_chats_by_user_id', lambda user_id, *_: user_id == member.id)

    response = get_client().delete(f'/api/v1/users/{member.id}', headers=_session_headers(admin.id))
    _wait_for_cleanup()

    assert response.status_code == 500
    assert ocu.deleted == []
    assert _existing([chat]) == {chat}


def test_user_row_failure_after_chats_committed_still_requests_their_sandboxes(users, ocu, monkeypatch):
    import open_webui.models.users as users_model
    from open_webui.models.users import User, Users

    member = _user(users)
    owned = [_chat(member.id), _chat(member.id)]
    original_delete = users_model.delete

    def failing_delete(table, *args, **kwargs):
        if table is User:
            raise RuntimeError('simulated user-row delete failure')
        return original_delete(table, *args, **kwargs)

    monkeypatch.setattr(users_model, 'delete', failing_delete)

    async def delete_and_drain():
        cleanup = _cleanup_module()
        with pytest.raises(RuntimeError, match='simulated user-row delete failure'):
            await Users.delete_user_by_id(member.id)
        while cleanup._background_tasks:
            await asyncio.gather(*list(cleanup._background_tasks))

    asyncio.run(delete_and_drain())
    monkeypatch.setattr(users_model, 'delete', original_delete)

    assert sorted(ocu.deleted) == sorted(owned)
    assert _existing(owned) == set()
