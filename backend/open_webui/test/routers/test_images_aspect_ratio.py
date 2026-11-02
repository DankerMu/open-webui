"""generate_image picks a size by aspect ratio from an editable table (#690).

The ratio table lives under the reserved key `aspect_ratio_sizes` of the stored
`IMAGES_OPENAI_API_PARAMS`, with a built-in preset when the key is absent. Seams: the tool
with `image_generations` mocked, `image_generations` with the HTTP session and the file
upload mocked, and the config routes. Config rows live in the harness database and are
restored exactly, row presence included.
"""

from __future__ import annotations

import asyncio
import base64
import json
from unittest.mock import AsyncMock

import pytest
from open_webui.test.ocu_harness import _delete_user, _insert_user, _session_headers, get_client

ENGINE = 'image_generation.engine'
PARAMS = 'image_generation.openai.params'
MODEL = 'image_generation.model'
SIZE = 'image_generation.size'
BASE_URL = 'image_generation.openai.api_base_url'
UPSTREAM = 'http://image-upstream.invalid/v1'

# The seven official sizes, copied from the fixture (design.md), not from the code.
PRESET = {
    '1:1': '2048x2048',
    '4:3': '2400x1792',
    '3:4': '1792x2400',
    '3:2': '2528x1696',
    '2:3': '1696x2528',
    '16:9': '2752x1536',
    '9:16': '1536x2752',
}
_ABSENT = object()


async def _rows() -> dict:
    from open_webui.internal.db import get_async_db
    from open_webui.models.config import Config
    from open_webui.routers.images import IMAGE_CONFIG_KEYS

    # config/update writes every image key, so every one of them is snapshotted.
    async with get_async_db() as db:
        rows = {key: await db.get(Config, key) for key in IMAGE_CONFIG_KEYS.values()}
        return {key: (row.value if row else _ABSENT) for key, row in rows.items()}


async def _restore(previous: dict) -> None:
    from open_webui.models.config import Config

    for key, value in previous.items():
        if value is _ABSENT:
            await Config.delete(key)
        else:
            await Config.upsert({key: value})


def _set(**values) -> None:
    from open_webui.models.config import Config

    keys = {'engine': ENGINE, 'params': PARAMS, 'model': MODEL, 'size': SIZE, 'base_url': BASE_URL}
    asyncio.run(Config.upsert({keys[name]: value for name, value in values.items()}))


def _stored_params():
    return asyncio.run(_rows())[PARAMS]


@pytest.fixture(autouse=True)
def config_rows():
    previous = asyncio.run(_rows())
    _set(engine='openai', model='harness-image-model', size='2048x2048', base_url=UPSTREAM, params={})
    try:
        yield
    finally:
        asyncio.run(_restore(previous))


# ── the tool, image_generations mocked ────────────────────────────────────────


@pytest.fixture
def generations(monkeypatch):
    from open_webui.tools import builtin

    mock = AsyncMock(return_value=[])
    monkeypatch.setattr(builtin, 'image_generations', mock)
    return mock


def _tool(aspect_ratio=_ABSENT) -> dict:
    from open_webui.tools.builtin import generate_image

    kwargs = {} if aspect_ratio is _ABSENT else {'aspect_ratio': aspect_ratio}
    return json.loads(asyncio.run(generate_image('a lighthouse', __request__=object(), **kwargs)))


def _form_size(generations):
    generations.assert_called_once()
    return generations.call_args.kwargs['form_data'].size


def test_configured_ratio_sets_form_size(generations):
    _set(params={'aspect_ratio_sizes': {'1:1': '2048x2048', '16:9': '2752x1536'}})
    assert _tool('16:9')['status'] == 'success'
    assert _form_size(generations) == '2752x1536'


def test_no_argument_leaves_size_to_image_size(generations):
    _set(params={'aspect_ratio_sizes': {'16:9': '2752x1536'}})
    assert _tool()['status'] == 'success'
    assert _form_size(generations) is None


def test_empty_table_turns_selection_off(generations):
    _set(params={'aspect_ratio_sizes': {}})
    assert _tool('16:9')['status'] == 'success'
    assert _form_size(generations) is None


