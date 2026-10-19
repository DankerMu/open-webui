"""Harness entry scripts anchor to their own checkout whatever the caller's CDPATH or PATH (#536)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]

# Records where the script really got to: argv and the cwd it was launched from.
# Exits with OBS_EXIT so smoke-stub stops at its first python3 call (the port
# probe) under `set -e`, before it would launch the real stub.
_STAND_IN = """
import json
import os
import sys

with open(os.environ['OBS_RECORD'], 'a', encoding='utf-8') as stream:
    stream.write(json.dumps({'argv': sys.argv, 'cwd': os.getcwd()}) + '\\n')
sys.exit(int(os.environ.get('OBS_EXIT', '0')))
"""


def _interpreters():
    found = {}
    for candidate in (shutil.which('bash'), '/bin/bash'):
        if candidate and os.path.exists(candidate):
            found.setdefault(os.path.realpath(candidate), candidate)
    return sorted(found.values())


INTERPRETERS = _interpreters()

# The Make form runs the whole caller-environment matrix.
CALLER_ENVIRONMENTS = ['no-cdpath', 'cdpath-dot', 'cdpath-foreign', 'restricted-path']
# Other invocation forms run once each, without CDPATH.
OTHER_FORMS = ['absolute-from-foreign', 'bare-name-from-scripts', 'dash-prefixed-checkout']


def stand_in(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'#!{sys.executable}\n' + _STAND_IN, encoding='utf-8')
    path.chmod(0o700)


def proxy_config(ocu_checkout):
    config = ocu_checkout / 'deploy' / 'proxy' / 'nginx.conf'
    config.parent.mkdir(parents=True)
    config.write_text('events {}\n', encoding='utf-8')
    return config


def populate(checkout, script):
    """A checkout holding a byte-copy of the script and the targets it reaches."""
    (checkout / 'scripts').mkdir(parents=True)
    shutil.copy2(ROOT / 'scripts' / script, checkout / 'scripts' / script)
    stand_in(checkout / '.venv' / 'bin' / 'python')
    proxy_config(checkout / 'ocu')
    proxy_config(checkout.parent / 'open-computer-use')


def binaries(tmp_path, interpreter):
    """Stand-ins plus the interpreter under test; no dirname, basename or caddy."""
    directory = tmp_path / 'bin'
    for name in ('python3', 'nginx'):
        stand_in(directory / name)
    (directory / 'bash').symlink_to(interpreter)
    (directory / 'env').symlink_to(shutil.which('env'))
    return directory


class Harness:
    def __init__(self, tmp_path, interpreter, script, checkout_name='checkout'):
        self.script = script
        self.checkout = tmp_path / checkout_name
        populate(self.checkout, script)
        # A complete foreign checkout (with its own sibling OCU checkout): if the
        # script anchored here, the stand-ins would record a foreign path.
        self.foreign = tmp_path / 'elsewhere' / 'foreign'
        populate(self.foreign, script)
        self.bin = binaries(tmp_path, interpreter)
        self.record = tmp_path / 'record.jsonl'
        self.env = {name: os.environ[name] for name in ('HOME', 'LANG') if name in os.environ}
        self.env.update(
            PATH=str(self.bin) + os.pathsep + os.defpath,
            LC_ALL='C',
            OBS_RECORD=str(self.record),
            OBS_EXIT='1' if script == 'smoke-stub.sh' else '0',
        )

    def caller_environment(self, name):
        if name == 'cdpath-dot':
            self.env['CDPATH'] = '.'
        elif name == 'cdpath-foreign':
            self.env['CDPATH'] = str(self.foreign)
        elif name == 'restricted-path':
            self.env['PATH'] = str(self.bin)

    def form(self, name):
        """(argv, cwd) for an invocation form."""
        return {
            'make': (['bash', f'scripts/{self.script}'], self.checkout),
            'absolute-from-foreign': (['bash', str(self.checkout / 'scripts' / self.script)], self.foreign),
            'bare-name-from-scripts': (['bash', self.script], self.checkout / 'scripts'),
            'dash-prefixed-checkout': (
                ['bash', '--', f'{self.checkout.name}/scripts/{self.script}'],
                self.checkout.parent,
            ),
        }[name]

    def run(self, form):
        argv, cwd = self.form(form)
        result = subprocess.run(argv, cwd=cwd, env=self.env, capture_output=True, text=True, timeout=30)
        assert self.record.exists(), (
            f'{self.script} never reached its stand-in (exit {result.returncode}): {result.stderr[-600:]!r}'
        )
        rows = [json.loads(line) for line in self.record.read_text(encoding='utf-8').splitlines()]
        assert len(rows) == 1, f'{self.script} reached stand-ins {len(rows)} times: {rows!r}'
        return result, rows[0]


def same_path(observed, expected):
    return '\n' not in observed and Path(observed).is_absolute() and Path(observed).resolve() == expected.resolve()


def check_smoke_stub(harness, result, row):
    assert same_path(row['cwd'], harness.checkout), f'smoke-stub ran from {row["cwd"]!r}, not its checkout'
    assert Path(row['argv'][0]).name == 'python3'


def check_verify_office(harness, result, row):
    interpreter, entry = row['argv']
    assert same_path(interpreter, harness.checkout / '.venv' / 'bin' / 'python'), f'interpreter {interpreter!r}'
    assert same_path(entry, harness.checkout / 'scripts' / 'verify-office.py'), f'entry {entry!r}'
    assert same_path(row['cwd'], harness.checkout), f'verify-office ran from {row["cwd"]!r}'
    assert result.returncode == 0, result.stderr


def check_proxy_dev(expected_config):
    def check(harness, result, row):
        assert row['argv'][1] == '-c' and row['argv'][3:] == ['-g', 'daemon off;'], row['argv']
        assert same_path(row['argv'][2], expected_config(harness)), f'nginx -c {row["argv"][2]!r}'
        assert result.returncode == 0, result.stderr

    return check


relative_ocu = check_proxy_dev(lambda harness: harness.checkout / 'ocu' / 'deploy' / 'proxy' / 'nginx.conf')
default_ocu = check_proxy_dev(
    lambda harness: harness.checkout.parent / 'open-computer-use' / 'deploy' / 'proxy' / 'nginx.conf'
)

# (script, OCU_CHECKOUT, check). `ocu` has no ./.. prefix, so bash consults
# CDPATH for it, and the foreign checkout holds a same-named ocu/ to bind to.
CASES = {
    'smoke-stub': ('smoke-stub.sh', None, check_smoke_stub),
    'verify-office': ('verify-office.sh', None, check_verify_office),
    'proxy-dev-relative-ocu': ('proxy-dev.sh', 'ocu', relative_ocu),
    'proxy-dev-default-ocu': ('proxy-dev.sh', None, default_ocu),
}


def run_case(tmp_path, interpreter, case, form, environment='no-cdpath', checkout_name='checkout'):
    script, ocu_checkout, check = CASES[case]
    harness = Harness(tmp_path, interpreter, script, checkout_name)
    if ocu_checkout is not None:
        harness.env['OCU_CHECKOUT'] = ocu_checkout
    harness.caller_environment(environment)
    result, row = harness.run(form)
    check(harness, result, row)


@pytest.mark.parametrize('interpreter', INTERPRETERS)
@pytest.mark.parametrize('environment', CALLER_ENVIRONMENTS)
@pytest.mark.parametrize('case', list(CASES))
def test_make_form_anchors_to_own_checkout(tmp_path, interpreter, case, environment):
    run_case(tmp_path, interpreter, case, 'make', environment)


@pytest.mark.parametrize('interpreter', INTERPRETERS)
@pytest.mark.parametrize('form', OTHER_FORMS)
@pytest.mark.parametrize('case', ['smoke-stub', 'verify-office', 'proxy-dev-default-ocu'])
def test_other_invocation_forms_anchor_to_own_checkout(tmp_path, interpreter, case, form):
    checkout_name = '-co' if form == 'dash-prefixed-checkout' else 'checkout'
    run_case(tmp_path, interpreter, case, form, checkout_name=checkout_name)
