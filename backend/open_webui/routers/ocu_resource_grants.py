from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import math
import re
import time
from urllib.parse import quote, unquote

from fastapi import APIRouter, Request
from open_webui import env
from open_webui.models.chats import Chats
from open_webui.models.users import Users
from open_webui.routers import ocu_workspaces
from open_webui.utils import auth
from open_webui.utils.chat_id import is_saved_chat_id
from starlette.responses import Response

router = APIRouter()
_PURPOSE = 'ocu-resource-read'
_KEY_LABEL = b'ocu-resource-grants'
_MAX_TOKEN_BYTES = 4096
_MAX_LIFETIME = 600
_CLAIMS = frozenset({'purpose', 'user_id', 'chat_id', 'session_jti', 'session_iat', 'session_exp', 'iat', 'exp'})
_BASE64URL = re.compile(r'[A-Za-z0-9_-]+\Z')
_PATH_SEGMENT = re.compile(r"(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|%[0-9A-Fa-f]{2})+\Z")
_ENCODED_OCTET = re.compile(r'%[0-9A-Fa-f]{2}')


def _empty(status_code: int, headers: dict[str, str] | None = None) -> Response:
    return Response(status_code=status_code, content=b'', headers={'Cache-Control': 'no-store', **(headers or {})})


def _has_control(value: str) -> bool:
    return any(ord(char) < 32 or 127 <= ord(char) <= 159 for char in value)


def _valid_chat(chat_id: str | None) -> bool:
    return (
        isinstance(chat_id, str)
        and is_saved_chat_id(chat_id)
        and chat_id not in ('default', '.', '..')
        and not any(char in '/\\?#%' or char.isspace() for char in chat_id)
        and not _has_control(chat_id)
    )


def _valid_path(path: str | None) -> bool:
    if not path:
        return False
    decoded_segments = []
    for segment in path.split('/'):
        if not _PATH_SEGMENT.fullmatch(segment):
            return False
        try:
            decoded = unquote(segment, encoding='utf-8', errors='strict')
        except UnicodeError:
            return False
        if decoded in ('.', '..') or '/' in decoded or '\\' in decoded:
            return False
        if _has_control(decoded) or _ENCODED_OCTET.search(decoded):
            return False
        decoded_segments.append(decoded)
    return decoded_segments != ['archive']


def _valid_query(query: str) -> bool:
    if any(ord(char) < 33 or ord(char) > 126 or char in '#\\' for char in query):
        return False
    try:
        decoded = unquote(query, encoding='utf-8', errors='strict')
    except UnicodeError:
        return False
    if _has_control(decoded):
        return False
    download_fields = [
        field.partition('=') for field in query.split('&') if field.partition('=')[0].lower() == 'download'
    ]
    return not (len(download_fields) == 1 and download_fields[0] == ('download', '=', '1'))


def _number(value) -> bool:
    if type(value) not in (int, float):
        return False
    try:
        return value >= 0 and math.isfinite(value)
    except OverflowError:
        return False


def _identifier(value) -> bool:
    return isinstance(value, str) and bool(value) and not _has_control(value)


def _valid_session(session: dict, now: float) -> bool:
    if not _identifier(session.get('id')) or not _identifier(session.get('jti')):
        return False
    issued_at = session.get('iat')
    if not _number(issued_at) or issued_at > now:
        return False
    if 'exp' not in session:
        return True
    expires_at = session['exp']
    return _number(expires_at) and expires_at > now and expires_at > issued_at


def _valid_claims(claims: dict, now: float) -> bool:
    if not isinstance(claims, dict) or claims.keys() != _CLAIMS or claims['purpose'] != _PURPOSE:
        return False
    if (
        not _identifier(claims['user_id'])
        or not _identifier(claims['session_jti'])
        or not _valid_chat(claims['chat_id'])
    ):
        return False
    if not all(_number(claims[key]) for key in ('session_iat', 'iat', 'exp')):
        return False
    issued_at, expires_at = claims['iat'], claims['exp']
    if not (claims['session_iat'] <= issued_at <= now < expires_at):
        return False
    if not (0 < expires_at - issued_at <= _MAX_LIFETIME):
        return False
    session_exp = claims['session_exp']
    return session_exp is None or (_number(session_exp) and expires_at <= session_exp)


def _canonical_json(claims: dict) -> bytes:
    return json.dumps(claims, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(',', ':')).encode(
        'utf-8'
    )


def _key() -> bytes:
    return hmac.new(auth.SESSION_SECRET.encode('utf-8'), _KEY_LABEL, hashlib.sha256).digest()


def _base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _decode_component(component: str) -> bytes:
    if not _BASE64URL.fullmatch(component):
        raise ValueError('Invalid capability encoding')
    decoded = base64.b64decode(component + '=' * (-len(component) % 4), altchars=b'-_', validate=True)
    if _base64url(decoded) != component:
        raise ValueError('Noncanonical capability encoding')
    return decoded


def _unique_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate capability claim')
        result[key] = value
    return result


