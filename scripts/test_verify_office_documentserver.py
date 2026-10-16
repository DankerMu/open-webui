import importlib.util
import os
import shutil
import sys
import time
from contextlib import ExitStack
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Event, Thread
from types import SimpleNamespace

import pytest
import verify_office_documentserver as readiness
from smoke_proxy_support import Fail
from verify_office_documentserver import wait_documentserver_ready
from verify_office_processes import OwnedProcesses

SCRIPT = Path(__file__).with_name('verify-office.py')
SPEC = importlib.util.spec_from_file_location('verify_office_readiness_cli', SCRIPT)
OFFICE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(OFFICE)


def _documentserver_handler(state):
    class DocumentServerHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            theme = self.path == '/sdkjs/slide/themes/themes.js'
            health = self.path == '/healthcheck'
            final_health = health and state.bootstrap_seen.exists()
            ready = (
                (health and not (final_health and state.final_health_error))
                or (theme and state.theme_available.is_set())
                or state.cleanup.is_set()
            )
            self.send_response(200 if ready else 503)
            self.end_headers()
            self.wfile.write(b'true' if health else b'window.AscSlide = {};')
            if final_health:
                state.final_health_served.set()
            elif health:
                state.health_served.set()
            elif theme:
                (state.ready_theme_served if ready else state.missing_theme_served).set()

        def log_message(self, *args):
            pass

    return DocumentServerHandler


def _await_final_phase(state, initializer):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        assert initializer.poll() is None, 'owned native initialization fixture exited before receipt'
        if state.final_phase_receipt.exists() and state.final_phase_receipt.read_text().isdigit():
            return
        time.sleep(0.02)
    pytest.fail('owned native initialization fixture did not confirm its final-phase child')


def _start_readiness_worker(state, resources, operation):
    def worker():
        try:
            operation()
        except Exception as exc:
            state.errors.append(exc)
        finally:
            state.completed.set()

    starting = Thread(target=worker, daemon=True)
    starting.start()

    def retire_worker():
        state.cleanup.set()
        state.theme_available.set()
        state.final_phase.touch()
        starting.join(timeout=5)
        assert not starting.is_alive(), 'DocumentServer readiness worker did not retire'

    resources.callback(retire_worker)


@pytest.fixture
def native_server(tmp_path, monkeypatch):
    state = SimpleNamespace(
        health_served=Event(),
        missing_theme_served=Event(),
        theme_available=Event(),
        ready_theme_served=Event(),
        cleanup=Event(),
        completed=Event(),
        errors=[],
        final_phase=tmp_path / 'release-native-final-phase',
        bootstrap_seen=tmp_path / 'bootstrap-seen',
        final_phase_receipt=tmp_path / 'native-final-phase-ready',
        pgrep_error=tmp_path / 'pgrep-error',
        final_health_error=False,
        final_health_served=Event(),
    )

    with ExitStack() as resources:
        owned = OwnedProcesses(tmp_path)
        resources.callback(owned.close)
        server = ThreadingHTTPServer(('127.0.0.1', 0), _documentserver_handler(state))
        server.daemon_threads = True
        resources.callback(server.server_close)
        serving = Thread(target=server.serve_forever, kwargs={'poll_interval': 0.05}, daemon=True)
        serving.start()

        def stop_http():
            server.shutdown()
            serving.join(timeout=2)
            assert not serving.is_alive(), 'DocumentServer HTTP fixture did not retire'

        resources.callback(stop_http)
        real_pgrep = shutil.which('pgrep')
        assert real_pgrep is not None, 'native readiness fixture requires pgrep'
        (tmp_path / 'native-final.log').write_text('owned native log follower fixture\n')
        initializer, _ = owned.start(
            [
                sys.executable,
                '-c',
                'import os,pathlib,subprocess,sys,time\n'
                'release=pathlib.Path(sys.argv[1])\n'
                'while not release.exists():\n'
                '    time.sleep(0.02)\n'
                'child=subprocess.Popen(["bash", "-c", "find native-final.log | xargs tail -F"])\n'
                'deadline=time.monotonic()+5\n'
                'while time.monotonic() < deadline:\n'
                '    if child.poll() is not None:\n'
                '        raise SystemExit("native final-phase child exited before receipt")\n'
                '    match=subprocess.run([sys.argv[3], "-P", str(os.getpid()), "-f", '
                '"^bash -c find .* [|] xargs tail -F$"], capture_output=True, text=True)\n'
                '    if match.returncode == 0 and match.stdout.split() == [str(child.pid)]:\n'
                '        pathlib.Path(sys.argv[2]).write_text(str(child.pid))\n'
                '        break\n'
                '    if match.returncode not in (0, 1):\n'
                '        raise SystemExit("native final-phase receipt pgrep failed")\n'
                '    time.sleep(0.02)\n'
                'else:\n'
                '    raise SystemExit("native final-phase receipt timed out")\n'
                'child.wait()\n',
                str(state.final_phase),
                str(state.final_phase_receipt),
                real_pgrep,
            ],
            env=dict(os.environ),
            cwd=tmp_path,
            label='native-initialization',
        )
        pgrep = tmp_path / 'pgrep'
        pgrep.write_text(
            f'#!{sys.executable}\n'
            'import os, pathlib, sys\n'
            'args = sys.argv[1:]\n'
            'if args[:2] == ["-P", "1"]:\n'
            f'    args[1] = {str(initializer.pid)!r}\n'
            f'if pathlib.Path({str(state.pgrep_error)!r}).exists():\n'
            '    args = ["--invalid-readiness-fixture-option"]\n'
            f'os.execv({real_pgrep!r}, ["pgrep", *args])\n'
        )
        pgrep.chmod(0o700)
        executable = tmp_path / 'docker-boundary'
        run = OFFICE.OfficeRun(
            {
                'OFFICE_DOCKER': str(executable),
                'platform': 'linux/amd64',
                'image_identity': 'sha256:' + '4' * 64,
            }
        )
        run.scratch = tmp_path
        run.processes = owned
        run.env['PATH'] = str(tmp_path) + os.pathsep + run.env['PATH']
        inspection = {'Config': {'Labels': {'ocu.verify-office': run.run_id}}, 'Mounts': []}
        executable.write_text(
            f'#!{sys.executable}\n'
            'import json, pathlib, subprocess, sys\n'
            'if sys.argv[1] == "create":\n'
            '    print("synthetic-documentserver")\n'
            'elif sys.argv[1] == "inspect":\n'
            f'    print(json.dumps([{inspection!r}]))\n'
            'elif sys.argv[1] == "exec":\n'
            '    result = subprocess.run(sys.argv[3:])\n'
            '    if result.returncode == 0:\n'
            f'        pathlib.Path({str(state.bootstrap_seen)!r}).touch()\n'
            '    sys.exit(result.returncode)\n'
        )
        executable.chmod(0o700)
        monkeypatch.setattr(OFFICE, 'distinct_ports', lambda count: (server.server_port, 1))
        state.run = run
        state.initializer = initializer
        state.origin = f'http://127.0.0.1:{server.server_port}'

        state.await_final_phase = lambda: _await_final_phase(state, initializer)
        state.start = lambda operation=None: _start_readiness_worker(
            state, resources, run.start_documentserver if operation is None else operation
        )
        yield state


