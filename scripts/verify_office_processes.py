"""Keep process-group ownership until every descendant has retired."""

import json
import os
import re
import signal
import stat
import subprocess
import time
from contextlib import contextmanager
from pathlib import Path

from smoke_proxy_support import Fail, kill_tree

INTERRUPTS = {signal.SIGINT, signal.SIGTERM, signal.SIGHUP, signal.SIGALRM}


@contextmanager
def defer_interrupts():
    previous = signal.pthread_sigmask(signal.SIG_BLOCK, INTERRUPTS)
    try:
        yield previous
    finally:
        signal.pthread_sigmask(signal.SIG_SETMASK, previous)


class OwnedProcesses:
    def __init__(self, directory: Path):
        self.directory = directory
        self.processes = []
        self.sequence = 0

    def _record(self):
        (self.directory / 'processes.json').write_text(
            json.dumps({'owned_process_groups': [process.pid for process in self.processes]}) + '\n'
        )

    def start(self, argv, *, env, cwd=None, label='process'):
        self.sequence += 1
        output = self.directory / f'{self.sequence}-{label}.log'
        with output.open('wb') as sink, defer_interrupts() as previous:
            process = subprocess.Popen(
                argv,
                cwd=cwd,
                env=env,
                stdout=sink,
                stderr=subprocess.STDOUT,
                start_new_session=True,
                preexec_fn=lambda: signal.pthread_sigmask(signal.SIG_SETMASK, previous),
            )
            self.processes.append(process)
            self._record()
        return process, output

    def retire(self, process):
        with defer_interrupts():
            kill_tree(process.pid)
            self.processes.remove(process)
            self._record()

    def command(self, argv, *, env, cwd=None, timeout=60, label='command') -> str:
        process, output = self.start(argv, env=env, cwd=cwd, label=label)
        try:
            code = process.wait(timeout=timeout)
            if code:
                raise Fail(f'{label}: command exited {code}; private log {output.name}')
            return output.read_text(encoding='utf-8', errors='replace')
        except subprocess.TimeoutExpired:
            raise Fail(f'{label}: exceeded {timeout} seconds') from None
        finally:
            self.retire(process)

    def start_chromium(self, executable, *, env, credentials, timeout=30):
        profile = self.directory / 'chromium-profile'
        profile.mkdir(mode=0o700)
        process, _ = self.start(
            [
                executable,
                '--headless',
                '--enable-automation',
                '--remote-debugging-address=127.0.0.1',
                '--remote-debugging-port=0',
                '--user-data-dir=' + str(profile),
                '--no-first-run',
                '--no-default-browser-check',
                'about:blank',
            ],
            env=env,
            label='chromium',
        )
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise Fail('Chromium readiness: owned browser exited')
            with defer_interrupts():
                endpoint = _devtools_endpoint(profile)
                if endpoint is not None:
                    credentials.append(endpoint)
                    credentials.append(endpoint.split('/devtools/browser/', 1)[1])
                    return process, endpoint
            time.sleep(0.05)
        raise Fail(f'Chromium readiness: exceeded {timeout} seconds')

    def close(self):
        errors = []
        with defer_interrupts():
            for process in list(reversed(self.processes)):
                try:
                    self.retire(process)
                except Exception as exc:
                    errors.append(f'group {process.pid}: {type(exc).__name__}')
        if errors:
            raise Fail('owned process cleanup failed: ' + '; '.join(errors))


def _devtools_endpoint(profile):
    active = profile / 'DevToolsActivePort'
    try:
        info = active.lstat()
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_size > 256:
        raise Fail('Chromium readiness: unsafe private endpoint metadata')
    rows = active.read_text(encoding='ascii').splitlines()
    if len(rows) != 2 or not re.fullmatch(r'[1-9]\d{0,4}', rows[0]):
        return None
    if int(rows[0]) > 65535 or not re.fullmatch(r'/devtools/browser/[a-f0-9-]+', rows[1]):
        return None
    return f'ws://127.0.0.1:{rows[0]}{rows[1]}'


def wait_ready(url: str, process, *, timeout=180):
    from urllib.error import URLError
    from urllib.request import urlopen

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process is not None and process.poll() is not None:
            raise Fail('service readiness: owned process exited')
        try:
            with urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, URLError):
            pass  # Readiness has a bounded deadline; a refusal is not a successful probe.
        time.sleep(0.2)
    raise Fail(f'service readiness: timed out at {url}')
