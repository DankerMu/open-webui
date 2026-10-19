"""Harness imports reject dotenv content without changing ordinary imports."""

from __future__ import annotations

import json
import os
import runpy
import shlex
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

ROOT = Path(__file__).resolve().parents[3]

_DOTENV_PROBE = r"""
import contextlib
import io
import json
import os

import dotenv
import dotenv.main

observed = {'stream_entries': 0, 'parse_calls': 0}


def discover(*args, **kwargs):
    return '/nonexistent-harness-dotenv-observation'


@contextlib.contextmanager
def synthetic_stream(self):
    observed['stream_entries'] += 1
    with io.StringIO(
        'HARNESS_DOTENV_SENTINEL=loaded\n'
        'ENABLE_OLLAMA_API=true\n'
        'DATABASE_TYPE=postgresql\n'
        'DATABASE_USER=dotenv-user\n'
        'DATABASE_PASSWORD=dotenv-password\n'
        'DATABASE_HOST=dotenv-host.invalid\n'
        'DATABASE_PORT=5432\n'
        'DATABASE_NAME=dotenv_db\n'
    ) as stream:
        yield stream


original_parse = dotenv.main.DotEnv.parse


def parse(self):
    observed['parse_calls'] += 1
    yield from original_parse(self)


dotenv.find_dotenv = discover
dotenv.main.DotEnv._get_stream = synthetic_stream
dotenv.main.DotEnv.parse = parse

import open_webui.env

observed.update(
    sentinel=os.environ.get('HARNESS_DOTENV_SENTINEL'),
    explicit_config=os.environ.get('ENABLE_OLLAMA_API'),
    database_url=open_webui.env.DATABASE_URL,
)
print('DOTENV_OBSERVATION=' + json.dumps(observed, sort_keys=True))
"""


_DOTENV_URL = 'postgresql://dotenv-user:dotenv-password@dotenv-host.invalid:5432/dotenv_db'
_PROBE_CONFIG = {
    'PYTHONPATH': str(ROOT / 'backend'),
    'PYTHONDONTWRITEBYTECODE': '1',
    'ENABLE_OLLAMA_API': 'false',
    'DO_NOT_TRACK': '1',
    'ANONYMIZED_TELEMETRY': 'false',
}

# The stand-in sees only the scripts' allowlisted environment, so every path is baked in.
_UV_STAND_IN = r"""
import json
import os
import sys

ALEMBIC_STEPS = (['upgrade', 'head'], ['downgrade', '-1'])
argv = sys.argv[1:]
no_env_file = argv[2:3] == ['--no-env-file']
command = argv[:2] + argv[3:] if no_env_file else argv
if command[:3] != ['run', '--quiet', 'alembic'] or command[3:] not in ALEMBIC_STEPS:
    sys.exit(f'uv stand-in: refusing unexpected argv {argv!r}')
child_env = dict(os.environ)
# Models real uv: env-file entries never override the parent (pinned by the real-uv contract test).
if not no_env_file and 'UV_ENV_FILE' in os.environ:
    with open(os.environ['UV_ENV_FILE']) as env_file:
        for line in env_file.read().splitlines():
            key, separator, value = line.partition('=')
            if separator:
                child_env.setdefault(key, value)
child_env.update(PROBE_CONFIG)
record = {
    'argv': argv,
    'cwd': os.getcwd(),
    'flag': os.environ.get('PYTHON_DOTENV_DISABLED'),
    'data_dir': os.environ.get('DATA_DIR'),
    'database_url': os.environ.get('DATABASE_URL'),
    'database_vars': [name for name in DATABASE_VARS if name in child_env],
}
print('ALEMBIC_RECORD=' + json.dumps(record, sort_keys=True), flush=True)
os.execve(PYTHON, [PYTHON, '-c', PROBE], child_env)
"""

_DATABASE_VARS = (
    'DATABASE_TYPE',
    'DATABASE_USER',
    'DATABASE_PASSWORD',
    'DATABASE_HOST',
    'DATABASE_PORT',
    'DATABASE_NAME',
)
_PRECEDENCE_KEY = 'HARNESS_UV_ENV_FILE_PRECEDENCE'


def _fake_database_vars(host: str) -> dict[str, str]:
    return dict(zip(_DATABASE_VARS, ('postgresql', 'fake-user', 'fake-password', host, '5432', 'fake_db')))


def _write_uv_env_file(tmp_path: Path) -> Path:
    entries = {**_fake_database_vars('uvenv-host.invalid'), _PRECEDENCE_KEY: 'env-file'}
    env_file = tmp_path.resolve() / 'uv.env'
    env_file.write_text(''.join(f'{key}={value}\n' for key, value in entries.items()))
    return env_file


