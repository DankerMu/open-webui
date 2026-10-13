from __future__ import annotations

import asyncio
import base64
import json
from contextlib import closing
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import jwt
import pytest
from fastapi.testclient import TestClient
from open_webui.test.ocu_harness import (
    _cleanup_owner,
    _delete_chat,
    _delete_user,
    _insert_chat,
    _insert_user,
    _owner_and_chat,
    _session_headers,
    get_client,
    session_test_client,
)
from open_webui.test.ocu_resource_grants_harness import (
    ISSUE_PATH,
    NOW,
    VERIFY_PATH,
    MemoryRedis,
    _assert_response,
    _change_chat_owner,
    _claims,
    _clock,
    _grant,
    _issue,
    _json,
    _session,
    _signed_payload,
    _stored_config,
    _unpack,
    _verify,
)
from open_webui.test.ocu_resource_grants_harness import resource_owner as resource_owner


def test_owner_session_issues_grant_for_cookie_free_reads_of_same_chat_files():
    owner, chat = asyncio.run(_owner_and_chat(prefix='resource-grant-owner'))
    try:
        issued = get_client().get(
            '/api/v1/ocu/resource-grants/issue',
            headers={
                **_session_headers(owner.id),
                'X-Chat-Id': chat.id,
                'X-Ocu-Resource-Path': 'reports/annual%20summary%20%E4%B8%AD.html',
                'X-Ocu-Resource-Query': 'view=inline&label=a%2Bb%20c&revision=7',
            },
            follow_redirects=False,
        )
        assert issued.status_code == 302
        assert issued.content == b''
        assert issued.headers.get('Cache-Control') == 'no-store'
        assert issued.headers.get('Referrer-Policy') == 'no-referrer'

        location = issued.headers['Location']
        assert location.startswith('/ocu/f/')
        grant, separator, target = location.removeprefix('/ocu/f/').partition('/')
        assert separator == '/'
        assert target == (f'{chat.id}/reports/annual%20summary%20%E4%B8%AD.html?view=inline&label=a%2Bb%20c&revision=7')

        with session_test_client() as holder:
            authorized = holder.get(
                '/api/v1/ocu/resource-grants/auth',
                headers={
                    'X-Ocu-Grant': grant,
                    'X-Chat-Id': chat.id,
                    'X-Ocu-Resource-Path': 'assets/site%20styles.css',
                    'X-Ocu-Resource-Method': 'GET',
                },
            )
        assert 'Cookie' not in authorized.request.headers
        assert 'Authorization' not in authorized.request.headers
        assert authorized.status_code == 200
        assert authorized.content == b''
        assert authorized.headers.get('X-User-Id') == owner.id
        assert authorized.headers.get('X-User-Email') == owner.email
        assert authorized.headers.get('Cache-Control') == 'no-store'
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


@pytest.mark.parametrize(
    'lookup,expected',
    [('user', 503), ('owner', 503), ('owner-internal', 403)],
    ids=['user-lookup', 'owner-lookup', 'owner-internal'],
)
@pytest.mark.parametrize('surface', ['issuer', 'verifier'])
def test_resource_authorization_refuses_storage_failure_boundaries_without_credentials(
    surface, lookup, expected, monkeypatch
):
    from open_webui.models import chats as chat_models
    from open_webui.models.chats import Chats
    from open_webui.models.users import Users

    owner, chat = asyncio.run(_owner_and_chat(prefix='resource-grant-storage'))
    try:
        headers = {
            **_session_headers(owner.id),
            'X-Chat-Id': chat.id,
            'X-Ocu-Resource-Path': 'reports/index.html',
            'X-Ocu-Resource-Query': '',
        }
        path = '/api/v1/ocu/resource-grants/issue'
        issued = get_client().get(path, headers=headers, follow_redirects=False)
        assert issued.status_code == 302
        grant = issued.headers['Location'].removeprefix('/ocu/f/').partition('/')[0]
        if surface == 'verifier':
            path = '/api/v1/ocu/resource-grants/auth'
            headers = {
                'X-Ocu-Grant': grant,
                'X-Chat-Id': chat.id,
                'X-Ocu-Resource-Path': 'assets/styles.css',
                'X-Ocu-Resource-Method': 'GET',
            }
        model, method = (Users, 'get_user_by_id') if lookup == 'user' else (Chats, 'is_chat_owner')
        if lookup == 'owner-internal':
            model, method = chat_models, 'get_async_db_context'
        with monkeypatch.context() as patch:
            failure = Mock if lookup == 'owner-internal' else AsyncMock
            patch.setattr(model, method, failure(side_effect=RuntimeError('Database unavailable')))
            with closing(TestClient(get_client().app, raise_server_exceptions=False)) as unavailable:
                response = unavailable.get(
                    path,
                    headers=headers,
                    follow_redirects=False,
                )
        assert response.status_code == expected
        assert response.content == b''
        assert response.headers.get('Cache-Control') == 'no-store'
        assert 'Location' not in response.headers
        assert 'X-User-Id' not in response.headers
        assert 'X-User-Email' not in response.headers
    finally:
        asyncio.run(_cleanup_owner(owner.id, chat.id))


