"""Seed/smoke credentials cross executable and HTTP boundaries without disclosure."""

from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import uuid4

import pytest

ROOT = Path(__file__).resolve().parents[3]

# Receivers accept both CLI contracts so the baseline reaches authentication, then
# fails on observed disclosure rather than on an unsupported transport option.
_RECEIVER = r"""
import json
import os
import signal
import stat
import sys
import urllib.error
import urllib.request
from pathlib import Path

command = Path(sys.argv[0]).name
args = sys.argv[1:]
password = os.environ['OBS_PASSWORD']
record = {'command': command, 'exposed': any(password in arg for arg in args)}


def save():
    with open(os.environ['OBS_RECORD'], 'a', encoding='utf-8') as stream:
        stream.write(json.dumps(record) + '\n')


def private_file(value):
    path = Path(value)
    record.setdefault('inputs', []).append({
        'path': str(path),
        'file_mode': stat.S_IMODE(path.stat().st_mode),
        'parent_mode': stat.S_IMODE(path.parent.stat().st_mode),
        'owned_parent': path.parent.parent == Path(os.environ['TMPDIR']),
    })
    record['tree_private'] = all(
        stat.S_IMODE(item.stat().st_mode) == (0o700 if item.is_dir() else 0o600)
        for item in path.parent.rglob('*')
    )
    return path.read_text(encoding='utf-8')


def request(url, data=None):
    wire = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(url, data=wire, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def fault():
    if command != os.environ.get('OBS_FAULT_COMMAND'):
        return
    record['pid'] = os.getpid()
    if os.environ['OBS_FAULT_MODE'] == 'nonzero':
        record['phase'] = 'nonzero'
        save()
        sys.exit(42)

    def retire(_signum, _frame):
        record['phase'] = 'retired'
        record['inputs_alive'] = all(Path(item['path']).is_file() for item in record['inputs'])
        save()
        sys.exit(0)

    for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(signum, retire)
    record['phase'] = 'active'
    save()
    Path(os.environ['OBS_READY']).mkdir()
    while True:
        signal.pause()


try:
    if command == 'bash' and args and args[0] == 'scripts/dev-bg.sh':
        # The service lifecycle boundary is replaced, not the seed/smoke runner.
        # Refuse startup even if the isolated health dependency is unavailable.
        record['health_only'] = args == ['scripts/dev-bg.sh', 'status']
        status, _ = request(os.environ['BASE_URL'] + '/health')
        save()
        sys.exit(0 if record['health_only'] and status == 200 else 93)
    if command == 'curl':
        body = None
        for index, arg in enumerate(args):
            if arg in ('-d', '--data', '--data-raw', '--data-binary'):
                value = args[index + 1]
                body = json.loads(private_file(value[1:]) if value.startswith('@') else value)
                record['binary_file'] = arg == '--data-binary' and value.startswith('@')
        fault()
        url = next(arg for arg in args if arg.startswith('http://'))
        status, response = request(url, body)
        record['authenticated'] = status == 200
        output = args[args.index('-o') + 1] if '-o' in args else args[args.index('--output') + 1]
        Path(output).write_bytes(response)
        record['output_mode'] = stat.S_IMODE(Path(output).stat().st_mode)
        save()
        sys.stdout.write(str(status))
    elif command == 'hurl':
        values = {}
        for index, arg in enumerate(args):
            if arg in ('--variable', '--secret'):
                key, value = args[index + 1].split('=', 1)
                values[key] = value
            elif arg in ('--variables-file', '--secrets-file'):
                for line in private_file(args[index + 1]).splitlines():
                    if line.strip() and not line.lstrip().startswith('#'):
                        key, value = line.split('=', 1)
                        values[key.strip()] = value.strip()
                record['secret_file'] = arg == '--secrets-file'
        fault()
        status, _ = request(os.environ['BASE_URL'] + '/api/v1/auths/signin', {
            'email': values.get('seed_email'), 'password': values.get('seed_password'),
        })
        record['authenticated'] = status == 200
        save()
        sys.exit(0 if status == 200 else 94)
    else:
        save()
        if command == 'rm' and os.environ.get('OBS_CLEANUP_NOOP') == '1':
            paths = [Path(arg) for arg in args if not arg.startswith('-')]
            if paths and all(path.parent == Path(os.environ['TMPDIR']) for path in paths):
                sys.exit(0)
            sys.exit(96)
        executables = json.loads(os.environ['OBS_EXECUTABLES'])
        os.execv(executables[command], [executables[command], *args])
except Exception:
    record['receiver_failure'] = True
    save()
    sys.exit(95)
"""