def _allowlisted_env(parent_flag: str | None) -> dict[str, str]:
    # An inherited disable flag could mask a missing harness policy.
    env = {key: os.environ[key] for key in ('PATH', 'HOME', 'LANG') if key in os.environ}
    if parent_flag is not None:
        env['PYTHON_DOTENV_DISABLED'] = parent_flag
    return env


def _prefixed_json(stdout: str, prefix: str) -> list[dict]:
    return [json.loads(line.removeprefix(prefix)) for line in stdout.splitlines() if line.startswith(prefix)]


def _import_environment(*, harness: bool, parent_flag: str | None = None):
    workspace = f'workspace-ui-{uuid4().hex}'
    data_dir = ROOT / '.run' / 'data' / workspace
    env = _allowlisted_env(parent_flag)
    env.update(
        _PROBE_CONFIG,
        DATA_DIR=str(data_dir),
        FRONTEND_BUILD_DIR=str(ROOT / '.run' / workspace / 'frontend-build'),
        WEBUI_SECRET_KEY=uuid4().hex,
    )
    command = [sys.executable, '-c', _DOTENV_PROBE]
    if harness:
        command = [
            'bash',
            '-c',
            'source scripts/dev-env.sh && exec "$1" -c "$2"',
            'harness-environment-probe',
            sys.executable,
            _DOTENV_PROBE,
        ]
    completed = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True, timeout=180)
    assert completed.returncode == 0, completed.stdout + completed.stderr
    observations = _prefixed_json(completed.stdout, 'DOTENV_OBSERVATION=')
    assert len(observations) == 1, completed.stdout + completed.stderr
    return observations[0], data_dir, completed


def _harness_env_lines(stderr: str) -> list[str]:
    return [line for line in stderr.splitlines() if line.startswith('harness-env:')]


# A non-allowlisted parent value must be labelled, never echoed.
_PARENT_FLAG_CANARY = f'parent-flag-canary-{uuid4().hex}'


@pytest.mark.parametrize(
    ('parent_flag', 'label'),
    [(None, 'unset'), ('false', 'false'), ('1', '1'), (_PARENT_FLAG_CANARY, 'other'), ('', 'other')],
    ids=['unset-parent-flag', 'false-parent-flag', 'one-parent-flag', 'other-parent-flag', 'empty-parent-flag'],
)
def test_harness_import_rejects_dotenv_content_and_preserves_explicit_config(parent_flag, label):
    observed, data_dir, completed = _import_environment(harness=True, parent_flag=parent_flag)
    assert _harness_env_lines(completed.stderr) == [f'harness-env: parent PYTHON_DOTENV_DISABLED={label}']
    assert _PARENT_FLAG_CANARY not in completed.stdout + completed.stderr
    assert observed == {
        'stream_entries': 0,
        'parse_calls': 0,
        'sentinel': None,
        'explicit_config': 'false',
        'database_url': f'sqlite:///{data_dir}/webui.db',
    }


def test_ui_runner_relays_only_the_staging_label(monkeypatch, capsys):
    monkeypatch.syspath_prepend(str(ROOT / 'scripts'))
    module = runpy.run_path(str(ROOT / 'scripts/verify-ui-ocu.py'))
    capsys.readouterr()
    staged = SimpleNamespace(
        stdout='staged assets\n',
        stderr=(
            'cp: staging noise\n'
            'harness-env: parent PYTHON_DOTENV_DISABLED=unset\n'
            'trailing harness-env: parent PYTHON_DOTENV_DISABLED=other\n'
        ),
    )

    module['relay_harness_env'](staged)

    assert capsys.readouterr() == ('', 'harness-env: parent PYTHON_DOTENV_DISABLED=unset\n')


def test_non_harness_import_loads_dotenv_content_and_preserves_explicit_config():
    observed, _, _ = _import_environment(harness=False)
    assert observed == {
        'stream_entries': 1,
        'parse_calls': 1,
        'sentinel': 'loaded',
        'explicit_config': 'false',
        'database_url': _DOTENV_URL,
    }