@pytest.mark.parametrize('ratio', list(PRESET))
def test_preset_applies_when_no_key_stored(generations, ratio):
    _set(params={'num_inference_steps': 40})
    assert _tool(ratio)['status'] == 'success'
    size = _form_size(generations)
    assert size == PRESET[ratio]
    width, height = map(int, size.split('x'))
    assert width % 32 == 0 and height % 32 == 0


@pytest.mark.parametrize('engine', ['comfyui', 'automatic1111', 'gemini'])
@pytest.mark.parametrize('ratio', ['16:9', '5:4'])
def test_other_engines_ignore_the_ratio(generations, engine, ratio):
    _set(engine=engine, params={'aspect_ratio_sizes': {'16:9': '2752x1536'}})
    assert _tool(ratio)['status'] == 'success'
    assert _form_size(generations) is None


@pytest.mark.parametrize('params', [None, ''])
def test_non_dict_params_use_the_preset(generations, params):
    _set(params=params)
    assert _tool('9:16')['status'] == 'success'
    assert _form_size(generations) == '1536x2752'


@pytest.mark.parametrize('params', [None, ''])
def test_non_dict_params_without_argument_leave_size(generations, params):
    _set(params=params)
    assert _tool()['status'] == 'success'
    assert _form_size(generations) is None


@pytest.mark.parametrize('table', ['16:9=2752x1536', ['16:9'], 7])
def test_non_mapping_table_counts_as_empty(generations, table):
    _set(params={'aspect_ratio_sizes': table})
    assert _tool('16:9')['status'] == 'success'
    assert _form_size(generations) is None


def test_edited_table_replaces_the_preset(generations):
    _set(params={'aspect_ratio_sizes': {'16:9': '1920x1088'}})
    assert _tool('16:9')['status'] == 'success'
    assert _form_size(generations) == '1920x1088'
    generations.reset_mock()
    result = _tool('1:1')
    assert '1:1' in result['error'] and '16:9' in result['error']
    generations.assert_not_called()


def test_unknown_ratio_lists_valid_ratios_without_a_request(generations):
    _set(params={'aspect_ratio_sizes': {'1:1': '2048x2048', '16:9': '2752x1536'}})
    result = _tool('5:4')
    assert set(result) == {'error'}
    assert '5:4' in result['error'] and '1:1' in result['error'] and '16:9' in result['error']
    generations.assert_not_called()


@pytest.mark.parametrize('ratio', [' 16:9', '16:9 ', '\t16:9\n'])
def test_whitespace_around_ratio_is_ignored(generations, ratio):
    _set(params={'aspect_ratio_sizes': {'16:9': '2752x1536'}})
    assert _tool(ratio)['status'] == 'success'
    assert _form_size(generations) == '2752x1536'


def test_tool_spec_exposes_optional_aspect_ratio():
    from open_webui.tools.builtin import generate_image
    from open_webui.utils.tools import get_builtin_tool_spec

    parameters = get_builtin_tool_spec(generate_image)['parameters']
    assert parameters['required'] == ['prompt']
    aspect_ratio = parameters['properties']['aspect_ratio']
    assert aspect_ratio['type'] == 'string'
    assert aspect_ratio['description'].strip()


# ── image_generations, HTTP session and upload mocked ─────────────────────────


class _Response:
    def raise_for_status(self):
        return None

    async def json(self, content_type=None):
        return {'data': [{'b64_json': base64.b64encode(b'image-bytes').decode()}]}


class _Post:
    async def __aenter__(self):
        return _Response()

    async def __aexit__(self, *_exc):
        return False


class _Session:
    def __init__(self):
        self.posts: list[dict] = []

    def post(self, url, json=None, **_):
        self.posts.append({'url': url, 'json': json})
        return _Post()


@pytest.fixture
def upstream(monkeypatch):
    from open_webui.routers import images

    session = _Session()

    async def get_session():
        return session

    upload = AsyncMock(return_value=(None, {'id': 'file-id', 'url': '/files/file-id'}))
    monkeypatch.setattr(images, 'get_session', get_session)
    monkeypatch.setattr(images, 'upload_image', upload)
    return {'session': session, 'upload': upload}


def _generate(size=None) -> None:
    from open_webui.routers.images import CreateImageForm, image_generations

    asyncio.run(image_generations(request=object(), form_data=CreateImageForm(prompt='a lighthouse', size=size)))


