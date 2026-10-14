from __future__ import annotations

import asyncio
import base64
import datetime as dt
import hmac
import json
from contextlib import contextmanager
from types import SimpleNamespace

import jwt
import pytest

from open_webui.test.ocu_harness import (
    _cleanup_owner,
    _owner_and_chat,
    _session_headers,
    get_client,
    session_test_client,
)

ISSUE_PATH = '/api/v1/ocu/resource-grants/issue'
VERIFY_PATH = '/api/v1/ocu/resource-grants/auth'
NOW = 2_000_000_000
REFUSED_RESOURCE_QUERIES = (
    'download=1',
    'x=1&download=1',
    'x=1#//evil',
    'x=\r\nLocation:evil',
    'x=%0d%0aevil',
    'download=1&x=two',
    'flag&download=1&x=two',
    'download=1&x=a=b',
    '_x-=yes&download=1',
    'Download_extra=1&download=1&download2',
    'download=1&x=1&x=2',
    'x=1&x=2&download=1',
    'download=1&x=',
    'x=&download=1',
    'download=1&x=%26',
    'x=%26&download=1',
    'x=%ff',
    'x=1\\path',
)
PRESERVED_RESOURCE_QUERIES = (
    'download=0',
    'Download=1',
    'download=1&download=0',
    'download=1&%64ownload=0',
    'download=1&Download=1',
    'next=https%3A%2F%2Fevil.example%2F&x=%23%25%2B',
    'revision=7',
    'DOWNLOAD=1',
    'download=0&download=1',
    'download=1&download=1',
    'Download=1&download=1',
    '%64ownload=0&download=1',
    'download=1&%78=0',
    '%78=0&download=1',
    'download=1&x.y=0',
    'x.y=0&download=1',
    '&download=1',
    'download=1&',
    'download=1&&x=2',
    '=x&download=1',
    'download=1&download',
    'download&download=1',
)


@pytest.fixture
def resource_owner(monkeypatch):
    from open_webui import env
    from open_webui.routers import ocu_workspaces

    monkeypatch.setattr(env, 'REDIS_URL', '')
    monkeypatch.setattr(env, 'REDIS_SENTINEL_HOSTS', '')
    monkeypatch.setattr(get_client().app.state, 'redis', None, raising=False)
    monkeypatch.setattr(ocu_workspaces, 'ENABLE_OCU_WORKSPACE', True)
    monkeypatch.setattr(ocu_workspaces, 'OCU_INTERNAL_TOKEN', 'resource-test-internal-secret')
    owner, chat = asyncio.run(_owner_and_chat(prefix='grant-security'))
    try:
        yield owner, chat
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


@contextmanager
def _clock(monkeypatch, now):
    from open_webui.routers import ocu_resource_grants
    from open_webui.utils import auth

    class FrozenDatetime(dt.datetime):
        @classmethod
        def now(cls, tz=None):
            return cls.fromtimestamp(now, tz=tz or dt.UTC)

    with monkeypatch.context() as patch:
        patch.setattr(ocu_resource_grants, 'time', SimpleNamespace(time=lambda: now))
        patch.setattr(jwt.api_jwt, 'datetime', FrozenDatetime)
        patch.setattr(auth, 'datetime', FrozenDatetime)
        yield


def _session(owner, **changes):
    from open_webui.utils import auth

    claims = {'id': owner.id, 'jti': 'security-session', 'iat': NOW - 20}
    claims.update(changes)
    return jwt.encode(claims, auth.SESSION_SECRET, algorithm='HS256')


def _issue(owner, chat, *, token=None, method='GET', path='reports/index.html', query='', headers=None):
    session = {}
    if token is not None:
        session = {'Authorization': f'Bearer {token}'}
    elif not headers or not ({'Cookie', 'Authorization'} & headers.keys()):
        session = _session_headers(owner.id)
    return get_client().request(
        method,
        ISSUE_PATH,
        headers={
            **session,
            'X-Chat-Id': chat.id,
            'X-Ocu-Resource-Path': path,
            'X-Ocu-Resource-Query': query,
            **(headers or {}),
        },
        follow_redirects=False,
    )


def _verify(grant, chat, *, path='assets/styles.css', method='GET', headers=None):
    with session_test_client() as holder:
        return holder.get(
            VERIFY_PATH,
            headers={
                'X-Ocu-Grant': grant,
                'X-Chat-Id': chat.id,
                'X-Ocu-Resource-Path': path,
                'X-Ocu-Resource-Method': method,
                **(headers or {}),
            },
        )


def _assert_response(response, status):
    assert response.status_code == status
    assert response.content == b''
    assert response.headers.get('Cache-Control') == 'no-store'
    if status != 302:
        assert 'Location' not in response.headers
    if status != 200:
        assert 'X-User-Id' not in response.headers
        assert 'X-User-Email' not in response.headers


def _grant(response):
    _assert_response(response, 302)
    assert response.headers.get('Referrer-Policy') == 'no-referrer'
    assert response.headers['Location'].startswith('/ocu/f/')
    return response.headers['Location'].split('/', 4)[3]


def _unpack(grant):
    payload = grant.split('.')[0]
    return json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))


def _claims(owner, chat):
    return {
        'purpose': 'ocu-resource-read',
        'user_id': owner.id,
        'chat_id': chat.id,
        'session_jti': 'security-session',
        'session_iat': NOW - 20,
        'session_exp': None,
        'iat': NOW,
        'exp': NOW + 600,
    }


def _json(claims):
    return json.dumps(claims, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def _signed_payload(payload):
    from open_webui.utils.auth import SESSION_SECRET

    key = hmac.digest(SESSION_SECRET.encode('utf-8'), b'ocu-resource-grants', 'sha256')
    signature = hmac.digest(key, payload, 'sha256')
    return '.'.join(base64.urlsafe_b64encode(part).decode('ascii').rstrip('=') for part in (payload, signature))


async def _stored_config(keys):
    from open_webui.internal.db import get_async_db
    from open_webui.models.config import Config

    async with get_async_db() as db:
        rows = [await db.get(Config, key) for key in keys]
        return {row.key for row in rows if row is not None}


async def _change_chat_owner(chat_id, owner_id):
    from sqlalchemy import update

    from open_webui.internal.db import get_async_db
    from open_webui.models.chats import Chat

    async with get_async_db() as db:
        await db.execute(update(Chat).where(Chat.id == chat_id).values(user_id=owner_id))
        await db.commit()


class MemoryRedis:
    def __init__(self):
        self.values = {}

    async def get(self, key):
        return self.values.get(key)

    async def set(self, key, value, **_options):
        self.values[key] = value
