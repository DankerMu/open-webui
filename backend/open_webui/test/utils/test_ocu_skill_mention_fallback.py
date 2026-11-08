"""Pin of unchanged native middleware behaviour that the OCU skill marker relies on without a filter.

The 「工作区 Skills」 slash entry sends `<$ocu--{name}|{name}>` (#751). With no OCU filter installed,
native mention stripping must turn it into `{name}`, and extraction yields an id no native skill has.
"""

from __future__ import annotations

import re

import pytest
from open_webui.test import ocu_harness  # noqa: F401  configures the harness env before open_webui.env loads
from open_webui.utils import middleware

MARKER_TEXT = '用 <$ocu--invoice-builder|invoice-builder> 做发票'
STRIPPED = '用 invoice-builder 做发票'


def _string_message() -> list[dict]:
    return [{'role': 'user', 'content': MARKER_TEXT}]


def _list_message() -> list[dict]:
    return [{'role': 'user', 'content': [{'type': 'text', 'text': MARKER_TEXT}]}]


def test_strip_turns_the_marker_into_its_label_in_string_content():
    messages = _string_message()
    middleware.strip_skill_mentions(messages)
    assert messages[0]['content'] == STRIPPED


def test_strip_turns_the_marker_into_its_label_in_list_content():
    messages = _list_message()
    middleware.strip_skill_mentions(messages)
    assert messages[0]['content'] == [{'type': 'text', 'text': STRIPPED}]


def test_extract_yields_the_ocu_id():
    assert middleware.extract_skill_ids_from_messages(_string_message()) == {'ocu--invoice-builder'}


@pytest.mark.parametrize('build', [_string_message, _list_message], ids=['string', 'list'])
def test_strip_depends_on_the_dollar_form(monkeypatch, build):
    """Red-proof: with a pattern matching only the `/` form the marker survives, so the pins above bite."""
    monkeypatch.setattr(middleware, 'SKILL_MENTION_STRIP_RE', re.compile(r'</[a-z0-9_-]+\|([^>]*)>'))
    messages = build()
    middleware.strip_skill_mentions(messages)
    text = messages[0]['content'] if isinstance(messages[0]['content'], str) else messages[0]['content'][0]['text']
    assert text == MARKER_TEXT
    assert text != STRIPPED
