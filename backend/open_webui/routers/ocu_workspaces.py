from __future__ import annotations

import os

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.routing import APIRoute
from open_webui.models.chats import Chats
from open_webui.utils.auth import get_verified_user
from open_webui.utils.chat_id import is_saved_chat_id
from starlette.requests import Request
from starlette.responses import Response

ENABLE_OCU_WORKSPACE = os.getenv('ENABLE_OCU_WORKSPACE', 'False').lower() == 'true'
OCU_INTERNAL_TOKEN = os.getenv('OCU_INTERNAL_TOKEN', '')
OCU_INTERNAL_URL = os.getenv('OCU_INTERNAL_URL', '')

router = APIRouter()


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


def _empty(status_code: int) -> Response:
    return Response(status_code=status_code, content=b'')


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
        headers={'X-User-Id': user.id, 'X-User-Email': user.email or ''},
    )


router.add_api_route(
    '/auth',
    ocu_auth,
    methods=['GET'],
    route_class_override=EmptyBodyAuthRoute,
    response_class=Response,
)
