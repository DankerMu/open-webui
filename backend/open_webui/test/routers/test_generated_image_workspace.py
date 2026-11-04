"""generate_image and edit_image name their images and save them into the chat workspace (#713).

Seams: the two builtin tools. The image service is replaced at its HTTP session
(`routers.images.get_session`), so WebUI's own upload, storage and file rows run for real.
OCU is a real aiohttp server on 127.0.0.1 that records each request and answers like OCU's
upload route (collision suffix, import receipts). Config rows touched here are restored.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import socket
from pathlib import PurePosixPath
from types import SimpleNamespace

import aiohttp
import pytest
from aiohttp import web
from open_webui.test.ocu_harness import _insert_user, _unique, get_client

TOKEN = 'ocu-internal-token-UNIQUE-image-workspace-5d1e'
PNG = b'\x89PNG\r\n\x1a\nimage-workspace-png-bytes'
JPEG = b'\xff\xd8\xff\xe0image-workspace-jpeg-bytes'
SOURCE = 'data:image/png;base64,' + base64.b64encode(b'\x89PNG\r\n\x1a\nsource').decode()
MESSAGE_ID = 'assistant-message'
LOGGER = 'open_webui.utils.ocu_image_workspace'
NOTE = (
    'The image is saved in the chat workspace at the workspace_files paths. '
    'Do not embed the workspace_files paths as images.'
)
CONFIG = {
    'image_generation.engine': 'openai',
    'image_generation.model': 'harness-image-model',
    'image_generation.size': '1024x1024',
    'image_generation.openai.api_base_url': 'http://image-upstream.invalid/v1',
    'image_generation.openai.params': {},
    'images.edit.engine': 'openai',
    'images.edit.model': 'harness-edit-model',
    'images.edit.openai.api_base_url': 'http://image-upstream.invalid/v1',
}
_ABSENT = object()


# ── image service at its HTTP session ─────────────────────────────────────────


class _EngineResponse:
    def __init__(self, items):
        self._items = items

    def raise_for_status(self):
        return None

    async def json(self, content_type=None):
        return {'data': [{'b64_json': item} for item in self._items]}


class _EnginePost:
    def __init__(self, items):
        self._items = items

    async def __aenter__(self):
        return _EngineResponse(self._items)

    async def __aexit__(self, *_exc):
        return False


class _Engine:
    """Answers every image request with `items` (base64 strings or data URIs)."""

    def __init__(self):
        self.items = [base64.b64encode(PNG).decode()]

    def post(self, url=None, **_):
        return _EnginePost(self.items)


@pytest.fixture
def engine(monkeypatch):
    from open_webui.models.config import Config
    from open_webui.routers import images

    async def rows():
        from open_webui.internal.db import get_async_db

        async with get_async_db() as db:
            found = {key: await db.get(Config, key) for key in CONFIG}
            return {key: (row.value if row else _ABSENT) for key, row in found.items()}

    previous = asyncio.run(rows())
    asyncio.run(Config.upsert(dict(CONFIG)))
    fake = _Engine()

    async def get_session():
        return fake

    monkeypatch.setattr(images, 'get_session', get_session)
    try:
        yield fake
    finally:

        async def restore():
            for key, value in previous.items():
                if value is _ABSENT:
                    await Config.delete(key)
                else:
                    await Config.upsert({key: value})

        asyncio.run(restore())


# ── OCU at its HTTP boundary ──────────────────────────────────────────────────


class _Ocu:
    """Records uploads and answers like OCU: `stem (N).ext` on collision, receipts by attachment id."""

    def __init__(self):
        self.mode = 'ok'
        self.uploads: list[dict] = []
        self.redirect_hits = 0
        self.stored: dict[str, bytes] = {}
        self.receipts: dict[str, str] = {}

    async def upload(self, request: web.Request) -> web.Response:
        form = await request.post()
        part = form['file']
        data = part.file.read()
        self.uploads.append(
            {
                'chat_id': request.match_info['chat_id'],
                'raw_path': request.raw_path,
                'name': request.match_info['name'],
                'part_content_type': part.content_type,
                'authorization': request.headers.get('Authorization'),
                'attachment_id': request.headers.get('X-OCU-Attachment-Id'),
                'data': data,
            }
        )
        if self.mode == 'error':
            return web.json_response({'detail': 'private-upstream-marker'}, status=500)
        if self.mode == 'redirect':
            raise web.HTTPTemporaryRedirect('/elsewhere')
        if self.mode == 'hang':
            await asyncio.sleep(5)
        if self.mode == 'malformed':
            return web.json_response({'status': 'success'})
        return web.json_response({'status': 'success', 'filename': self._store(request, data)})

    def _store(self, request: web.Request, data: bytes) -> str:
        attachment_id = request.headers.get('X-OCU-Attachment-Id')
        if attachment_id in self.receipts:
            return self.receipts[attachment_id]
        path = PurePosixPath(request.match_info['name'])
        stored, counter = path.name, 2
        while stored in self.stored:
            stored, counter = f'{path.stem} ({counter}){path.suffix}', counter + 1
        self.stored[stored] = data
        if attachment_id:
            self.receipts[attachment_id] = stored
        return stored

    async def elsewhere(self, _request: web.Request) -> web.Response:
        self.redirect_hits += 1
        return web.json_response({'status': 'success', 'filename': 'redirected.png'})


async def _serve(ocu: _Ocu):
    app = web.Application()
    app.router.add_post('/api/uploads/{chat_id}/{name}', ocu.upload)
    app.router.add_route('*', '/elsewhere', ocu.elsewhere)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '127.0.0.1', 0)
    await site.start()
    return runner, site._server.sockets[0].getsockname()[1]


def _closed_port() -> int:
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        return probe.getsockname()[1]


# ── chats, users and tool calls ───────────────────────────────────────────────


@pytest.fixture
def world(monkeypatch):
    """An owner, a stranger, and cleanup of every chat and generated file they made."""
    from open_webui.models.chats import Chats
    from open_webui.models.files import Files
    from open_webui.models.users import Users
    from open_webui.storage.provider import Storage

    monkeypatch.setenv('ENABLE_OCU_WORKSPACE', 'true')
    monkeypatch.setenv('OCU_INTERNAL_TOKEN', TOKEN)
    owner = asyncio.run(_insert_user(role='user', prefix='image-workspace-owner'))
    stranger = asyncio.run(_insert_user(role='user', prefix='image-workspace-stranger'))
    state = SimpleNamespace(owner=owner, stranger=stranger, chats=[])
    try:
        yield state
    finally:

        async def purge():
            for chat_id in state.chats:
                await Chats.delete_chat_by_id(chat_id)
            for user in (owner, stranger):
                for row in await Files.get_files_by_user_id(user.id):
                    Storage.delete_file(row.path)
                    await Files.delete_file_by_id(row.id)
                await Users.delete_user_by_id(user.id)

        asyncio.run(purge())


def _chat(world, owner_id: str) -> str:
    from open_webui.models.chats import ChatForm, Chats

    history = {'currentId': MESSAGE_ID, 'messages': {MESSAGE_ID: {'id': MESSAGE_ID, 'role': 'assistant'}}}
    chat = asyncio.run(
        Chats.insert_new_chat(_unique('chat'), owner_id, ChatForm(chat={'title': 'images', 'history': history}))
    )
    world.chats.append(chat.id)
    return chat.id


async def _call(tool: str, chat_id: str, user, emitter=_ABSENT, **arguments) -> tuple[dict, list[dict]]:
    """Call the tool; `emitter` None passes no event emitter, a coroutine function also sees each event."""
    from open_webui.tools import builtin

    events: list[dict] = []

    async def emit(event):
        events.append(event)
        if emitter not in (_ABSENT, None):
            await emitter(event)

    if tool == 'edit_image':
        arguments.setdefault('image_urls', [SOURCE])
    result = await getattr(builtin, tool)(
        'an avalanche',
        __request__=SimpleNamespace(app=get_client().app),
        __user__=user.model_dump(),
        __event_emitter__=None if emitter is None else emit,
        __chat_id__=chat_id,
        __message_id__=MESSAGE_ID,
        **arguments,
    )
    return json.loads(result), events


def _run(ocu: _Ocu, tool: str, chat_id: str, user, monkeypatch, **arguments) -> tuple[dict, list[dict]]:
    async def scenario():
        runner, port = await _serve(ocu)
        monkeypatch.setenv('OCU_INTERNAL_URL', f'http://127.0.0.1:{port}')
        try:
            return await _call(tool, chat_id, user, **arguments)
        finally:
            await runner.cleanup()

    return asyncio.run(scenario())


def _file_names(file_id: str) -> tuple[str, str]:
    """The file row's `filename` column (FilesModal, search) and metadata `name` (downloads)."""
    from open_webui.models.files import Files

    row = asyncio.run(Files.get_file_by_id(file_id))
    return row.filename, row.meta['name']


