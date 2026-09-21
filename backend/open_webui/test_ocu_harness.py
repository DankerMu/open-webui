"""Shared OCU TestClient harness for auth, workspace, and chat-state tests."""

from __future__ import annotations

import os
import uuid
from contextlib import contextmanager
from pathlib import Path

_CLIENT = None


def configure_ocu_test_env() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    data_dir = repo_root / '.run' / 'data'
    data_dir.mkdir(parents=True, exist_ok=True)
    os.environ['DATA_DIR'] = str(data_dir)
    os.environ['DATABASE_URL'] = f'sqlite:///{data_dir}/webui.db'
    os.environ.setdefault('WEBUI_SECRET_KEY', 'dev-harness-secret')
    os.environ.setdefault('ENABLE_OLLAMA_API', 'false')
    os.environ.setdefault('ENABLE_OPENAI_API', 'false')
    os.environ.setdefault('OFFLINE_MODE', 'true')
    os.environ.setdefault('ENABLE_VERSION_UPDATE_CHECK', 'false')
    os.environ['ENABLE_OCU_WORKSPACE'] = 'true'


configure_ocu_test_env()


@contextmanager
def session_test_client():
    from fastapi.testclient import TestClient

    from open_webui.main import app

    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        test_client.close()


def bind_client(client) -> None:
    global _CLIENT
    _CLIENT = client


def get_client():
    return _CLIENT


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


async def _insert_chat(owner_id: str, *, folder_id: str | None = None, title: str = 'OCU fixture'):
    from open_webui.models.chats import ChatForm, Chats

    chat = await Chats.insert_new_chat(
        _unique('chat'),
        owner_id,
        ChatForm(chat={'title': title}, folder_id=folder_id),
    )
    assert chat is not None
    return chat


async def _delete_user(user_id: str) -> None:
    from open_webui.models.users import Users

    await Users.delete_user_by_id(user_id)


async def _delete_chat(chat_id: str) -> None:
    from open_webui.models.chats import Chats

    await Chats.delete_chat_by_id(chat_id)


async def _owner_and_chat(*, prefix: str = 'owner', email: str | None = None, title: str = 'OCU fixture'):
    owner = await _insert_user(role='user', prefix=prefix, email=email)
    chat = await _insert_chat(owner.id, title=title)
    return owner, chat


async def _cleanup_owner(owner_id: str, chat_id: str) -> None:
    await _delete_chat(chat_id)
    await _delete_user(owner_id)


def _session_headers(user_id: str) -> dict[str, str]:
    from open_webui.utils.auth import create_token

    return {'Authorization': f'Bearer {create_token({"id": user_id})}'}
