"""Typed HTTP client for OCU internal describe/launch/outputs endpoints."""

from __future__ import annotations

import json
import logging
import os

import aiohttp

log = logging.getLogger(__name__)

_NEVER_CREATED = 'never_created'


class OcuUnreachable(Exception):
    """OCU did not answer: connection error or timeout."""


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

    def _url(self, path: str) -> str:
        return self._base.rstrip('/') + '/' + path.lstrip('/')

    def _headers(self) -> dict[str, str]:
        return {'Authorization': f'Bearer {self._token}'}

    def _session_or_create(self) -> aiohttp.ClientSession:
        if self._session is None:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=30),
                trust_env=True,
            )
        return self._session

    async def describe(self, chat_id: str):
        return await self._request('GET', f'/internal/describe/{chat_id}')

    async def launch(self, chat_id: str):
        return await self._request('POST', f'/internal/launch/{chat_id}', never_created=True)

    async def refresh(self, chat_id: str):
        return await self._request('GET', f'/api/outputs/{chat_id}')

    async def _request(self, method: str, path: str, *, never_created: bool = False):
        log.debug('OCU %s %s', method, path)
        try:
            async with self._session_or_create().request(
                method,
                self._url(path),
                headers=self._headers(),
            ) as response:
                text = await response.text()
                status = response.status
        except (aiohttp.ClientConnectionError, TimeoutError) as exc:
            raise OcuUnreachable('OCU unreachable') from exc
        if never_created and status == 409 and _NEVER_CREATED in text:
            return OcuNeverCreated()
        if not text:
            return {}
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text