def _message_files(chat_id: str) -> list[dict]:
    from open_webui.models.chats import Chats

    chat = asyncio.run(Chats.get_chat_by_id(chat_id))
    return chat.chat['history']['messages'][MESSAGE_ID]['files']


# ── saved into the workspace ──────────────────────────────────────────────────


@pytest.mark.parametrize('tool', ['generate_image', 'edit_image'])
def test_named_image_is_uploaded_from_storage_with_its_receipt(world, engine, monkeypatch, tool):
    ocu = _Ocu()
    chat_id = _chat(world, world.owner.id)

    result, events = _run(ocu, tool, chat_id, world.owner, monkeypatch, name='雪崩')

    assert result['status'] == 'success'
    assert 'already visible' in result['message']
    file_id = result['images'][0]['id']
    assert len(ocu.uploads) == 1
    upload = ocu.uploads[0]
    assert upload['chat_id'] == chat_id
    assert upload['raw_path'] == f'/api/uploads/{chat_id}/%E9%9B%AA%E5%B4%A9.png'
    assert upload['name'] == '雪崩.png'
    assert upload['part_content_type'] == 'image/png'
    assert upload['authorization'] == f'Bearer {TOKEN}'
    assert upload['attachment_id'] == file_id
    assert upload['data'] == PNG
    assert result['workspace_files'] == ['/mnt/user-data/files/雪崩.png']
    assert result['workspace_note'] == NOTE
    assert 'workspace_error' not in result
    assert result['images'][0]['name'] == '雪崩.png'
    assert _file_names(file_id) == ('雪崩.png', '雪崩.png')
    assert [file['name'] for file in events[0]['data']['files']] == ['雪崩.png']
    assert [file['name'] for file in _message_files(chat_id)] == ['雪崩.png']


