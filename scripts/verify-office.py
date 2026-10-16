#!/usr/bin/env python3
"""Owned, local three-format verification through the pinned production broker.

Installed prerequisites (this command never installs packages or pulls images):
  - Python document environment with python-docx, openpyxl, python-pptx,
    Pillow, pypdf, fontTools and lxml.
  - Broker Python 3.12 with the pinned OCU requirements installed.
  - Node, this checkout's Playwright package and its matching installed Chromium.
  - LibreOffice headless, a running Linux Docker engine and the exact locally
    loaded qualified DocumentServer image selected from the pinned OCU source.
  - Git and an OCU checkout containing constraints.yaml's exact pinned commit.

Executable settings:
  OFFICE_PYTHON         Launcher-only document interpreter; defaults to
                       this checkout's .venv/bin/python.
  OFFICE_BROKER_PYTHON  Broker interpreter; defaults to .venv/bin/python.
                       Set explicitly when using a separate broker environment.
  OFFICE_NODE          Node executable; defaults to node on PATH.
  OFFICE_DOCKER        Docker executable; defaults to docker on PATH.
  OFFICE_SOFFICE       LibreOffice executable; defaults to soffice/libreoffice
                       on PATH, then the conventional macOS application bundle.
  OCU_CHECKOUT         Pinned-source repository; defaults to the sibling
                       open-computer-use directory.
  OFFICE_ARGS          Arguments forwarded by make verify-office.

Existing Docker connection settings are honored; DOCKER_SOCKET can override
the broker socket, otherwise DOCKER_HOST or the active Docker context is used.
--generate-samples requires a NEW destination directory and starts no services.
--check-document reads a synthetic published file without starting services.
"""

import argparse
import hashlib
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
import uuid
from pathlib import Path
from urllib.request import Request, urlopen

from smoke_proxy_support import Fail, distinct_ports, git_blob, git_run, kill_tree, materialize_git_files
from verify_office_documentserver import wait_documentserver_ready
from verify_office_processes import OwnedProcesses, defer_interrupts, wait_ready

QUALIFIED_IMAGE_PATH = 'deploy/documentserver-qualified.json'
ROOT = Path(__file__).resolve().parent.parent
log = logging.getLogger('verify-office')


def child_environment():
    env = {'PYTHON_DOTENV_DISABLED': '1', 'PYTHONUNBUFFERED': '1'}
    for key in (
        'PATH',
        'HOME',
        'TMPDIR',
        'LANG',
        'LC_ALL',
        'DOCKER_HOST',
        'DOCKER_CONTEXT',
        'DOCKER_CONFIG',
        'DOCKER_TLS_VERIFY',
        'DOCKER_CERT_PATH',
        'PLAYWRIGHT_BROWSERS_PATH',
    ):
        if key in os.environ:
            env[key] = os.environ[key]
    return env


def executable(setting, default, label=None):
    selected = os.environ.get(setting, default)
    found = shutil.which(selected)
    if found is None:
        raise Fail(f'missing prerequisite: {label or setting} ({selected})')
    return str(Path(found).absolute())


