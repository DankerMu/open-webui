"""Skill mention patterns scan linearly and keep every existing mention form (#769).

The label class `[^<>]*` stops a label at the next `<`, so an unclosed start is abandoned at the
following start instead of being rescanned to the end of the text.
"""

from __future__ import annotations

import copy
import time

import pytest
from open_webui.test import ocu_harness  # noqa: F401  configures the harness env before open_webui.env loads
from open_webui.utils import middleware

# The fixed patterns take about 1 ms on these inputs; the quadratic ones take seconds.
SCAN_BOUND_SECONDS = 0.25

IMAGE_PART = {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,iVBORw0KGgo='}}

UNCLOSED_DOLLAR = '<$ocu--a|' * 10000
UNCLOSED_SLASH = '</a|' * 20000


def _string_messages(text: str) -> list[dict]:
    return [{'role': 'user', 'content': text}]


def _list_messages(text: str) -> list[dict]:
    return [{'role': 'user', 'content': [{'type': 'text', 'text': text}, copy.deepcopy(IMAGE_PART)]}]


LINEAR_INPUTS = [
    pytest.param(_string_messages, UNCLOSED_DOLLAR, id='dollar-string'),
    pytest.param(_string_messages, UNCLOSED_SLASH, id='slash-string'),
    pytest.param(_list_messages, UNCLOSED_DOLLAR, id='dollar-list'),
]


@pytest.mark.parametrize('build,text', LINEAR_INPUTS)
def test_extract_scans_unclosed_starts_linearly(build, text):
    messages = build(text)
    started = time.perf_counter()
    ids = middleware.extract_skill_ids_from_messages(messages)
    elapsed = time.perf_counter() - started
    assert elapsed < SCAN_BOUND_SECONDS, f'extract took {elapsed:.3f}s'
    assert ids == set()


@pytest.mark.parametrize('build,text', LINEAR_INPUTS)
def test_strip_scans_unclosed_starts_linearly(build, text):
    messages = build(text)
    expected = copy.deepcopy(messages)
    started = time.perf_counter()
    middleware.strip_skill_mentions(messages)
    elapsed = time.perf_counter() - started
    assert elapsed < SCAN_BOUND_SECONDS, f'strip took {elapsed:.3f}s'
    assert messages == expected


# (input text, extracted ids, stripped text) — identical on main @ e5da5be3b and after the fix.
MUST_PRESERVE = [
    pytest.param('<$skill-a>', {'skill-a'}, '', id='dollar-no-label'),
    pytest.param('<$skill-a|Label A>', {'skill-a'}, 'Label A', id='dollar-label'),
    pytest.param('</skill-b|Label B>', {'skill-b'}, 'Label B', id='slash-label'),
    pytest.param('a <$x|X> b </y|Y> c', {'x', 'y'}, 'a X b Y c', id='mixed'),
    pytest.param('<$a|>', {'a'}, '', id='dollar-empty-label'),
    pytest.param('</a|>', {'a'}, '', id='slash-empty-label'),
    pytest.param('<$a|多 字>', {'a'}, '多 字', id='cjk-label'),
    pytest.param('<$a|x>y>', {'a'}, 'xy>', id='label-then-gt'),
    pytest.param('<$Bad|B>', set(), '<$Bad|B>', id='uppercase-id'),
    pytest.param('</x>', set(), '</x>', id='slash-without-label'),
]

MUST_PRESERVE_LIST = [p for p in MUST_PRESERVE if p.id in ('dollar-label', 'mixed')]


@pytest.mark.parametrize('text,ids,stripped', MUST_PRESERVE)
def test_existing_mention_forms_keep_their_result_in_string_content(text, ids, stripped):
    assert middleware.extract_skill_ids_from_messages(_string_messages(text)) == ids
    messages = _string_messages(text)
    middleware.strip_skill_mentions(messages)
    assert messages[0]['content'] == stripped


@pytest.mark.parametrize('text,ids,stripped', MUST_PRESERVE_LIST)
def test_existing_mention_forms_keep_their_result_in_list_content(text, ids, stripped):
    assert middleware.extract_skill_ids_from_messages(_list_messages(text)) == ids
    messages = _list_messages(text)
    middleware.strip_skill_mentions(messages)
    assert messages[0]['content'] == [{'type': 'text', 'text': stripped}, IMAGE_PART]


CHANGED = [
    pytest.param('<$b|c<d>', set(), '<$b|c<d>', id='label-holding-lt'),
    pytest.param('<$a|x<$b|y>', {'b'}, '<$a|xy', id='nested-start'),
    # Accepted regression (#769 design): a native skill whose name holds `<` is no longer recognised,
    # so it does not load and the raw marker reaches the model. On main it gave {'my-skill'} and 'a<b'.
    pytest.param('<$my-skill|a<b>', set(), '<$my-skill|a<b>', id='native-name-holding-lt'),
]


@pytest.mark.parametrize('text,ids,stripped', CHANGED)
def test_a_label_stops_at_the_next_lt(text, ids, stripped):
    assert middleware.extract_skill_ids_from_messages(_string_messages(text)) == ids
    messages = _string_messages(text)
    middleware.strip_skill_mentions(messages)
    assert messages[0]['content'] == stripped