@pytest.mark.parametrize('method', ['GET', 'HEAD'])
@pytest.mark.parametrize('transport', ['bearer', 'cookie'])
def test_session_owner_entry_preserves_encoded_target_without_exposing_credentials(resource_owner, method, transport):
    from open_webui.utils.auth import create_token

    owner, chat = resource_owner
    session = create_token({'id': owner.id})
    headers = {'Authorization': f'Bearer {session}'} if transport == 'bearer' else {'Cookie': f'token={session}'}
    response = _issue(
        owner,
        chat,
        method=method,
        path='a%20b/%E4%B8%AD%23%2B%25.html',
        query='label=a%2Bb%20c&hash=%23&percent=%25',
        headers=headers,
    )
    grant = _grant(response)
    assert response.headers['Location'].split('/', 4)[4] == (
        f'{chat.id}/a%20b/%E4%B8%AD%23%2B%25.html?label=a%2Bb%20c&hash=%23&percent=%25'
    )
    claims = _unpack(grant)
    assert claims['user_id'] == owner.id
    assert claims['chat_id'] == chat.id
    assert claims['session_jti'] != ''
    raw = base64.urlsafe_b64decode(grant.split('.')[0] + '==')
    assert session.encode() not in raw
    assert owner.email.encode() not in raw
    assert b'resource-test-internal-secret' not in raw
    assert set(claims) == {'purpose', 'user_id', 'chat_id', 'session_jti', 'session_iat', 'session_exp', 'iat', 'exp'}


@pytest.mark.parametrize('token', ['', 'not-a-session', 'sk-not-a-session'])
def test_missing_or_invalid_session_cannot_issue(resource_owner, token):
    owner, chat = resource_owner
    _assert_response(_issue(owner, chat, token=token), 401)


def test_anonymous_entry_cannot_issue(resource_owner):
    _, chat = resource_owner
    with session_test_client() as anonymous:
        response = anonymous.get(ISSUE_PATH, headers={'X-Chat-Id': chat.id, 'X-Ocu-Resource-Path': 'index.html'})
    _assert_response(response, 401)


@pytest.mark.parametrize(
    'change',
    [
        {'jti': None},
        {'jti': ''},
        {'jti': 7},
        {'iat': None},
        {'iat': True},
        {'iat': '2000000000'},
        {'iat': -1},
        {'iat': NOW + 1},
        {'iat': float('nan')},
        {'iat': float('inf')},
        {'exp': None},
        {'exp': True},
        {'exp': '2000000600'},
        {'exp': -1},
        {'exp': float('nan')},
        {'exp': float('inf')},
        {'exp': NOW},
    ],
)
def test_invalid_session_binding_or_time_requires_sign_in(resource_owner, monkeypatch, change):
    owner, chat = resource_owner
    with _clock(monkeypatch, NOW):
        _assert_response(_issue(owner, chat, token=_session(owner, **change)), 401)