def probe(argv, label):
    process = None
    try:
        with defer_interrupts() as previous:
            process = subprocess.Popen(
                argv,
                cwd=ROOT,
                env=child_environment(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                start_new_session=True,
                preexec_fn=lambda: signal.pthread_sigmask(signal.SIG_SETMASK, previous),
            )
        output, _ = process.communicate(timeout=30)
        if process.returncode:
            raise Fail(f'missing prerequisite: {label}')
        return output
    except (OSError, subprocess.TimeoutExpired):
        raise Fail(f'missing prerequisite: {label}') from None
    finally:
        if process is not None:
            with defer_interrupts():
                kill_tree(process.pid)


def reader_preflight():
    for module in ('docx', 'openpyxl', 'pptx', 'PIL', 'pypdf', 'fontTools'):
        try:
            __import__(module)
        except ImportError:
            raise Fail(f'missing prerequisite: Office Python reader {module}') from None


def tool_preflight():
    tools = {
        key: executable(key, default)
        for key, default in (
            ('OFFICE_DOCKER', 'docker'),
            ('OFFICE_NODE', 'node'),
            ('OFFICE_BROKER_PYTHON', str(ROOT / '.venv/bin/python')),
        )
    }
    default_lo = shutil.which('soffice') or shutil.which('libreoffice')
    if not default_lo and Path('/Applications/LibreOffice.app/Contents/MacOS/soffice').is_file():
        default_lo = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    tools['OFFICE_SOFFICE'] = executable('OFFICE_SOFFICE', default_lo or 'soffice', 'LibreOffice')
    probe([tools['OFFICE_SOFFICE'], '--version'], 'LibreOffice')
    if not (ROOT / 'node_modules/@playwright/test').is_dir():
        raise Fail('missing prerequisite: installed Playwright package')
    tools['CHROMIUM'] = probe(
        [
            tools['OFFICE_NODE'],
            '-e',
            "const {chromium}=require('@playwright/test');const fs=require('fs');"
            'const path=chromium.executablePath();if(!fs.existsSync(path))process.exit(1);'
            'console.log(path)',
        ],
        'installed Chromium',
    ).strip()
    probe(
        [
            tools['OFFICE_BROKER_PYTHON'],
            '-c',
            'import sys; assert sys.version_info[:2] == (3,12); '
            'import fastapi,uvicorn,aiohttp,mcp,docker,requests,multipart',
        ],
        'broker Python 3.12 dependencies',
    )
    return tools


def source_preflight(tools):
    text = (ROOT / 'constraints.yaml').read_text()
    match = re.search(r'(?m)^ocu_checkout:\n(?:  .*\n)*?  sha:\s*"([0-9a-f]{40})"', text)
    if not match:
        raise Fail('pinned source: constraints.yaml lacks full OCU SHA')
    sha = match.group(1)
    checkout = Path(os.environ.get('OCU_CHECKOUT', str(ROOT.parent / 'open-computer-use'))).resolve()
    if not checkout.is_dir():
        raise Fail('missing prerequisite: OCU checkout')
    if git_run(['git', '-C', str(checkout), 'cat-file', '-t', sha]).stdout.strip() != 'commit':
        raise Fail('pinned source: OCU SHA is not a commit')
    paths = tuple(
        git_run(
            ['git', '-C', str(checkout), 'ls-tree', '-r', '--name-only', sha, '--', 'computer-use-server']
        ).stdout.splitlines()
    )
    for required in (
        'computer-use-server/app.py',
        'computer-use-server/office/sessions.py',
        'computer-use-server/static/office-editor.js',
        'computer-use-server/requirements.txt',
    ):
        if required not in paths:
            raise Fail(f'pinned source: missing {required}')
    requirements = git_blob(checkout, sha, 'computer-use-server/requirements.txt').decode()
    probe(
        [
            tools['OFFICE_BROKER_PYTHON'],
            '-c',
            'import sys; from importlib.metadata import version; from packaging.requirements import Requirement; '
            'requirements=[Requirement(line) for line in sys.argv[1].splitlines() '
            'if line.strip() and not line.lstrip().startswith("#")]; '
            'assert all(version(item.name) in item.specifier for item in requirements)',
            requirements,
        ],
        'broker pinned dependency versions',
    )
    return {'checkout': checkout, 'sha': sha, 'paths': paths}


def select_platform(engine):
    aliases = {'aarch64': 'arm64', 'arm64': 'arm64', 'x86_64': 'amd64', 'amd64': 'amd64'}
    architecture = aliases.get(engine['architecture'])
    if engine['os'] != 'linux' or architecture is None:
        raise Fail('B1 DocumentServer image: unsupported Docker engine Linux platform')
    return 'linux/' + architecture


def validate_qualified_platform_record(platform, record):
    if (
        not isinstance(record, dict)
        or not {'reference', 'configuration_digest'} <= set(record)
        or not set(record) <= {'reference', 'configuration_digest', 'platform_manifest_digest'}
    ):
        raise Fail(f'DocumentServer qualification: invalid {platform} identity schema')
    for field in ('configuration_digest', 'platform_manifest_digest'):
        if field in record and (
            not isinstance(record[field], str) or not re.fullmatch(r'sha256:[0-9a-f]{64}', record[field])
        ):
            raise Fail(f'DocumentServer qualification: invalid {platform} {field}')
    if record['reference'] != 'ocu-documentserver:' + record['configuration_digest'][7:]:
        raise Fail(f'DocumentServer qualification: invalid {platform} content reference')
    if record.get('platform_manifest_digest') == record['configuration_digest']:
        raise Fail('DocumentServer qualification: configuration and manifest identities must differ')


def qualified_images(source):
    try:
        declaration = json.loads(git_blob(source['checkout'], source['sha'], QUALIFIED_IMAGE_PATH))
    except (ValueError, UnicodeError) as exc:
        raise Fail('DocumentServer qualification: invalid JSON declaration') from exc
    if (
        not isinstance(declaration, dict)
        or set(declaration) != {'schema_version', 'recipe_tree', 'platforms'}
        or type(declaration['schema_version']) is not int
        or declaration['schema_version'] != 1
        or not isinstance(declaration['recipe_tree'], str)
        or not re.fullmatch(r'[0-9a-f]{40}', declaration['recipe_tree'])
    ):
        raise Fail('DocumentServer qualification: invalid declaration schema')
    tree = git_run(
        [
            'git',
            '-C',
            str(source['checkout']),
            'rev-parse',
            f'{source["sha"]}:deploy/documentserver',
        ]
    ).stdout.strip()
    kind = git_run(['git', '-C', str(source['checkout']), 'cat-file', '-t', tree]).stdout.strip()
    if kind != 'tree' or tree != declaration['recipe_tree']:
        raise Fail('DocumentServer qualification: stale or invalid recipe tree')
    platforms = declaration['platforms']
    if not isinstance(platforms, dict) or not platforms or not set(platforms) <= {'linux/amd64', 'linux/arm64'}:
        raise Fail('DocumentServer qualification: invalid platform map')
    for platform, record in platforms.items():
        validate_qualified_platform_record(platform, record)
    return platforms


def image_preflight(tools, source):
    platforms = qualified_images(source)
    engine = json.loads(
        probe(
            [
                tools['OFFICE_DOCKER'],
                'info',
                '--format',
                '{"os":{{json .OSType}},"architecture":{{json .Architecture}}}',
            ],
            'Docker daemon',
        )
    )
    platform = select_platform(engine)
    if platform not in platforms:
        raise Fail(f'DocumentServer qualification: missing {platform} output')
    qualified = platforms[platform]
    architecture = platform.split('/')[1]
    image = json.loads(
        probe(
            [tools['OFFICE_DOCKER'], 'image', 'inspect', '--platform', platform, qualified['reference']],
            f'B1 DocumentServer image ({platform})',
        )
    )[0]
    if image.get('Os') != 'linux' or image.get('Architecture') != architecture:
        raise Fail('B1 DocumentServer image: selected image does not match Docker engine platform')
    identities = {qualified['configuration_digest'], qualified.get('platform_manifest_digest')}
    if not isinstance(image.get('Id'), str) or image['Id'] not in identities:
        raise Fail('B1 DocumentServer image: local identity differs from qualified configuration/platform manifest')
    return {
        'image': image,
        'platform': platform,
        'image_reference': qualified['reference'],
        'image_identity': image['Id'],
        'image_qualification': qualified,
    }


def preflight() -> dict:
    reader_preflight()
    tools = tool_preflight()
    source = source_preflight(tools)
    return dict(tools, **source, **image_preflight(tools, source))


class OfficeRun:
    def __init__(self, inputs):
        self.inputs = inputs
        self.run_id = 'office-' + uuid.uuid4().hex
        self.scratch = None
        self.processes = None
        self.container = None
        self.container_name = self.run_id + '-documentserver'
        self.volumes = []
        self.baseline = None
        self.credentials = []
        self.retired = False
        self.env = child_environment()

    def docker(self, *args, timeout=60):
        return self.processes.command(
            [self.inputs['OFFICE_DOCKER'], *args], env=self.env, label='Docker', timeout=timeout
        )

    def inventory(self):
        inventory = {
            kind: sorted(set(self.docker(*args).splitlines()))
            for kind, args in {
                'containers': ('ps', '-aq', '--no-trunc'),
                'volumes': ('volume', 'ls', '-q'),
                'networks': ('network', 'ls', '-q', '--no-trunc'),
                'images': ('image', 'ls', '-q', '--no-trunc'),
            }.items()
        }
        # Inspect state only: pre-existing container environment can contain operator secrets.
        inventory['container_states'] = {
            identifier: json.loads(self.docker('inspect', '--format', '{{json .State}}', identifier))
            for identifier in inventory['containers']
        }
        for state in inventory['container_states'].values():
            state.pop('Health', None)
        return inventory

    def api(self, method, path, body=None):
        request = Request(
            self.origin + path, method=method, data=body, headers={'Authorization': 'Bearer ' + self.token}
        )
        with urlopen(request, timeout=30) as response:
            return json.load(response)

    def prepare(self):
        from verify_office_libreoffice import LibreOffice
        from verify_office_samples import generate_samples

        (ROOT / '.run').mkdir(exist_ok=True)
        self.scratch = Path(tempfile.mkdtemp(prefix=self.run_id + '-', dir=ROOT / '.run'))
        os.chmod(self.scratch, 0o700)
        self.processes = OwnedProcesses(self.scratch)
        self.env.update(HOME=str(self.scratch / 'home'), TMPDIR=str(self.scratch / 'tmp'))
        for name in ('home', 'tmp'):
            (self.scratch / name).mkdir()
        self.env['DOCKER_CONFIG'] = os.environ.get('DOCKER_CONFIG', str(Path.home() / '.docker'))
        self.baseline = self.inventory()
        (self.scratch / 'resources-before.json').write_text(json.dumps(self.baseline, indent=2))
        self.stage = self.scratch / 'ocu'
        materialize_git_files(self.inputs['checkout'], self.inputs['sha'], self.stage, self.inputs['paths'])
        self.samples = generate_samples(self.scratch / 'samples')
        self.lo = LibreOffice(self.inputs['OFFICE_SOFFICE'], self.scratch / 'libreoffice', self.processes, self.env)
        self.before = {kind: self.lo.observe(path, 'before') for kind, path in self.samples.items()}

    def start_documentserver(self):
        self.ds_port, self.broker_port = distinct_ports(2)
        self.origin = f'http://127.0.0.1:{self.broker_port}'
        self.ds_origin = f'http://127.0.0.1:{self.ds_port}'
        self.token, self.jwt = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        self.credentials = [self.token, self.jwt]
        env_file = self.scratch / 'documentserver.env'
        env_file.write_text(
            'JWT_ENABLED=true\nJWT_SECRET=' + self.jwt + '\n'
            'ALLOW_PRIVATE_IP_ADDRESS=true\nALLOW_META_IP_ADDRESS=false\n'
        )
        os.chmod(env_file, 0o600)
        (self.scratch / 'container-ownership.json').write_text(
            json.dumps(
                {
                    'name': self.container_name,
                    'label': self.run_id,
                    'image': self.inputs['image_identity'],
                    'platform': self.inputs['platform'],
                }
            )
        )
        with defer_interrupts():
            self.container = self.docker(
                'create',
                '--pull=never',
                '--platform=' + self.inputs['platform'],
                '--name',
                self.container_name,
                '--label',
                'ocu.verify-office=' + self.run_id,
                '--cpus=4',
                '--memory=6g',
                '--shm-size=1g',
                '--add-host=host.docker.internal:host-gateway',
                '-p',
                f'127.0.0.1:{self.ds_port}:80',
                '--env-file',
                str(env_file),
                self.inputs['image_identity'],
                timeout=120,
            ).strip()
        details = json.loads(self.docker('inspect', self.container))[0]
        if details['Config']['Labels'].get('ocu.verify-office') != self.run_id:
            raise Fail('Docker ownership: label mismatch')
        self.volumes = [mount['Name'] for mount in details['Mounts'] if mount['Type'] == 'volume']
        self.docker('start', self.container)
        wait_documentserver_ready(self.ds_origin, self.container, self.docker)

    def broker_socket(self):
        if 'DOCKER_SOCKET' in os.environ:
            return os.environ['DOCKER_SOCKET']
        if os.environ.get('DOCKER_HOST'):
            return os.environ['DOCKER_HOST']
        context = json.loads(self.docker('context', 'inspect'))[0]
        return context['Endpoints']['docker']['Host']

    def start_broker(self):
        data = self.scratch / 'data'
        self.chat = str(uuid.uuid4())
        self.outputs = data / self.chat / 'outputs'
        self.outputs.mkdir(parents=True)
        for path in self.samples.values():
            shutil.copyfile(path, self.outputs / path.name)
        broker_env = dict(
            self.env,
            BASE_DATA_DIR=str(data),
            SKILLS_CACHE_DIR=str(self.scratch / 'skills'),
            OCU_INTERNAL_TOKEN=self.token,
            OCU_OFFICE_JWT_SECRET=self.jwt,
            OCU_OFFICE_DOCSERVER_URL=self.ds_origin,
            OCU_OFFICE_DOCSERVER_ORIGIN=self.ds_origin,
            OCU_OFFICE_SELF_URL=f'http://host.docker.internal:{self.broker_port}',
            DOCKER_SOCKET=self.broker_socket(),
        )
        process, _ = self.processes.start(
            [
                self.inputs['OFFICE_BROKER_PYTHON'],
                '-m',
                'uvicorn',
                'app:app',
                '--host',
                '127.0.0.1',
                '--port',
                str(self.broker_port),
                '--no-access-log',
                '--no-proxy-headers',
            ],
            cwd=self.stage / 'computer-use-server',
            env=broker_env,
            label='broker',
        )
        wait_ready(self.origin + '/health', process)
        try:
            self.docker(
                'exec',
                self.container,
                'curl',
                '--silent',
                '--show-error',
                '--fail',
                '--max-time',
                '10',
                f'http://host.docker.internal:{self.broker_port}/health',
            )
        except Fail:
            raise Fail('DocumentServer source/callback reachability: container-to-host HTTP probe failed') from None

    def register_files(self):
        records = self.api('GET', f'/api/outputs/{self.chat}').get('files', [])
        files = {}
        for kind, path in self.samples.items():
            found = [record for record in records if record['name'] == path.name]
            if len(found) != 1:
                raise Fail(f'{kind.upper()} registration: output identity missing')
            files[kind] = found[0]
        return files

    def browser_roundtrip(self):
        _, endpoint = self.processes.start_chromium(
            self.inputs['CHROMIUM'],
            env=self.env,
            credentials=self.credentials,
        )
        config = self.scratch / 'browser-config.json'
        result = self.scratch / 'browser-result.json'
        config.write_text(
            json.dumps(
                dict(
                    origin=self.origin,
                    document_server_origin=self.ds_origin,
                    token=self.token,
                    chat=self.chat,
                    files=self.register_files(),
                    cdp_endpoint=endpoint,
                    result=str(result),
                )
            )
        )
        os.chmod(config, 0o600)
        try:
            self.processes.command(
                [self.inputs['OFFICE_NODE'], str(ROOT / 'scripts/verify-office-browser.mjs'), str(config)],
                env=self.env,
                timeout=900,
                label='browser',
            )
        except Fail:
            browser_logs = sorted(self.scratch.glob('*-browser.log'))
            if browser_logs:
                for diagnostic in browser_logs[-1].read_text().splitlines():
                    if re.fullmatch(r'(DOCX|XLSX|PPTX|browser) [A-Za-z ]+: real browser operation failed', diagnostic):
                        raise Fail(diagnostic) from None
            raise
        browser = json.loads(result.read_text())
        if [row['format'] for row in browser] != ['DOCX', 'XLSX', 'PPTX']:
            raise Fail('browser round trip: incomplete supported format set')
        return browser

    def judge_publications(self):
        from verify_office_documents import judge_document

        fidelity = {}
        judged = {}
        published = self.scratch / 'published'
        published.mkdir()
        for kind, sample in self.samples.items():
            source = self.outputs / sample.name
            if hashlib.sha256(source.read_bytes()).digest() == hashlib.sha256(sample.read_bytes()).digest():
                raise Fail(f'{kind.upper()} publication: workspace bytes unchanged')
            artifact = published / sample.name
            shutil.copyfile(source, artifact)
            judged[kind] = judge_document(artifact)
            after = self.lo.observe(artifact, 'after')
            fidelity[kind] = dict(
                before=self.before[kind],
                after=after,
                page_delta=after['page_count'] - self.before[kind]['page_count'],
                published_declaration_change={
                    'before': self.before[kind]['declared_font_policy']['font'],
                    'after': after['declared_font_policy']['font'],
                    'scope': 'OOXML declaration difference across publication, not a LibreOffice substitution',
                },
            )
            if kind == 'xlsx':
                judged[kind]['LibreOffice_reopened_values'] = self.lo.reopened_values(artifact)
        return fidelity, judged

    def write_observations(self, browser, fidelity, judged):
        record = self.scratch / 'fidelity.json'
        record.write_text(json.dumps(fidelity, ensure_ascii=False, indent=2) + '\n')
        (self.scratch / 'result.json').write_text(
            json.dumps(
                dict(
                    source_sha=self.inputs['sha'],
                    image=self.inputs['image_reference'],
                    image_qualification=self.inputs['image_qualification'],
                    image_platform=self.inputs['platform'],
                    engine_image_id=self.inputs['image']['Id'],
                    browser=browser,
                    documents=judged,
                    fidelity_record=str(record.relative_to(ROOT)),
                    verification_status='content-observed-cleanup-pending',
                ),
                indent=2,
            )
            + '\n'
        )
        for kind, observation in fidelity.items():
            log.info('%s content: %s', kind.upper(), ', '.join(judged[kind]['checks']))
            log.info('%s LibreOffice headless reopen: observed', kind.upper())
            log.info(
                '%s fidelity observation (LibreOffice): pages %s → %s; '
                'font substitutions before %s; after %s; declaration difference %s; not judged',
                kind.upper(),
                observation['before']['page_count'],
                observation['after']['page_count'],
                json.dumps(observation['before']['substitutions']),
                json.dumps(observation['after']['substitutions']),
                json.dumps(observation['published_declaration_change']),
            )
        log.info('Fidelity record: %s', record.relative_to(ROOT))

    def run(self):
        self.prepare()
        self.start_documentserver()
        self.start_broker()
        browser = self.browser_roundtrip()
        fidelity, judged = self.judge_publications()
        self.write_observations(browser, fidelity, judged)
        return 0

    def remove_container(self, identifier):
        details = json.loads(self.docker('inspect', identifier))[0]
        if details['Name'] != '/' + self.container_name:
            raise Fail('Docker cleanup: refusing unexpected owned name')
        if details['Config']['Labels'].get('ocu.verify-office') != self.run_id:
            raise Fail('Docker cleanup: refusing unowned label')
        mounts = [mount['Name'] for mount in details['Mounts'] if mount['Type'] == 'volume']
        if any(name in self.baseline['volumes'] for name in mounts):
            raise Fail('Docker cleanup: refusing pre-existing volume')
        self.volumes = sorted(set(self.volumes) | set(mounts))
        self.docker('rm', '-f', '-v', identifier, timeout=120)

    def assert_inventory(self, remaining):
        for kind in ('containers', 'volumes', 'networks', 'images'):
            if not set(self.baseline[kind]).issubset(remaining[kind]):
                raise Fail(f'Docker cleanup: pre-existing {kind} disappeared')
        for identifier, state in self.baseline['container_states'].items():
            if remaining['container_states'].get(identifier) != state:
                raise Fail('Docker cleanup: pre-existing container state changed')
        if self.container in remaining['containers'] or set(self.volumes) & set(remaining['volumes']):
            raise Fail('Docker cleanup: owned container or volume survived')
        if self.docker('ps', '-aq', '--filter', 'label=ocu.verify-office=' + self.run_id).strip():
            raise Fail('Docker cleanup: owned label survived')

    def retire_docker(self):
        if self.baseline is None:
            return None
        matches = self.docker(
            'ps',
            '-aq',
            '--no-trunc',
            '--filter',
            'label=ocu.verify-office=' + self.run_id,
        ).splitlines()
        errors = []
        for identifier in matches:
            try:
                self.remove_container(identifier)
            except Exception as exc:
                errors.append('container retirement: ' + type(exc).__name__)
        if errors:
            raise Fail('; '.join(errors))
        remaining = self.inventory()
        self.assert_inventory(remaining)
        return remaining

    def retire_processes(self, errors, label):
        try:
            self.processes.close()
        except Exception as exc:
            errors.append(label + ': ' + type(exc).__name__)

    def finalize_artifacts(self, remaining):
        for path in self.scratch.glob('*.log'):
            text = path.read_text(encoding='utf-8', errors='replace')
            for credential in self.credentials:
                text = text.replace(credential, '[redacted]')
            text = re.sub(r'/office/source/[^\s"<>]+', '/office/source/[redacted]', text)
            text = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[redacted-jwt]', text)
            text = re.sub(r'ws://127\.0\.0\.1:\d+/devtools/browser/[a-f0-9-]+', '[redacted-cdp]', text)
            path.write_text(text)
        for name in ('browser-config.json', 'documentserver.env'):
            (self.scratch / name).unlink(missing_ok=True)
        for name in ('ocu', 'data', 'home', 'tmp', 'skills', 'chromium-profile'):
            directory = self.scratch / name
            if directory.exists():
                shutil.rmtree(directory)
        (self.scratch / 'resources-after.json').write_text(json.dumps(remaining, indent=2))
        result_path = self.scratch / 'result.json'
        if result_path.exists():
            result = json.loads(result_path.read_text())
            result['cleanup_status'] = 'owned-resources-retired'
            result_path.write_text(json.dumps(result, indent=2) + '\n')

    def cleanup(self):
        if self.processes is None:
            return
        with defer_interrupts():
            errors = []
            self.retire_processes(errors, 'process retirement')
            remaining = None
            try:
                remaining = self.retire_docker()
            except Exception as exc:
                errors.append('Docker retirement: ' + type(exc).__name__)
            self.retire_processes(errors, 'cleanup command retirement')
            if errors:
                raise Fail('; '.join(errors))
            self.retired = True
            self.finalize_artifacts(remaining)


def document_command(args):
    if args.check_document:
        from verify_office_documents import judge_document

        sys.stdout.write(json.dumps(judge_document(args.check_document)) + '\n')
        return True
    if args.generate_samples:
        from verify_office_samples import generate_samples

        paths = generate_samples(args.generate_samples)
        sys.stdout.write(json.dumps({kind: str(path) for kind, path in paths.items()}) + '\n')
        return True
    return False


def report_failure(exc):
    if isinstance(exc, Fail) or type(exc).__name__ == 'DocumentCheckError':
        log.error('verify-office: %s', exc)
    else:
        log.error('verify-office: failed (%s); verification incomplete', type(exc).__name__)


def finish_runtime(runtime, code):
    if runtime is None:
        return code
    try:
        runtime.cleanup()
    except Exception as exc:
        log.error('verify-office: cleanup failed (%s); private artifacts retained', type(exc).__name__)
        return code or 1
    if code == 0:
        try:
            result_path = runtime.scratch / 'result.json'
            result = json.loads(result_path.read_text())
            result['verification_status'] = 'passed'
            result_path.write_text(json.dumps(result, indent=2) + '\n')
        except Exception as exc:
            log.error('verify-office: evidence finalization failed (%s)', type(exc).__name__)
            return 1
        log.info('verify-office: PASS DOCX XLSX PPTX; owned resources retired')
    return code


def main():
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            'DocumentServer must be installed locally and qualified by pinned OCU '
            f'{QUALIFIED_IMAGE_PATH}. No pull or build.'
        ),
    )
    parser.add_argument('--preflight', action='store_true', help='verify prerequisites without starting services')
    parser.add_argument('--check-document', type=Path, help='judge a synthetic published sample without services')
    parser.add_argument(
        '--generate-samples',
        type=Path,
        metavar='NEW_DIRECTORY',
        help='generate deterministic inputs in a new directory without services; existing paths are rejected',
    )
    args = parser.parse_args()
    runtime = None
    old_mask = os.umask(0o077)

    def interrupt(_signum, _frame):
        raise KeyboardInterrupt

    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP, signal.SIGALRM):
        signal.signal(sig, interrupt)
    signal.alarm(1200)
    code = 1
    try:
        if not document_command(args):
            inputs = preflight()
            if args.preflight:
                log.info('Office prerequisites available; no services started')
            else:
                runtime = OfficeRun(inputs)
                runtime.run()
        code = 0
    except KeyboardInterrupt:
        log.error('verify-office: interrupted or timed out')
        code = 130
    except Exception as exc:
        report_failure(exc)
    finally:
        signal.alarm(0)
        try:
            code = finish_runtime(runtime, code)
        finally:
            os.umask(old_mask)
    return code


if __name__ == '__main__':
    raise SystemExit(main())
