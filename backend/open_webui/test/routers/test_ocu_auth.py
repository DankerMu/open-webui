"""TestClient matrix for GET /api/v1/ocu/auth."""

from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path
from unittest.mock import AsyncMock
from urllib.parse import quote

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

AUTH_PATH = '/api/v1/ocu/auth'
INVALID_CHAT_IDS = ('temporary:abc', 'local:abc', 'channel:abc', '', 'default')


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


async def _insert_chat(owner_id: str, *, folder_id: str | None = None):
    from open_webui.models.chats import ChatForm, Chats

    chat = await Chats.insert_new_chat(
        _unique('chat'),
        owner_id,
        ChatForm(chat={'title': 'OCU auth fixture'}, folder_id=folder_id),
    )
    assert chat is not None
    return chat


async def _delete_user(user_id: str) -> None:
    from open_webui.models.users import Users

    await Users.delete_user_by_id(user_id)


async def _delete_chat(chat_id: str) -> None:
    from open_webui.models.chats import Chats

    await Chats.delete_chat_by_id(chat_id)


async def _revoke_grant(resource_type: str, resource_id: str, principal_id: str) -> None:
    from open_webui.models.access_grants import AccessGrants

    await AccessGrants.revoke_access(
        resource_type,
        resource_id,
        'user',
        principal_id,
        'read',
    )


def _session_headers(user_id: str) -> dict[str, str]:
    from open_webui.utils.auth import create_token

    return {'Authorization': f'Bearer {create_token({"id": user_id})}'}


def _cookie_headers(user_id: str) -> dict[str, str]:
    from open_webui.utils.auth import create_token

    return {'Cookie': f'token={create_token({"id": user_id})}'}


def _auth_get(headers: dict[str, str] | None = None):
    return _CLIENT.get(AUTH_PATH, headers=headers)


def _assert_empty(response, status_code: int) -> None:
    assert response.status_code == status_code
    assert response.content == b''


def test_owner_session_returns_200_identity_headers_and_empty_body():
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        response = _auth_get({**_session_headers(owner.id), 'X-Chat-Id': chat.id})
        assert response.status_code == 200
        assert response.headers.get('X-User-Id') == owner.id
        assert response.headers.get('X-User-Email') == owner.email
        assert response.content == b''
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_owner_cookie_session_returns_200_identity_headers_and_empty_body():
    owner, chat = asyncio.run(_owner_and_chat())
    try:
        response = _auth_get({**_cookie_headers(owner.id), 'X-Chat-Id': chat.id})
        assert response.status_code == 200
        assert response.headers.get('X-User-Id') == owner.id
        assert response.headers.get('X-User-Email') == owner.email
        assert response.content == b''
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_owner_with_non_latin1_email_returns_200_percent_encoded_header():
    owner, chat = asyncio.run(_owner_and_chat(email='用户@example.com'))
    try:
        response = _auth_get({**_session_headers(owner.id), 'X-Chat-Id': chat.id})
        assert response.status_code == 200
        assert response.content == b''
        assert response.headers.get('X-User-Id') == owner.id
        assert response.headers.get('X-User-Email') == quote(owner.email, safe='@.')
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_anonymous_request_returns_401_empty_body():
    _assert_empty(_auth_get({'X-Chat-Id': _unique('chat')}), 401)


def test_invalid_session_returns_401_empty_body():
    _assert_empty(
        _auth_get({'Authorization': 'Bearer not-a-jwt', 'X-Chat-Id': _unique('chat')}),
        401,
    )


def test_missing_chat_id_header_returns_403_empty_body():
    owner = asyncio.run(_insert_user(role='user', prefix='missing-header'))
    try:
        _assert_empty(_auth_get(_session_headers(owner.id)), 403)
    finally:
        asyncio.run(_delete_user(owner.id))


@pytest.mark.parametrize('chat_id', INVALID_CHAT_IDS)
def test_invalid_chat_id_returns_403_without_ownership_lookup(chat_id, monkeypatch):
    from open_webui.models.chats import Chats

    owner = asyncio.run(_insert_user(role='user', prefix='invalid-id'))
    spy = AsyncMock()
    monkeypatch.setattr(Chats, 'is_chat_owner', spy)
    try:
        _assert_empty(_auth_get({**_session_headers(owner.id), 'X-Chat-Id': chat_id}), 403)
        spy.assert_not_called()
    finally:
        asyncio.run(_delete_user(owner.id))


def test_shared_chat_grantee_returns_403_empty_body():
    from open_webui.models.access_grants import AccessGrants

    owner, grantee, chat = asyncio.run(_shared_chat_fixture())
    try:
        granted = asyncio.run(AccessGrants.has_access(grantee.id, 'shared_chat', chat.id, 'read'))
        assert granted is True
        _assert_empty(_auth_get({**_session_headers(grantee.id), 'X-Chat-Id': chat.id}), 403)
    finally:
        asyncio.run(_cleanup_shared(owner.id, grantee.id, chat.id))


