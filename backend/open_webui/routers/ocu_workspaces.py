from __future__ import annotations

import json
import math
import os
import time
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.routing import APIRoute
from open_webui.models.chats import Chats
from open_webui.models.ocu_chat_state import OcuChatStates
from open_webui.utils.auth import get_verified_user
from open_webui.utils.chat_id import is_saved_chat_id
from open_webui.utils.ocu_client import OcuClient, OcuNeverCreated, OcuUnreachable
from pydantic import BaseModel, ConfigDict, ValidationError
from starlette.responses import JSONResponse, Response

ENABLE_OCU_WORKSPACE = os.getenv('ENABLE_OCU_WORKSPACE', 'False').lower() == 'true'
OCU_INTERNAL_TOKEN = os.getenv('OCU_INTERNAL_TOKEN', '')
OCU_INTERNAL_URL = os.getenv('OCU_INTERNAL_URL', '')

XR_VALUE = 'ocu-workspace'
PREFS_MAX_BYTES = 2048
BASE_URL = '/ocu'
REFRESH_BURST = 3.0
REFRESH_RATE = 0.5
_NEVER_CREATED = 'never_created'
_UNREACHABLE = 'ocu_unreachable'

router = APIRouter()
ocu_client = None
_refresh_buckets: dict[str, tuple[float, float]] = {}
_now = time.monotonic


class EmptyBodyAuthRoute(APIRoute):
    """Strip bodies from 401/403 raised while resolving this route's dependencies."""

    def get_route_handler(self):
        original = super().get_route_handler()

        async def empty_body_handler(request: Request) -> Response:
            try:
                return await original(request)
            except HTTPException as exc:
                if exc.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN):
                    return Response(status_code=exc.status_code, content=b'', headers=exc.headers)
                raise

        return empty_body_handler


class PrefsBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    view: Literal['files', 'browser', 'terminal'] | None = None
    selected_file_id: str | None = None
    open: bool | None = None


def get_ocu_client():
    global ocu_client
    if ocu_client is None:
        ocu_client = OcuClient()
    return ocu_client


def _empty(status_code: int) -> Response:
    return Response(status_code=status_code, content=b'')


def _not_found() -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)


def _unprocessable() -> None:
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT)


async def _gate(chat_id: str, user, *, xrw: str | None = None, mutating: bool = False) -> None:
    if not ENABLE_OCU_WORKSPACE:
        _not_found()
    if not (is_saved_chat_id(chat_id) and chat_id != 'default'):
        _not_found()
    if mutating and xrw != XR_VALUE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    if not await Chats.is_chat_owner(chat_id, user.id):
        _not_found()


def _map_status(state: str) -> tuple[str, str | None]:
    if state == 'running':
        return 'running', None
    if state == _NEVER_CREATED:
        return 'unavailable', _NEVER_CREATED
    return 'stopped', None


def _capabilities(mapped: str, ocu_answered: bool) -> list[str]:
    caps: list[str] = []
    if mapped == 'stopped':
        caps.append('launch')
    if ocu_answered:
        caps.append('refresh')
    caps.append('prefs')
    return caps


def _revision_of(payload: dict) -> int:
    try:
        return int(payload.get('revision', 0) or 0)
    except (TypeError, ValueError):
        return 0


def _describe_body(chat_id: str, mapped: str, reason: str | None, caps: list[str], revision: int, views: list) -> dict:
    body = {
        'chat_id': chat_id,
        'status': mapped,
        'capabilities': caps,
        'revision': revision,
        'views': views,
        'base_url': BASE_URL,
    }
    if reason is not None:
        body['reason'] = reason
    return body


async def _describe_unreachable(chat_id: str) -> dict:
    row = await OcuChatStates.get(chat_id)
    revision = row.last_seen_revision if row is not None else 0
    return _describe_body(chat_id, 'unavailable', _UNREACHABLE, _capabilities('unavailable', False), revision, [])


async def _describe_answered(chat_id: str, payload: dict) -> dict:
    mapped, reason = _map_status(str(payload.get('state', '')))
    revision = _revision_of(payload)
    await OcuChatStates.advance_cursor(chat_id, revision)
    views = payload.get('views') if isinstance(payload.get('views'), list) else []
    body = _describe_body(chat_id, mapped, reason, _capabilities(mapped, True), revision, views)
    if 'cli_badge' in payload:
        body['cli_badge'] = payload['cli_badge']
    return body