def test_documentserver_readiness_waits_for_theme_and_native_initialization(native_server):
    state = native_server
    state.start()
    assert state.health_served.wait(5), 'DocumentServer health was not probed'
    assert not state.completed.wait(0.5), (
        f'DocumentServer reported ready while slide themes were unavailable: {state.errors!r}'
    )
    assert state.missing_theme_served.wait(5), 'DocumentServer did not probe the unavailable slide theme asset'
    state.theme_available.set()
    assert state.ready_theme_served.wait(5), 'DocumentServer did not observe the now-available slide theme asset'
    assert not state.completed.wait(0.5), (
        f'DocumentServer reported ready before native initialization reached its final phase: {state.errors!r}'
    )
    assert state.initializer.poll() is None, 'owned native initialization fixture exited early'
    state.final_phase.touch()
    assert state.completed.wait(5), 'DocumentServer did not become ready after native initialization completed'
    assert state.errors == []
    assert state.final_health_served.is_set()


def test_native_process_query_errors_fail_without_reporting_readiness(native_server):
    state = native_server
    state.theme_available.set()
    state.pgrep_error.touch()
    with pytest.raises(Fail, match='DocumentServer native initialization readiness: Docker: command exited 2'):
        wait_documentserver_ready(state.origin, 'synthetic-documentserver', state.run.docker, timeout=2)
    assert not state.bootstrap_seen.exists()
    assert not state.final_health_served.is_set()


def test_native_initialization_cannot_outlive_readiness_budget(native_server):
    state = native_server
    state.theme_available.set()
    with pytest.raises(Fail, match='DocumentServer native initialization readiness: Docker: exceeded'):
        wait_documentserver_ready(state.origin, 'synthetic-documentserver', state.run.docker, timeout=0.5)
    assert not state.bootstrap_seen.exists()
    assert not state.final_health_served.is_set()


def test_final_health_failure_is_not_hidden_by_native_completion(native_server, monkeypatch):
    state = native_server
    state.theme_available.set()
    state.final_phase.touch()
    state.await_final_phase()
    state.final_health_error = True
    monkeypatch.setattr(
        readiness,
        'time',
        SimpleNamespace(monotonic=lambda: 9.8 if state.bootstrap_seen.exists() else 0),
    )
    state.start(
        lambda: wait_documentserver_ready(state.origin, 'synthetic-documentserver', state.run.docker, timeout=10)
    )
    assert state.final_health_served.wait(5), 'final healthcheck was not reached after the native witness'
    assert state.completed.wait(2), 'final healthcheck received a fresh budget instead of the remaining 0.2s'
    assert len(state.errors) == 1
    assert isinstance(state.errors[0], Fail)
    assert 'DocumentServer final healthcheck readiness: service readiness: timed out' in str(state.errors[0])
    assert state.bootstrap_seen.exists()
    assert state.final_health_served.is_set()
