#!/usr/bin/env python3
"""Run the real mounted Files UI through an owned, pinned, isolated gateway stack."""

from __future__ import annotations

import importlib.util
import json
import logging
import os
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace

from ocu_stub_office import OFFICE_SCENARIOS, office_document
from smoke_proxy_resources import mint_short_session
from smoke_proxy_support import (
    Fail,
    distinct_ports,
    fail,
    git_run,
    http_json,
    kill_tree,
    materialize_git_files,
    observations,
    redact,
    run,
    run_owned_lifecycle,
    wait_http,
)

smoke_spec = importlib.util.spec_from_file_location('smoke_proxy', Path(__file__).with_name('smoke-proxy.py'))
if smoke_spec is None or smoke_spec.loader is None:
    fail('missing shared proxy lifecycle module')
smoke_module = importlib.util.module_from_spec(smoke_spec)
smoke_spec.loader.exec_module(smoke_module)
Smoke = smoke_module.Smoke
require_tools = smoke_module.require_tools
PINNED_FILES = smoke_module.PINNED_FILES


def relay_harness_env(staged: subprocess.CompletedProcess[str]) -> None:
    """Forward dev-env.sh parent-flag labels from a captured run so the receipt carries them."""
    for line in staged.stderr.splitlines():
        if line.startswith('harness-env:'):
            sys.stderr.write(line + '\n')


