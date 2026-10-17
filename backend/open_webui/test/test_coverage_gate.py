"""Standalone coverage gating rejects failed tests without suppressing reports."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
ADDED_PYTHON = 'A\tbackend/open_webui/coverage_probe.py\n'
SECOND_ADDED_PYTHON = 'A\tbackend/open_webui/second_probe.py\n'
MODIFIED_PYTHON = 'M\tbackend/open_webui/modified_probe.py\n'
ADDED_FRONTEND = 'A\tsrc/coverage_widget.ts\n'

_RECEIVER = r"""
import json
import os
import sys
from pathlib import Path

command = Path(sys.argv[0]).name
args = sys.argv[1:]
if command == 'uv' and args[:3] == ['run', '--quiet', 'pytest']:
    operation = 'pytest'
    status = int(os.environ['GATE_PYTEST_STATUS'])
    print('1 failed' if status else '1 passed')
elif command == 'uv' and args[:4] == ['run', '--quiet', 'coverage', 'report']:
    gated = any(arg.startswith('--fail-under=') for arg in args)
    operation = 'coverage' if gated else 'advisory'
    if gated and 'GATE_FILE_COVERAGE' in os.environ:
        file_coverage = json.loads(os.environ['GATE_FILE_COVERAGE'])
        included = next(arg.split('=', 1)[1] for arg in args if arg.startswith('--include=')).split(',')
        minimum = int(next(arg.split('=', 1)[1] for arg in args if arg.startswith('--fail-under=')))
        if any(path not in file_coverage for path in included):
            status = 1
            print('No coverage data for requested files')
        else:
            covered = sum(file_coverage[path][0] for path in included)
            total = sum(file_coverage[path][1] for path in included)
            status = 0 if 100 * covered >= minimum * total else 2
            print(f'TOTAL  {total}  {total - covered}  {100 * covered / total:.0f}%')
    else:
        status = int(os.environ['GATE_COVERAGE_STATUS' if gated else 'GATE_ADVISORY_STATUS'])
        print('open_webui/coverage_probe.py  1  0  100%' if status == 0 else 'Coverage below threshold')
elif command == 'npx' and args[:3] == ['--no-install', 'vitest', 'run']:
    operation = 'vitest'
    status = int(os.environ['GATE_FRONTEND_STATUS'])
else:
    raise SystemExit(f'Unexpected external command: {command} {args!r}')

observation = {'operation': operation, 'status': status}
if operation == 'coverage' and 'GATE_FILE_COVERAGE' in os.environ:
    observation['included'] = included
with open(os.environ['GATE_RECORD'], 'a', encoding='utf-8') as stream:
    stream.write(json.dumps(observation) + '\n')