def test_unnamed_image_is_saved_as_generated_image(world, engine, monkeypatch):
    ocu = _Ocu()
    chat_id = _chat(world, world.owner.id)

    result, _ = _run(ocu, 'generate_image', chat_id, world.owner, monkeypatch)

    assert [upload['name'] for upload in ocu.uploads] == ['generated-image.png']
    assert result['workspace_files'] == ['/mnt/user-data/files/generated-image.png']
    assert result['images'][0]['name'] == 'generated-image.png'
    assert _file_names(result['images'][0]['id']) == ('generated-image.png', 'generated-image.png')


def test_two_images_with_one_name_get_the_names_ocu_stored(world, engine, monkeypatch):
    ocu = _Ocu()
    engine.items = [base64.b64encode(PNG).decode(), base64.b64encode(PNG + b'second').decode()]
    chat_id = _chat(world, world.owner.id)

    result, _ = _run(ocu, 'generate_image', chat_id, world.owner, monkeypatch, name='雪崩')

    ids = [image['id'] for image in result['images']]
    assert [upload['attachment_id'] for upload in ocu.uploads] == ids
    assert [upload['data'] for upload in ocu.uploads] == [PNG, PNG + b'second']
    assert result['workspace_files'] == ['/mnt/user-data/files/雪崩.png', '/mnt/user-data/files/雪崩 (2).png']


def test_each_generation_lists_its_own_stored_name(world, engine, monkeypatch):
    ocu = _Ocu()
    chat_id = _chat(world, world.owner.id)

    first, _ = _run(ocu, 'generate_image', chat_id, world.owner, monkeypatch, name='雪崩')
    second, _ = _run(ocu, 'generate_image', chat_id, world.owner, monkeypatch, name='雪崩')

    assert first['workspace_files'] == ['/mnt/user-data/files/雪崩.png']
    assert second['workspace_files'] == ['/mnt/user-data/files/雪崩 (2).png']
    assert len(ocu.uploads) == 2