def _posted(upstream) -> dict:
    assert len(upstream['session'].posts) == 1
    return upstream['session'].posts[0]['json']


def _file_metadata(upstream) -> dict:
    upstream['upload'].assert_called_once()
    return upstream['upload'].call_args.args[3]


def test_reserved_key_is_not_posted_or_stored(upstream):
    table = {'16:9': '2752x1536'}
    _set(params={'num_inference_steps': 40, 'aspect_ratio_sizes': table})
    _generate('2752x1536')
    posted = _posted(upstream)
    assert posted['num_inference_steps'] == 40
    assert 'aspect_ratio_sizes' not in posted
    assert 'aspect_ratio_sizes' not in _file_metadata(upstream)
    assert _stored_params() == {'num_inference_steps': 40, 'aspect_ratio_sizes': table}


def test_form_size_beats_image_size(upstream):
    _generate('1536x2752')
    assert _posted(upstream)['size'] == '1536x2752'


def test_image_size_applies_without_form_size(upstream):
    _generate()
    assert _posted(upstream)['size'] == '2048x2048'


@pytest.mark.parametrize('params', [None, ''])
def test_non_dict_params_still_post(upstream, params):
    _set(params=params)
    _generate()
    posted = _posted(upstream)
    assert posted['size'] == '2048x2048'
    assert 'aspect_ratio_sizes' not in posted


def test_form_size_beats_params_size(upstream):
    _set(params={'size': '1024x1024', 'aspect_ratio_sizes': {'16:9': '2752x1536'}})
    _generate('2752x1536')
    posted = _posted(upstream)
    assert posted['size'] == '2752x1536'
    assert 'aspect_ratio_sizes' not in posted
    assert 'aspect_ratio_sizes' not in _file_metadata(upstream)


def test_params_size_beats_image_size_without_form_size(upstream):
    _set(params={'size': '1024x1024', 'aspect_ratio_sizes': {'16:9': '2752x1536'}})
    _generate()
    posted = _posted(upstream)
    assert posted['size'] == '1024x1024'
    assert 'aspect_ratio_sizes' not in posted
    assert 'aspect_ratio_sizes' not in _file_metadata(upstream)


# ── config routes ─────────────────────────────────────────────────────────────


@pytest.fixture
def admin_headers():
    admin = asyncio.run(_insert_user(role='admin', prefix='images-admin'))
    try:
        yield _session_headers(admin.id)
    finally:
        asyncio.run(_delete_user(admin.id))


def _get_config(headers) -> dict:
    response = get_client().get('/api/v1/images/config', headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_get_config_shows_preset_without_writing(admin_headers):
    assert _get_config(admin_headers)['IMAGES_OPENAI_API_PARAMS'] == {'aspect_ratio_sizes': PRESET}
    assert _stored_params() == {}


def test_get_config_keeps_other_params(admin_headers):
    _set(params={'num_inference_steps': 40})
    shown = _get_config(admin_headers)['IMAGES_OPENAI_API_PARAMS']
    assert shown == {'num_inference_steps': 40, 'aspect_ratio_sizes': PRESET}
    assert _stored_params() == {'num_inference_steps': 40}


@pytest.mark.parametrize('params', [None, '', 'not-json'])
def test_get_config_returns_non_dict_params_unchanged(admin_headers, params):
    _set(params=params)
    assert _get_config(admin_headers)['IMAGES_OPENAI_API_PARAMS'] == params
    assert _stored_params() == params


@pytest.mark.parametrize(
    ('table', 'ratio', 'size'),
    [({'16:9': '1920x1088', '1:1': '1024x1024'}, '16:9', '1920x1088'), ({}, '16:9', None)],
    ids=['edited', 'empty'],
)
def test_saved_table_round_trips_and_drives_the_tool(admin_headers, generations, table, ratio, size):
    form = _get_config(admin_headers)
    form['IMAGES_OPENAI_API_PARAMS'] = {'num_inference_steps': 40, 'aspect_ratio_sizes': table}
    response = get_client().post('/api/v1/images/config/update', headers=admin_headers, json=form)
    assert response.status_code == 200, response.text
    assert _get_config(admin_headers)['IMAGES_OPENAI_API_PARAMS'] == form['IMAGES_OPENAI_API_PARAMS']
    assert _tool(ratio)['status'] == 'success'
    assert _form_size(generations) == size