@pytest.mark.parametrize('missing', ['jti', 'iat'])
def test_legacy_session_without_binding_requires_sign_in(resource_owner, monkeypatch, missing):
    from open_webui.utils.auth import SESSION_SECRET

    owner, chat = resource_owner
    claims = {'id': owner.id, 'jti': 'legacy-session', 'iat': NOW - 20}
    del claims[missing]
    token = jwt.encode(claims, SESSION_SECRET, algorithm='HS256')
    with _clock(monkeypatch, NOW):
        _assert_response(_issue(owner, chat, token=token), 401)


def test_genuinely_valid_api_key_cannot_issue(resource_owner):
    from open_webui.models.config import Config
    from open_webui.models.users import Users
    from open_webui.utils.auth import create_api_key

    owner, chat = resource_owner
    keys = ('auth.enable_api_keys', 'auth.api_key.endpoint_restrictions')
    saved = asyncio.run(Config.get_many(*keys))
    stored = asyncio.run(_stored_config(keys))
    key = create_api_key()
    try:
        asyncio.run(Users.update_user_role_by_id(owner.id, 'admin'))
        asyncio.run(Users.update_user_api_key_by_id(owner.id, key))
        asyncio.run(Config.upsert({'auth.enable_api_keys': True, 'auth.api_key.endpoint_restrictions': False}))
        existing = get_client().get('/api/v1/auths/', headers={'Authorization': f'Bearer {key}'})
        assert existing.status_code == 200
        assert existing.json()['id'] == owner.id
        _assert_response(_issue(owner, chat, token=key), 401)
    finally:
        try:
            asyncio.run(Config.upsert(saved))
            for setting in set(keys) - stored:
                asyncio.run(Config.delete(setting))
        finally:
            asyncio.run(Users.delete_user_api_key_by_id(owner.id))


@pytest.mark.parametrize('role', ['user', 'admin', 'pending'])
def test_foreign_or_ineligible_user_cannot_issue(resource_owner, role):
    owner, chat = resource_owner
    foreign = asyncio.run(_insert_user(role=role, prefix='grant-foreign'))
    try:
        _assert_response(_issue(foreign, chat), 403)
        if role == 'pending':
            from open_webui.models.users import Users

            asyncio.run(Users.update_user_role_by_id(owner.id, 'pending'))
            _assert_response(_issue(owner, chat), 403)
    finally:
        asyncio.run(_delete_user(foreign.id))


def test_shared_chat_read_access_is_not_issuance_authority(resource_owner):
    from open_webui.models.access_grants import AccessGrants

    _, chat = resource_owner
    grantee = asyncio.run(_insert_user(role='user', prefix='grant-share'))
    try:
        asyncio.run(AccessGrants.grant_access('shared_chat', chat.id, 'user', grantee.id, 'read'))
        assert asyncio.run(AccessGrants.has_access(grantee.id, 'shared_chat', chat.id, 'read')) is True
        _assert_response(_issue(grantee, chat), 403)
    finally:
        asyncio.run(AccessGrants.revoke_access('shared_chat', chat.id, 'user', grantee.id, 'read'))
        asyncio.run(_delete_user(grantee.id))


@pytest.mark.parametrize('surface', [ISSUE_PATH, VERIFY_PATH])
def test_disabled_workspace_denies_registered_routes_even_anonymously(resource_owner, monkeypatch, surface):
    from open_webui.routers import ocu_workspaces

    monkeypatch.setattr(ocu_workspaces, 'ENABLE_OCU_WORKSPACE', False)
    with session_test_client() as anonymous:
        _assert_response(anonymous.get(surface), 403)


@pytest.mark.parametrize('method', ['GET', 'HEAD'])
@pytest.mark.parametrize('holder', ['absent', 'invalid', 'different'])
def test_grant_authority_does_not_depend_on_holder_session(resource_owner, method, holder):
    owner, chat = resource_owner
    foreign = asyncio.run(_insert_user(role='user', prefix='grant-holder'))
    try:
        grant = _grant(_issue(owner, chat))
        headers = {}
        if holder == 'invalid':
            headers = {'Cookie': 'token=invalid', 'Authorization': 'Bearer invalid'}
        if holder == 'different':
            token = _session_headers(foreign.id)['Authorization']
            headers = {'Authorization': token, 'Cookie': f'token={token.removeprefix("Bearer ")}'}
        headers.update({'X-User-Id': foreign.id, 'X-User-Email': 'forged@example.com'})
        response = _verify(grant, chat, method=method, headers=headers)
        _assert_response(response, 200)
        assert response.headers['X-User-Id'] == owner.id
        assert response.headers['X-User-Email'] == owner.email
    finally:
        asyncio.run(_delete_user(foreign.id))


