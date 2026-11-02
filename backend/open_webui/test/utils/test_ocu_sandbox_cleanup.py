"""Background OCU sandbox deletion scheduled after WebUI chat deletion."""

from __future__ import annotations

import asyncio
import gc
import logging

import aiohttp
import pytest
from open_webui.test.ocu_harness import _StubResponse, _StubSession

DISTINCTIVE_TOKEN = 'ocu-internal-token-UNIQUE-cleanup-3b8d'
CHAT_IDS = [f'00000000-0000-4000-8000-00000000000{n}' for n in range(10)]
LOGGER = 'open_webui.utils.ocu_sandbox_cleanup'


class _FakeOcu:
    """Records OCU delete requests; optionally holds them on a gate or fails chosen chats."""

    def __init__(self, *, gate: asyncio.Event | None = None, errors: dict[str, Exception] | None = None):
        self.gate = gate
        self.errors = errors or {}
        self.constructed = 0
        self.deleted: list[str] = []
        self.in_flight = 0
        self.peak = 0

    def factory(self):
        self.constructed += 1
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _tb):
        return False

    async def delete_sandbox(self, chat_id: str):
        self.in_flight += 1
        self.peak = max(self.peak, self.in_flight)
        try:
            if self.gate is not None:
                await self.gate.wait()
            else:
                await asyncio.sleep(0)
            self.deleted.append(chat_id)
            if chat_id in self.errors:
                raise self.errors[chat_id]
            return {'container': True, 'volume': True, 'data': True}
        finally:
            self.in_flight -= 1


def _cleanup_module():
    import open_webui.utils.ocu_sandbox_cleanup as cleanup

    return cleanup


def _install(monkeypatch, fake: _FakeOcu):
    cleanup = _cleanup_module()
    monkeypatch.setattr(cleanup, 'OcuClient', fake.factory)
    return cleanup


def _install_http(monkeypatch, session: _StubSession):
    """Real OcuClient over a stub HTTP session: only the network is replaced."""
    from open_webui.utils.ocu_client import OcuClient

    monkeypatch.setenv('OCU_INTERNAL_URL', 'http://ocu.example/')
    monkeypatch.setenv('OCU_INTERNAL_TOKEN', DISTINCTIVE_TOKEN)
    cleanup = _cleanup_module()
    monkeypatch.setattr(cleanup, 'OcuClient', lambda: OcuClient(session=session))
    return cleanup


async def _drain(cleanup):
    while cleanup._background_tasks:
        await asyncio.gather(*list(cleanup._background_tasks))


def _logged(caplog) -> str:
    return '\n'.join(f'{record.getMessage()} {record.exc_text or ""}' for record in caplog.records)


@pytest.fixture(autouse=True)
def _workspace_enabled(monkeypatch):
    monkeypatch.setenv('ENABLE_OCU_WORKSPACE', 'true')


@pytest.mark.asyncio
async def test_each_scheduled_chat_sandbox_is_deleted_once(monkeypatch):
    fake = _FakeOcu()
    cleanup = _install(monkeypatch, fake)

    cleanup.schedule_sandbox_cleanup(CHAT_IDS[:3])
    await _drain(cleanup)

    assert sorted(fake.deleted) == CHAT_IDS[:3]
    assert fake.constructed == 1


@pytest.mark.asyncio
@pytest.mark.parametrize('flag', ['false', 'False', ''])
async def test_disabled_workspace_makes_no_ocu_call(monkeypatch, flag):
    fake = _FakeOcu()
    cleanup = _install(monkeypatch, fake)
    monkeypatch.setenv('ENABLE_OCU_WORKSPACE', flag)

    cleanup.schedule_sandbox_cleanup(CHAT_IDS[:2])

    assert not cleanup._background_tasks
    await asyncio.sleep(0)
    assert fake.constructed == 0
    assert fake.deleted == []


@pytest.mark.asyncio
async def test_unset_workspace_flag_makes_no_ocu_call(monkeypatch):
    fake = _FakeOcu()
    cleanup = _install(monkeypatch, fake)
    monkeypatch.delenv('ENABLE_OCU_WORKSPACE')

    cleanup.schedule_sandbox_cleanup(CHAT_IDS[:1])

    assert not cleanup._background_tasks
    assert fake.constructed == 0


@pytest.mark.asyncio
async def test_no_chat_ids_starts_no_background_task(monkeypatch):
    fake = _FakeOcu()
    cleanup = _install(monkeypatch, fake)

    cleanup.schedule_sandbox_cleanup([])

    assert not cleanup._background_tasks
    assert fake.constructed == 0