def test_folder_grantee_returns_403_empty_body():
    from open_webui.models.folders import Folders
    from open_webui.utils.access_control.folders import has_folder_access

    owner, grantee, chat, folder_id = asyncio.run(_folder_grant_fixture())
    try:
        folder = asyncio.run(Folders.get_folder_by_id(folder_id))
        assert folder is not None
        assert asyncio.run(has_folder_access(grantee.id, folder, 'read', None)) is True
        _assert_empty(_auth_get({**_session_headers(grantee.id), 'X-Chat-Id': chat.id}), 403)
    finally:
        asyncio.run(_cleanup_folder(owner.id, grantee.id, chat.id, folder_id))


def test_admin_non_owner_returns_403_empty_body():
    owner, admin, chat = asyncio.run(_admin_non_owner_fixture())
    try:
        _assert_empty(_auth_get({**_session_headers(admin.id), 'X-Chat-Id': chat.id}), 403)
    finally:
        asyncio.run(_cleanup_admin(owner.id, admin.id, chat.id))


def test_nonexistent_chat_returns_403_empty_body():
    owner = asyncio.run(_insert_user(role='user', prefix='missing-chat'))
    try:
        _assert_empty(
            _auth_get({**_session_headers(owner.id), 'X-Chat-Id': _unique('missing')}),
            403,
        )
    finally:
        asyncio.run(_delete_user(owner.id))


def test_flag_off_owner_returns_403_never_404(monkeypatch):
    import open_webui.routers.ocu_workspaces as ocu_workspaces

    owner, chat = asyncio.run(_owner_and_chat())
    monkeypatch.setattr(ocu_workspaces, 'ENABLE_OCU_WORKSPACE', False)
    try:
        response = _auth_get({**_session_headers(owner.id), 'X-Chat-Id': chat.id})
        _assert_empty(response, 403)
        assert response.status_code != 404
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


def test_other_route_keeps_usual_error_body():
    response = _CLIENT.get('/api/v1/auths/')
    assert response.status_code == 401
    assert response.content != b''
    body = response.json()
    assert 'detail' in body
    assert body['detail']


async def _owner_and_chat(*, email: str | None = None):
    owner = await _insert_user(role='user', prefix='owner', email=email)
    chat = await _insert_chat(owner.id)
    return owner, chat


async def _cleanup_owner(owner_id: str, chat_id: str) -> None:
    await _delete_chat(chat_id)
    await _delete_user(owner_id)


async def _shared_chat_fixture():
    from open_webui.models.access_grants import AccessGrants

    owner = await _insert_user(role='user', prefix='share-owner')
    grantee = await _insert_user(role='user', prefix='share-grantee')
    chat = await _insert_chat(owner.id)
    grant = await AccessGrants.grant_access('shared_chat', chat.id, 'user', grantee.id, 'read')
    assert grant is not None
    return owner, grantee, chat


async def _cleanup_shared(owner_id: str, grantee_id: str, chat_id: str) -> None:
    await _revoke_grant('shared_chat', chat_id, grantee_id)
    await _delete_chat(chat_id)
    await _delete_user(grantee_id)
    await _delete_user(owner_id)


async def _folder_grant_fixture():
    from open_webui.models.access_grants import AccessGrants
    from open_webui.models.folders import FolderForm, Folders

    owner = await _insert_user(role='user', prefix='folder-owner')
    grantee = await _insert_user(role='user', prefix='folder-grantee')
    folder = await Folders.insert_new_folder(owner.id, FolderForm(name=_unique('folder')))
    assert folder is not None
    chat = await _insert_chat(owner.id, folder_id=folder.id)
    grant = await AccessGrants.grant_access('folder', folder.id, 'user', grantee.id, 'read')
    assert grant is not None
    return owner, grantee, chat, folder.id


async def _cleanup_folder(owner_id: str, grantee_id: str, chat_id: str, folder_id: str) -> None:
    from open_webui.models.folders import Folders

    await _revoke_grant('folder', folder_id, grantee_id)
    await _delete_chat(chat_id)
    await Folders.delete_folder_by_id_and_user_id(folder_id, owner_id)
    await _delete_user(grantee_id)
    await _delete_user(owner_id)


async def _admin_non_owner_fixture():
    owner = await _insert_user(role='user', prefix='admin-owner')
    admin = await _insert_user(role='admin', prefix='admin-other')
    chat = await _insert_chat(owner.id)
    return owner, admin, chat


async def _cleanup_admin(owner_id: str, admin_id: str, chat_id: str) -> None:
    await _delete_chat(chat_id)
    await _delete_user(admin_id)
    await _delete_user(owner_id)
