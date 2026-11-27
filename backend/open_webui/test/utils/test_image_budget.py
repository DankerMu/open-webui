"""Per-request image cap on the payload sent to the model (#936, openspec webui-image-request-cap).

The production upstream rejects a request with more than 32 images; WebUI keeps the newest
CHAT_MAX_IMAGES_PER_REQUEST image parts and replaces each older one with a text placeholder.
"""

from __future__ import annotations

import copy
import os
import subprocess
import sys

import pytest
from open_webui.test import ocu_harness  # noqa: F401  configures the harness env before open_webui.env loads
from open_webui.utils import image_budget, middleware

IMAGE_TYPES = ('image_url', 'input_image')


def _image(n: int) -> dict:
    return {'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,IMG{n}'}}


def _text(value: str) -> dict:
    return {'type': 'text', 'text': value}


def _image_parts(messages: list) -> list[dict]:
    return [
        part
        for message in messages
        if isinstance(message.get('content'), list)
        for part in message['content']
        if part.get('type') in IMAGE_TYPES
    ]


def _placeholder(kind: str = 'text') -> dict:
    return {'type': kind, 'text': image_budget.OMITTED}


def _tool_flow(tool_images: int) -> list[dict]:
    """3 user images in earlier messages, then a tool round whose images are flattened into one user message."""
    return [
        {'role': 'system', 'content': 'You are helpful.'},
        {'role': 'user', 'content': [_text('look at these'), _image(0), _image(1)]},
        {'role': 'assistant', 'content': 'I see two images.'},
        {'role': 'user', 'content': [_text('and this one'), _image(2)]},
        {
            'role': 'assistant',
            'content': '',
            'tool_calls': [{'id': 'call_1', 'type': 'function', 'function': {'name': 'view', 'arguments': '{}'}}],
        },
        {'role': 'tool', 'tool_call_id': 'call_1', 'content': 'viewed'},
        {
            'role': 'user',
            'content': [_text('Here are the images from the tool results above')]
            + [_image(3 + i) for i in range(tool_images)],
        },
    ]


def test_forty_tool_images_and_three_user_images_keep_the_newest_thirty():
    messages = _tool_flow(40)

    capped = image_budget.cap_images(messages, 30)

    kept = _image_parts(capped)
    assert [part['image_url']['url'] for part in kept] == [f'data:image/png;base64,IMG{n}' for n in range(13, 43)]
    placeholders = [part for message in capped if isinstance(message['content'], list) for part in message['content']]
    assert placeholders.count(_placeholder()) == 13
    assert capped[1]['content'] == [_text('look at these'), _placeholder(), _placeholder()]
    assert capped[3]['content'] == [_text('and this one'), _placeholder()]
    tool_round = capped[6]['content']
    assert tool_round[0] == _text('Here are the images from the tool results above')
    assert tool_round[1:11] == [_placeholder()] * 10
    assert tool_round[11:] == [_image(n) for n in range(13, 43)]
    assert [m['role'] for m in capped] == [m['role'] for m in messages]
    for index in (0, 2, 4, 5):
        assert capped[index] is messages[index]


def test_payload_at_the_limit_is_returned_unchanged():
    messages = _tool_flow(27)

    capped = image_budget.cap_images(messages, 30)

    assert capped is messages
    assert all(after is before for after, before in zip(capped, messages))
    assert len(_image_parts(capped)) == 30


def test_one_message_over_the_limit_keeps_its_last_parts():
    messages = [{'role': 'user', 'content': [_image(n) for n in range(5)]}]

    capped = image_budget.cap_images(messages, 2)

    assert capped == [{'role': 'user', 'content': [_placeholder()] * 3 + [_image(3), _image(4)]}]


def test_input_image_parts_become_input_text():
    messages = [
        {
            'role': 'tool',
            'tool_call_id': 'call_9',
            'content': [
                {'type': 'input_text', 'text': 'screenshot'},
                {'type': 'input_image', 'image_url': 'data:image/png;base64,A'},
                {'type': 'input_image', 'image_url': 'data:image/png;base64,B'},
                {'type': 'input_image', 'image_url': 'data:image/png;base64,C'},
            ],
        }
    ]

    capped = image_budget.cap_images(messages, 1)

    assert capped == [
        {
            'role': 'tool',
            'tool_call_id': 'call_9',
            'content': [
                {'type': 'input_text', 'text': 'screenshot'},
                _placeholder('input_text'),
                _placeholder('input_text'),
                {'type': 'input_image', 'image_url': 'data:image/png;base64,C'},
            ],
        }
    ]


