"""scripts/ci-gate.py: docs-only classification and the `All checks passed` verdict in ci.yml."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'scripts/ci-gate.py'
SPEC = importlib.util.spec_from_file_location('ci_gate', SCRIPT)
GATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GATE)
WORKFLOW = yaml.safe_load((ROOT / '.github/workflows/ci.yml').read_text(encoding='utf-8'))
JOBS = WORKFLOW['jobs']


def rows(*paths: str | tuple[str, str]) -> str:
    return ''.join(f'{p[0]}\t{p[1]}\n' if isinstance(p, tuple) else f'{p}\t\n' for p in paths)


def run(*args: str, stdin: str = '', env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        input=stdin,
        capture_output=True,
        text=True,
        env={'PATH': os.defpath, **(env or {})},
        timeout=20,
        check=False,
    )


@pytest.mark.parametrize(
    'paths',
    [
        ('docs/office-editing.md',),
        ('README.md', 'AGENTS.md', 'openspec/changes/x/design.md'),
        ('docs/evidence/issue-1/shot.png', 'CONTEXT.md'),
        (('docs/plans/b.md', 'docs/plans/a.md'),),
    ],
)
def test_docs_only_pull_request_skips_code_jobs(paths):
    assert GATE.classify(rows(*paths), len(paths)) is False


@pytest.mark.parametrize(
    'paths',
    [
        ('docs/a.md', 'scripts/smoke.sh'),
        ('CHANGELOG.md',),
        ('.github/PULL_REQUEST_TEMPLATE.md',),
        ('backend/open_webui/README.md',),
        ('Makefile',),
        ('docs.md/x.py',),
        # A rename out of code into docs/ still deletes the code path.
        (('docs/moved.py', 'scripts/moved.py'),),
    ],
)
def test_any_code_path_runs_code_jobs(paths):
    assert GATE.classify(rows(*paths), len(paths)) is True


def test_truncated_or_empty_file_list_runs_code_jobs():
    assert GATE.classify(rows('docs/a.md'), 3000) is True
    assert GATE.classify('', 0) is True


def test_classify_command_prints_the_step_output():
    completed = run('classify', '--expected-files', '1', stdin=rows('docs/a.md'))
    assert (completed.returncode, completed.stdout) == (0, 'code=false\n'), completed.stderr
    completed = run('classify', '--expected-files', '1', stdin=rows('src/app.html'))
    assert (completed.returncode, completed.stdout) == (0, 'code=true\n'), completed.stderr


@pytest.mark.parametrize(
    'args', [['classify'], ['classify', '--expected-files', 'x'], ['classify', '--expected-files', '-1'], ['bogus'], []]
)
def test_malformed_command_line_fails_loud(args):
    completed = run(*args, stdin=rows('docs/a.md'))
    assert completed.returncode == 2, completed.stdout + completed.stderr


def needs(**results: str) -> dict:
    base = {job: 'success' for job in GATE.REQUIRED_JOBS}
    base.update({key.replace('_', '-'): value for key, value in results.items()})
    return {job: {'result': result, 'outputs': {}} for job, result in base.items()}


def test_all_success_passes():
    assert GATE.failures(needs(), 'pull_request', 'true') == []
    assert GATE.failures(needs(), 'push', 'true') == []


@pytest.mark.parametrize('result', ['failure', 'cancelled'])
def test_failed_or_cancelled_job_fails(result):
    assert GATE.failures(needs(layer3_browser=result), 'push', 'true') == [f'layer3-browser: {result}']


def test_pr_only_jobs_may_skip_only_outside_pull_requests():
    skipped = needs(lockfile_consistency='skipped', layer6_diff_size_guard='skipped')
    assert GATE.failures(skipped, 'push', 'true') == []
    assert GATE.failures(skipped, 'pull_request', 'true') == [
        'lockfile-consistency: skipped',
        'layer6-diff-size-guard: skipped',
    ]


def test_code_jobs_may_skip_only_on_a_docs_only_pull_request():
    skipped = needs(**{job.replace('-', '_'): 'skipped' for job in GATE.CODE_JOBS})
    assert GATE.failures(skipped, 'pull_request', 'false') == []
    assert sorted(GATE.failures(skipped, 'pull_request', 'true')) == sorted(f'{job}: skipped' for job in GATE.CODE_JOBS)
    assert sorted(GATE.failures(skipped, 'push', 'false')) == sorted(f'{job}: skipped' for job in GATE.CODE_JOBS)


def test_other_jobs_never_skip_even_on_docs_only():
    assert GATE.failures(needs(layer1_fast_checks='skipped'), 'pull_request', 'false') == [
        'layer1-fast-checks: skipped'
    ]


@pytest.mark.parametrize('code', ['', 'maybe'])
def test_missing_classification_fails(code):
    assert 'changes: classification output is' in ' '.join(GATE.failures(needs(), 'pull_request', code))


def test_missing_or_unknown_job_fails():
    partial = needs()
    del partial['layer3-browser']
    assert GATE.failures(partial, 'push', 'true') == ['layer3-browser: missing from needs']
    extra = needs()
    extra['layer9-new'] = {'result': 'success'}
    assert GATE.failures(extra, 'push', 'true') == ['layer9-new: not a known required job']


def test_verdict_command_exits_by_the_failures():
    ok = run('verdict', env={'NEEDS': json.dumps(needs()), 'EVENT': 'push', 'CODE': 'true'})
    assert ok.returncode == 0, ok.stdout + ok.stderr
    bad = run('verdict', env={'NEEDS': json.dumps(needs(changes='failure')), 'EVENT': 'push', 'CODE': ''})
    assert bad.returncode == 1
    assert 'changes: failure' in bad.stdout + bad.stderr
    garbled = run('verdict', env={'NEEDS': 'not json', 'EVENT': 'push', 'CODE': 'true'})
    assert garbled.returncode == 2


def test_workflow_matches_the_gate_job_sets():
    aggregator = JOBS['all-checks-passed']
    assert aggregator['if'] == 'always()'
    assert set(aggregator['needs']) == set(GATE.REQUIRED_JOBS) == set(JOBS) - {'all-checks-passed'}
    for job in GATE.CODE_JOBS:
        assert JOBS[job]['needs'] == 'changes', job
        assert JOBS[job]['if'] == "needs.changes.outputs.code == 'true'", job
    for job in GATE.PR_ONLY_JOBS:
        assert JOBS[job]['if'] == "github.event_name == 'pull_request'", job
    for job in set(GATE.REQUIRED_JOBS) - set(GATE.CODE_JOBS) - set(GATE.PR_ONLY_JOBS):
        assert 'if' not in JOBS[job], job


def test_main_pushes_are_never_cancelled():
    assert WORKFLOW['concurrency']['cancel-in-progress'] == "${{ github.ref != 'refs/heads/main' }}"
