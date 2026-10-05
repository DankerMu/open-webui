#!/usr/bin/env python3
"""Run the real mounted Files UI through an owned, pinned, isolated gateway stack."""

from __future__ import annotations

import importlib.util
import io
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
import zipfile
from pathlib import Path

from ocu_stub_office import OFFICE_SCENARIOS
from smoke_proxy_support import (
    fail,
    free_port,
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
    'ocu-controls.e2e.ts',
    'ocu-reconciliation.e2e.ts',
    'ocu-drawio.e2e.ts',
    'ocu-tree.e2e.ts',
    'ocu-office.e2e.ts',
)


def office_document() -> bytes:
    """A small valid DOCX, with visible content independently checked in the browser."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            '[Content_Types].xml',
            """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml"
 ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>""",
        )
        archive.writestr(
            '_rels/.rels',
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1"
 Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
 Target="word/document.xml"/>
</Relationships>""",
        )
        archive.writestr(
            'word/document.xml',
            """<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Verified Office document</w:t></w:r></w:p></w:body></w:document>""",
        )
    return buffer.getvalue()


class BrowserHarness(Smoke):
    def __init__(self) -> None:
        super().__init__()
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
                for name in ('stub', 'backend', 'stub-restart', 'backend-restart', 'vite', 'proxy', 'drawio-prepare'):
                    source = self.scratch / f'{name}.log'
                    if source.is_file():
                        data = source.read_text(encoding='utf-8', errors='replace')
                        if self.token:
                            data = data.replace(self.token, '[redacted]')
                        (evidence / f'{name}.log').write_text(data, encoding='utf-8')
                log.error('workspace failure logs: %s', evidence)
            raise

    def verify_test_discovery(self, browser_env: dict[str, str]) -> None:
        listing = subprocess.run(
            [str(self.root / 'node_modules/.bin/playwright'), 'test', '--config', 'playwright.ocu.config.ts', '--list'],
            cwd=self.root,
            env=browser_env,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        sys.stdout.write(listing.stdout)
        sys.stderr.write(listing.stderr)
        if listing.returncode:
            fail(f'configured Playwright test discovery failed ({listing.returncode})')
        discovered = set(
            re.findall(
                r'(?m)^\s*(?:\[.*?\]\s+›\s+)?(?:.*[/\\])?(ocu-[\w-]+\.e2e\.ts):\d+:\d+\s+›\s+\S',
                listing.stdout,
            )
        )
        for spec in REQUIRED_SPECS:
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
        ports = []
        while len(ports) < 4:
            port = free_port()
            if port not in ports:
                ports.append(port)
        self.stub_port, self.backend_port, self.frontend_port, self.proxy_port = ports
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
            'UV_NO_SYNC': '1',
        }
        run(['bash', str(self.root / 'scripts/dev-bg.sh'), 'stage'], env=service_env)
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
        context = self.scratch / 'browser.json'
        context.write_text(
            json.dumps(
                {
                    'origin': self.origin,
                    'chats': chats,
                    'fixtures': str(self.fixtures),
                    'record': str(self.record),
                    'restart': restart,
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
        }
        self.verify_test_discovery(browser_env)
        browser = subprocess.Popen(
            [str(self.root / 'node_modules/.bin/playwright'), 'test', '--config', 'playwright.ocu.config.ts'],
            cwd=self.root,
            env=browser_env,
            start_new_session=True,
        )
        self.owned.append(browser.pid)
        try:
            code = browser.wait(timeout=600)
        except subprocess.TimeoutExpired:
            fail('workspace browser verification exceeded 600 seconds')
        finally:
            if browser.poll() is not None:
                self.owned.remove(browser.pid)
                kill_tree(browser.pid)
        if code:
            fail(f'workspace browser verification failed ({code})')
        log.info('verify-ui-ocu: all required browser cases completed')
        return 0


def main() -> int:
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    signal.signal(signal.SIGALRM, lambda _signum, _frame: fail('workspace harness exceeded 1500 seconds'))
    signal.alarm(1500)
    try:
        return run_owned_lifecycle(BrowserHarness(), log)
    finally:
        signal.alarm(0)


if __name__ == '__main__':
    raise SystemExit(main())