@pytest.mark.parametrize(
    'name,expected',
    [
        ('雪崩', '雪崩.png'),
        ('sunset beach', 'sunset beach.png'),
        ('  sunset \t\n beach  ', 'sunset beach.png'),
        ('sunset\tbeach', 'sunset beach.png'),
        ('Café', 'Café.png'),
        ('雪崩.png', '雪崩.png'),
        ('../x', 'x.png'),
        ('../../etc/passwd', 'etcpasswd.png'),
        ('a/b', 'ab.png'),
        ('a\\b', 'ab.png'),
        ('a\x00b\x1fc\x7f', 'abc.png'),
        ('   ', 'generated-image.png'),
        ('...', 'generated-image.png'),
        ('', 'generated-image.png'),
        ('雪' * 200, '雪' * 60 + '.png'),
    ],
)
def test_name_is_cleaned_before_upload_and_display(world, engine, monkeypatch, name, expected):
    ocu = _Ocu()
    chat_id = _chat(world, world.owner.id)

    result, _ = _run(ocu, 'generate_image', chat_id, world.owner, monkeypatch, name=name)

    assert [upload['name'] for upload in ocu.uploads] == [expected]
    assert result['workspace_files'] == [f'/mnt/user-data/files/{expected}']
    assert result['images'][0]['name'] == expected
    assert _file_names(result['images'][0]['id']) == (expected, expected)


def test_jpeg_image_takes_the_jpeg_extension(world, engine, monkeypatch):
    ocu = _Ocu()
    engine.items = ['data:image/jpeg;base64,' + base64.b64encode(JPEG).decode()]
    chat_id = _chat(world, world.owner.id)

    result, _ = _run(ocu, 'generate_image', chat_id, world.owner, monkeypatch, name='雪崩')

    assert ocu.uploads[0]['name'] == '雪崩.jpg'
    assert ocu.uploads[0]['part_content_type'] == 'image/jpeg'
    assert ocu.uploads[0]['data'] == JPEG
    assert result['workspace_files'] == ['/mnt/user-data/files/雪崩.jpg']


# ── gates: nothing uploaded, result as before ─────────────────────────────────


def _assert_unchanged(result: dict, ocu: _Ocu) -> None:
    assert ocu.uploads == []
    assert set(result) == {'status', 'message', 'images'}
    assert result['images'][0]['name'] == 'generated-image.png'


def test_workspace_disabled_uploads_nothing(world, engine, monkeypatch):
    monkeypatch.setenv('ENABLE_OCU_WORKSPACE', 'false')
    ocu = _Ocu()
    result, _ = _run(ocu, 'generate_image', _chat(world, world.owner.id), world.owner, monkeypatch)
    _assert_unchanged(result, ocu)


@pytest.mark.parametrize('chat_id', ['local:session-1', 'temporary:session-1', 'channel:channel-1'])
def test_temporary_and_channel_chats_upload_nothing(world, engine, monkeypatch, chat_id):
    ocu = _Ocu()
    result, _ = _run(ocu, 'generate_image', chat_id, world.owner, monkeypatch)
    _assert_unchanged(result, ocu)


@pytest.mark.parametrize('tool', ['generate_image', 'edit_image'])
def test_requester_who_does_not_own_the_chat_uploads_nothing(world, engine, monkeypatch, tool):
    ocu = _Ocu()
    result, _ = _run(ocu, tool, _chat(world, world.owner.id), world.stranger, monkeypatch)
    _assert_unchanged(result, ocu)


def test_name_applies_to_the_display_name_without_the_workspace(world, engine, monkeypatch):
    monkeypatch.setenv('ENABLE_OCU_WORKSPACE', 'false')
    ocu = _Ocu()

    result, _ = _run(ocu, 'generate_image', _chat(world, world.owner.id), world.owner, monkeypatch, name='雪崩')

    assert ocu.uploads == []
    assert set(result) == {'status', 'message', 'images'}
    assert result['images'][0]['name'] == '雪崩.png'
    assert _file_names(result['images'][0]['id']) == ('雪崩.png', '雪崩.png')


# ── failures never fail generation ────────────────────────────────────────────


