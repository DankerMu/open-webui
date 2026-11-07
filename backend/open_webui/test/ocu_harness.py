"""Shared OCU TestClient harness for auth, workspace, and chat-state tests.

Every consumer imports it as open_webui.test.ocu_harness, before any
open_webui.env import.
"""

from __future__ import annotations

import io
import json
import os
import struct
import sys
import uuid
import zipfile
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse

_CLIENT = None


_DATABASE_VARS = (
    'DATABASE_TYPE',
    'DATABASE_USER',
    'DATABASE_PASSWORD',
    'DATABASE_HOST',
    'DATABASE_PORT',
    'DATABASE_NAME',
)


def configure_ocu_test_env() -> None:
    # open_webui.env freezes the database target at import; configuring afterwards cannot take effect.
    if 'open_webui.env' in sys.modules:
        raise RuntimeError('configure_ocu_test_env must run before open_webui.env is imported')
    # A complete DATABASE_* set from the shell, a uv env-file or dotenv makes open_webui.env rebuild
    # DATABASE_URL, so import-time migrations and test writes would hit a non-harness database.
    for name in _DATABASE_VARS:
        os.environ.pop(name, None)
    os.environ['PYTHON_DOTENV_DISABLED'] = '1'
    repo_root = Path(__file__).resolve().parents[3]
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
    os.environ['ENABLE_OCU_OFFICE_EDIT'] = 'true'


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


class _StubResponse:
    def __init__(self, status=200, payload=None, text=None):
        self.status = status
        self._payload = {} if payload is None else payload
        self._text = text

    async def json(self):
        return self._payload

    async def text(self):
        if self._text is not None:
            return self._text
        return json.dumps(self._payload)


class _StubCM:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self._response

    async def __aexit__(self, _exc_type, _exc, _tb):
        return False


class _StubSession:
    def __init__(self, response=None, error=None):
        self.response = response or _StubResponse()
        self.error = error
        self.calls = []
        self.closed = False

    def request(self, method, url, *, headers=None, **kwargs):
        parsed = urlparse(url)
        self.calls.append(
            {
                'method': method,
                'path': parsed.path,
                'url': url,
                'headers': dict(headers or {}),
            }
        )
        if self.error is not None:
            raise self.error
        return _StubCM(self.response)

    async def close(self):
        self.closed = True


_ZERO_CHUNK = b'\0' * (1 << 20)
# Per signature: offset of the file name, and of each patchable field with its struct format.
_ZIP_HEADERS = {
    b'PK\x03\x04': (30, {'flag_bits': (6, '<H'), 'compress_type': (8, '<H'), 'file_size': (22, '<I')}),
    b'PK\x01\x02': (46, {'flag_bits': (8, '<H'), 'compress_type': (10, '<H'), 'file_size': (24, '<I')}),
}


def skill_zip(entries, *, patch: dict[str, dict[str, int]] | None = None) -> bytes:
    """Build a deflated ZIP in memory from (name or ZipInfo, content) pairs.

    An int content streams that many zero bytes. `patch` overwrites header fields of the named
    entries after writing, for archives zipfile will not write (writestr resets flag_bits).
    """
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, content in entries:
            if isinstance(content, int):
                with archive.open(name, 'w') as stream:
                    for start in range(0, content, len(_ZERO_CHUNK)):
                        stream.write(_ZERO_CHUNK[: content - start])
            else:
                archive.writestr(name, content)
    data = bytearray(buffer.getvalue())
    for name, fields in (patch or {}).items():
        _patch_zip_headers(data, name.encode(), fields)
    return bytes(data)


def _patch_zip_headers(data: bytearray, name: bytes, fields: dict[str, int]) -> None:
    for signature, (name_at, offsets) in _ZIP_HEADERS.items():
        start = data.find(signature)
        while start != -1:
            if data[start + name_at : start + name_at + len(name)] == name:
                for field, value in fields.items():
                    struct.pack_into(offsets[field][1], data, start + offsets[field][0], value)
            start = data.find(signature, start + 1)
