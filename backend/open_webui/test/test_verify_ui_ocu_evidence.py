"""The browser harness failure branch retains redacted per-case evidence, best effort, never traces."""

from __future__ import annotations

import logging
import runpy
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
SECRET = 'Tok!private-stub-token#$%'
SESSION = 'eyJ-private-session'
GRANT_TEXT = f'goto /ocu/f/grant-abc/chat-1/page.html with {SECRET} and {SESSION}'
REDACTED_TEXT = 'goto [redacted] with [redacted] and [redacted]'
PNG = b'\x89PNG\r\n\x1a\nfailure screenshot'
CASE = 'ocu-resources-A-T01-sidebar-resources-chromium'


class OriginalFailure(RuntimeError):
    pass


@pytest.fixture
def harness(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT / 'scripts'))
    module = runpy.run_path(str(ROOT / 'scripts/verify-ui-ocu.py'))
    monkeypatch.setitem(module['Smoke'].__init__.__globals__, 'repo_root', lambda: tmp_path)
    (tmp_path / '.run').mkdir()
    smoke = module['BrowserHarness']()
    smoke.scratch = tmp_path / '.run/workspace-ui-case'
    smoke.secrets = [SECRET, SESSION]
    original = OriginalFailure('browser case failed')

    def fail_stack():
        raise original

    monkeypatch.setattr(smoke, 'run_stack', fail_stack)
    results = smoke.scratch / 'test-results'
    case = results / CASE
    case.mkdir(parents=True)
    (case / 'test-failed-1.png').write_bytes(PNG)
    (case / 'error-context.md').write_text(GRANT_TEXT, encoding='utf-8')
    (case / 'wire-rows.json').write_text(f'[{{"url": "{GRANT_TEXT}"}}]', encoding='utf-8')
    (case / 'trace.zip').write_bytes(b'PK private headers and bodies')
    passing = results / 'ocu-resources-passing-chromium'
    passing.mkdir()
    (passing / 'trace.zip').write_bytes(b'PK passing trace')
    (passing / 'wire-rows.json').write_text('[]', encoding='utf-8')
    (smoke.scratch / 'stub.log').write_text(f'stub {SECRET}', encoding='utf-8')
    evidence = tmp_path / '.run/ui-evidence/workspace-ui-case'
    return smoke, module, original, evidence


def retained(evidence: Path) -> list[str]:
    return sorted(str(path.relative_to(evidence)) for path in evidence.rglob('*') if path.is_file())


def test_failure_retains_screenshots_and_redacted_text_but_no_trace(harness):
    smoke, _, original, evidence = harness

    with pytest.raises(OriginalFailure) as raised:
        smoke.run()

    assert raised.value is original
    assert retained(evidence) == [
        'stub.log',
        f'test-results/{CASE}/error-context.md',
        f'test-results/{CASE}/test-failed-1.png',
        f'test-results/{CASE}/wire-rows.json',
    ]
    case = evidence / 'test-results' / CASE
    assert (case / 'test-failed-1.png').read_bytes() == PNG
    assert (case / 'error-context.md').read_text(encoding='utf-8') == REDACTED_TEXT
    assert (case / 'wire-rows.json').read_text(encoding='utf-8') == f'[{{"url": "{REDACTED_TEXT}"}}]'
    assert (evidence / 'stub.log').read_text(encoding='utf-8') == 'stub [redacted]'


@pytest.mark.parametrize('fault', ['undecodable', 'unredactable'])
def test_one_bad_file_is_logged_and_the_rest_retained_without_masking_the_failure(harness, monkeypatch, caplog, fault):
    smoke, module, original, evidence = harness
    context = smoke.scratch / 'test-results' / CASE / 'error-context.md'
    if fault == 'undecodable':
        context.write_bytes(b'\xff\xfe not text ' + SECRET.encode())
    else:
        context.write_text(f'POISON {SECRET}', encoding='utf-8')
        real_redact = module['redact']

        def poisoned(text, secrets):
            if 'POISON' in text:
                raise ValueError(f'cannot redact {SECRET}')
            return real_redact(text, secrets)

        monkeypatch.setitem(module['BrowserHarness'].run.__globals__, 'redact', poisoned)

    with caplog.at_level(logging.ERROR, logger='verify-ui-ocu'), pytest.raises(OriginalFailure) as raised:
        smoke.run()

    assert raised.value is original
    assert retained(evidence) == [
        'stub.log',
        f'test-results/{CASE}/test-failed-1.png',
        f'test-results/{CASE}/wire-rows.json',
    ]
    errors = [record.getMessage() for record in caplog.records if 'not retained' in record.getMessage()]
    assert len(errors) == 1
    assert f'{CASE}/error-context.md' in errors[0]
    assert SECRET not in caplog.text


def test_missing_results_still_retain_logs_and_raise_the_original(harness):
    smoke, _, original, evidence = harness
    for path in sorted((smoke.scratch / 'test-results').rglob('*'), reverse=True):
        path.rmdir() if path.is_dir() else path.unlink()
    (smoke.scratch / 'test-results').rmdir()

    with pytest.raises(OriginalFailure) as raised:
        smoke.run()

    assert raised.value is original
    assert retained(evidence) == ['stub.log']


def test_unlistable_results_still_retain_logs_and_raise_the_original(harness, monkeypatch, caplog):
    smoke, _, original, evidence = harness
    (smoke.scratch / 'stub-restart.log').write_text(f'restart {SECRET}', encoding='utf-8')
    results = smoke.scratch / 'test-results'
    real_iterdir = Path.iterdir

    def unlistable(self):
        if self == results:
            raise OSError(f'cannot list {SECRET}')
        return real_iterdir(self)

    monkeypatch.setattr(Path, 'iterdir', unlistable)

    with caplog.at_level(logging.ERROR, logger='verify-ui-ocu'), pytest.raises(OriginalFailure) as raised:
        smoke.run()

    assert raised.value is original
    assert retained(evidence) == ['stub-restart.log', 'stub.log']
    assert (evidence / 'stub-restart.log').read_text(encoding='utf-8') == 'restart [redacted]'
    errors = [record.getMessage() for record in caplog.records if 'not listed' in record.getMessage()]
    assert errors == ['workspace failure evidence not listed (OSError)']
    assert SECRET not in caplog.text
