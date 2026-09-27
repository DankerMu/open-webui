"""Stubbed-transport tests for the internal OCU HTTP client."""

from __future__ import annotations

import json
import logging
from urllib.parse import urlparse

import aiohttp
import pytest
from aiohttp import web

TOKEN = 'test-token'
DISTINCTIVE_TOKEN = 'ocu-internal-token-UNIQUE-7f2a9c1e'
BASE_URL = 'http://ocu.example/'
CHAT_ID = 'C'


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


def _make_client(monkeypatch, session, url=BASE_URL, token=TOKEN):
    monkeypatch.setenv('OCU_INTERNAL_URL', url)
    monkeypatch.setenv('OCU_INTERNAL_TOKEN', token)
    from open_webui.utils.ocu_client import OcuClient

    return OcuClient(session=session)


def _assert_bearer_call(session, method, path, token=TOKEN):
    assert len(session.calls) == 1
    call = session.calls[0]
    assert call['method'] == method
    assert call['path'] == path
    assert call['headers']['Authorization'] == f'Bearer {token}'
    assert token not in call['url']
    assert '//' not in call['url'][len('http://') :]


@pytest.mark.asyncio
async def test_describe_sends_get_with_bearer_token(monkeypatch):
    session = _StubSession(_StubResponse(payload={'state': 'running'}))
    client = _make_client(monkeypatch, session)

    result = await client.describe(CHAT_ID)

    assert result == {'state': 'running'}
    _assert_bearer_call(session, 'GET', f'/internal/describe/{CHAT_ID}')


@pytest.mark.asyncio
async def test_launch_sends_post_with_bearer_token(monkeypatch):
    session = _StubSession(_StubResponse(payload={'state': 'running'}))
    client = _make_client(monkeypatch, session)

    result = await client.launch(CHAT_ID)

    assert result == {'state': 'running'}
    _assert_bearer_call(session, 'POST', f'/internal/launch/{CHAT_ID}')


@pytest.mark.asyncio
async def test_refresh_sends_get_outputs_with_bearer_token(monkeypatch):
    session = _StubSession(_StubResponse(payload={'files': []}))
    client = _make_client(monkeypatch, session)

    result = await client.refresh(CHAT_ID)

    assert result == {'files': []}
    _assert_bearer_call(session, 'GET', f'/api/outputs/{CHAT_ID}')


@pytest.mark.asyncio
async def test_launch_409_never_created_is_typed_result(monkeypatch):
    session = _StubSession(_StubResponse(status=409, payload={'reason': 'never_created'}))
    client = _make_client(monkeypatch, session)
    from open_webui.utils.ocu_client import OcuNeverCreated, OcuUnreachable

    result = await client.launch(CHAT_ID)

    assert isinstance(result, OcuNeverCreated)
    assert result.reason == 'never_created'
    assert not isinstance(result, OcuUnreachable)
    _assert_bearer_call(session, 'POST', f'/internal/launch/{CHAT_ID}')


@pytest.mark.asyncio
@pytest.mark.parametrize(
    'operation,status,text',
    [
        ('describe', 500, '{"revision": 999, "marker": "private-upstream-marker"}'),
        ('refresh', 500, 'private-upstream-marker'),
        ('launch', 500, ''),
        ('describe', 401, '{"reason": "never_created"}'),
        ('refresh', 403, '{"reason": "never_created"}'),
        ('describe', 409, '{"reason": "never_created"}'),
        ('launch', 409, 'private-upstream-marker never_created'),
        ('launch', 409, '{"detail": "never_created"}'),
        ('launch', 409, '["never_created"]'),
        ('launch', 409, '{"reason": "other"}'),
        ('launch', 409, '{"reason": "never_created later"}'),
    ],
)
async def test_failed_http_responses_are_typed_without_upstream_details(monkeypatch, caplog, operation, status, text):
    from open_webui.utils.ocu_client import OcuUpstreamError

    session = _StubSession(_StubResponse(status=status, text=text))
    client = _make_client(monkeypatch, session)
    caplog.set_level(logging.DEBUG, logger='open_webui.utils.ocu_client')

    with pytest.raises(OcuUpstreamError) as failure:
        await getattr(client, operation)(CHAT_ID)

    assert failure.value.status == status
    assert failure.value.reason == 'ocu_upstream_error'
    assert str(failure.value) == 'ocu_upstream_error'
    assert 'private-upstream-marker' not in repr(failure.value)
    assert 'private-upstream-marker' not in ' '.join(record.getMessage() for record in caplog.records)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    'body,content_type',
    [
        (b'\xffprivate-upstream-marker', 'application/json'),
        ('private-upstream-marker'.encode('utf-16')[:-1], 'application/json; charset=utf-16'),
        (b'private-upstream-marker', 'application/json; charset=base64_codec'),
    ],
)
async def test_launch_invalid_response_encoding_is_safe_upstream_failure(monkeypatch, caplog, body, content_type):
    from open_webui.utils.ocu_client import OcuUpstreamError

    async def failed_launch(_request):
        return web.Response(status=409, body=body, headers={'Content-Type': content_type})

    app = web.Application()
    app.router.add_post('/internal/launch/{chat_id}', failed_launch)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '127.0.0.1', 0)
    try:
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        caplog.set_level(logging.DEBUG, logger='open_webui.utils.ocu_client')
        async with aiohttp.ClientSession() as session:
            client = _make_client(monkeypatch, session, url=f'http://127.0.0.1:{port}')
            with pytest.raises(OcuUpstreamError) as failure:
                await client.launch(CHAT_ID)

        assert failure.value.status == 409
        assert failure.value.reason == 'ocu_upstream_error'
        assert str(failure.value) == 'ocu_upstream_error'
        assert failure.value.__cause__ is None
        assert failure.value.__context__ is None
        assert 'private-upstream-marker' not in repr(failure.value)
        assert 'private-upstream-marker' not in ' '.join(record.getMessage() for record in caplog.records)
    finally:
        await runner.cleanup()


