import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest
from smoke_proxy_support import Fail
from verify_office_processes import OwnedProcesses


def _live(pid):
    observed = subprocess.run(['ps', '-o', 'stat=', '-p', str(pid)], capture_output=True, text=True)
    return bool(observed.stdout.strip()) and not observed.stdout.strip().startswith('Z')


def test_cleanup_retires_descendant_after_leader_exit_and_preserves_unrelated_process(tmp_path):
    unrelated = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'], start_new_session=True)
    owned = OwnedProcesses(tmp_path)
    try:
        child_record = tmp_path / 'child.pid'
        program = (
            'import pathlib,subprocess,sys; '
            'child=subprocess.Popen([sys.executable,"-c","import time; time.sleep(60)"]); '
            'pathlib.Path(sys.argv[1]).write_text(str(child.pid))'
        )
        leader, _ = owned.start([sys.executable, '-c', program, str(child_record)], env=dict(os.environ))
        leader.wait(timeout=5)
        child = int(child_record.read_text())
        assert _live(child)
        owned.close()
        assert not _live(child)
        assert unrelated.poll() is None
    finally:
        owned.close()
        os.killpg(unrelated.pid, signal.SIGKILL)
        unrelated.wait(timeout=5)


def test_command_timeout_retires_its_owned_process_group(tmp_path):
    owned = OwnedProcesses(tmp_path)
    pidfile = tmp_path / 'command.pid'
    program = 'import os,pathlib,sys,time; pathlib.Path(sys.argv[1]).write_text(str(os.getpid())); time.sleep(60)'
    with pytest.raises(Fail, match='exceeded'):
        owned.command([sys.executable, '-c', program, str(pidfile)], env=dict(os.environ), timeout=1)
    deadline = time.monotonic() + 2
    pid = int(pidfile.read_text())
    while _live(pid) and time.monotonic() < deadline:
        time.sleep(0.02)
    assert not _live(pid)


def _live_group(pid):
    result = subprocess.run(['ps', '-eo', 'pgid=,stat='], capture_output=True, text=True, check=True)
    return any(
        fields[0] == str(pid) and not fields[1].startswith('Z')
        for fields in (line.split() for line in result.stdout.splitlines())
        if len(fields) == 2
    )


def test_native_chromium_owner_retires_stopped_browser_after_cdp_worker_is_killed(tmp_path):
    root = Path(__file__).resolve().parent.parent
    node = os.environ.get('OFFICE_NODE', 'node')
    lookup = subprocess.run(
        [node, '-e', "process.stdout.write(require('@playwright/test').chromium.executablePath())"],
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
        timeout=15,
    )
    executable = lookup.stdout.strip()
    env = dict(os.environ, HOME=str(tmp_path / 'home'), TMPDIR=str(tmp_path / 'tmp'), PYTHON_DOTENV_DISABLED='1')
    (tmp_path / 'home').mkdir()
    (tmp_path / 'tmp').mkdir()
    owned = OwnedProcesses(tmp_path)
    unrelated = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(90)'], start_new_session=True)
    try:
        browser, endpoint = owned.start_chromium(executable, env=env, credentials=[])
        ready = tmp_path / 'worker-ready'
        # Keep the browser control endpoint out of argv and public failure reports.
        worker_config = tmp_path / 'worker-config.json'
        worker_config.write_text(json.dumps({'endpoint': endpoint, 'ready': str(ready)}))
        worker_config.chmod(0o600)
        code = (
            "const fs=require('node:fs'); const {chromium}=require('@playwright/test'); "
            "const config=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); "
            '(async()=>{const browser=await chromium.connectOverCDP(config.endpoint); '
            'const context=await browser.newContext(); const page=await context.newPage(); '
            "await page.setContent('<title>Owned browser</title>'); "
            'fs.writeFileSync(config.ready,await page.title()); await new Promise(()=>{}); '
            '})().catch(()=>process.exit(1));'
        )
        worker, _ = owned.start([node, '-e', code, str(worker_config)], env=env, cwd=root, label='cdp-worker')
        deadline = time.monotonic() + 30
        while not ready.exists() and time.monotonic() < deadline:
            if worker.poll() is not None:
                pytest.fail('CDP worker exited before attaching to the owned native browser')
            time.sleep(0.05)
        assert ready.read_text() == 'Owned browser'
        assert os.getpgid(browser.pid) == browser.pid
        os.killpg(browser.pid, signal.SIGSTOP)
        worker.kill()
        worker.wait(timeout=5)
        assert _live_group(browser.pid)

        owned.close()

        assert not _live_group(browser.pid)
        assert not _live_group(worker.pid)
        assert unrelated.poll() is None
        assert (tmp_path / 'chromium-profile').is_dir()
    finally:
        try:
            owned.close()
        finally:
            os.killpg(unrelated.pid, signal.SIGKILL)
            unrelated.wait(timeout=5)