def test_session_and_grant_credentials_are_not_interchangeable(resource_owner):
    owner, chat = resource_owner
    session = _session_headers(owner.id)['Authorization'].removeprefix('Bearer ')
    grant = _grant(_issue(owner, chat, token=session))
    _assert_response(_verify(session, chat), 403)
    with session_test_client() as holder:
        response = holder.get('/api/v1/ocu/auth', headers={'Authorization': f'Bearer {grant}', 'X-Chat-Id': chat.id})
    assert response.status_code == 401
    assert response.content == b''


def test_missing_grant_does_not_fall_back_to_holder_session(resource_owner):
    owner, chat = resource_owner
    _assert_response(_verify('', chat, headers=_session_headers(owner.id)), 401)
    with session_test_client() as holder:
        _assert_response(holder.get(VERIFY_PATH, headers={'X-Chat-Id': chat.id}), 401)


def test_independently_signed_contract_grant_authorizes_owner(resource_owner, monkeypatch):
    owner, chat = resource_owner
    with _clock(monkeypatch, NOW):
        response = _verify(_signed_payload(_json(_claims(owner, chat))), chat)
    _assert_response(response, 200)
    assert response.headers['X-User-Id'] == owner.id


@pytest.mark.parametrize(
    'form',
    [
        'empty-components',
        'extra-component',
        'not-base64',
        'padded',
        'noncanonical-bits',
        'altered-payload',
        'altered-signature',
        'oversized',
        'non-ascii',
    ],
)
def test_malformed_or_altered_capability_never_authorizes(resource_owner, form):
    owner, chat = resource_owner
    grant = _grant(_issue(owner, chat))
    payload, signature = grant.split('.')
    alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    noncanonical_last = alphabet[alphabet.index(signature[-1]) + 1]
    bad = {
        'empty-components': '.',
        'extra-component': grant + '.extra',
        'not-base64': '!.!',
        'padded': payload + '=.' + signature,
        'noncanonical-bits': payload + '.' + signature[:-1] + noncanonical_last,
        'altered-payload': ('A' if payload[0] != 'A' else 'B') + payload[1:] + '.' + signature,
        'altered-signature': payload + '.' + ('A' if signature[0] != 'A' else 'B') + signature[1:],
        'oversized': 'a' * 4097,
        'non-ascii': b'\xe9.' + signature.encode('ascii'),
    }[form]
    _assert_response(_verify(bad, chat), 403)


@pytest.mark.parametrize(
    'field,value',
    [
        ('purpose', 'webui-login'),
        ('purpose', None),
        ('user_id', 1),
        ('user_id', ''),
        ('chat_id', []),
        ('session_jti', ''),
        ('session_jti', False),
        ('session_iat', NOW + 1),
        ('iat', NOW + 1),
        ('exp', NOW),
        ('exp', NOW + 601),
        ('session_exp', NOW + 599),
    ],
)
def test_correctly_signed_invalid_claims_never_authorize(resource_owner, monkeypatch, field, value):
    owner, chat = resource_owner
    claims = _claims(owner, chat)
    claims[field] = value
    with _clock(monkeypatch, NOW):
        _assert_response(_verify(_signed_payload(_json(claims)), chat), 403)


@pytest.mark.parametrize('field', ['session_iat', 'iat', 'exp', 'session_exp'])
@pytest.mark.parametrize('value', [True, '2000000000', -1, float('nan'), float('inf'), float('-inf')])
def test_mistyped_or_nonfinite_signed_times_never_authorize(resource_owner, monkeypatch, field, value):
    owner, chat = resource_owner
    claims = _claims(owner, chat)
    claims[field] = value
    with _clock(monkeypatch, NOW):
        _assert_response(_verify(_signed_payload(_json(claims)), chat), 403)