def _take_refresh_token(chat_id: str) -> int | None:
    now = _now()
    tokens, last = _refresh_buckets.get(chat_id, (REFRESH_BURST, now))
    tokens = min(REFRESH_BURST, tokens + max(0.0, now - last) * REFRESH_RATE)
    if tokens < 1.0:
        _refresh_buckets[chat_id] = (tokens, now)
        return max(1, math.ceil((1.0 - tokens) / REFRESH_RATE))
    _refresh_buckets[chat_id] = (tokens - 1.0, now)
    return None


async def _read_prefs(request: Request) -> dict:
    length = request.headers.get('content-length')
    if length is not None and length.isdigit() and int(length) > PREFS_MAX_BYTES:
        _unprocessable()
    raw = await request.body()
    if len(raw) > PREFS_MAX_BYTES:
        _unprocessable()
    try:
        data = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        _unprocessable()
    if not isinstance(data, dict):
        _unprocessable()
    try:
        return PrefsBody.model_validate(data).model_dump(exclude_unset=True)
    except ValidationError:
        _unprocessable()


async def ocu_auth(
    user=Depends(get_verified_user),
    x_chat_id: str | None = Header(default=None, alias='X-Chat-Id'),
):
    if not ENABLE_OCU_WORKSPACE:
        return _empty(status.HTTP_403_FORBIDDEN)
    if x_chat_id is None or not (is_saved_chat_id(x_chat_id) and x_chat_id != 'default'):
        return _empty(status.HTTP_403_FORBIDDEN)
    if not await Chats.is_chat_owner(x_chat_id, user.id):
        return _empty(status.HTTP_403_FORBIDDEN)
    return Response(
        status_code=status.HTTP_200_OK,
        content=b'',
        headers={'X-User-Id': user.id, 'X-User-Email': quote(user.email or '', safe='@.')},
    )


async def describe_workspace(chat_id: str, user=Depends(get_verified_user)):
    await _gate(chat_id, user)
    try:
        payload = await get_ocu_client().describe(chat_id)
    except OcuUnreachable:
        return await _describe_unreachable(chat_id)
    if not isinstance(payload, dict):
        payload = {}
    return await _describe_answered(chat_id, payload)


async def launch_workspace(
    chat_id: str,
    user=Depends(get_verified_user),
    x_requested_with: str | None = Header(default=None, alias='X-Requested-With'),
):
    await _gate(chat_id, user, xrw=x_requested_with, mutating=True)
    result = await get_ocu_client().launch(chat_id)
    if isinstance(result, OcuNeverCreated):
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={'reason': _NEVER_CREATED})
    return result if isinstance(result, dict) else {}


async def refresh_workspace(
    chat_id: str,
    user=Depends(get_verified_user),
    x_requested_with: str | None = Header(default=None, alias='X-Requested-With'),
):
    await _gate(chat_id, user, xrw=x_requested_with, mutating=True)
    retry_after = _take_refresh_token(chat_id)
    if retry_after is not None:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={},
            headers={'Retry-After': str(retry_after)},
        )
    payload = await get_ocu_client().refresh(chat_id)
    payload = payload if isinstance(payload, dict) else {}
    revision = _revision_of(payload)
    await OcuChatStates.advance_cursor(chat_id, revision)
    return {'revision': revision}


async def put_prefs(
    chat_id: str,
    request: Request,
    user=Depends(get_verified_user),
    x_requested_with: str | None = Header(default=None, alias='X-Requested-With'),
):
    await _gate(chat_id, user, xrw=x_requested_with, mutating=True)
    prefs = await _read_prefs(request)
    row = await OcuChatStates.upsert_prefs(chat_id, prefs)
    return {'prefs': row.prefs}


router.add_api_route(
    '/auth',
    ocu_auth,
    methods=['GET'],
    route_class_override=EmptyBodyAuthRoute,
    response_class=Response,
)

if ENABLE_OCU_WORKSPACE:
    router.add_api_route('/workspaces/{chat_id}', describe_workspace, methods=['GET'])
    router.add_api_route('/workspaces/{chat_id}/launch', launch_workspace, methods=['POST'])
    router.add_api_route('/workspaces/{chat_id}/refresh', refresh_workspace, methods=['POST'])
    router.add_api_route('/workspaces/{chat_id}/prefs', put_prefs, methods=['PUT'])
