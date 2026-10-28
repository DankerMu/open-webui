"""POST /api/v1/messages refuses a model the caller may not use before any upstream call (#662).

Claude Code in the sandbox sends the user's own token to this endpoint (the `sub_agent`
and terminal gateway), so its model access check is the only thing standing between a
forwarded token and a model the user may not use. Both routes through the endpoint are
pinned with BYPASS_MODEL_ACCESS_CONTROL off: the convert path (OpenAI-compatible
connection, through `chat_completion`) and the Anthropic passthrough (`provider: litellm`,
through `get_anthropic_request_target`). The upstream is a recording fake behind
`get_session`; connections and model rows live in the harness database and are restored.
"""

from __future__ import annotations

import asyncio
import json

import pytest
from open_webui.test.ocu_harness import _delete_user, _insert_user, _session_headers, _unique, get_client

CONVERT_URL = 'http://convert-upstream.invalid/v1'
PASSTHROUGH_URL = 'http://litellm-upstream.invalid/v1'
CONFIG_KEYS = ('openai.enable', 'openai.api_base_urls', 'openai.api_keys', 'openai.api_configs')
COMPLETION = {
    'id': 'chatcmpl-1',
    'object': 'chat.completion',
    'created': 0,
    'model': 'upstream',
    'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': 'upstream reply'}, 'finish_reason': 'stop'}],
    'usage': {'prompt_tokens': 3, 'completion_tokens': 2, 'total_tokens': 5},
}
ANTHROPIC_MESSAGE = {
    'id': 'msg-1',
    'type': 'message',
    'role': 'assistant',
    'model': 'upstream',
    'content': [{'type': 'text', 'text': 'upstream reply'}],
    'stop_reason': 'end_turn',
    'usage': {'input_tokens': 3, 'output_tokens': 2},
}


class _UpstreamResponse:
    def __init__(self, payload: dict):
        self.status = 200
        self.headers = {'Content-Type': 'application/json'}
        self.closed = False
        self._payload = payload

    async def json(self, loads=None):
        return self._payload

    async def text(self):
        return json.dumps(self._payload)

    def close(self):
        self.closed = True


class _Upstream:
    """Records every provider request; answers by endpoint like an OpenAI-compatible proxy."""

    def __init__(self):
        self.calls: list[dict] = []

    async def request(self, method, url, data=None, **kwargs):
        body = json.loads(data) if isinstance(data, (str, bytes)) else data
        self.calls.append({'method': method, 'url': url, 'model': (body or {}).get('model')})
        if url.endswith('/messages/count_tokens'):
            return _UpstreamResponse({'input_tokens': 3})
        if url.endswith('/messages'):
            return _UpstreamResponse(ANTHROPIC_MESSAGE)
        if url.endswith('/chat/completions'):
            return _UpstreamResponse(COMPLETION)
        raise AssertionError(f'unexpected upstream request {method} {url}')

    def generation_calls(self) -> list[dict]:
        return [call for call in self.calls if not call['url'].endswith('/count_tokens')]


async def _stored_config() -> dict:
    from open_webui.models.config import Config

    return await Config.get_many(*CONFIG_KEYS)


async def _restore_config(previous: dict) -> None:
    from open_webui.models.config import Config

    for key in CONFIG_KEYS:
        if key in previous:
            await Config.upsert({key: previous[key]})
        else:
            await Config.delete(key)


async def _clear_model_caches(app) -> None:
    from open_webui.routers import openai

    await openai.get_all_models.cache.clear()
    app.state.MODELS = {}
    app.state.BASE_MODELS = []
    app.state.OPENAI_MODELS = {}


async def _setup(state: dict) -> None:
    from open_webui.models.config import Config
    from open_webui.models.models import ModelForm, ModelMeta, ModelParams, Models

    ids = state['ids']
    await Config.upsert(
        {
            'openai.enable': True,
            'openai.api_base_urls': [CONVERT_URL, PASSTHROUGH_URL],
            'openai.api_keys': ['convert-key', 'passthrough-key'],
            'openai.api_configs': {
                '0': {'enable': True, 'model_ids': [ids['convert_allowed'], ids['convert_restricted']]},
                '1': {
                    'enable': True,
                    'provider': 'litellm',
                    'model_ids': [ids['passthrough_allowed'], ids['passthrough_restricted']],
                },
            },
        }
    )
    state['caller'] = await _insert_user(role='user', prefix='messages-caller')
    state['owner'] = await _insert_user(role='user', prefix='messages-model-owner')
    for key, model_id in ids.items():
        row_owner = state['caller'] if key.endswith('_allowed') else state['owner']
        inserted = await Models.insert_new_model(
            ModelForm(id=model_id, name=model_id, meta=ModelMeta(), params=ModelParams(), access_grants=[]),
            row_owner.id,
        )
        assert inserted is not None