def _assert_generated_but_not_saved(result: dict, reason: str) -> None:
    assert result['status'] == 'success'
    assert 'already visible' in result['message']
    assert result['images'][0]['url'].endswith('/content')
    assert 'workspace_files' not in result
    assert result['workspace_error'] == f'1 of 1 image(s) not saved to the workspace: {reason}'


@pytest.mark.parametrize('tool', ['generate_image', 'edit_image'])
def test_ocu_error_leaves_the_image_and_reports_it(world, engine, monkeypatch, caplog, tool):
    ocu = _Ocu()
    ocu.mode = 'error'
    caplog.set_level(logging.WARNING, logger=LOGGER)

    result, _ = _run(ocu, tool, _chat(world, world.owner.id), world.owner, monkeypatch, name='雪崩')

    _assert_generated_but_not_saved(result, 'OCU answered HTTP 500')
    assert result['images'][0]['name'] == '雪崩.png'
    logged = ' '.join(record.getMessage() for record in caplog.records if record.name == LOGGER)
    assert 'OCU answered HTTP 500' in logged
    assert 'private-upstream-marker' not in logged and TOKEN not in logged


def test_redirect_is_not_followed(world, engine, monkeypatch):
    ocu = _Ocu()
    ocu.mode = 'redirect'
    result, _ = _run(ocu, 'generate_image', _chat(world, world.owner.id), world.owner, monkeypatch)
    _assert_generated_but_not_saved(result, 'OCU answered HTTP 307')
    assert ocu.redirect_hits == 0


def test_response_without_a_stored_name_is_an_error(world, engine, monkeypatch):
    ocu = _Ocu()
    ocu.mode = 'malformed'
    result, _ = _run(ocu, 'generate_image', _chat(world, world.owner.id), world.owner, monkeypatch)
    _assert_generated_but_not_saved(result, 'ValueError')


def test_unreachable_ocu_leaves_the_image(world, engine, monkeypatch):
    chat_id = _chat(world, world.owner.id)
    monkeypatch.setenv('OCU_INTERNAL_URL', f'http://127.0.0.1:{_closed_port()}')

    result, _ = asyncio.run(_call('generate_image', chat_id, world.owner))

    _assert_generated_but_not_saved(result, 'OCU unreachable')


def test_ocu_timeout_leaves_the_image(world, engine, monkeypatch):
    from open_webui.utils import ocu_client, ocu_image_workspace

    class _ShortTimeoutClient(ocu_client.OcuClient):
        """The real client over a session whose total timeout is 0.3 s instead of 30 s."""

        def __init__(self):
            super().__init__(session=aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=0.3), trust_env=False))
            self._owns_session = True

    monkeypatch.setattr(ocu_image_workspace, 'OcuClient', _ShortTimeoutClient)
    ocu = _Ocu()
    ocu.mode = 'hang'

    result, _ = _run(ocu, 'generate_image', _chat(world, world.owner.id), world.owner, monkeypatch)

    _assert_generated_but_not_saved(result, 'OCU unreachable')


def test_missing_ocu_configuration_leaves_the_image(world, engine, monkeypatch):
    chat_id = _chat(world, world.owner.id)
    monkeypatch.delenv('OCU_INTERNAL_URL', raising=False)

    result, _ = asyncio.run(_call('generate_image', chat_id, world.owner))

    _assert_generated_but_not_saved(result, 'OCU is not configured')


def test_one_failed_upload_keeps_the_other_path(world, engine, monkeypatch):
    ocu = _Ocu()
    engine.items = [base64.b64encode(PNG).decode(), base64.b64encode(PNG + b'second').decode()]
    chat_id = _chat(world, world.owner.id)
    first = ocu.upload
    calls = []

    async def fail_second(request):
        calls.append(1)
        ocu.mode = 'error' if len(calls) == 2 else 'ok'
        return await first(request)

    ocu.upload = fail_second
    result, _ = _run(ocu, 'generate_image', chat_id, world.owner, monkeypatch, name='雪崩')

    assert result['workspace_files'] == ['/mnt/user-data/files/雪崩.png']
    assert result['workspace_error'] == '1 of 2 image(s) not saved to the workspace: OCU answered HTTP 500'


# ── ordering, emitter-less calls, defensive paths ─────────────────────────────