@pytest.mark.parametrize(
    'form',
    [
        'extra',
        'duplicate',
        'noncanonical-json',
        'invalid-utf8',
        'list',
        'null',
        'nested',
        'deep-nesting',
        'huge-number',
        'surrogate',
    ],
)
def test_signed_payload_parser_refuses_ambiguous_or_invalid_schema(resource_owner, monkeypatch, form):
    owner, chat = resource_owner
    claims = _claims(owner, chat)
    raw = _json(claims)
    if form == 'extra':
        raw = _json({**claims, 'authority': 'all-files'})
    if form == 'duplicate':
        raw = b'{"purpose":"ocu-resource-read",' + raw[1:]
    if form == 'noncanonical-json':
        raw = json.dumps(claims, indent=2).encode()
    invalid = {
        'invalid-utf8': b'\xff',
        'list': b'[]',
        'null': b'null',
        'nested': _json({**claims, 'user_id': {'id': owner.id}}),
        'deep-nesting': b'[' * 1100 + b'0' + b']' * 1100,
        'huge-number': raw.replace(str(NOW + 600).encode(), b'1' + b'0' * 400),
        'surrogate': raw.replace(b'security-session', b'\\ud800'),
    }
    raw = invalid.get(form, raw)
    with _clock(monkeypatch, NOW):
        _assert_response(_verify(_signed_payload(raw), chat), 403)


def test_capability_size_boundary_accepts_4096_and_refuses_4097_bytes(resource_owner, monkeypatch):
    owner, chat = resource_owner
    claims = _claims(owner, chat)
    claims['session_jti'] = ''
    claims['session_jti'] = 'j' * (3039 - len(_json(claims)))
    grant = _signed_payload(_json(claims))
    assert len(grant.encode('ascii')) == 4096
    with _clock(monkeypatch, NOW):
        _assert_response(_verify(grant, chat), 200)
        _assert_response(_verify(grant + 'A', chat), 403)


@pytest.mark.parametrize('session_exp,expected_exp', [(None, NOW + 600), (NOW + 17, NOW + 17), (NOW + 900, NOW + 600)])
def test_grant_expiry_is_capped_by_session_and_ten_minutes(resource_owner, monkeypatch, session_exp, expected_exp):
    owner, chat = resource_owner
    changes = {} if session_exp is None else {'exp': session_exp}
    with _clock(monkeypatch, NOW):
        grant = _grant(_issue(owner, chat, token=_session(owner, **changes)))
    claims = _unpack(grant)
    assert claims['iat'] == NOW
    assert claims['exp'] == expected_exp
    assert claims['session_exp'] == session_exp
    with _clock(monkeypatch, expected_exp - 0.001):
        _assert_response(_verify(grant, chat), 200)
    with _clock(monkeypatch, expected_exp):
        _assert_response(_verify(grant, chat), 403)


def test_session_exact_expiry_refuses_issuance_through_real_decoder(resource_owner, monkeypatch):
    owner, chat = resource_owner
    token = _session(owner, exp=NOW + 17)
    with _clock(monkeypatch, NOW + 16):
        _grant(_issue(owner, chat, token=token))
    with _clock(monkeypatch, NOW + 17):
        _assert_response(_issue(owner, chat, token=token), 401)


@pytest.mark.parametrize(
    'path',
    [
        None,
        '',
        '.',
        '..',
        '/index.html',
        'index.html/',
        'a//b',
        'a/./b',
        'a/../b',
        'a\\b',
        'a%2Fb',
        'a%2fb',
        'a%5Cb',
        '%2e',
        '%2e%2e/x',
        'a/%00b',
        'a%0Db',
        'a%7Fb',
        '%252e%252e/b',
        'a%252fb',
        'archive',
        '%61rchive',
        'a?x=1',
        'a#fragment',
        '//evil.example/file',
        'https://evil.example/file',
        'a\r\nb',
    ],
)
@pytest.mark.parametrize('surface', ['issuer', 'verifier'])
def test_out_of_scope_file_paths_are_refused(resource_owner, path, surface):
    owner, chat = resource_owner
    grant = _grant(_issue(owner, chat))
    headers = {'X-Ocu-Resource-Path': path} if path is not None else {}
    if path is None:
        with session_test_client() as holder:
            headers.update({'X-Chat-Id': chat.id})
            headers.update(
                _session_headers(owner.id)
                if surface == 'issuer'
                else {'X-Ocu-Grant': grant, 'X-Ocu-Resource-Method': 'GET'}
            )
            response = holder.get(ISSUE_PATH if surface == 'issuer' else VERIFY_PATH, headers=headers)
    else:
        response = _issue(owner, chat, path=path) if surface == 'issuer' else _verify(grant, chat, path=path)
    _assert_response(response, 403)


