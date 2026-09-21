"""TestClient matrix for /api/v1/ocu/workspaces describe/launch/refresh/prefs."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[4]
_DATA_DIR = _REPO_ROOT / '.run' / 'data'
_DATA_DIR.mkdir(parents=True, exist_ok=True)
os.environ['DATA_DIR'] = str(_DATA_DIR)
os.environ['DATABASE_URL'] = f'sqlite:///{_DATA_DIR}/webui.db'
os.environ.setdefault('WEBUI_SECRET_KEY', 'dev-harness-secret')
os.environ.setdefault('ENABLE_OLLAMA_API', 'false')
os.environ.setdefault('ENABLE_OPENAI_API', 'false')
os.environ.setdefault('OFFLINE_MODE', 'true')
os.environ.setdefault('ENABLE_VERSION_UPDATE_CHECK', 'false')
os.environ['ENABLE_OCU_WORKSPACE'] = 'true'

WORKSPACE_PREFIX = '/api/v1/ocu/workspaces'
INVALID_CHAT_IDS = ('temporary:abc', 'local:abc', 'channel:abc', 'default')
XR = {'X-Requested-With': 'ocu-workspace'}
STOPPED_STATES = ('paused', 'exited', 'created', 'restarting', 'dead', 'stopped')


@pytest.fixture(scope='session')
def client():
    from fastapi.testclient import TestClient
    from open_webui.main import app

    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        test_client.close()


_CLIENT = None


@pytest.fixture(autouse=True)
def _bind_client(client):
    global _CLIENT
    _CLIENT = client
    yield


def _unique(prefix: str) -> str:
    return f'{prefix}-{uuid.uuid4()}'


async def _insert_user(*, role: str, prefix: str, email: str | None = None):
    from open_webui.models.users import Users

    user_id = _unique(prefix)
    user = await Users.insert_new_user(
        id=user_id,
        name=prefix,
        email=email or f'{user_id}@harness.local',
        role=role,
    )
    assert user is not None
    return user


async def _insert_chat(owner_id: str):
    from open_webui.models.chats import ChatForm, Chats

    chat = await Chats.insert_new_chat(
        _unique('chat'),
        owner_id,
        ChatForm(chat={'title': 'OCU workspace fixture'}),
    )
    assert chat is not None
    return chat


async def _delete_user(user_id: str) -> None:
    from open_webui.models.users import Users

    await Users.delete_user_by_id(user_id)


async def _delete_chat(chat_id: str) -> None:
    from open_webui.models.chats import Chats

    await Chats.delete_chat_by_id(chat_id)


async def _owner_and_chat():
    owner = await _insert_user(role='user', prefix='ws-owner')
    chat = await _insert_chat(owner.id)
    return owner, chat


async def _cleanup_owner(owner_id: str, chat_id: str) -> None:
    await _delete_chat(chat_id)
    await _delete_user(owner_id)


def _session_headers(user_id: str) -> dict[str, str]:
    from open_webui.utils.auth import create_token

    return {'Authorization': f'Bearer {create_token({"id": user_id})}'}


class _StubClient:
    def __init__(self, *, describe=None, launch=None, refresh=None, describe_error=None):
        self.describe_result = describe if describe is not None else {'state': 'stopped', 'revision': 0, 'views': []}
        self.launch_result = launch if launch is not None else {'state': 'running'}
        self.refresh_result = refresh if refresh is not None else {'revision': 1}
        self.describe_error = describe_error
        self.calls: list[tuple[str, str]] = []

    async def describe(self, chat_id: str):
        self.calls.append(('describe', chat_id))
        if self.describe_error is not None:
            raise self.describe_error
        return self.describe_result

    async def launch(self, chat_id: str):
        self.calls.append(('launch', chat_id))
        return self.launch_result

    async def refresh(self, chat_id: str):
        self.calls.append(('refresh', chat_id))
        return self.refresh_result


def _install_client(monkeypatch, stub: _StubClient):
    import open_webui.routers.ocu_workspaces as ocu_workspaces

    monkeypatch.setattr(ocu_workspaces, 'ocu_client', stub)
    monkeypatch.setattr(ocu_workspaces, 'get_ocu_client', lambda: stub)
    return stub


def _describe(chat_id: str, headers: dict[str, str] | None = None):
    return _CLIENT.get(f'{WORKSPACE_PREFIX}/{chat_id}', headers=headers)


def _launch(chat_id: str, headers: dict[str, str] | None = None):
    return _CLIENT.post(f'{WORKSPACE_PREFIX}/{chat_id}/launch', headers=headers)


def _refresh(chat_id: str, headers: dict[str, str] | None = None):
    return _CLIENT.post(f'{WORKSPACE_PREFIX}/{chat_id}/refresh', headers=headers)


def _prefs(chat_id: str, body, headers: dict[str, str] | None = None, *, content: bytes | None = None):
    url = f'{WORKSPACE_PREFIX}/{chat_id}/prefs'
    if content is not None:
        return _CLIENT.put(url, content=content, headers=headers)
    return _CLIENT.put(url, json=body, headers=headers)


def test_describe_never_calls_launch(monkeypatch):
    stub = _install_client(monkeypatch, _StubClient(describe={'state': 'stopped', 'revision': 0, 'views': ['files']}))
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        response = _describe(chat.id, _session_headers(owner.id))
        assert response.status_code == 200
        assert ('launch', chat.id) not in stub.calls
        assert stub.calls == [('describe', chat.id)]
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


@pytest.mark.parametrize('state', STOPPED_STATES)
def test_stopped_and_paused_have_launch_capability(state, monkeypatch):
    _install_client(
        monkeypatch,
        _StubClient(describe={'state': state, 'revision': 3, 'views': ['files']}),
    )
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        body = _describe(chat.id, _session_headers(owner.id)).json()
        assert body['status'] == 'stopped'
        assert 'launch' in body['capabilities']
        assert 'refresh' in body['capabilities']
        assert 'prefs' in body['capabilities']
        assert 'files' not in body
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_running_has_no_launch_capability(monkeypatch):
    _install_client(
        monkeypatch,
        _StubClient(
            describe={'state': 'running', 'revision': 4, 'views': ['files', 'browser', 'terminal'], 'cli_badge': 'ok'}
        ),
    )
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        response = _describe(chat.id, _session_headers(owner.id))
        assert response.status_code == 200
        body = response.json()
        assert body['status'] == 'running'
        assert 'launch' not in body['capabilities']
        assert 'refresh' in body['capabilities']
        assert 'prefs' in body['capabilities']
        assert body['base_url'] == '/ocu'
        assert body['cli_badge'] == 'ok'
        assert body['chat_id'] == chat.id
        assert 'files' not in body
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_unreachable_capabilities_are_prefs_only(monkeypatch):
    from open_webui.utils.ocu_client import OcuUnreachable

    _install_client(monkeypatch, _StubClient(describe_error=OcuUnreachable('down')))
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        body = _describe(chat.id, _session_headers(owner.id)).json()
        assert body['status'] == 'unavailable'
        assert body['reason'] == 'ocu_unreachable'
        assert body['capabilities'] == ['prefs']
        assert body['views'] == []
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_unreachable_returns_stored_cursor(monkeypatch):
    from open_webui.models.ocu_chat_state import OcuChatStates
    from open_webui.utils.ocu_client import OcuUnreachable

    _install_client(monkeypatch, _StubClient(describe_error=OcuUnreachable('down')))
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        asyncio.run(OcuChatStates.advance_cursor(chat.id, 5))
        response = _describe(chat.id, _session_headers(owner.id))
        assert response.status_code == 200
        body = response.json()
        assert body['status'] == 'unavailable'
        assert body['reason'] == 'ocu_unreachable'
        assert body['revision'] == 5
        assert body['views'] == []
        stored = asyncio.run(OcuChatStates.get(chat.id))
        assert stored is not None
        assert stored.last_seen_revision == 5
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


@pytest.mark.parametrize('method,call', [('POST', _launch), ('POST', _refresh), ('PUT', _prefs)])
def test_mutating_without_header_is_403_and_skips_owner_and_client(method, call, monkeypatch):
    from open_webui.models.chats import Chats

    stub = _install_client(monkeypatch, _StubClient())
    spy = AsyncMock()
    monkeypatch.setattr(Chats, 'is_chat_owner', spy)
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        headers = _session_headers(owner.id)
        if call is _prefs:
            response = call(chat.id, {'view': 'files'}, headers)
        else:
            response = call(chat.id, headers)
        assert response.status_code == 403
        spy.assert_not_called()
        assert stub.calls == []
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


@pytest.mark.parametrize('call', [_launch, _refresh, _prefs])
def test_mutating_without_session_is_401(call, monkeypatch):
    from open_webui.models.chats import Chats

    stub = _install_client(monkeypatch, _StubClient())
    spy = AsyncMock()
    monkeypatch.setattr(Chats, 'is_chat_owner', spy)
    if call is _prefs:
        response = call('any-chat', {'view': 'files'}, XR)
    else:
        response = call('any-chat', XR)
    assert response.status_code == 401
    spy.assert_not_called()
    assert stub.calls == []


def test_flag_off_returns_404_for_all_four(monkeypatch):
    import open_webui.routers.ocu_workspaces as ocu_workspaces
    from open_webui.models.chats import Chats

    stub = _install_client(monkeypatch, _StubClient())
    spy = AsyncMock()
    monkeypatch.setattr(Chats, 'is_chat_owner', spy)
    monkeypatch.setattr(ocu_workspaces, 'ENABLE_OCU_WORKSPACE', False)
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        headers = {**_session_headers(owner.id), **XR}
        assert _describe(chat.id, headers).status_code == 404
        assert _launch(chat.id, headers).status_code == 404
        assert _refresh(chat.id, headers).status_code == 404
        assert _prefs(chat.id, {'view': 'files'}, headers).status_code == 404
        spy.assert_not_called()
        assert stub.calls == []
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_launch_never_created_is_409(monkeypatch):
    from open_webui.utils.ocu_client import OcuNeverCreated

    stub = _install_client(monkeypatch, _StubClient(launch=OcuNeverCreated()))
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        response = _launch(chat.id, {**_session_headers(owner.id), **XR})
        assert response.status_code == 409
        assert response.json()['reason'] == 'never_created'
        assert stub.calls == [('launch', chat.id)]
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_refresh_burst_overflow_is_429(monkeypatch):
    import open_webui.routers.ocu_workspaces as ocu_workspaces

    _install_client(monkeypatch, _StubClient(refresh={'revision': 2}))
    monkeypatch.setattr(ocu_workspaces, '_now', lambda: 1_000.0)
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        headers = {**_session_headers(owner.id), **XR}
        codes = [_refresh(chat.id, headers).status_code for _ in range(5)]
        assert codes[:3] == [200, 200, 200]
        assert codes[3:] == [429, 429]
        overflow = _refresh(chat.id, headers)
        assert overflow.status_code == 429
        assert overflow.headers.get('Retry-After') is not None
        int(overflow.headers['Retry-After'])
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_describe_advances_cursor_to_broker_revision_when_stopped(monkeypatch):
    from open_webui.models.ocu_chat_state import OcuChatStates

    _install_client(
        monkeypatch,
        _StubClient(describe={'state': 'stopped', 'revision': 7, 'views': ['files']}),
    )
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        asyncio.run(OcuChatStates.advance_cursor(chat.id, 5))
        response = _describe(chat.id, _session_headers(owner.id))
        assert response.status_code == 200
        body = response.json()
        assert body['status'] == 'stopped'
        assert body['revision'] == 7
        stored = asyncio.run(OcuChatStates.get(chat.id))
        assert stored is not None
        assert stored.last_seen_revision == 7
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_prefs_owner_200(monkeypatch):
    from open_webui.models.ocu_chat_state import OcuChatStates

    _install_client(monkeypatch, _StubClient())
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        payload = {'view': 'terminal', 'selected_file_id': 'f1', 'open': True}
        response = _prefs(chat.id, payload, {**_session_headers(owner.id), **XR})
        assert response.status_code == 200
        stored = asyncio.run(OcuChatStates.get(chat.id))
        assert stored is not None
        assert stored.prefs == payload
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_prefs_non_owner_404(monkeypatch):
    from open_webui.models.ocu_chat_state import OcuChatStates

    _install_client(monkeypatch, _StubClient())
    owner, chat = asyncio.run(_owner_and_chat())
    other = asyncio.run(_insert_user(role='user', prefix='ws-other'))
    try:
        response = _prefs(chat.id, {'view': 'files'}, {**_session_headers(other.id), **XR})
        assert response.status_code == 404
        assert asyncio.run(OcuChatStates.get(chat.id)) is None
    finally:
        asyncio.run(_delete_user(other.id))
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_prefs_anonymous_401(monkeypatch):
    _install_client(monkeypatch, _StubClient())
    assert _prefs('any-chat', {'view': 'files'}, XR).status_code == 401


def test_prefs_unknown_key_422(monkeypatch):
    from open_webui.models.ocu_chat_state import OcuChatStates

    _install_client(monkeypatch, _StubClient())
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        response = _prefs(chat.id, {'token': 'x'}, {**_session_headers(owner.id), **XR})
        assert response.status_code == 422
        assert asyncio.run(OcuChatStates.get(chat.id)) is None
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_prefs_oversize_422(monkeypatch):
    from open_webui.models.ocu_chat_state import OcuChatStates

    _install_client(monkeypatch, _StubClient())
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        body = json.dumps({'view': 'files', 'selected_file_id': 'a' * 3000}).encode()
        assert len(body) > 2048
        response = _prefs(chat.id, None, {**_session_headers(owner.id), **XR}, content=body)
        assert response.status_code == 422
        assert asyncio.run(OcuChatStates.get(chat.id)) is None
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_new_chat_has_no_state_until_write(monkeypatch):
    from open_webui.models.ocu_chat_state import OcuChatStates

    _install_client(monkeypatch, _StubClient())
    owner, chat = asyncio.run(_owner_and_chat())
    clone = asyncio.run(_insert_chat(owner.id))
    try:
        assert asyncio.run(OcuChatStates.get(clone.id)) is None
        asyncio.run(OcuChatStates.advance_cursor(chat.id, 3))
        assert asyncio.run(OcuChatStates.get(clone.id)) is None
    finally:
        asyncio.run(_delete_chat(clone.id))
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_deleted_chat_returns_404(monkeypatch):
    _install_client(monkeypatch, _StubClient())
    owner, chat = asyncio.run(_owner_and_chat())
    chat_id = chat.id
    headers = {**_session_headers(owner.id), **XR}
    asyncio.run(_delete_chat(chat_id))
    try:
        assert _describe(chat_id, headers).status_code == 404
        assert _launch(chat_id, headers).status_code == 404
        assert _refresh(chat_id, headers).status_code == 404
        assert _prefs(chat_id, {'view': 'files'}, headers).status_code == 404
    finally:
        asyncio.run(_delete_user(owner.id))


@pytest.mark.parametrize('chat_id', INVALID_CHAT_IDS)
def test_invalid_chat_id_is_404_without_owner_or_client(chat_id, monkeypatch):
    from open_webui.models.chats import Chats

    stub = _install_client(monkeypatch, _StubClient())
    spy = AsyncMock()
    monkeypatch.setattr(Chats, 'is_chat_owner', spy)
    owner = asyncio.run(_insert_user(role='user', prefix='ws-invalid'))
    try:
        headers = {**_session_headers(owner.id), **XR}
        assert _describe(chat_id, headers).status_code == 404
        assert _launch(chat_id, headers).status_code == 404
        spy.assert_not_called()
        assert stub.calls == []
    finally:
        asyncio.run(_delete_user(owner.id))


def test_nonexistent_chat_is_404(monkeypatch):
    _install_client(monkeypatch, _StubClient())
    owner = asyncio.run(_insert_user(role='user', prefix='ws-missing'))
    try:
        missing = _unique('missing')
        headers = {**_session_headers(owner.id), **XR}
        assert _describe(missing, headers).status_code == 404
        assert _launch(missing, headers).status_code == 404
    finally:
        asyncio.run(_delete_user(owner.id))


def test_launch_success_is_200(monkeypatch):
    stub = _install_client(monkeypatch, _StubClient(launch={'state': 'running'}))
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        response = _launch(chat.id, {**_session_headers(owner.id), **XR})
        assert response.status_code == 200
        assert stub.calls == [('launch', chat.id)]
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_never_created_describe_is_unavailable(monkeypatch):
    _install_client(
        monkeypatch,
        _StubClient(describe={'state': 'never_created', 'revision': 0, 'views': []}),
    )
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        body = _describe(chat.id, _session_headers(owner.id)).json()
        assert body['status'] == 'unavailable'
        assert body['reason'] == 'never_created'
        assert 'launch' not in body['capabilities']
        assert 'refresh' in body['capabilities']
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))
