#!/usr/bin/env python3
"""Temporary native Linux characterization of actual A-T01. Not acceptance."""

from __future__ import annotations

import importlib.util
import json
import logging
import os
import re
import shutil
import sys
from pathlib import Path

from smoke_proxy_support import fail, redact

ROOT = Path(__file__).resolve().parent.parent
REPORT_DIR = ROOT / '.run/ocu-popup-repro'
RAW_REPORT = REPORT_DIR / 'attempts.json'
SANITIZED_REPORT = REPORT_DIR / 'report.json'
SCREENSHOTS = REPORT_DIR / 'screenshots'
AT01_TITLE = 'A-T01 generated HTML keeps opaque origin in sidebar, message link and direct tab'
# Playwright CLI --grep is compiled with /gi and matched against "<file> <title>".
# '^A-T01' matches neither file-prefixed title; unanchored A-T01 would also select
# the controls positive-control title. Anchor the unique workspace A-T01 title.
GREP = f'{re.escape(AT01_TITLE)}$'
PNG_MAGIC = b'\x89PNG\r\n\x1a\n'
MAX_ERROR = 4000
MAX_LAST_DOCUMENT = 2000
REPORTER = str(Path(__file__).with_name('ocu-popup-diagnostic-reporter.mjs'))

log = logging.getLogger('reproduce-ocu-popup')

harness_spec = importlib.util.spec_from_file_location('verify_ui_ocu', Path(__file__).with_name('verify-ui-ocu.py'))
if harness_spec is None or harness_spec.loader is None:
    fail('missing verify-ui-ocu harness')
harness_module = importlib.util.module_from_spec(harness_spec)
harness_spec.loader.exec_module(harness_module)


def expected_playwright(root: Path) -> list[str]:
    return [str(root / 'node_modules/.bin/playwright'), 'test', '--config', 'playwright.ocu.config.ts']


def diagnostic_playwright(root: Path) -> list[str]:
    return [
        *expected_playwright(root),
        '--grep',
        GREP,
        '--repeat-each=10',
        '--retries=0',
        '--workers=1',
        '--max-failures=0',
        f'--add-reporter={REPORTER}',
        f'--output={REPORT_DIR / "test-results"}',
    ]


def strip_ansi(text: str) -> str:
    return re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', text)


def last_document_from(message: str) -> str | None:
    marker = 'Native popup fixture event missing: '
    if marker not in message:
        return None
    payload = message.split(marker, 1)[1].strip()
    if payload.startswith('{'):
        depth = 0
        for index, char in enumerate(payload):
            if char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
                if depth == 0:
                    payload = payload[: index + 1]
                    break
    if len(payload) > MAX_LAST_DOCUMENT:
        payload = payload[:MAX_LAST_DOCUMENT] + '…'
    return payload


def sanitize_error(message: object, secrets: list[str]) -> dict[str, str] | None:
    if not isinstance(message, str) or not message.strip():
        return None
    text = strip_ansi(redact(message, secrets))
    if len(text) > MAX_ERROR:
        text = text[:MAX_ERROR] + '…'
    row = {'message': text}
    last_document = last_document_from(text)
    if last_document is not None:
        row['lastDocument'] = last_document
    return row


def write_report(payload: dict) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    SANITIZED_REPORT.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')


def incomplete(reason: str, extra: dict | None = None) -> dict:
    payload = {
        'acceptance': 'nonacceptance',
        'characterization': True,
        'complete': False,
        'reason': reason,
        'attempts': [],
        **(extra or {}),
    }
    write_report(payload)
    return payload


def copy_safe_png(source: Path, destination: Path) -> None:
    data = source.read_bytes()
    if data[:8] != PNG_MAGIC:
        fail(f'refusing non-PNG screenshot: {source}')
    destination.write_bytes(data)


def collect_screenshots() -> list[str]:
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    results_root = REPORT_DIR / 'test-results'
    if not results_root.is_dir():
        return copied
    for source in sorted(path for path in results_root.rglob('test-failed-*.png') if path.is_file()):
        repeat = source.parent.name
        name = re.sub(r'[^A-Za-z0-9._-]+', '-', f'{repeat}-{source.name}')
        destination = SCREENSHOTS / name
        index = 1
        while destination.exists():
            destination = SCREENSHOTS / f'{destination.stem}-{index}{destination.suffix}'
            index += 1
        copy_safe_png(source, destination)
        copied.append(str(destination.relative_to(REPORT_DIR)))
    return copied


class HarnessSubprocess:
    def __init__(self, original, seen: list[int], root: Path) -> None:
        self._original = original
        self._seen = seen
        self._root = root

    def Popen(self, argv, *args, **kwargs):
        if not isinstance(argv, (list, tuple)) or [str(part) for part in argv] != expected_playwright(self._root):
            fail(f'unexpected Playwright invocation: {argv!r}')
        if kwargs.get('cwd') not in (None, self._root, str(self._root)):
            fail(f'unexpected Playwright cwd: {kwargs.get("cwd")!r}')
        env = dict(kwargs.get('env') or {})
        if env.get('PLAYWRIGHT_JSON_OUTPUT_FILE'):
            fail('unexpected PLAYWRIGHT_JSON_OUTPUT_FILE in harness environment')
        env['PLAYWRIGHT_OCU_POPUP_DIAGNOSTIC_REPORTER_OUTPUT'] = str(RAW_REPORT)
        env['PLAYWRIGHT_OCU_POPUP_DIAGNOSTIC_SECRETS'] = json.dumps(list(DiagnosticHarness.secrets))
        kwargs['env'] = env
        self._seen.append(1)
        if len(self._seen) != 1:
            fail('Playwright was invoked more than once')
        log.info('nonacceptance characterization: actual A-T01 x10, retries=0, workers=1')
        return self._original.Popen(diagnostic_playwright(self._root), *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._original, name)