sys.exit(status)
"""


@pytest.fixture
def coverage_gate(tmp_path):
    workspace = tmp_path / 'workspace'
    (workspace / 'scripts').mkdir(parents=True)
    (workspace / 'backend').mkdir()
    shutil.copy2(ROOT / 'Makefile', workspace / 'Makefile')
    shutil.copy2(ROOT / 'constraints.yaml', workspace / 'constraints.yaml')
    shutil.copy2(ROOT / 'scripts/coverage-gate.sh', workspace / 'scripts/coverage-gate.sh')
    (workspace / 'scripts/change-scope.sh').write_text(
        '#!/usr/bin/env bash\n'
        'case "$3" in\n'
        '  py) cat scope-py ;;\n'
        '  "ts js svelte") cat scope-web ;;\n'
        '  *) exit 2 ;;\n'
        'esac\n',
        encoding='utf-8',
    )
    (workspace / 'scope-py').write_text(ADDED_PYTHON, encoding='utf-8')
    (workspace / 'scope-web').write_text('', encoding='utf-8')
    binaries = tmp_path / 'bin'
    binaries.mkdir()
    receiver = binaries / 'receiver'
    receiver.write_text(f'#!{sys.executable}\n' + _RECEIVER, encoding='utf-8')
    receiver.chmod(0o700)
    for name in ('uv', 'npx'):
        (binaries / name).symlink_to(receiver)
    for name in ('git', 'make'):
        executable = shutil.which(name)
        assert executable is not None, f'{name} is required for the coverage-gate subprocess test'
        (binaries / name).symlink_to(executable)
    record = tmp_path / 'observations.jsonl'
    env = {
        'PATH': str(binaries) + os.pathsep + os.defpath,
        'HOME': str(tmp_path),
        'TMPDIR': str(tmp_path),
        'LC_ALL': 'C',
        'GIT_CONFIG_NOSYSTEM': '1',
        'GATE_RECORD': str(record),
        'GATE_PYTEST_STATUS': '0',
        'GATE_COVERAGE_STATUS': '0',
        'GATE_ADVISORY_STATUS': '0',
        'GATE_FRONTEND_STATUS': '0',
    }
    subprocess.run(['git', 'init', '--quiet'], cwd=workspace, env=env, check=True, capture_output=True, timeout=10)
    return workspace, record, env


def run_gate(
    coverage_gate,
    *,
    python_scope=ADDED_PYTHON,
    web_scope='',
    pytest_status=0,
    coverage_status=0,
    advisory_status=0,
    frontend_status=0,
    file_coverage=None,
):
    workspace, record, base_env = coverage_gate
    (workspace / 'scope-py').write_text(python_scope, encoding='utf-8')
    (workspace / 'scope-web').write_text(web_scope, encoding='utf-8')
    record.unlink(missing_ok=True)
    env = base_env | {
        'GATE_PYTEST_STATUS': str(pytest_status),
        'GATE_COVERAGE_STATUS': str(coverage_status),
        'GATE_ADVISORY_STATUS': str(advisory_status),
        'GATE_FRONTEND_STATUS': str(frontend_status),
    }
    if file_coverage is not None:
        env['GATE_FILE_COVERAGE'] = json.dumps(file_coverage)
    completed = subprocess.run(
        ['make', 'coverage-gate'],
        cwd=workspace,
        env=env,
        capture_output=True,
        text=True,
        timeout=20,
    )
    outcomes = [json.loads(line) for line in record.read_text(encoding='utf-8').splitlines()] if record.exists() else []
    return completed, outcomes


def test_failed_backend_tests_reject_gate_even_when_coverage_passes_and_is_reported(coverage_gate):
    completed, outcomes = run_gate(coverage_gate, pytest_status=1)
    output = completed.stdout + completed.stderr
    assert outcomes.index({'operation': 'pytest', 'status': 1}) < outcomes.index(
        {'operation': 'coverage', 'status': 0}
    ), output
    assert completed.returncode != 0, output


@pytest.mark.parametrize(('pytest_status', 'expected_success'), [(0, True), (2, False), (5, True)])
def test_backend_runner_status_policy(coverage_gate, pytest_status, expected_success):
    completed, _ = run_gate(coverage_gate, pytest_status=pytest_status)
    assert (completed.returncode == 0) is expected_success, completed.stdout + completed.stderr


@pytest.mark.parametrize('pytest_status', [0, 5])
def test_gated_coverage_failure_rejects_successful_or_uncollected_backend_tests(coverage_gate, pytest_status):
    completed, outcomes = run_gate(coverage_gate, pytest_status=pytest_status, coverage_status=1)
    assert {'operation': 'coverage', 'status': 1} in outcomes, completed.stdout + completed.stderr
    assert completed.returncode != 0, completed.stdout + completed.stderr


def test_frontend_test_failure_rejects_gate(coverage_gate):
    completed, outcomes = run_gate(coverage_gate, python_scope='', web_scope=ADDED_FRONTEND, frontend_status=1)
    assert {'operation': 'vitest', 'status': 1} in outcomes, completed.stdout + completed.stderr
    assert completed.returncode != 0, completed.stdout + completed.stderr


@pytest.mark.parametrize(('pytest_status', 'expected_success'), [(0, True), (1, False)])
def test_advisory_report_failure_does_not_determine_backend_test_verdict(
    coverage_gate, pytest_status, expected_success
):
    completed, outcomes = run_gate(
        coverage_gate,
        python_scope=MODIFIED_PYTHON,
        pytest_status=pytest_status,
        advisory_status=1,
    )
    assert {'operation': 'advisory', 'status': 1} in outcomes, completed.stdout + completed.stderr
    assert (completed.returncode == 0) is expected_success, completed.stdout + completed.stderr


def test_backend_test_failure_continues_gated_and_advisory_reports_and_frontend_tests(coverage_gate):
    completed, outcomes = run_gate(
        coverage_gate,
        python_scope=ADDED_PYTHON + MODIFIED_PYTHON,
        web_scope=ADDED_FRONTEND,
        pytest_status=1,
        advisory_status=1,
    )
    output = completed.stdout + completed.stderr
    assert [item['operation'] for item in outcomes] == ['pytest', 'coverage', 'advisory', 'vitest'], output
    assert completed.returncode != 0, output


def test_no_scoped_sources_succeeds_without_starting_test_or_coverage_tools(coverage_gate):
    completed, outcomes = run_gate(coverage_gate, python_scope='')
    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert outcomes == []


def test_unavailable_backend_directory_rejects_gate_even_with_only_advisory_coverage(coverage_gate):
    workspace, _, _ = coverage_gate
    (workspace / 'backend').rmdir()
    completed, _ = run_gate(coverage_gate, python_scope=MODIFIED_PYTHON)
    assert completed.returncode != 0, completed.stdout + completed.stderr


@pytest.mark.parametrize(
    'python_scope',
    [ADDED_PYTHON + SECOND_ADDED_PYTHON, SECOND_ADDED_PYTHON + ADDED_PYTHON],
    ids=['low-first', 'low-last'],
)
def test_low_file_rejects_gate_even_when_combined_coverage_meets_minimum(coverage_gate, python_scope):
    completed, outcomes = run_gate(
        coverage_gate,
        python_scope=python_scope,
        file_coverage={
            'open_webui/coverage_probe.py': [3, 5],
            'open_webui/second_probe.py': [5, 5],
        },
    )
    output = completed.stdout + completed.stderr
    assert {'operation': 'pytest', 'status': 0} in outcomes, output
    coverage_statuses = [item['status'] for item in outcomes if item['operation'] == 'coverage']
    assert 0 in coverage_statuses, output
    assert all(status in (0, 2) for status in coverage_statuses), output
    assert completed.returncode != 0, output


def test_files_at_minimum_and_above_pass_gate(coverage_gate):
    completed, _ = run_gate(
        coverage_gate,
        python_scope=ADDED_PYTHON + SECOND_ADDED_PYTHON,
        file_coverage={
            'open_webui/coverage_probe.py': [4, 5],
            'open_webui/second_probe.py': [5, 5],
        },
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr


@pytest.mark.parametrize(
    ('first_coverage', 'expected_status'),
    [([3, 5], 2), (None, 1)],
    ids=['below-minimum', 'report-error'],
)
def test_failed_file_report_continues_other_files_advisory_and_frontend(coverage_gate, first_coverage, expected_status):
    file_coverage = {'open_webui/second_probe.py': [5, 5]}
    if first_coverage is not None:
        file_coverage['open_webui/coverage_probe.py'] = first_coverage
    completed, outcomes = run_gate(
        coverage_gate,
        python_scope=ADDED_PYTHON + SECOND_ADDED_PYTHON + MODIFIED_PYTHON,
        web_scope=ADDED_FRONTEND,
        file_coverage=file_coverage,
    )
    output = completed.stdout + completed.stderr
    reports = [item for item in outcomes if item['operation'] == 'coverage']
    failed_report = next(item for item in reports if 'open_webui/coverage_probe.py' in item['included'])
    passing_report = next(item for item in reports if 'open_webui/second_probe.py' in item['included'])
    assert failed_report['status'] == expected_status, output
    assert passing_report['status'] == 0, output
    assert (
        outcomes.index(failed_report)
        < outcomes.index(passing_report)
        < outcomes.index({'operation': 'advisory', 'status': 0})
        < outcomes.index({'operation': 'vitest', 'status': 0})
    ), output
    assert completed.returncode != 0, output