_SOURCE_CALLER = r"""
set +u
trap ':' EXIT
trap ':' INT TERM HUP
before_flags=$-
before_options=$(set +o)
before_shopt=$(shopt -p)
before_traps=$(trap -p)
source scripts/seed.sh
[ "$-" = "$before_flags" ] || exit 81
[ "$(set +o)" = "$before_options" ] || exit 82
[ "$(shopt -p)" = "$before_shopt" ] || exit 83
[ "$(trap -p)" = "$before_traps" ] || exit 84
printf 'SOURCE_RETURNED\n'
"""


def require(condition, message):
    # Pytest's value introspection must never render managed credential values.
    if not condition:
        raise AssertionError(message)


class PrivateInvocation:
    def __init__(self, argv, environment):
        self.argv = argv
        self.environment = environment

    def __repr__(self):
        return '<private harness invocation>'


@pytest.fixture
def harness(tmp_path):
    workspace = tmp_path / 'workspace'
    (workspace / 'scripts').mkdir(parents=True)
    shutil.copy2(ROOT / 'Makefile', workspace / 'Makefile')
    for name in ('seed.sh', 'smoke.sh'):
        source = ROOT / 'scripts' / name
        if source.exists():
            shutil.copy2(source, workspace / 'scripts' / name)
    shutil.copytree(ROOT / 'smoke', workspace / 'smoke')
    scratch = tmp_path / 'transport'
    scratch.mkdir(mode=0o700)
    sentinel = scratch / 'unrelated'
    sentinel.write_text('retain', encoding='utf-8')
    binaries = tmp_path / 'bin'
    binaries.mkdir()
    receiver = binaries / 'receiver'
    receiver.write_text(f'#!{sys.executable}\n' + _RECEIVER, encoding='utf-8')
    receiver.chmod(0o700)
    names = ('bash', 'mktemp', 'mkdir', 'chmod', 'rm', 'cat', 'sed', 'python', 'python3', 'env', 'sleep')
    executables = {name: path for name in names if (path := shutil.which(name))}
    for name in (*executables, 'curl', 'hurl'):
        (binaries / name).symlink_to(receiver)
    record = tmp_path / 'observations.jsonl'
    env = {
        'PATH': str(binaries) + os.pathsep + os.defpath,
        'HOME': str(tmp_path),
        'TMPDIR': str(scratch),
        'OBS_RECORD': str(record),
        'OBS_EXECUTABLES': json.dumps(executables),
        'NO_PROXY': '*',
    }
    state = {'account': False, 'requests': [], 'matches': lambda _credentials: False}

    class AuthBoundary(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            self.send_response(200 if self.path == '/health' else 404)
            self.end_headers()

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            matches = state['matches']((body.get('email'), body.get('password')))
            state['requests'].append((self.path.rsplit('/', 1)[-1], matches))
            status = 401
            if self.path == '/api/v1/auths/signup' and matches and not state['account']:
                state['account'] = True
                status = 200
            elif self.path == '/api/v1/auths/signin' and matches and state['account']:
                status = 200
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"role":"admin"}' if status == 200 else b'{"detail":"denied"}')

    server = ThreadingHTTPServer(('127.0.0.1', 0), AuthBoundary)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    env['BASE_URL'] = f'http://127.0.0.1:{server.server_port}'
    try:
        yield workspace, scratch, sentinel, record, env, state
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def launch(harness, invocation, interrupt=None):
    workspace = harness[0]
    process = None
    try:
        process = subprocess.Popen(
            invocation.argv,
            cwd=workspace,
            env=invocation.environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
        if interrupt is not None:
            deadline = time.monotonic() + 10
            ready = Path(invocation.environment['OBS_READY'])
            while not ready.exists() and process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.01)
            require(ready.exists(), 'Transport did not reach its active private-file boundary')
            os.kill(process.pid, interrupt)
        stdout, stderr = process.communicate(timeout=20)
    except subprocess.TimeoutExpired:
        raise AssertionError('Harness invocation timed out at the executable boundary') from None
    except (OSError, subprocess.SubprocessError, ValueError):
        raise AssertionError('Harness invocation could not execute its subprocess boundary') from None
    finally:
        # A failing assertion or receiver must not leave an owned process behind.
        if process is not None:
            try:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=5)
            except (OSError, subprocess.SubprocessError):
                raise AssertionError('Harness invocation could not retire its owned processes') from None
    password = invocation.environment['OBS_PASSWORD'].encode()
    return process.returncode, b'SOURCE_RETURNED\n' in stdout, password in stdout + stderr