def _encode_grant(claims: dict) -> str:
    payload = _canonical_json(claims)
    signature = hmac.new(_key(), payload, hashlib.sha256).digest()
    token = f'{_base64url(payload)}.{_base64url(signature)}'
    if len(token) > _MAX_TOKEN_BYTES:
        raise ValueError('Capability exceeds size limit')
    return token


def _decode_grant(token: str, now: float) -> dict | None:
    if len(token) > _MAX_TOKEN_BYTES or not token.isascii() or token.count('.') != 1:
        return None
    try:
        payload_component, signature_component = token.split('.')
        payload = _decode_component(payload_component)
        signature = _decode_component(signature_component)
        expected = hmac.new(_key(), payload, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            return None
        claims = json.loads(payload.decode('utf-8'), object_pairs_hook=_unique_object)
        if not _valid_claims(claims, now) or _canonical_json(claims) != payload:
            return None
        return claims
    except (ValueError, UnicodeError, binascii.Error, RecursionError):
        return None


def _session_token(request: Request) -> str | None:
    credentials = auth.get_http_authorization_cred(request.headers.get('Authorization'))
    if credentials is not None and credentials.scheme.lower() == 'bearer':
        return credentials.credentials
    return request.cookies.get('token')


async def _revocation_status(request: Request, session: dict) -> int | None:
    redis = getattr(request.app.state, 'redis', None)
    if (env.REDIS_URL or env.REDIS_SENTINEL_HOSTS) and not redis:
        return 503
    try:
        return None if await auth.is_valid_token(session, redis) else 403
    except Exception:
        return 503


class _AuthorizationStorageUnavailable(Exception):
    pass


async def _authorized_owner(user_id: str, chat_id: str):
    try:
        user = await Users.get_user_by_id(user_id)
    except Exception:
        raise _AuthorizationStorageUnavailable from None
    if user is None or user.role not in auth.VERIFIED_USER_ROLES:
        return None
    try:
        owned = await Chats.is_chat_owner(chat_id, user.id)
    except Exception:
        raise _AuthorizationStorageUnavailable from None
    return user if owned else None


@router.api_route('/issue', methods=['GET', 'HEAD'])
async def issue_resource_grant(request: Request):
    if not ocu_workspaces.ENABLE_OCU_WORKSPACE:
        return _empty(403)
    token = _session_token(request)
    session = auth.decode_token(token) if token else None
    now = time.time()
    if not isinstance(session, dict) or not _valid_session(session, now):
        return _empty(401)
    revocation_status = await _revocation_status(request, session)
    if revocation_status is not None:
        return _empty(401 if revocation_status == 403 else revocation_status)
    chat_id = request.headers.get('X-Chat-Id')
    path = request.headers.get('X-Ocu-Resource-Path')
    query = request.headers.get('X-Ocu-Resource-Query', '')
    if not _valid_chat(chat_id) or not _valid_path(path) or not _valid_query(query):
        return _empty(403)
    try:
        user = await _authorized_owner(session['id'], chat_id)
    except _AuthorizationStorageUnavailable:
        return _empty(503)
    if user is None:
        return _empty(403)
    claims = {
        'purpose': _PURPOSE,
        'user_id': user.id,
        'chat_id': chat_id,
        'session_jti': session['jti'],
        'session_iat': session['iat'],
        'session_exp': session.get('exp'),
        'iat': now,
        'exp': min(now + _MAX_LIFETIME, session['exp']) if 'exp' in session else now + _MAX_LIFETIME,
    }
    try:
        grant = _encode_grant(claims)
    except (ValueError, UnicodeError):
        return _empty(403)
    location = f'/ocu/f/{grant}/{quote(chat_id, safe="")}/{path}'
    if query:
        location += f'?{query}'
    return _empty(302, {'Location': location, 'Referrer-Policy': 'no-referrer'})


@router.get('/auth')
async def authorize_resource_grant(request: Request):
    if not ocu_workspaces.ENABLE_OCU_WORKSPACE:
        return _empty(403)
    token = request.headers.get('X-Ocu-Grant')
    if not token:
        return _empty(401)
    claims = _decode_grant(token, time.time())
    if claims is None:
        return _empty(403)
    chat_id = request.headers.get('X-Chat-Id')
    path = request.headers.get('X-Ocu-Resource-Path')
    method = request.headers.get('X-Ocu-Resource-Method')
    if chat_id != claims['chat_id'] or not _valid_path(path) or method not in ('GET', 'HEAD'):
        return _empty(403)
    session = {'id': claims['user_id'], 'jti': claims['session_jti'], 'iat': claims['session_iat']}
    if claims['session_exp'] is not None:
        session['exp'] = claims['session_exp']
    revocation_status = await _revocation_status(request, session)
    if revocation_status is not None:
        return _empty(revocation_status)
    try:
        user = await _authorized_owner(claims['user_id'], chat_id)
    except _AuthorizationStorageUnavailable:
        return _empty(503)
    if user is None:
        return _empty(403)
    return _empty(200, {'X-User-Id': user.id, 'X-User-Email': quote(user.email or '', safe='@.')})