def _isolated_checkout(tmp_path: Path) -> tuple[Path, Path]:
    checkout = tmp_path.resolve() / 'checkout'
    git_env = _allowlisted_env(None)
    subprocess.run(['git', 'init', '-q', str(checkout)], env=git_env, check=True)
    toplevel = subprocess.run(
        ['git', '-C', str(checkout), 'rev-parse', '--show-toplevel'],
        env=git_env,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    assert toplevel == str(checkout)
    (checkout / 'scripts').mkdir()
    (checkout / 'backend' / 'open_webui').mkdir(parents=True)
    for name in ('db-reset.sh', 'db-verify.sh'):
        (checkout / 'scripts' / name).write_text((ROOT / 'scripts' / name).read_text())
    stand_in = tmp_path.resolve() / 'uv_stand_in.py'
    constants = (
        f'PYTHON = {sys.executable!r}\nPROBE = {_DOTENV_PROBE!r}\nPROBE_CONFIG = {_PROBE_CONFIG!r}\n'
        f'DATABASE_VARS = {_DATABASE_VARS!r}\n'
    )
    stand_in.write_text(constants + _UV_STAND_IN)
    bin_dir = tmp_path.resolve() / 'bin'
    bin_dir.mkdir()
    uv = bin_dir / 'uv'
    uv.write_text(f'#!/bin/sh\nexec {shlex.quote(sys.executable)} {shlex.quote(str(stand_in))} "$@"\n')
    uv.chmod(0o755)
    return checkout, bin_dir


@pytest.mark.parametrize(
    ('parent_flag', 'source'),
    [(None, 'dotenv'), ('false', 'dotenv'), (None, 'shell'), (None, 'uv-env-file')],
    ids=['unset-parent-flag', 'false-parent-flag', 'shell-database-vars', 'uv-env-file-database-vars'],
)
@pytest.mark.parametrize(
    ('script', 'steps'),
    [
        ('db-reset.sh', [['upgrade', 'head']]),
        ('db-verify.sh', [['upgrade', 'head'], ['downgrade', '-1'], ['upgrade', 'head']]),
    ],
    ids=['db-reset', 'db-verify'],
)
def test_database_script_alembic_steps_reject_dotenv_database_target(tmp_path, script, steps, parent_flag, source):
    checkout, bin_dir = _isolated_checkout(tmp_path)
    data_dir = checkout / '.run' / 'data'
    data_dir.mkdir(parents=True)
    for name in ('webui.db', 'webui.db-wal', 'webui.db-shm'):
        (data_dir / name).write_text('stale harness database')
    sentinel = checkout / '.run' / 'outside-data.db'
    sentinel.write_text('outside the resettable directory')
    env = _allowlisted_env(parent_flag)
    env['PATH'] = f'{bin_dir}{os.pathsep}{env["PATH"]}'
    if source == 'shell':
        env.update(_fake_database_vars('shell-host.invalid'))
    elif source == 'uv-env-file':
        env['UV_ENV_FILE'] = str(_write_uv_env_file(tmp_path))

    completed = subprocess.run(
        ['bash', f'scripts/{script}'], cwd=checkout, env=env, capture_output=True, text=True, timeout=600
    )

    assert completed.returncode == 0, completed.stdout + completed.stderr
    harness_url = f'sqlite:///{data_dir}/webui.db'
    records = _prefixed_json(completed.stdout, 'ALEMBIC_RECORD=')
    observations = _prefixed_json(completed.stdout, 'DOTENV_OBSERVATION=')
    # The resolved target is the governing invariant, so it fails first.
    assert observations == [
        {
            'stream_entries': 0,
            'parse_calls': 0,
            'sentinel': None,
            'explicit_config': 'false',
            'database_url': harness_url,
        }
    ] * len(steps)
    assert records == [
        {
            'argv': ['run', '--quiet', '--no-env-file', 'alembic', *step],
            'cwd': str(checkout / 'backend' / 'open_webui'),
            'flag': '1',
            'data_dir': str(data_dir),
            'database_url': harness_url,
            'database_vars': [],
        }
        for step in steps
    ]
    assert not any((data_dir / name).exists() for name in ('webui.db', 'webui.db-wal', 'webui.db-shm'))
    assert sentinel.read_text() == 'outside the resettable directory'


@pytest.mark.parametrize(
    ('flag', 'database_host'),
    [(['--no-env-file'], None), ([], 'uvenv-host.invalid')],
    ids=['no-env-file', 'env-file-control'],
)
def test_real_uv_no_env_file_hides_uv_env_file_entries(tmp_path, flag, database_host):
    env = _allowlisted_env(None)
    env.update(
        UV_CACHE_DIR=str(tmp_path.resolve() / 'uv-cache'),
        UV_ENV_FILE=str(_write_uv_env_file(tmp_path)),
        **{_PRECEDENCE_KEY: 'parent'},
    )
    probe = f'import json, os; print(json.dumps([os.environ.get(k) for k in ("DATABASE_HOST", "{_PRECEDENCE_KEY}")]))'
    command = ['uv', 'run', '--no-project', '--offline', '--no-config', '--python', sys.executable, *flag]

    completed = subprocess.run(
        [*command, 'python', '-c', probe], cwd=tmp_path, env=env, capture_output=True, text=True, timeout=180
    )

    assert completed.returncode == 0, completed.stdout + completed.stderr
    assert json.loads(completed.stdout) == [database_host, 'parent']
