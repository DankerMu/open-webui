"""Typed HTTP client for OCU internal describe/launch/outputs/sandbox-delete/upload endpoints."""

from __future__ import annotations

import json
import logging
import os
from urllib.parse import quote

import aiohttp

log = logging.getLogger(__name__)

_NEVER_CREATED = 'never_created'


class OcuUnreachable(Exception):
    """OCU did not answer: connection error or timeout."""


class OcuUpstreamError(Exception):
    """OCU returned an unsuccessful HTTP response without exposing its body."""

    reason = 'ocu_upstream_error'

    def __init__(self, status: int):
        self.status = status
        super().__init__(self.reason)


class OcuNeverCreated:
    """Launch refused because this chat has never had a sandbox."""

    def __init__(self, reason: str = _NEVER_CREATED):
        self.reason = reason


class OcuClient:
    def __init__(self, session: aiohttp.ClientSession | None = None):
        url = os.getenv('OCU_INTERNAL_URL', '')
        token = os.getenv('OCU_INTERNAL_TOKEN', '')
        if not url:
            raise ValueError('OCU_INTERNAL_URL is required')
        if not token:
            raise ValueError('OCU_INTERNAL_TOKEN is required')
        self._base = url
        self._token = token
        self._session = session
        self._owns_session = session is None

    def _url(self, path: str) -> str:
        return self._base.rstrip('/') + '/' + path.lstrip('/')

    def _headers(self) -> dict[str, str]:
        return {'Authorization': f'Bearer {self._token}'}

    def _session_or_create(self) -> aiohttp.ClientSession:
        if self._session is None:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=30),
                trust_env=False,
            )
            self._owns_session = True
        return self._session

    async def aclose(self):
        if self._owns_session and self._session is not None:
            await self._session.close()
            self._session = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _tb):
        await self.aclose()

    async def describe(self, chat_id: str):
        return await self._request('GET', f'/internal/describe/{chat_id}')

    async def launch(self, chat_id: str):
        return await self._request('POST', f'/internal/launch/{chat_id}', never_created=True)

    async def refresh(self, chat_id: str):
        return await self._request('GET', f'/api/outputs/{chat_id}')

    async def delete_sandbox(self, chat_id: str):
        return await self._request('DELETE', f'/internal/sandbox/{chat_id}')

    async def upload_file(self, chat_id: str, name: str, data: bytes, attachment_id: str, content_type: str) -> str:
        """Store `data` in the chat's workspace files under `name`; return the name OCU stored it as.

        `attachment_id` is OCU's import receipt key: a later upload of the same id returns the
        recorded name instead of writing again. A redirect is an upstream error, never followed.
        """
        form = aiohttp.FormData()
        form.add_field('file', data, filename=name, content_type=content_type)
        result = await self._request(
            'POST',
            f'/api/uploads/{chat_id}/{quote(name, safe="")}',
            data=form,
            extra_headers={'X-OCU-Attachment-Id': attachment_id},
            allow_redirects=False,
        )
        stored = result.get('filename') if isinstance(result, dict) else None
        if not isinstance(stored, str) or not stored:
            raise ValueError('OCU upload response names no stored file')
        return stored

    async def _request(
        self,
        method: str,
        path: str,
        *,
        never_created: bool = False,
        data: aiohttp.FormData | None = None,
        extra_headers: dict[str, str] | None = None,
        allow_redirects: bool = True,
    ):
        log.debug('OCU %s %s', method, path)
        try:
            async with self._session_or_create().request(
                method,
                self._url(path),
                headers={**self._headers(), **(extra_headers or {})},
                data=data,
                allow_redirects=allow_redirects,
            ) as response:
                status = response.status
                if not 200 <= status < 300:
                    if never_created and status == 409:
                        try:
                            payload = json.loads(await response.text())
                        except (json.JSONDecodeError, UnicodeError, LookupError):
                            payload = None
                        detail = payload.get('detail') if isinstance(payload, dict) else None
                        if isinstance(detail, dict) and detail.get('reason') == _NEVER_CREATED:
                            return OcuNeverCreated()
                    raise OcuUpstreamError(status)
                text = await response.text()
        except (aiohttp.ClientError, TimeoutError) as exc:
            raise OcuUnreachable('OCU unreachable') from exc
        if not text:
            return {}
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text
