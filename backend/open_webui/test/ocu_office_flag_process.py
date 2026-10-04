"""Fresh-process Office flag import: harness first, then env, then app."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[2]
_REPO = Path(__file__).resolve().parents[3]


def run_office_flag_process(*, office: str | None, workspace: str) -> dict:
    data_dir = _REPO / '.run' / 'data' / f'office-flag-{uuid.uuid4()}'
    data_dir.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        '-m',
        'open_webui.test.ocu_office_flag_process',
        '--workspace',
        workspace,
        '--data-dir',
        str(data_dir),
    ]
    if office is None:
        command.append('--unset-office')
    else:
        command.extend(['--office', office])
    env = os.environ.copy()
    pythonpath = env.get('PYTHONPATH', '')
    env['PYTHONPATH'] = str(_BACKEND) if not pythonpath else os.pathsep.join([str(_BACKEND), pythonpath])
    try:
        completed = subprocess.run(command, cwd=str(_BACKEND), env=env, capture_output=True, text=True, timeout=180)
    finally:
        shutil.rmtree(data_dir, ignore_errors=True)
    payload = None
    if completed.returncode == 0:
        payload = json.loads(completed.stdout.splitlines()[-1])
    return {
        'exit': completed.returncode,
        'stdout': completed.stdout,
        'stderr': completed.stderr,
        'payload': payload,
    }


def _main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--office')
    parser.add_argument('--unset-office', action='store_true')
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--data-dir', required=True)
    args = parser.parse_args()

    import open_webui.test.ocu_harness as ocu_harness

    os.environ['DATA_DIR'] = args.data_dir
    os.environ['DATABASE_URL'] = f'sqlite:///{Path(args.data_dir) / "webui.db"}'
    os.environ['ENABLE_OCU_WORKSPACE'] = args.workspace
    if args.unset_office:
        os.environ.pop('ENABLE_OCU_OFFICE_EDIT', None)
    else:
        os.environ['ENABLE_OCU_OFFICE_EDIT'] = args.office if args.office is not None else ''

    from fastapi.testclient import TestClient

    from open_webui.main import app

    with TestClient(app) as client:
        user = asyncio.run(ocu_harness._insert_user(role='user', prefix='office-flag'))
        try:
            auth_response = client.get('/api/config', headers=ocu_harness._session_headers(user.id))
            anon_response = client.get('/api/config')
            assert auth_response.status_code == 200
            assert anon_response.status_code == 200
            auth = auth_response.json()['features']
            anon = anon_response.json()['features']
        finally:
            asyncio.run(ocu_harness._delete_user(user.id))
    sys.stdout.write(
        json.dumps(
            {
                'auth_office': auth['enable_ocu_office_edit'],
                'auth_workspace': auth['enable_ocu_workspace'],
                'anon_office': 'enable_ocu_office_edit' in anon,
                'anon_workspace': 'enable_ocu_workspace' in anon,
            }
        )
        + '\n'
    )


if __name__ == '__main__':
    _main()
