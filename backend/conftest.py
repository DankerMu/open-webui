"""Pin every backend pytest process to owned .run/ directories before open_webui loads (#695).

Importing open_webui.config empties STATIC_DIR's top-level files and refills them from
FRONTEND_BUILD_DIR/static; the defaults are the tracked backend/open_webui/static and build/,
and DATA_DIR defaults to backend/data. scripts/dev-env.sh owns the path rules and the staging,
so this module only defaults, delegates and adopts its answer. It must not import open_webui:
open_webui.test.ocu_harness refuses to configure once open_webui.env has loaded.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

_ROOT = Path(__file__).resolve().parents[1]
_RESOLVED = ('DATA_DIR', 'FRONTEND_BUILD_DIR', 'STATIC_DIR', 'DATABASE_URL')
_REPORT = r'printf "%s\0" "$DATA_DIR" "$FRONTEND_BUILD_DIR" "$STATIC_DIR" "$DATABASE_URL"'
_UNSET = (
    'DATABASE_TYPE',
    'DATABASE_USER',
    'DATABASE_PASSWORD',
    'DATABASE_HOST',
    'DATABASE_PORT',
    'DATABASE_NAME',
    'UV_ENV_FILE',
)


def _isolate() -> None:
    # bash reads an empty value as unset, os.getenv does not: Path('') is the working directory.
    for name in _RESOLVED[:3]:
        if not os.environ.get(name):
            os.environ.pop(name, None)
    # An inherited pair belongs to its caller: validated, never restaged (staging deletes). Half a
    # pair would leave the inherited STATIC_DIR wiped at import with nothing staged to refill it.
    inherited = 'FRONTEND_BUILD_DIR' in os.environ, 'STATIC_DIR' in os.environ
    if inherited[0] != inherited[1]:
        raise pytest.UsageError(
            'backend/conftest.py: inherit both FRONTEND_BUILD_DIR and STATIC_DIR or neither '
            f'(FRONTEND_BUILD_DIR set: {inherited[0]}, STATIC_DIR set: {inherited[1]})'
        )
    os.environ.setdefault('FRONTEND_BUILD_DIR', str(_ROOT / '.run' / 'pytest' / 'frontend-build'))
    stage = '' if inherited[0] else 'stage_frontend_assets && '
    completed = subprocess.run(
        ['bash', '-c', f'source scripts/dev-env.sh && {stage}{_REPORT}'],
        cwd=_ROOT,
        env=os.environ,
        capture_output=True,
        text=True,
        check=False,
    )
    values = completed.stdout.split('\0')
    if completed.returncode != 0 or len(values) != len(_RESOLVED) + 1:
        raise pytest.UsageError(
            f'backend/conftest.py: scripts/dev-env.sh refused the test environment '
            f'(exit {completed.returncode}):\n{completed.stderr}'
        )
    # Child processes copy os.environ (ocu_office_flag_process), so monkeypatch would not reach them.
    os.environ.update(zip(_RESOLVED, values))
    # Validated paths only, never deleted: import-time migrations need DATA_DIR (ocu_harness.py
    # does the same) and main.py mounts STATIC_DIR, which an inherited pair may not have created.
    for name in ('DATA_DIR', 'STATIC_DIR'):
        Path(os.environ[name]).mkdir(parents=True, exist_ok=True)
    for name in _UNSET:
        os.environ.pop(name, None)
    # A dotenv DATABASE_* set would rebuild DATABASE_URL in open_webui.env, as dev-env.sh notes (#549).
    os.environ['PYTHON_DOTENV_DISABLED'] = '1'


_isolate()