@pytest.mark.parametrize(
    'path',
    [
        'a%20b/%E4%B8%AD.html',
        'a%23b.css',
        'a%2Bb.css',
        '100%25.txt',
        '.hidden',
        'private/report.html',
        'office.docx',
        'unlisted/nested.js',
        'archive/report.txt',
    ],
)
def test_ordinary_encoded_or_unlisted_names_remain_in_whole_chat_scope(resource_owner, path):
    owner, chat = resource_owner
    grant = _grant(_issue(owner, chat, path=path))
    _assert_response(_verify(grant, chat, path=path), 200)


@pytest.mark.parametrize(
    'chat_id',
    [
        '',
        'default',
        'temporary:abc',
        'local:abc',
        'channel:abc',
        '../chat',
        'chat/other',
        'chat?other',
        'chat#other',
        'chat%2fother',
        'chat\\other',
        'chat\r\nInjected:1',
        'other-saved-chat',
    ],
)
@pytest.mark.parametrize('surface', ['issuer', 'verifier'])
def test_invalid_or_wrong_chat_cannot_use_owner_authority(resource_owner, chat_id, surface):
    owner, chat = resource_owner
    grant = _grant(_issue(owner, chat))
    headers = {'X-Chat-Id': chat_id}
    response = _issue(owner, chat, headers=headers) if surface == 'issuer' else _verify(grant, chat, headers=headers)
    _assert_response(response, 403)


@pytest.mark.parametrize('method', ['', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'get', 'CONNECT'])
def test_grant_never_authorizes_nonread_operations(resource_owner, method):
    owner, chat = resource_owner
    grant = _grant(_issue(owner, chat))
    _assert_response(_verify(grant, chat, method=method), 403)


@pytest.mark.parametrize('query', ['download=1', 'x=1&download=1', 'x=1#//evil', 'x=\r\nLocation:evil', 'x=%0d%0aevil'])
def test_issuer_refuses_download_or_redirect_query_injection(resource_owner, query):
    owner, chat = resource_owner
    _assert_response(_issue(owner, chat, query=query), 403)


@pytest.mark.parametrize(
    'query',
    [
        'download=0',
        'Download=1',
        'download=1&download=0',
        'download=1&Download=1',
        'next=https%3A%2F%2Fevil.example%2F&x=%23%25%2B',
    ],
)
def test_issuer_preserves_nondownload_query_semantics_without_external_redirect(resource_owner, query):
    owner, chat = resource_owner
    response = _issue(owner, chat, query=query, headers={'Host': 'evil.example', 'X-Forwarded-Host': 'evil.example'})
    _grant(response)
    assert response.headers['Location'].split('/', 4)[4] == f'{chat.id}/reports/index.html?{query}'


@pytest.mark.parametrize('change', ['owner', 'role', 'deleted-user', 'workspace'])
def test_next_request_rechecks_current_authorization_after_state_change(resource_owner, monkeypatch, change):
    from open_webui.models.users import Users
    from open_webui.routers import ocu_workspaces

    owner, chat = resource_owner
    grant = _grant(_issue(owner, chat))
    _assert_response(_verify(grant, chat), 200)
    if change == 'owner':
        asyncio.run(_change_chat_owner(chat.id, 'different-owner'))
    if change == 'role':
        asyncio.run(Users.update_user_role_by_id(owner.id, 'pending'))
    if change == 'deleted-user':
        assert asyncio.run(Users.delete_user_by_id(owner.id)) is True
    if change == 'workspace':
        monkeypatch.setattr(ocu_workspaces, 'ENABLE_OCU_WORKSPACE', False)
    _assert_response(_verify(grant, chat), 403)


