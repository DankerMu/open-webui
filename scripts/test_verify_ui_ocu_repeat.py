"""Repeat entry point validation for scripts/verify-ui-ocu.py (OCU_UI_SPEC + OCU_UI_REPEAT)."""

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).with_name('verify-ui-ocu.py')
SPEC = importlib.util.spec_from_file_location('verify_ui_ocu_repeat', SCRIPT)
HARNESS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HARNESS)


class Rejected(Exception):
    """Raised by the monkeypatched fail() so the test proves repeat_selection() rejects through fail."""


@pytest.fixture
def selection(monkeypatch):
    monkeypatch.delenv('OCU_UI_SPEC', raising=False)
    monkeypatch.delenv('OCU_UI_REPEAT', raising=False)
    monkeypatch.delenv('OCU_UI_GREP', raising=False)

    def reject(message: str) -> None:
        raise Rejected(message)

    monkeypatch.setattr(HARNESS, 'fail', reject)

    def select(spec: str | None, repeat: str | None, grep: str | None = None):
        if spec is not None:
            monkeypatch.setenv('OCU_UI_SPEC', spec)
        if repeat is not None:
            monkeypatch.setenv('OCU_UI_REPEAT', repeat)
        if grep is not None:
            monkeypatch.setenv('OCU_UI_GREP', grep)
        return HARNESS.repeat_selection()

    return select


def test_both_unset_selects_the_default_run(selection):
    assert selection(None, None) is None


def test_valid_pair_selects_the_spec_and_count(selection):
    assert selection('ocu-workspace.e2e.ts', '3') == ('ocu-workspace.e2e.ts', 3, None)


def test_diagnostic_spec_is_allowed_only_through_the_pair(selection):
    assert HARNESS.DIAGNOSTIC_SPECS == ('ocu-popup-release.e2e.ts',)
    assert 'ocu-popup-release.e2e.ts' not in HARNESS.REQUIRED_SPECS
    assert selection('ocu-popup-release.e2e.ts', '5') == ('ocu-popup-release.e2e.ts', 5, None)


def test_grep_with_the_pair_is_accepted_and_forwarded_as_a_list(selection):
    assert selection('ocu-workspace.e2e.ts', '3', 'A-T01') == ('ocu-workspace.e2e.ts', 3, 'A-T01')
    harness = HARNESS.BrowserHarness(('ocu-workspace.e2e.ts', 3, 'A-T01'))
    assert harness.grep_args == ['--grep', 'A-T01']
    assert harness.spec_args == ['e2e/ocu-workspace.e2e.ts']
    assert harness.repeat_args == ['--repeat-each', '3']


@pytest.mark.parametrize(
    ('spec', 'repeat'),
    [
        (None, None),
        ('ocu-workspace.e2e.ts', None),
        (None, '2'),
    ],
)
def test_grep_without_the_complete_pair_fails(selection, spec, repeat):
    with pytest.raises(Rejected, match='OCU_UI_GREP requires OCU_UI_SPEC and OCU_UI_REPEAT'):
        selection(spec, repeat, 'A-T01')


def test_empty_grep_with_the_pair_fails(selection):
    with pytest.raises(Rejected, match='OCU_UI_GREP must not be empty'):
        selection('ocu-workspace.e2e.ts', '1', '')


@pytest.mark.parametrize(
    ('spec', 'repeat'),
    [
        ('ocu-workspace.e2e.ts', None),
        (None, '2'),
        ('', None),
        (None, ''),
    ],
)
def test_one_variable_alone_fails_even_when_empty(selection, spec, repeat):
    with pytest.raises(Rejected, match='OCU_UI_SPEC and OCU_UI_REPEAT must be set together'):
        selection(spec, repeat)


@pytest.mark.parametrize('spec', ['', 'ocu-missing.e2e.ts', 'ocu-fixtures.ts', '../ocu-workspace.e2e.ts'])
def test_spec_outside_the_allowed_set_fails(selection, spec):
    with pytest.raises(Rejected, match='OCU_UI_SPEC'):
        selection(spec, '1')


@pytest.mark.parametrize('repeat', ['', '0', 'abc', '-1', '01', '1.5', ' 2'])
def test_non_positive_or_non_integer_repeat_fails(selection, repeat):
    with pytest.raises(Rejected, match='OCU_UI_REPEAT'):
        selection('ocu-workspace.e2e.ts', repeat)


def test_harness_precomputes_the_opt_in_deltas_without_branching_the_default_path():
    default = HARNESS.BrowserHarness(None)
    assert default.specs == HARNESS.REQUIRED_SPECS
    assert default.repeat_count == 1
    assert default.spec_env == {}
    assert default.spec_args == []
    assert default.repeat_args == []
    assert default.grep_args == []
    selected = HARNESS.BrowserHarness(('ocu-popup-release.e2e.ts', 4, None))
    assert selected.specs == ('ocu-popup-release.e2e.ts',)
    assert selected.repeat_count == 4
    assert selected.spec_env == {'OCU_UI_SPEC': 'ocu-popup-release.e2e.ts'}
    assert selected.spec_args == ['e2e/ocu-popup-release.e2e.ts']
    assert selected.repeat_args == ['--repeat-each', '4']
    assert selected.grep_args == []


def test_harness_alarm_scales_only_with_the_repeat_count():
    assert HARNESS.harness_alarm(1) == 1500
    assert HARNESS.harness_alarm(2) == 2100
    assert HARNESS.harness_alarm(20) == 12900