def mint_browser_session() -> int:
    config = json.loads(Path(json.load(sys.stdin)['config']).read_text(encoding='utf-8'))
    owner = SimpleNamespace(
        root=Path(config['root']), owner_id=config['owner_id'], secrets=[], scratch=Path(config['scratch'])
    )
    token, expiry = mint_short_session(owner, service_env=config['service_env'], lifetime=20, inherited_group=True)
    fd = os.open(config['credentials'], os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(fd, 'a', encoding='utf-8') as stream:
        stream.write(json.dumps(token) + '\n')
    sys.stdout.write(json.dumps({'token': token, 'exp': expiry}))
    return 0


log = logging.getLogger('verify-ui-ocu')
SCENARIOS = (
    'normal',
    'empty',
    'large',
    'valid',
    'corrupt',
    'unreachable',
    'deleted',
    'partial',
    'stopped',
    'link',
    'restart',
    'drawio',
    'drawio_embedded',
    'nested',
    *sorted(OFFICE_SCENARIOS),
)
REQUIRED_SPECS = (
    'ocu-workspace.e2e.ts',
    'ocu-resources.e2e.ts',
    'ocu-controls.e2e.ts',
    'ocu-reconciliation.e2e.ts',
    'ocu-drawio.e2e.ts',
    'ocu-tree.e2e.ts',
    'ocu-office.e2e.ts',
)
# Collected only through the repeat entry point (OCU_UI_SPEC); never part of the default run.
DIAGNOSTIC_SPECS = ('ocu-popup-release.e2e.ts',)
REPEAT_RE = re.compile(r'^[1-9][0-9]*$')


def repeat_selection() -> tuple[str, int, str | None] | None:
    """Validate OCU_UI_SPEC + OCU_UI_REPEAT (+ optional OCU_UI_GREP) before any owned service starts.

    None means the default run; otherwise (spec, repeat, grep_or_None).
    """
    spec = os.environ.get('OCU_UI_SPEC')
    repeat = os.environ.get('OCU_UI_REPEAT')
    grep = os.environ.get('OCU_UI_GREP')
    if grep is not None and (spec is None or repeat is None):
        fail('OCU_UI_GREP requires OCU_UI_SPEC and OCU_UI_REPEAT')
    if spec is None and repeat is None:
        return None
    if spec is None or repeat is None:
        fail('OCU_UI_SPEC and OCU_UI_REPEAT must be set together')
    if spec not in REQUIRED_SPECS + DIAGNOSTIC_SPECS:
        fail(f'OCU_UI_SPEC must name one of {", ".join(REQUIRED_SPECS + DIAGNOSTIC_SPECS)}')
    if not REPEAT_RE.match(repeat):
        fail('OCU_UI_REPEAT must be a positive integer')
    if grep == '':
        fail('OCU_UI_GREP must not be empty')
    return spec, int(repeat), grep


def harness_alarm(repeat_count: int) -> int:
    # The only timing change on the opt-in path: one spec repeated n times may outlast the default run.
    return max(1500, 900 + 600 * repeat_count)


class BrowserHarness(Smoke):
    def __init__(self, selection: tuple[str, int, str | None] | None = None) -> None:
        super().__init__()
        self.specs = (selection[0],) if selection else REQUIRED_SPECS
        self.repeat_count = selection[1] if selection else 1
        self.spec_env = {'OCU_UI_SPEC': selection[0]} if selection else {}
        self.spec_args = [f'e2e/{selection[0]}'] if selection else []
        self.repeat_args = ['--repeat-each', str(selection[1])] if selection else []
        grep = selection[2] if selection else None
        # List form only: the title filter never passes through a shell.
        self.grep_args = ['--grep', grep] if grep else []
        self.original_pidfiles = {
            name: (self.root / '.run' / name).read_bytes() if (self.root / '.run' / name).exists() else None
            for name in ('backend.pid', 'frontend.pid')
        }
        self.data_dir: Path | None = None
        self.backend_port = 0
        self.frontend_port = 0

    def cleanup_data(self) -> None:
        if self.data_dir and self.data_dir.exists():
            if self.data_dir.parent != self.root / '.run/data' or not self.data_dir.name.startswith('workspace-ui-'):
                fail('refusing to remove a non-owned data directory')
            shutil.rmtree(self.data_dir)

    def assert_sentinel(self) -> None:
        for name, original in self.original_pidfiles.items():
            path = self.root / '.run' / name
            current = path.read_bytes() if path.exists() else None
            if current != original:
                fail(f'unowned development service pidfile changed: {name}')

    def checkout_path(self) -> Path:
        if os.environ.get('OCU_CHECKOUT'):
            return Path(os.environ['OCU_CHECKOUT']).resolve()
        sibling = self.root.parent / 'open-computer-use'
        return sibling.resolve() if sibling.is_dir() else (self.root / '.run/open-computer-use').resolve()

    def prepare_drawio_assets(self) -> None:
        preparer = self.stage / 'computer-use-server/drawio/prepare_drawio.py'
        inventory = self.stage / 'computer-use-server/drawio/inventory.json'
        if not preparer.is_file() or not inventory.is_file():
            fail('pinned Drawio preparation tree is missing')
        cache = self.root / '.run/drawio-cache'
        cache.mkdir(parents=True, exist_ok=True)
        log_path = self.scratch / 'drawio-prepare.log'
        env = {
            'PATH': os.environ.get('PATH', ''),
            'HOME': os.environ.get('HOME', ''),
            'TMPDIR': os.environ.get('TMPDIR', '/tmp'),
            'OCU_DRAWIO_CACHE': str(cache),
        }
        pid = self.start_owned([self.python, str(preparer)], env, None, log_path)
        deadline = time.time() + 120
        status = None
        while time.time() < deadline:
            try:
                waited, status = os.waitpid(pid, os.WNOHANG)
            except ChildProcessError:
                fail('Drawio preparation process disappeared before reporting a status')
            if waited:
                break
            time.sleep(0.05)
        else:
            kill_tree(pid)
            self.owned.remove(pid)
            fail('Drawio preparation exceeded 120 seconds')
        self.owned.remove(pid)
        if not os.WIFEXITED(status) or os.WEXITSTATUS(status):
            detail = log_path.read_text(encoding='utf-8', errors='replace')[-4000:]
            fail(f'Drawio preparation failed: {detail}')
        viewer = self.stage / 'computer-use-server/static/drawio/js/viewer-static.min.js'
        if not viewer.is_file():
            fail('Drawio preparation did not publish viewer materials in the served stage')

    def provision(self) -> tuple[dict[str, str], str, str]:
        backend = f'http://127.0.0.1:{self.backend_port}'
        identity = f'workspace-ui-{secrets.token_hex(8)}@harness.local'
        password = secrets.token_urlsafe(22)
        status, signup, _, _ = http_json(
            'POST',
            f'{backend}/api/v1/auths/signup',
            headers={'Content-Type': 'application/json'},
            body=json.dumps({'name': 'Workspace UI Owner', 'email': identity, 'password': password}).encode(),
        )
        if status != 200 or not signup.get('token'):
            fail(f'isolated owner signup failed: {status}')
        jwt = signup['token']
        status, signin, headers, _ = http_json(
            'POST',
            f'{self.origin}/api/v1/auths/signin',
            headers={'Content-Type': 'application/json'},
            body=json.dumps({'email': identity, 'password': password}).encode(),
        )
        if status != 200 or not signin.get('token') or not headers.get('set-cookie'):
            fail('owner cannot sign in through actual proxy')
        cookie = f'token={signin["token"]}'
        self.owner_id = signin['id']
        self.secrets.extend([jwt, signin['token'], password])
        scenarios: dict[str, str] = {}
        chats: dict[str, str] = {}
        for scenario in SCENARIOS:
            status, created, _, _ = http_json(
                'POST',
                f'{backend}/api/v1/chats/new',
                headers={'Authorization': f'Bearer {jwt}', 'Content-Type': 'application/json'},
                body=json.dumps(
                    {'chat': {'title': f'Workspace {scenario}', 'history': {'messages': {}, 'currentId': None}}}
                ).encode(),
            )
            if status != 200 or not created.get('id'):
                fail(f'owner chat creation failed for {scenario}: {status}')
            chats[scenario] = created['id']
            scenarios[created['id']] = 'valid' if scenario == 'restart' else scenario
        link_chat = chats['link']
        message = {
            'id': 'fixture-message',
            'role': 'assistant',
            'content': f'[Open generated workspace file](/ocu/files/{link_chat}/page.html) '
            f'[Open scripted SVG](/ocu/files/{link_chat}/diagram.svg)',
            'parentId': None,
            'childrenIds': [],
            'timestamp': 1,
        }
        status, _, _, _ = http_json(
            'POST',
            f'{backend}/api/v1/chats/{link_chat}',
            headers={'Authorization': f'Bearer {jwt}', 'Content-Type': 'application/json'},
            body=json.dumps(
                {'chat': {'history': {'messages': {message['id']: message}, 'currentId': message['id']}}}
            ).encode(),
        )
        if status != 200:
            fail(f'fixture message could not be saved: {status}')
        self.fixtures.write_text(json.dumps(scenarios), encoding='utf-8')
        restart_prefs = {'view': 'files', 'selected_file_id': 'fixture-valid.docx', 'open': True}
        status, saved, _, _ = http_json(
            'PUT',
            f'{self.origin}/api/v1/ocu/workspaces/{chats["restart"]}/prefs',
            cookie=cookie,
            headers={'Content-Type': 'application/json', 'X-Requested-With': 'ocu-workspace'},
            body=json.dumps(restart_prefs).encode(),
        )
        if status != 200 or saved.get('prefs') != restart_prefs:
            fail('restart-chat preferences were not persisted before process restart')
        status, describe, _, _ = http_json(
            'GET', f'{self.origin}/api/v1/ocu/workspaces/{chats["valid"]}', cookie=cookie
        )
        if status != 200 or describe.get('status') != 'running' or describe.get('base_url') != '/ocu':
            fail(f'owner-chat readiness failed: {status} {describe.get("status")}')
        status, _, asset_headers, raw = http_json('GET', f'{self.origin}/ocu/static/preview.js', cookie=cookie)
        if status != 200 or b'ocu:preview-ready' not in raw:
            direct_status, _, direct_headers, direct_raw = http_json(
                'GET', f'http://127.0.0.1:{self.stub_port}/ocu/static/preview.js'
            )
            hits = sum('/static/preview.js' in row.get('target', '') for row in observations(self.record))
            nginx_error = self.stage / 'deploy/proxy/runtime/error.log'
            errors = nginx_error.read_text(encoding='utf-8', errors='replace') if nginx_error.exists() else ''
            summary = redact(errors[-4000:], [self.token, signin['token'], password])
            fail(
                f'pin asset readiness: proxy={status} content_type={asset_headers.get("content-type")} '
                f'bytes={len(raw)} '
                f'stub={direct_status} content_type={direct_headers.get("content-type")} bytes={len(direct_raw)} '
                f'stub_arrivals={hits}; nginx_error_tail={summary}'
            )
        return chats, identity, password

    def restart_native(
        self,
        old_stub: int,
        old_backend: int,
        stub_cmd: list[str],
        backend_cmd: list[str],
        stub_env: dict,
        backend_env: dict,
    ) -> dict:
        for pid in (old_backend, old_stub):
            if pid not in self.owned:
                fail('refusing to restart a process not owned by this harness')
            kill_tree(pid)
            self.owned.remove(pid)
        new_stub = self.start_owned(
            stub_cmd,
            stub_env,
            f'http://127.0.0.1:{self.stub_port}/internal/describe/running',
            self.scratch / 'stub-restart.log',
        )
        new_backend = self.start_owned(
            backend_cmd,
            backend_env,
            f'http://127.0.0.1:{self.backend_port}/health',
            self.scratch / 'backend-restart.log',
            timeout=180,
        )
        if new_stub == old_stub or new_backend == old_backend:
            fail('native restart did not change the owned service identity')
        return {
            'stub': {'old_pid': old_stub, 'new_pid': new_stub},
            'backend': {'old_pid': old_backend, 'new_pid': new_backend},
            'record_offset': self.record.stat().st_size,
        }

    def run(self) -> int:
        try:
            return self.run_stack()
        except Exception:
            if self.scratch:
                evidence = self.root / '.run/ui-evidence' / self.scratch.name
                evidence.mkdir(parents=True, exist_ok=True)
                self.retain_failed_cases(evidence / 'test-results')
                for name in ('stub', 'backend', 'stub-restart', 'backend-restart', 'vite', 'proxy', 'drawio-prepare'):
                    source = self.scratch / f'{name}.log'
                    if source.is_file():
                        data = source.read_text(encoding='utf-8', errors='replace')
                        data = redact(data, self.secrets)
                        (evidence / f'{name}.log').write_text(data, encoding='utf-8')
                log.error('workspace failure logs: %s', evidence)
            raise

    def retain_failed_cases(self, destination: Path) -> None:
        """Best-effort copy of failed cases' screenshots and redacted text; traces stay private."""
        results = self.scratch / 'test-results'
        cases = sorted(path for path in results.iterdir() if path.is_dir()) if results.is_dir() else []
        for case in cases:
            screenshots = sorted(case.glob('test-failed-*.png'))
            texts = [case / name for name in ('error-context.md', 'wire-rows.json') if (case / name).is_file()]
            if not screenshots and not (case / 'error-context.md').is_file():
                continue
            # Destination names come only from this listing; trace.zip is never selected.
            target = destination / case.name
            for source in [*screenshots, *texts]:
                try:
                    target.mkdir(parents=True, exist_ok=True)
                    if source.suffix == '.png':
                        shutil.copyfile(source, target / source.name)
                    else:
                        text = redact(source.read_text(encoding='utf-8'), self.secrets)
                        (target / source.name).write_text(text, encoding='utf-8')
                except Exception as error:
                    # The original browser failure is re-raised by run(); one bad file must not mask it.
                    log.error(
                        'workspace failure evidence not retained: %s/%s (%s)',
                        case.name,
                        source.name,
                        type(error).__name__,
                    )

    def verify_test_discovery(self, browser_env: dict[str, str]) -> None:
        listing = subprocess.run(
            [
                str(self.root / 'node_modules/.bin/playwright'),
                'test',
                '--config',
                'playwright.ocu.config.ts',
                '--list',
                *self.spec_args,
                *self.grep_args,
            ],
            cwd=self.root,
            env=browser_env,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        sys.stdout.write(redact(listing.stdout, self.secrets))
        sys.stderr.write(redact(listing.stderr, self.secrets))
        if listing.returncode:
            fail(f'configured Playwright test discovery failed ({listing.returncode})')
        discovered = set(
            re.findall(
                r'(?m)^\s*(?:\[.*?\]\s+›\s+)?(?:.*[/\\])?(ocu-[\w-]+\.e2e\.ts):\d+:\d+\s+›\s+\S',
                listing.stdout,
            )
        )
        for spec in self.specs:
            if spec not in discovered:
                fail(f'required Playwright spec contributes no tests: {spec}')

    def run_stack(self) -> int:
        require_tools()
        if not shutil.which('uv'):
            fail('missing prerequisite: uv')
        for name in ('vite', 'playwright'):
            if not (self.root / 'node_modules/.bin' / name).is_file():
                fail(f'missing prerequisite: npm ci ({name})')
        self.pin_sha = self.pin()
        checkout = self.checkout_path()
        self.verify_checkout(checkout, self.pin_sha)
        (self.root / '.run/data').mkdir(parents=True, exist_ok=True)
        self.scratch = Path(tempfile.mkdtemp(prefix='workspace-ui-', dir=self.root / '.run'))
        self.data_dir = Path(tempfile.mkdtemp(prefix='workspace-ui-', dir=self.root / '.run/data'))
        self.fixtures = self.scratch / 'fixtures.json'
        self.fixtures.write_text('{}', encoding='utf-8')
        self.record = self.scratch / 'stub.jsonl'
        self.token = 'Tok!' + secrets.token_hex(12) + '#$%'
        self.secrets.append(self.token)
        (self.stub_port, self.backend_port, self.frontend_port, self.proxy_port, self.office_port) = distinct_ports(5)
        self.origin = f'http://127.0.0.1:{self.proxy_port}'
        self.webui = f'http://127.0.0.1:{self.frontend_port}'
        self.stage = self.scratch / 'ocu'
        static_paths = tuple(
            line
            for line in git_run(
                [
                    'git',
                    '-C',
                    str(checkout),
                    'ls-tree',
                    '-r',
                    '--name-only',
                    self.pin_sha,
                    '--',
                    'computer-use-server/static',
                ]
            ).stdout.splitlines()
            if line.startswith('computer-use-server/static/')
        )
        if not static_paths or 'computer-use-server/static/preview.js' not in static_paths:
            fail('pinned Office asset tree is missing')
        materialize_git_files(
            checkout,
            self.pin_sha,
            self.stage,
            (
                *PINNED_FILES,
                'computer-use-server/app.py',
                'computer-use-server/drawio/prepare_drawio.py',
                'computer-use-server/drawio/inventory.json',
                *static_paths,
            ),
        )
        self.prepare_drawio_assets()
        docx = self.scratch / 'valid.docx'
        docx.write_bytes(office_document())
        self.render(require_tools())
        env = {
            'PATH': os.environ.get('PATH', ''),
            'HOME': os.environ.get('HOME', ''),
            'OCU_INTERNAL_TOKEN': self.token,
            'OCU_PUBLIC_PREFIX': '/ocu',
            'OCU_STUB_PORT': str(self.stub_port),
            'OCU_STUB_RECORD': str(self.record),
            'OCU_STUB_FIXTURES': str(self.fixtures),
            'OCU_STUB_ASSETS': str(self.stage / 'computer-use-server/static'),
            'OCU_STUB_DOCX': str(docx),
        }
        stub_cmd = [self.python, str(self.root / 'scripts/ocu-stub.py')]
        old_stub = self.start_owned(
            stub_cmd,
            env,
            f'http://127.0.0.1:{self.stub_port}/internal/describe/running',
            self.scratch / 'stub.log',
        )
        service_env = {
            'PATH': os.environ.get('PATH', ''),
            'HOME': os.environ.get('HOME', ''),
            'TMPDIR': os.environ.get('TMPDIR', '/tmp'),
            'BACKEND_PORT': str(self.backend_port),
            'FRONTEND_PORT': str(self.frontend_port),
            'DATA_DIR': str(self.data_dir),
            'WEBUI_SECRET_KEY': secrets.token_urlsafe(32),
            'FRONTEND_BUILD_DIR': str(self.scratch / 'frontend-build'),
            'STATIC_DIR': str(self.scratch / 'backend-static'),
            'FONTS_DIR': str(self.scratch / 'backend-static/fonts'),
            'OCU_INTERNAL_URL': f'http://127.0.0.1:{self.stub_port}',
            'OCU_INTERNAL_TOKEN': self.token,
            'WEBUI_BACKEND_URL': f'http://127.0.0.1:{self.backend_port}',
            'ENABLE_OCU_WORKSPACE': 'true',
            'ENABLE_OCU_OFFICE_EDIT': 'true',
            'CORS_ALLOW_ORIGIN': self.origin,
            'OCU_UI_PROXY_HARNESS': 'true',
            'OCU_UI_SVELTEKIT_OUT_DIR': str(self.scratch / 'svelte-kit'),
            'OCU_UI_VITE_CACHE_DIR': str(self.scratch / 'vite-cache'),
            'UV_NO_SYNC': '1',
        }
        self.secrets.append(service_env['WEBUI_SECRET_KEY'])
        relay_harness_env(run(['bash', str(self.root / 'scripts/dev-bg.sh'), 'stage'], env=service_env))
        backend_cmd = [
            'bash',
            '-c',
            'source scripts/dev-env.sh && cd backend && exec uv run --no-sync --quiet '
            'uvicorn open_webui.main:app --host 127.0.0.1 --port "$BACKEND_PORT"',
        ]
        old_backend = self.start_owned(
            backend_cmd,
            service_env,
            f'http://127.0.0.1:{self.backend_port}/health',
            self.scratch / 'backend.log',
            timeout=180,
        )
        self.start_owned(
            [
                str(self.root / 'node_modules/.bin/vite'),
                'dev',
                '--host',
                '127.0.0.1',
                '--port',
                str(self.frontend_port),
                '--strictPort',
            ],
            service_env,
            self.webui + '/',
            self.scratch / 'vite.log',
            timeout=60,
        )
        self.start_owned(
            ['bash', str(self.root / 'scripts/proxy-dev.sh')],
            {'PATH': os.environ.get('PATH', ''), 'HOME': os.environ.get('HOME', ''), 'OCU_CHECKOUT': str(self.stage)},
            None,
            self.scratch / 'proxy.log',
        )
        wait_http(self.origin + '/', self.owned[-1], timeout=20)
        chats, identity, password = self.provision()
        restart = self.restart_native(old_stub, old_backend, stub_cmd, backend_cmd, env, service_env)
        mint_config = self.scratch / 'mint-config.json'
        credentials = self.scratch / 'mint-credentials.jsonl'
        fd = os.open(mint_config, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(
                {
                    'root': str(self.root),
                    'scratch': str(self.scratch),
                    'owner_id': self.owner_id,
                    'service_env': service_env,
                    'credentials': str(credentials),
                },
                stream,
            )
        context = self.scratch / 'browser.json'
        context.write_text(
            json.dumps(
                {
                    'origin': self.origin,
                    'chats': chats,
                    'fixtures': str(self.fixtures),
                    'record': str(self.record),
                    'restart': restart,
                    'mint': {'python': self.python, 'config': str(mint_config)},
                }
            ),
            encoding='utf-8',
        )
        browser_env = {
            'PATH': os.environ.get('PATH', ''),
            'HOME': os.environ.get('HOME', ''),
            'BASE_URL': self.origin,
            'OCU_E2E_CONTEXT': str(context),
            'OCU_E2E_EMAIL': identity,
            'OCU_E2E_PASSWORD': password,
            **self.spec_env,
        }
        self.verify_test_discovery(browser_env)
        # Reporter output and automatic traces stay private until credential redaction.
        output_fd = os.open(self.scratch / 'browser-output.log', os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(output_fd, 'w+', encoding='utf-8') as output:
            browser = subprocess.Popen(
                [
                    str(self.root / 'node_modules/.bin/playwright'),
                    'test',
                    '--config',
                    'playwright.ocu.config.ts',
                    '--output',
                    str(self.scratch / 'test-results'),
                    *self.spec_args,
                    *self.repeat_args,
                    *self.grep_args,
                ],
                cwd=self.root,
                env=browser_env,
                stdout=output,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            self.owned.append(browser.pid)
            # 600 s per repetition: unchanged on the default path (repeat_count is 1 there).
            browser_timeout = 600 * self.repeat_count
            try:
                code = browser.wait(timeout=browser_timeout)
            except subprocess.TimeoutExpired:
                fail(f'workspace browser verification exceeded {browser_timeout} seconds')
            finally:
                # Retire every inherited mint before consuming credentials or releasing private assets.
                kill_tree(browser.pid)
                browser.wait()
                self.owned.remove(browser.pid)
                if credentials.exists():
                    self.secrets.extend(json.loads(line) for line in credentials.read_text().splitlines())
                output.seek(0)
                sys.stdout.write(redact(output.read(), self.secrets))
        if code:
            fail(f'workspace browser verification failed ({code})')
        log.info('verify-ui-ocu: all required browser cases completed')
        return 0


def main() -> int:
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    try:
        selection = repeat_selection()
    except Fail as cop:
        log.error('verify-ui-ocu: %s', cop)
        return 1
    alarm = harness_alarm(selection[1] if selection else 1)
    signal.signal(signal.SIGALRM, lambda _signum, _frame: fail(f'workspace harness exceeded {alarm} seconds'))
    signal.alarm(alarm)
    try:
        return run_owned_lifecycle(BrowserHarness(selection), log)
    finally:
        signal.alarm(0)


if __name__ == '__main__':
    raise SystemExit(mint_browser_session() if sys.argv[1:] == ['--mint-session'] else main())