class DiagnosticHarness(harness_module.BrowserHarness):
    secrets: list[str] = []

    def provision(self) -> tuple[dict[str, str], str, str]:
        chats, identity, password = super().provision()
        DiagnosticHarness.secrets = [secret for secret in (self.token, password, identity) if secret]
        return chats, identity, password


def sanitize_errors(items: list, secrets: list[str]) -> list[dict[str, str]]:
    errors = []
    for item in items:
        if isinstance(item, dict):
            sanitized = sanitize_error(item.get('message'), secrets)
            if sanitized:
                errors.append(sanitized)
    return errors


def project_report(code: int, secrets: list[str]) -> dict:
    extra = {'playwrightExit': code, 'platform': sys.platform}
    if not RAW_REPORT.is_file():
        return incomplete(
            'diagnostic attempt report missing; batch may have been interrupted by the 600s harness wait', extra
        )
    try:
        raw = json.loads(RAW_REPORT.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return incomplete('diagnostic attempt report is not valid JSON', extra)
    if not isinstance(raw, dict):
        return incomplete('diagnostic attempt report is not an object', extra)
    rows = raw.get('attempts')
    if not isinstance(rows, list):
        return incomplete('diagnostic attempt report is missing attempts', extra)
    attempts = []
    for ordinal, row in enumerate(rows):
        if not isinstance(row, dict):
            return incomplete('diagnostic attempt entry is not an object', extra)
        title = row.get('title')
        if title != AT01_TITLE:
            return incomplete(f'unexpected Playwright spec retained: {title!r}', extra)
        errors = sanitize_errors(row.get('errors') or [], secrets)
        retry = int(row.get('retry') or 0)
        status = row.get('status')
        attempts.append(
            {
                'ordinal': ordinal,
                'repeatEachIndex': row.get('repeatEachIndex'),
                'retry': retry,
                'status': status,
                'durationMs': row.get('durationMs'),
                'errors': errors,
            }
        )
    statuses = [row['status'] for row in attempts]
    retries = [row['retry'] for row in attempts]
    complete = (
        len(attempts) == 10
        and retries == [0] * 10
        and all(status in ('passed', 'failed', 'timedOut') for status in statuses)
    )
    failed = sum(1 for row in attempts if row['status'] != 'passed')
    try:
        screenshots = collect_screenshots()
    except Exception as error:
        return incomplete(str(error), {**extra, 'attempts': attempts})
    payload = {
        'acceptance': 'nonacceptance',
        'characterization': True,
        'complete': complete,
        'title': AT01_TITLE,
        'grep': GREP,
        'repeatEach': 10,
        'retries': 0,
        'workers': 1,
        'playwrightExit': code,
        'platform': sys.platform,
        'attempts': attempts,
        'totals': {'retained': len(attempts), 'failed': failed},
        'screenshots': screenshots,
        'screenshotScope': 'This-run test-failed PNGs only; no shared UI evidence.',
        'limits': [
            'Harness wait remains 600s; SIGALRM remains 1500s. Interrupted batches fail.',
            'Rows follow onTestEnd order; repeatEachIndex is retained only when supplied.',
            'Known harness secrets are redacted; this is not a general credential scanner.',
        ],
    }
    if not complete:
        payload['reason'] = 'expected exactly 10 distinct A-T01 terminal outcomes with zero retries'
    write_report(payload)
    return payload


def prepare_report_dir() -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    if RAW_REPORT.exists():
        RAW_REPORT.unlink()
    if SCREENSHOTS.exists():
        shutil.rmtree(SCREENSHOTS)
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    os.environ['PLAYWRIGHT_OCU_POPUP_DIAGNOSTIC_REPORTER_OUTPUT'] = str(RAW_REPORT)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    prepare_report_dir()
    seen: list[int] = []
    DiagnosticHarness.secrets = []
    original_subprocess = harness_module.subprocess
    original_browser = harness_module.BrowserHarness
    harness_module.subprocess = HarnessSubprocess(original_subprocess, seen, ROOT)
    harness_module.BrowserHarness = DiagnosticHarness
    try:
        code = harness_module.main()
    finally:
        harness_module.subprocess = original_subprocess
        harness_module.BrowserHarness = original_browser
    secrets = list(DiagnosticHarness.secrets)
    DiagnosticHarness.secrets = []
    if len(seen) != 1:
        incomplete('Playwright invocation was not observed exactly once', {'playwrightExit': code})
        return 1
    payload = project_report(code, secrets)
    log.info(
        json.dumps(
            {
                'acceptance': 'nonacceptance',
                'complete': payload.get('complete'),
                'total': payload.get('totals', {}).get('retained', 0),
                'failed': payload.get('totals', {}).get('failed', 0),
                'playwrightExit': code,
            }
        )
    )
    if not payload.get('complete'):
        return code or 1
    return code


if __name__ == '__main__':
    raise SystemExit(main())