def test_grant_identity_uses_fresh_database_email_not_signed_or_holder_identity(resource_owner):
    from open_webui.models.users import Users

    owner, chat = resource_owner
    grant = _grant(_issue(owner, chat))
    assert _verify(grant, chat).headers['X-User-Email'] == owner.email
    asyncio.run(Users.update_user_by_id(owner.id, {'email': '用户@example.com'}))
    response = _verify(grant, chat, headers={'X-User-Email': 'stale@example.com'})
    _assert_response(response, 200)
    assert response.headers['X-User-Id'] == owner.id
    assert response.headers['X-User-Email'] == '%E7%94%A8%E6%88%B7@example.com'


@pytest.mark.parametrize('revocation', ['token', 'user'])
def test_existing_revocation_refuses_next_grant_and_issuer_request(resource_owner, monkeypatch, revocation):
    from open_webui import env
    from open_webui.utils import auth

    owner, chat = resource_owner
    redis = MemoryRedis()
    monkeypatch.setattr(get_client().app.state, 'redis', redis)
    token = _session(owner, exp=NOW + 900)
    with _clock(monkeypatch, NOW):
        grant = _grant(_issue(owner, chat, token=token))
        _assert_response(_verify(grant, chat), 200)
        request = SimpleNamespace(app=get_client().app)
        if revocation == 'token':
            asyncio.run(auth.invalidate_token(request, token))
        else:
            redis.values[f'{env.REDIS_KEY_PREFIX}:auth:user:{owner.id}:revoked_at'] = str(NOW - 20)
        _assert_response(_verify(grant, chat), 403)
        _assert_response(_issue(owner, chat, token=token), 401)


@pytest.mark.parametrize('cutoff,expected', [(NOW - 21, 200), (NOW - 20, 403), (NOW - 19, 403)])
def test_user_revocation_cutoff_uses_original_session_issuance(resource_owner, monkeypatch, cutoff, expected):
    from open_webui import env

    owner, chat = resource_owner
    redis = MemoryRedis()
    monkeypatch.setattr(get_client().app.state, 'redis', redis)
    with _clock(monkeypatch, NOW):
        grant = _grant(_issue(owner, chat, token=_session(owner)))
        _assert_response(_verify(grant, chat), 200)
        redis.values[f'{env.REDIS_KEY_PREFIX}:auth:user:{owner.id}:revoked_at'] = str(cutoff)
        _assert_response(_verify(grant, chat), expected)


def test_existing_per_user_revocation_helper_invalidates_issued_grant(resource_owner, monkeypatch):
    from open_webui.utils import auth

    owner, chat = resource_owner
    monkeypatch.setattr(get_client().app.state, 'redis', MemoryRedis())
    with _clock(monkeypatch, NOW):
        grant = _grant(_issue(owner, chat, token=_session(owner)))
        _assert_response(_verify(grant, chat), 200)
        asyncio.run(auth.revoke_user_tokens(SimpleNamespace(app=get_client().app), owner.id))
        _assert_response(_verify(grant, chat), 403)


@pytest.mark.parametrize('store', ['absent', 'no-exp-session'])
def test_logout_without_effective_stored_revocation_is_bounded_by_grant_expiry(resource_owner, monkeypatch, store):
    from open_webui.utils import auth

    owner, chat = resource_owner
    if store == 'no-exp-session':
        monkeypatch.setattr(get_client().app.state, 'redis', MemoryRedis())
    with _clock(monkeypatch, NOW):
        token = _session(owner) if store == 'no-exp-session' else _session(owner, exp=NOW + 900)
        grant = _grant(_issue(owner, chat, token=token))
        asyncio.run(auth.invalidate_token(SimpleNamespace(app=get_client().app), token))
        _assert_response(_verify(grant, chat), 200)
    with _clock(monkeypatch, NOW + 600):
        _assert_response(_verify(grant, chat), 403)