@pytest.mark.asyncio
async def test_connection_refused_raises_ocu_unreachable(monkeypatch):
    session = _StubSession(error=aiohttp.ClientConnectionError('Connection refused'))
    client = _make_client(monkeypatch, session)
    from open_webui.utils.ocu_client import OcuNeverCreated, OcuUnreachable

    with pytest.raises(OcuUnreachable) as describe_error:
        await client.describe(CHAT_ID)
    assert not isinstance(describe_error.value, OcuNeverCreated)

    with pytest.raises(OcuUnreachable) as launch_error:
        await client.launch(CHAT_ID)
    assert not isinstance(launch_error.value, OcuNeverCreated)


@pytest.mark.asyncio
async def test_timeout_raises_ocu_unreachable_not_never_created(monkeypatch):
    session = _StubSession(error=TimeoutError('timed out'))
    client = _make_client(monkeypatch, session)
    from open_webui.utils.ocu_client import OcuNeverCreated, OcuUnreachable

    with pytest.raises(OcuUnreachable) as exc_info:
        await client.launch(CHAT_ID)

    assert not isinstance(exc_info.value, OcuNeverCreated)


@pytest.mark.asyncio
async def test_payload_error_raises_ocu_unreachable_not_never_created(monkeypatch):
    session = _StubSession(error=aiohttp.ClientPayloadError('Response payload is not completed'))
    client = _make_client(monkeypatch, session)
    from open_webui.utils.ocu_client import OcuNeverCreated, OcuUnreachable

    with pytest.raises(OcuUnreachable) as describe_error:
        await client.describe(CHAT_ID)
    assert not isinstance(describe_error.value, OcuNeverCreated)

    with pytest.raises(OcuUnreachable) as launch_error:
        await client.launch(CHAT_ID)
    assert not isinstance(launch_error.value, OcuNeverCreated)


@pytest.mark.asyncio
async def test_aclose_does_not_close_injected_session(monkeypatch):
    session = _StubSession()
    client = _make_client(monkeypatch, session)

    await client.aclose()

    assert session.closed is False


@pytest.mark.asyncio
async def test_token_is_absent_from_captured_log_records(monkeypatch, caplog):
    session = _StubSession(_StubResponse(payload={'state': 'running'}))
    client = _make_client(monkeypatch, session, token=DISTINCTIVE_TOKEN)
    caplog.set_level(logging.DEBUG)
    caplog.set_level(logging.DEBUG, logger='open_webui.utils.ocu_client')
    caplog.set_level(logging.DEBUG, logger='')

    await client.describe(CHAT_ID)

    recorded = []
    for record in caplog.records:
        recorded.append(record.getMessage())
        recorded.append(str(record.msg))
        recorded.append(str(record.args))
        recorded.extend(str(value) for value in record.__dict__.values())
    blob = ' '.join(recorded)
    assert DISTINCTIVE_TOKEN not in blob
    _assert_bearer_call(session, 'GET', f'/internal/describe/{CHAT_ID}', token=DISTINCTIVE_TOKEN)


def test_empty_url_fails_loud(monkeypatch):
    monkeypatch.setenv('OCU_INTERNAL_URL', '')
    monkeypatch.setenv('OCU_INTERNAL_TOKEN', TOKEN)
    from open_webui.utils.ocu_client import OcuClient

    with pytest.raises(ValueError, match='OCU_INTERNAL_URL'):
        OcuClient(session=_StubSession())


def test_empty_token_fails_loud(monkeypatch):
    monkeypatch.setenv('OCU_INTERNAL_URL', BASE_URL)
    monkeypatch.setenv('OCU_INTERNAL_TOKEN', '')
    from open_webui.utils.ocu_client import OcuClient

    with pytest.raises(ValueError, match='OCU_INTERNAL_TOKEN'):
        OcuClient(session=_StubSession())