async def _teardown(state: dict) -> None:
    from open_webui.models.models import Models

    for model_id in state['ids'].values():
        await Models.delete_model_by_id(model_id)
    for role in ('caller', 'owner'):
        if role in state:
            await _delete_user(state[role].id)
    await _restore_config(state['previous'])


@pytest.fixture
def world(monkeypatch):
    from open_webui import main
    from open_webui.routers import openai
    from open_webui.utils import chat

    for module in (main, openai, chat):
        assert module.BYPASS_MODEL_ACCESS_CONTROL is False, module.__name__
    upstream = _Upstream()

    async def get_session():
        return upstream

    monkeypatch.setattr(main, 'get_session', get_session)
    monkeypatch.setattr(openai, 'get_session', get_session)
    for name in ('MODELS', 'BASE_MODELS', 'OPENAI_MODELS'):
        monkeypatch.setattr(main.app.state, name, getattr(main.app.state, name))
    ids = {
        'convert_allowed': _unique('allowed-m'),
        'convert_restricted': _unique('restricted-m'),
        'passthrough_allowed': _unique('allowed-m'),
        'passthrough_restricted': _unique('restricted-m'),
    }
    asyncio.run(_clear_model_caches(main.app))
    state = {'ids': ids, 'previous': asyncio.run(_stored_config())}
    try:
        asyncio.run(_setup(state))
        yield {
            'app': main.app,
            'ids': ids,
            'upstream': upstream,
            'headers': _session_headers(state['caller'].id),
        }
    finally:
        asyncio.run(_teardown(state))
        asyncio.run(_clear_model_caches(main.app))


def _messages(world, model: str):
    return get_client().post(
        '/api/v1/messages',
        headers=world['headers'],
        json={'model': model, 'max_tokens': 16, 'messages': [{'role': 'user', 'content': 'hello'}]},
    )


def _chat_completions(world, model: str):
    return get_client().post(
        '/api/chat/completions',
        headers=world['headers'],
        json={'model': model, 'messages': [{'role': 'user', 'content': 'hello'}]},
    )


def test_convert_path_refuses_like_chat_completions_before_any_upstream_call(world):
    model = world['ids']['convert_restricted']
    refused = _messages(world, model)
    assert world['upstream'].calls == []
    chat_refused = _chat_completions(world, model)
    assert world['upstream'].calls == []
    assert refused.status_code == chat_refused.status_code
    assert 400 <= refused.status_code < 500
    assert model in world['app'].state.MODELS, 'refusal must come from access, not an unknown model'


def test_passthrough_refuses_with_403_before_any_upstream_call(world):
    model = world['ids']['passthrough_restricted']
    refused = _messages(world, model)
    assert refused.status_code == 403
    assert world['upstream'].calls == []
    assert model in world['app'].state.OPENAI_MODELS, 'refusal must come from access, not an unknown model'


def test_convert_path_allowed_model_reaches_the_upstream(world):
    model = world['ids']['convert_allowed']
    response = _messages(world, model)
    assert response.status_code == 200, response.text
    assert response.json()['content'] == [{'type': 'text', 'text': 'upstream reply'}]
    assert world['upstream'].generation_calls() == [
        {'method': 'POST', 'url': f'{CONVERT_URL}/chat/completions', 'model': model}
    ]


def test_passthrough_allowed_model_reaches_the_upstream(world):
    model = world['ids']['passthrough_allowed']
    response = _messages(world, model)
    assert response.status_code == 200, response.text
    assert response.json() == ANTHROPIC_MESSAGE
    assert world['upstream'].generation_calls() == [
        {'method': 'POST', 'url': f'{PASSTHROUGH_URL}/messages', 'model': model}
    ]