def observations(record):
    return [json.loads(line) for line in record.read_text(encoding='utf-8').splitlines()]


def require_private_inputs(row):
    require(bool(row.get('inputs')), 'Transport did not consume a private credential file')
    require(row.get('tree_private'), 'Transport scratch contained nonprivate request/response/status files')
    paths = []
    for item in row['inputs']:
        require(item['file_mode'] == 0o600, 'Credential input file was not mode 0600')
        require(
            item['parent_mode'] == 0o700 and item['owned_parent'],
            'Credential input did not belong to fresh mode 0700 scratch',
        )
        paths.append(Path(item['path']))
    return paths


def require_completed_private_transports(transports):
    parents = set()
    for row in transports:
        require(
            row.get('binary_file') if row['command'] == 'curl' else row.get('secret_file'),
            'Transport did not use binary-body/secret-file semantics',
        )
        if row['command'] == 'curl':
            require(row.get('output_mode') == 0o600, 'Curl response file was not private')
        for path in require_private_inputs(row):
            parents.add(path.parent)
            require(
                not path.exists() and not path.parent.exists(),
                'Completed invocation retained private input or scratch',
            )
    return parents


@pytest.mark.parametrize('surface', ['seed', 'smoke'])
@pytest.mark.parametrize('configuration', ['defaults', 'environment', 'make-cli', 'empty'])
def test_seed_and_smoke_use_private_matching_credentials(harness, surface, configuration):
    workspace, scratch, sentinel, record, base_env, state = harness
    env = dict(base_env)
    default_email, default_password = 'admin@harness.local', 'harness-admin-pw'
    email, password = default_email, default_password
    overrides = []
    if configuration in ('environment', 'make-cli'):
        email, password = f'seed-{uuid4().hex}@harness.local', uuid4().hex
        env.update(SEED_EMAIL=email, SEED_PASSWORD=password)
    if configuration == 'make-cli':
        env.update(SEED_EMAIL='inherited@harness.local', SEED_PASSWORD=uuid4().hex)
        # The operator's own Make argv is explicitly outside the child guarantee.
        overrides = [f'SEED_EMAIL={email}', f'SEED_PASSWORD={password}']
    elif configuration == 'empty':
        env.update(SEED_EMAIL='', SEED_PASSWORD='')
    env.update(OBS_PASSWORD=password)
    state['matches'] = lambda credentials: credentials == (email, password)
    command = ['make', '-s', '--no-print-directory', surface, *overrides]
    if surface == 'seed' and configuration != 'make-cli':
        command = ['bash', 'scripts/seed.sh']
    runs = []
    for _ in range(2):
        runs.append(launch(harness, PrivateInvocation(command, env)))
    observed = observations(record)
    require(
        not any(row.get('receiver_failure') for row in observed),
        'Transport receiver could not interpret executed argv',
    )
    # Disclosure is checked first, even if empty-value divergence also breaks Hurl.
    exposed_commands = sorted({row['command'] for row in observed if row['exposed']})
    require(
        not exposed_commands,
        'Executed child argv disclosed the seed password: ' + ', '.join(exposed_commands),
    )
    require(not any(run[2] for run in runs), 'Harness diagnostics disclosed the seed password')
    require(all(run[0] == 0 for run in runs), 'Seed/smoke authentication failed')
    expected = [('signin', True), ('signup', True)]
    if surface == 'smoke':
        expected.append(('signin', True))
    expected.append(('signin', True))
    if surface == 'smoke':
        expected.append(('signin', True))
    require(state['requests'] == expected, 'Effective credentials or signin-first account lifetime changed')
    transports = [row for row in observed if row['command'] in ('curl', 'hurl')]
    require(sum(row['command'] == 'curl' for row in transports) == 3, 'Seed did not use signin-first idempotence')
    require(
        sum(row['command'] == 'hurl' for row in transports) == (2 if surface == 'smoke' else 0),
        'Smoke did not reach Hurl',
    )
    parents = require_completed_private_transports(transports)
    require(len(parents) == 2, 'Invocations reused credential scratch instead of owning fresh lifetimes')
    require(
        set(scratch.iterdir()) == {sentinel} and sentinel.read_text() == 'retain',
        'Credential cleanup affected unrelated files or left residue',
    )