def test_stop_during_a_stuck_upload_keeps_the_shown_image(world, engine, monkeypatch):
    ocu = _Ocu()
    ocu.mode = 'hang'
    chat_id = _chat(world, world.owner.id)
    seen: list[dict] = []

    async def record(event):
        seen.append(event)

    async def scenario():
        runner, port = await _serve(ocu)
        monkeypatch.setenv('OCU_INTERNAL_URL', f'http://127.0.0.1:{port}')
        try:
            task = asyncio.create_task(_call('generate_image', chat_id, world.owner, emitter=record, name='雪崩'))
            deadline = asyncio.get_running_loop().time() + 10
            while not ocu.uploads:
                assert asyncio.get_running_loop().time() < deadline, 'upload never reached OCU'
                await asyncio.sleep(0.01)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        finally:
            await runner.cleanup()

    asyncio.run(scenario())

    assert [file['name'] for file in seen[0]['data']['files']] == ['雪崩.png']
    assert [file['name'] for file in _message_files(chat_id)] == ['雪崩.png']


def test_call_without_an_event_emitter_lists_the_workspace_paths(world, engine, monkeypatch):
    ocu = _Ocu()
    chat_id = _chat(world, world.owner.id)

    result, events = _run(ocu, 'generate_image', chat_id, world.owner, monkeypatch, emitter=None, name='雪崩')

    assert events == []
    assert set(result) == {'status', 'images', 'workspace_files', 'workspace_note'}
    assert result['workspace_files'] == ['/mnt/user-data/files/雪崩.png']
    assert result['workspace_note'] == NOTE
    assert 'must not be embedded again' not in json.dumps(result)


def test_image_file_deleted_before_upload_is_reported_not_found(world, engine, monkeypatch):
    from open_webui.models.files import Files

    async def delete_rows(event):
        for file in event['data']['files']:
            await Files.delete_file_by_id(file['id'])

    ocu = _Ocu()
    result, _ = _run(ocu, 'generate_image', _chat(world, world.owner.id), world.owner, monkeypatch, emitter=delete_rows)

    assert ocu.uploads == []
    assert result['workspace_error'].endswith('image file not found')
    assert 'workspace_files' not in result


def test_image_file_owned_by_someone_else_is_not_uploaded(world, engine, monkeypatch):
    from open_webui.internal.db import get_async_db
    from open_webui.models.files import File
    from sqlalchemy import update

    async def hand_to_stranger(event):
        ids = [file['id'] for file in event['data']['files']]
        async with get_async_db() as db:
            await db.execute(update(File).where(File.id.in_(ids)).values(user_id=world.stranger.id))
            await db.commit()

    ocu = _Ocu()
    result, _ = _run(
        ocu, 'generate_image', _chat(world, world.owner.id), world.owner, monkeypatch, emitter=hand_to_stranger
    )

    assert ocu.uploads == []
    assert result['workspace_error'] == '1 of 1 image(s) not saved to the workspace: image file not found'


def test_failed_rename_keeps_the_original_name(world, engine, monkeypatch):
    from unittest.mock import AsyncMock

    from open_webui.models.files import Files

    monkeypatch.setattr(Files, 'update_file_name_by_id', AsyncMock(return_value=None))
    ocu = _Ocu()

    result, events = _run(ocu, 'generate_image', _chat(world, world.owner.id), world.owner, monkeypatch, name='雪崩')

    assert result['images'][0]['name'] == 'generated-image.png'
    assert [file['name'] for file in events[0]['data']['files']] == ['generated-image.png']
    assert _file_names(result['images'][0]['id']) == ('generated-image.png', 'generated-image.png')
    assert [upload['name'] for upload in ocu.uploads] == ['generated-image.png']
    assert result['workspace_files'] == ['/mnt/user-data/files/generated-image.png']


def test_tool_specs_expose_an_optional_name():
    from open_webui.tools.builtin import edit_image, generate_image
    from open_webui.utils.tools import get_builtin_tool_spec

    for tool in (generate_image, edit_image):
        parameters = get_builtin_tool_spec(tool)['parameters']
        assert 'name' not in parameters['required']
        assert parameters['properties']['name']['type'] == 'string'
        description = parameters['properties']['name']['description']
        assert "user's language" in description and 'from the request' in description
        assert 'image content' not in description