def test_image_url_and_input_image_share_one_budget():
    tool_image = {'type': 'input_image', 'image_url': 'data:image/png;base64,TOOL'}
    messages = [
        {'role': 'tool', 'tool_call_id': 'call_1', 'content': [tool_image]},
        {'role': 'user', 'content': [_image(0), _image(1)]},
    ]

    capped = image_budget.cap_images(messages, 2)

    assert capped == [
        {'role': 'tool', 'tool_call_id': 'call_1', 'content': [_placeholder('input_text')]},
        {'role': 'user', 'content': [_image(0), _image(1)]},
    ]
    assert capped[1] is messages[1]


def test_string_content_and_image_free_messages_are_untouched():
    messages = [
        {'role': 'system', 'content': 'system text'},
        {'role': 'user', 'content': [_text('only text')]},
        {'role': 'assistant', 'content': None},
        {'role': 'user', 'content': [_image(0), _image(1)]},
    ]

    capped = image_budget.cap_images(messages, 1)

    for index in range(3):
        assert capped[index] is messages[index]
    assert capped[3]['content'] == [_placeholder(), _image(1)]


def test_string_valued_image_url_is_replaced():
    messages = [
        {
            'role': 'user',
            'content': [
                {'type': 'image_url', 'image_url': 'data:image/png;base64,OLD'},
                {'type': 'image_url', 'image_url': 'data:image/png;base64,NEW'},
            ],
        }
    ]

    capped = image_budget.cap_images(messages, 1)

    assert capped[0]['content'] == [_placeholder(), {'type': 'image_url', 'image_url': 'data:image/png;base64,NEW'}]


def test_placeholder_keeps_cache_control():
    marker = {'type': 'ephemeral'}
    messages = [{'role': 'user', 'content': [{**_image(0), 'cache_control': marker}, _image(1)]}]

    capped = image_budget.cap_images(messages, 1)

    assert capped[0]['content'][0] == {**_placeholder(), 'cache_control': marker}


def test_caller_messages_are_never_mutated():
    messages = _tool_flow(40)
    messages[1]['content'][1]['cache_control'] = {'type': 'ephemeral'}
    before = copy.deepcopy(messages)
    content_lists = [message['content'] for message in messages]

    image_budget.cap_images(messages, 30)

    assert messages == before
    assert [message['content'] for message in messages] == content_lists
    assert all(message['content'] is lists for message, lists in zip(messages, content_lists))


def test_placeholder_tells_the_model_why_and_how_to_recover():
    text = image_budget.OMITTED.lower()
    assert 'omitted' in text
    assert 'per-request image limit' in text
    assert 'tool' in text


@pytest.mark.parametrize('value', ['0', '-1', 'abc', '3.5', '', ' 5', '+5'])
def test_invalid_limit_raises_naming_the_variable(value):
    with pytest.raises(ValueError, match='CHAT_MAX_IMAGES_PER_REQUEST'):
        image_budget.parse_image_limit(value)


@pytest.mark.parametrize(('value', 'expected'), [(None, 30), ('5', 5), ('1', 1), ('030', 30)])
def test_valid_limit_parses(value, expected):
    assert image_budget.parse_image_limit(value) == expected


def _import_with_limit(value: str | None) -> subprocess.CompletedProcess:
    env = {key: val for key, val in os.environ.items() if key != 'CHAT_MAX_IMAGES_PER_REQUEST'}
    if value is not None:
        env['CHAT_MAX_IMAGES_PER_REQUEST'] = value
    code = 'from open_webui.utils import image_budget; print(image_budget.CHAT_MAX_IMAGES_PER_REQUEST)'
    return subprocess.run([sys.executable, '-c', code], env=env, capture_output=True, text=True, check=False)


def test_invalid_limit_fails_at_import():
    completed = _import_with_limit('0')
    assert completed.returncode != 0
    assert 'ValueError' in completed.stderr
    assert 'CHAT_MAX_IMAGES_PER_REQUEST' in completed.stderr


@pytest.mark.parametrize(('value', 'expected'), [(None, '30'), ('5', '5')])
def test_limit_is_read_from_the_environment_at_import(value, expected):
    completed = _import_with_limit(value)
    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.strip() == expected


def test_normalize_caps_the_passed_dict_with_the_default_limit():
    assert 'CHAT_MAX_IMAGES_PER_REQUEST' not in os.environ
    form_data = {'model': 'm', 'messages': [{'role': 'user', 'content': [_image(n) for n in range(33)]}]}

    result = middleware.normalize_messages_for_model(form_data)

    assert result is form_data
    kept = _image_parts(form_data['messages'])
    assert len(kept) == 30
    assert kept == [_image(n) for n in range(3, 33)]
    assert form_data['messages'][0]['content'][:3] == [_placeholder()] * 3
