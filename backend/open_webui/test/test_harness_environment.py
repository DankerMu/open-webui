"""Harness imports reject dotenv content without changing ordinary imports."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
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
    with io.StringIO('HARNESS_DOTENV_SENTINEL=loaded\nENABLE_OLLAMA_API=true\n') as stream:
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
)
print('DOTENV_OBSERVATION=' + json.dumps(observed, sort_keys=True))
"""


def _import_environment(*, harness: bool, parent_flag: str | None = None):
    workspace = f'workspace-ui-{uuid4().hex}'
    # An inherited disable flag could mask a missing harness policy.
    env = {key: os.environ[key] for key in ('PATH', 'HOME', 'LANG') if key in os.environ}
    env.update(
        PYTHONPATH=str(ROOT / 'backend'),
        PYTHONDONTWRITEBYTECODE='1',
        DATA_DIR=str(ROOT / '.run' / 'data' / workspace),
        FRONTEND_BUILD_DIR=str(ROOT / '.run' / workspace / 'frontend-build'),
        WEBUI_SECRET_KEY=uuid4().hex,
        ENABLE_OLLAMA_API='false',
        DO_NOT_TRACK='1',
        ANONYMIZED_TELEMETRY='false',
    )
    if parent_flag is not None:
        env['PYTHON_DOTENV_DISABLED'] = parent_flag
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
    observations = [
        line.removeprefix('DOTENV_OBSERVATION=')
        for line in completed.stdout.splitlines()
        if line.startswith('DOTENV_OBSERVATION=')
    ]
    assert len(observations) == 1, completed.stdout + completed.stderr
    return json.loads(observations[0])


@pytest.mark.parametrize('parent_flag', [None, 'false'], ids=['unset-parent-flag', 'false-parent-flag'])
def test_harness_import_rejects_dotenv_content_and_preserves_explicit_config(parent_flag):
    observed = _import_environment(harness=True, parent_flag=parent_flag)
    assert observed == {
        'stream_entries': 0,
        'parse_calls': 0,
        'sentinel': None,
        'explicit_config': 'false',
    }


def test_non_harness_import_loads_dotenv_content_and_preserves_explicit_config():
    observed = _import_environment(harness=False)
    assert observed == {
        'stream_entries': 1,
        'parse_calls': 1,
        'sentinel': 'loaded',
        'explicit_config': 'false',
    }