@pytest.mark.asyncio
async def test_at_most_four_sandbox_deletes_run_at_once(monkeypatch):
    gate = asyncio.Event()
    fake = _FakeOcu(gate=gate)
    cleanup = _install(monkeypatch, fake)

    cleanup.schedule_sandbox_cleanup(CHAT_IDS)
    for _ in range(100):
        await asyncio.sleep(0)
    assert fake.in_flight == 4
    assert fake.deleted == []

    gate.set()
    await _drain(cleanup)

    assert fake.peak == 4
    assert sorted(fake.deleted) == CHAT_IDS


@pytest.mark.asyncio
async def test_background_task_is_strongly_held_until_done(monkeypatch):
    gate = asyncio.Event()
    fake = _FakeOcu(gate=gate)
    cleanup = _install(monkeypatch, fake)

    cleanup.schedule_sandbox_cleanup(CHAT_IDS[:1])
    assert len(cleanup._background_tasks) == 1
    (task,) = cleanup._background_tasks
    await asyncio.sleep(0)
    gc.collect()
    assert task in cleanup._background_tasks
    assert not task.done()

    gate.set()
    await task
    await asyncio.sleep(0)

    assert task not in cleanup._background_tasks
    assert fake.deleted == CHAT_IDS[:1]


@pytest.mark.asyncio
async def test_one_failed_delete_does_not_stop_the_others(monkeypatch, caplog):
    from open_webui.utils.ocu_client import OcuUnreachable

    fake = _FakeOcu(errors={CHAT_IDS[1]: OcuUnreachable('OCU unreachable')})
    cleanup = _install(monkeypatch, fake)
    caplog.set_level(logging.WARNING, logger=LOGGER)

    cleanup.schedule_sandbox_cleanup(CHAT_IDS[:3])
    await _drain(cleanup)

    assert sorted(fake.deleted) == CHAT_IDS[:3]
    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert CHAT_IDS[1] in warnings[0]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    'session',
    [
        _StubSession(error=TimeoutError()),
        _StubSession(error=aiohttp.ClientConnectionError(f'refused Bearer {DISTINCTIVE_TOKEN}')),
        _StubSession(_StubResponse(status=500, text=f'delete_failed {DISTINCTIVE_TOKEN}')),
        _StubSession(_StubResponse(status=404, text='Not Found')),
    ],
    ids=['timeout', 'connection-error', 'delete-failed', 'older-ocu-without-route'],
)
async def test_ocu_failure_is_logged_with_chat_id_and_without_token(monkeypatch, caplog, session):
    cleanup = _install_http(monkeypatch, session)
    caplog.set_level(logging.DEBUG)

    cleanup.schedule_sandbox_cleanup(CHAT_IDS[:2])
    await _drain(cleanup)

    assert [call['method'] for call in session.calls] == ['DELETE', 'DELETE']
    assert sorted(call['path'] for call in session.calls) == [f'/internal/sandbox/{c}' for c in CHAT_IDS[:2]]
    assert all(call['headers']['Authorization'] == f'Bearer {DISTINCTIVE_TOKEN}' for call in session.calls)
    warnings = [r for r in caplog.records if r.name == LOGGER and r.levelno == logging.WARNING]
    for chat_id in CHAT_IDS[:2]:
        assert len([r for r in warnings if chat_id in r.getMessage()]) == 1
    assert DISTINCTIVE_TOKEN not in _logged(caplog)


@pytest.mark.asyncio
async def test_successful_ocu_delete_logs_no_warning(monkeypatch, caplog):
    session = _StubSession(_StubResponse(payload={'container': False, 'volume': False, 'data': False}))
    cleanup = _install_http(monkeypatch, session)
    caplog.set_level(logging.WARNING, logger=LOGGER)

    cleanup.schedule_sandbox_cleanup(CHAT_IDS[:1])
    await _drain(cleanup)

    assert len(session.calls) == 1
    assert not [r for r in caplog.records if r.name == LOGGER]


@pytest.mark.asyncio
async def test_missing_ocu_configuration_is_logged_per_chat_and_never_raises(monkeypatch, caplog):
    cleanup = _cleanup_module()
    monkeypatch.setenv('OCU_INTERNAL_TOKEN', DISTINCTIVE_TOKEN)
    monkeypatch.delenv('OCU_INTERNAL_URL', raising=False)
    caplog.set_level(logging.WARNING, logger=LOGGER)

    cleanup.schedule_sandbox_cleanup(CHAT_IDS[:2])
    await _drain(cleanup)

    messages = [r.getMessage() for r in caplog.records if r.name == LOGGER]
    assert len(messages) == 2
    assert all(any(c in m for m in messages) for c in CHAT_IDS[:2])
    assert DISTINCTIVE_TOKEN not in _logged(caplog)