@pytest.mark.parametrize('failure', ['configured-url', 'configured-sentinel', 'get-error'])
@pytest.mark.parametrize('surface', ['issuer', 'verifier'])
def test_unavailable_configured_revocation_storage_fails_closed(resource_owner, monkeypatch, failure, surface):
    from open_webui import env

    owner, chat = resource_owner
    grant = _grant(_issue(owner, chat))
    if failure == 'configured-url':
        monkeypatch.setattr(env, 'REDIS_URL', 'redis://unavailable.invalid:6379')
    if failure == 'configured-sentinel':
        monkeypatch.setattr(env, 'REDIS_SENTINEL_HOSTS', 'unavailable.invalid')
    if failure == 'get-error':
        redis = MemoryRedis()
        monkeypatch.setattr(redis, 'get', AsyncMock(side_effect=RuntimeError('Revocation store unavailable')))
        monkeypatch.setattr(get_client().app.state, 'redis', redis)
    response = _issue(owner, chat) if surface == 'issuer' else _verify(grant, chat)
    _assert_response(response, 503)


@pytest.mark.parametrize(
    'missing', ['purpose', 'user_id', 'chat_id', 'session_jti', 'session_iat', 'session_exp', 'iat', 'exp']
)
def test_signed_capability_requires_every_binding_claim(resource_owner, monkeypatch, missing):
    owner, chat = resource_owner
    claims = _claims(owner, chat)
    del claims[missing]
    with _clock(monkeypatch, NOW):
        _assert_response(_verify(_signed_payload(_json(claims)), chat), 403)


def test_shared_folder_read_access_is_not_issuance_authority(resource_owner):
    from open_webui.models.access_grants import AccessGrants
    from open_webui.models.chats import Chats
    from open_webui.models.folders import FolderForm, Folders
    from open_webui.utils.access_control.folders import has_folder_access

    owner, chat = resource_owner
    grantee = asyncio.run(_insert_user(role='user', prefix='grant-folder'))
    folder = asyncio.run(Folders.insert_new_folder(owner.id, FolderForm(name='Grant folder')))
    assert folder is not None
    try:
        asyncio.run(Chats.update_chat_folder_id_by_id_and_user_id(chat.id, owner.id, folder.id))
        asyncio.run(AccessGrants.grant_access('folder', folder.id, 'user', grantee.id, 'read'))
        folder = asyncio.run(Folders.get_folder_by_id(folder.id))
        assert asyncio.run(has_folder_access(grantee.id, folder, 'read', None)) is True
        _assert_response(_issue(grantee, chat), 403)
    finally:
        asyncio.run(AccessGrants.revoke_access('folder', folder.id, 'user', grantee.id, 'read'))
        asyncio.run(Folders.delete_folder_by_id_and_user_id(folder.id, owner.id))
        asyncio.run(_delete_user(grantee.id))


def test_grant_cannot_read_another_chat_even_when_issuer_owns_both(resource_owner):
    owner, chat = resource_owner
    another = asyncio.run(_insert_chat(owner.id))
    try:
        grant = _grant(_issue(owner, chat))
        _assert_response(_verify(grant, another), 403)
    finally:
        asyncio.run(_delete_chat(another.id))


@pytest.mark.parametrize('surface', ['issuer', 'verifier'])
def test_missing_chat_target_cannot_use_session_or_grant_authority(resource_owner, surface):
    owner, chat = resource_owner
    headers = {'X-Ocu-Resource-Path': 'index.html'}
    if surface == 'issuer':
        headers.update(_session_headers(owner.id))
    else:
        headers.update({'X-Ocu-Grant': _grant(_issue(owner, chat)), 'X-Ocu-Resource-Method': 'GET'})
    with session_test_client() as holder:
        _assert_response(holder.get(ISSUE_PATH if surface == 'issuer' else VERIFY_PATH, headers=headers), 403)


def test_expiry_requires_reopening_canonical_entry_for_fresh_authority(resource_owner, monkeypatch):
    owner, chat = resource_owner
    token = _session(owner)
    with _clock(monkeypatch, NOW):
        old_grant = _grant(_issue(owner, chat, token=token))
        _assert_response(_verify(old_grant, chat), 200)
    with _clock(monkeypatch, NOW + 600):
        _assert_response(_verify(old_grant, chat), 403)
        fresh = _grant(_issue(owner, chat, token=token))
        assert _unpack(fresh)['exp'] == NOW + 1200
        _assert_response(_verify(fresh, chat), 200)
        _assert_response(_verify(old_grant, chat), 403)