def test_sourcing_seed_preserves_the_private_callers_shell(harness):
    _, scratch, sentinel, record, base_env, state = harness
    env = dict(base_env, OBS_PASSWORD=uuid4().hex)
    state['matches'] = lambda credentials: credentials == ('unused@harness.local', env['OBS_PASSWORD'])
    status, returned, disclosed = launch(harness, PrivateInvocation(['bash', '-c', _SOURCE_CALLER], env))
    require(status == 0 and returned, 'Sourcing seed exited or changed caller options/traps')
    require(not disclosed, 'Source-only diagnostics disclosed credentials')
    rows = observations(record)
    require(not state['requests'], 'Sourcing seed performed authentication')
    require(
        not any(row['command'] in ('mktemp', 'mkdir', 'curl', 'hurl') for row in rows),
        'Sourcing seed allocated scratch or launched transport',
    )
    require(set(scratch.iterdir()) == {sentinel}, 'Sourcing seed changed the private caller filesystem')


def require_clean_scratch(harness):
    _, scratch, sentinel, *_ = harness
    require(
        set(scratch.iterdir()) == {sentinel} and sentinel.read_text() == 'retain',
        'Credential lifetime left residue or affected unrelated files',
    )


@pytest.mark.parametrize('transport', ['curl', 'hurl'])
@pytest.mark.parametrize('failure', ['nonzero', 'missing', 'SIGINT', 'SIGTERM', 'SIGHUP'])
def test_failed_transport_retires_owned_child_before_private_files(harness, transport, failure):
    _, _, _, record, base_env, state = harness
    email, password = f'fault-{uuid4().hex}@harness.local', uuid4().hex
    env = dict(base_env, SEED_EMAIL=email, SEED_PASSWORD=password, OBS_PASSWORD=password)
    state['matches'] = lambda credentials: credentials == (email, password)
    interrupt = getattr(signal, failure) if failure.startswith('SIG') else None
    if failure == 'missing':
        binaries = Path(env['PATH'].split(os.pathsep)[0])
        (binaries / transport).unlink()
        env['PATH'] = str(binaries)
    else:
        env.update(
            OBS_FAULT_COMMAND=transport,
            OBS_FAULT_MODE='hold' if interrupt else 'nonzero',
            OBS_READY=str(record.parent / 'active'),
        )
    unrelated = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
    try:
        script = 'seed.sh' if transport == 'curl' else 'smoke.sh'
        invocation = PrivateInvocation(['bash', f'scripts/{script}'], env)
        status, _, disclosed = launch(harness, invocation, interrupt)
        expected = 128 + interrupt if interrupt else (127 if failure == 'missing' else 42)
        require(status == expected, 'Owner did not preserve transport/interruption failure status')
        require(not disclosed, 'Failed transport diagnostics disclosed the seed password')
        require(unrelated.poll() is None, 'Credential cleanup retired an unrelated process')
        rows = observations(record)
        require(
            not any(row.get('receiver_failure') for row in rows),
            'Fault receiver failed before its intended boundary',
        )
        require(not any(row['exposed'] for row in rows), 'Failed transport/helper argv disclosed the seed password')
        if failure != 'missing':
            active = next(row for row in rows if row['command'] == transport and 'phase' in row)
            require_private_inputs(active)
            try:
                os.kill(active['pid'], 0)
            except ProcessLookupError:
                pass
            else:
                require(False, 'Credential transport child survived owner completion')
            if interrupt:
                retired = [row for row in rows if row.get('phase') == 'retired']
                require(
                    len(retired) == 1 and retired[0]['inputs_alive'],
                    'Private files were removed before child retirement',
                )
        require_clean_scratch(harness)
    finally:
        unrelated.terminate()
        unrelated.wait(timeout=5)
