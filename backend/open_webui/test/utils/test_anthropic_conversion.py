"""Thinking-block handling in the Anthropic Messages to Chat Completions request conversion."""

from __future__ import annotations

from open_webui.test import ocu_harness  # noqa: F401  configures the harness env before open_webui.env loads
from open_webui.utils.anthropic import convert_anthropic_to_openai_payload

UNSIGNED_THINKING = {'type': 'thinking', 'thinking': 'I should list the files.'}
SIGNED_THINKING = {'type': 'thinking', 'thinking': 'I should list the files.', 'signature': 'sig'}
REDACTED_THINKING = {'type': 'redacted_thinking', 'data': 'opaque-redacted-payload'}
TOOL_USE = {'type': 'tool_use', 'id': 'toolu_1', 'name': 'Bash', 'input': {'command': 'ls'}}
TOOL_CALL = {
    'id': 'toolu_1',
    'type': 'function',
    'function': {'name': 'Bash', 'arguments': '{"command": "ls"}'},
}


def _convert(*messages: dict) -> list[dict]:
    return convert_anthropic_to_openai_payload({'model': 'm', 'messages': list(messages)})['messages']


def _user(text: str) -> dict:
    return {'role': 'user', 'content': text}


def test_unsigned_thinking_before_tool_use_leaves_empty_content_with_tool_calls():
    assert _convert(
        _user('list files'),
        {'role': 'assistant', 'content': [UNSIGNED_THINKING, TOOL_USE]},
    ) == [
        _user('list files'),
        {'role': 'assistant', 'content': '', 'tool_calls': [TOOL_CALL]},
    ]


def test_unsigned_thinking_before_text_leaves_plain_string_content():
    assert _convert(
        _user('hello'),
        {'role': 'assistant', 'content': [UNSIGNED_THINKING, {'type': 'text', 'text': 'Hi there.'}]},
    ) == [
        _user('hello'),
        {'role': 'assistant', 'content': 'Hi there.'},
    ]


def test_signed_thinking_before_tool_use_is_kept_verbatim():
    assert _convert(
        _user('list files'),
        {'role': 'assistant', 'content': [SIGNED_THINKING, TOOL_USE]},
    ) == [
        _user('list files'),
        {
            'role': 'assistant',
            'content': [{'type': 'thinking', 'thinking': 'I should list the files.', 'signature': 'sig'}],
            'tool_calls': [TOOL_CALL],
        },
    ]


def test_redacted_thinking_is_kept_as_content_part():
    assert _convert(
        _user('hello'),
        {'role': 'assistant', 'content': [REDACTED_THINKING]},
    ) == [
        _user('hello'),
        {'role': 'assistant', 'content': [{'type': 'redacted_thinking', 'data': 'opaque-redacted-payload'}]},
    ]


def test_assistant_turn_with_only_unsigned_thinking_stays_between_user_turns():
    assert _convert(
        _user('first'),
        {'role': 'assistant', 'content': [UNSIGNED_THINKING]},
        _user('second'),
    ) == [
        _user('first'),
        {'role': 'assistant', 'content': ''},
        _user('second'),
    ]


def test_empty_user_turn_is_still_omitted():
    assert _convert(
        _user('first'),
        {'role': 'assistant', 'content': 'answer'},
        {'role': 'user', 'content': []},
        _user('second'),
    ) == [
        _user('first'),
        {'role': 'assistant', 'content': 'answer'},
        _user('second'),
    ]


def test_user_turn_with_only_unsigned_thinking_is_omitted():
    assert _convert(
        _user('first'),
        {'role': 'assistant', 'content': 'answer'},
        {'role': 'user', 'content': [UNSIGNED_THINKING]},
        _user('second'),
    ) == [
        _user('first'),
        {'role': 'assistant', 'content': 'answer'},
        _user('second'),
    ]


def test_empty_assistant_turn_becomes_empty_assistant_message():
    assert _convert(
        _user('first'),
        {'role': 'assistant', 'content': []},
        _user('second'),
    ) == [
        _user('first'),
        {'role': 'assistant', 'content': ''},
        _user('second'),
    ]


def test_cache_control_on_signed_thinking_is_copied():
    assert _convert(
        _user('hello'),
        {
            'role': 'assistant',
            'content': [
                {**SIGNED_THINKING, 'cache_control': {'type': 'ephemeral'}},
                {'type': 'text', 'text': 'Hi there.'},
            ],
        },
    ) == [
        _user('hello'),
        {
            'role': 'assistant',
            'content': [
                {
                    'type': 'thinking',
                    'thinking': 'I should list the files.',
                    'signature': 'sig',
                    'cache_control': {'type': 'ephemeral'},
                },
                {'type': 'text', 'text': 'Hi there.'},
            ],
        },
    ]


def test_claude_code_tool_round_trip_keeps_turn_order_without_thinking_parts():
    assert _convert(
        {'role': 'user', 'content': [{'type': 'text', 'text': 'list files'}]},
        {'role': 'assistant', 'content': [UNSIGNED_THINKING, TOOL_USE]},
        {
            'role': 'user',
            'content': [{'type': 'tool_result', 'tool_use_id': 'toolu_1', 'content': 'a.txt\nb.txt'}],
        },
    ) == [
        _user('list files'),
        {'role': 'assistant', 'content': '', 'tool_calls': [TOOL_CALL]},
        {'role': 'tool', 'tool_call_id': 'toolu_1', 'content': 'a.txt\nb.txt'},
    ]
