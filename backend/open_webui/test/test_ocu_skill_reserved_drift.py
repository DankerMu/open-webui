"""RESERVED_SKILL_NAMES covers every OCU built-in at the pinned checkout (task 2.3, #746).

Top level on purpose: test/routers/ has an autouse `client` fixture that imports the whole app.
"""

from __future__ import annotations

import ast
import os
from pathlib import Path

import pytest

import open_webui.test.ocu_harness  # noqa: F401  configures the harness env before open_webui.env loads
from open_webui.routers.ocu_skills import RESERVED_SKILL_NAMES

ROOT = Path(__file__).resolve().parents[3]
DESCRIPTIONS = 'NATIVE_PROMPT_DESCRIPTIONS'


def ocu_checkout() -> Path:
    # Empty counts as unset, as `${OCU_CHECKOUT:-}` does in scripts/proxy-dev.sh.
    checkout = Path(os.environ.get('OCU_CHECKOUT') or ROOT.parent / 'open-computer-use')
    if not checkout.is_dir():
        pytest.fail(
            f'missing OCU checkout: {checkout}; clone DankerMu/open-computer-use there at '
            'constraints.yaml ocu_checkout.sha, or set OCU_CHECKOUT to such a checkout'
        )
    return checkout


def description_keys(manager: Path) -> set[str]:
    for node in ast.parse(manager.read_text(encoding='utf-8'), filename=str(manager)).body:
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, ast.AnnAssign):
            targets = [node.target]
        else:
            continue
        if not any(isinstance(target, ast.Name) and target.id == DESCRIPTIONS for target in targets):
            continue
        if not isinstance(node.value, ast.Dict):
            pytest.fail(f'{manager}: {DESCRIPTIONS} is not a dict literal')
        keys = set()
        for key in node.value.keys:
            # A `**spread` entry has no key node.
            if not (isinstance(key, ast.Constant) and isinstance(key.value, str)):
                pytest.fail(f'{manager}: {DESCRIPTIONS} has a non-string key: {ast.unparse(key) if key else "**"}')
            keys.add(key.value)
        return keys
    pytest.fail(f'{manager}: no module-level {DESCRIPTIONS} assignment')


def check_ocu_checkout() -> None:
    checkout = ocu_checkout()
    public = checkout / 'skills' / 'public'
    manager = checkout / 'computer-use-server' / 'skill_manager.py'
    if not public.is_dir():
        pytest.fail(f'OCU checkout {checkout} has no skills/public/')
    if not manager.is_file():
        pytest.fail(f'OCU checkout {checkout} has no computer-use-server/skill_manager.py')
    expected = {entry.name for entry in public.iterdir() if entry.is_dir()} | {'remotion'} | description_keys(manager)
    missing = sorted(expected - RESERVED_SKILL_NAMES)
    assert not missing, f'RESERVED_SKILL_NAMES misses OCU built-ins at {checkout}: {missing}'


def test_reserved_names_cover_pinned_ocu_builtins() -> None:
    check_ocu_checkout()


def test_default_checkout_is_the_repo_root_sibling(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    assert (ROOT / 'constraints.yaml').is_file()
    monkeypatch.delenv('OCU_CHECKOUT', raising=False)
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(f'{__name__}.ROOT', tmp_path / 'repo')
    (tmp_path / 'open-computer-use').mkdir()
    assert ocu_checkout() == tmp_path / 'open-computer-use'


def fake_checkout(root: Path, dirs: tuple[str, ...] = (), manager: str | None = None) -> Path:
    public = root / 'skills' / 'public'
    for name in dirs:
        (public / name).mkdir(parents=True)
    if manager is not None:
        (root / 'computer-use-server').mkdir(parents=True)
        (root / 'computer-use-server' / 'skill_manager.py').write_text(manager, encoding='utf-8')
    return root


@pytest.mark.parametrize(
    'manager',
    [
        'NATIVE_PROMPT_DESCRIPTIONS: dict[str, str] = {"internal-comms": "x"}\n',
        'NATIVE_PROMPT_DESCRIPTIONS = {"internal-comms": "x"}\n',
    ],
    ids=['annotated', 'plain'],
)
def test_subset_checkout_passes(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, manager: str) -> None:
    checkout = fake_checkout(tmp_path, ('docx', 'file-reading'), manager)
    (checkout / 'skills' / 'public' / 'not-a-skill.md').write_text('a file, not a directory', encoding='utf-8')
    monkeypatch.setenv('OCU_CHECKOUT', str(checkout))
    check_ocu_checkout()


def test_unreserved_builtins_fail_naming_each(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    checkout = fake_checkout(tmp_path, ('zz-new-dir', 'docx'), f'{DESCRIPTIONS} = {{"aa-new-key": "x", "pdf": "y"}}\n')
    monkeypatch.setenv('OCU_CHECKOUT', str(checkout))
    with pytest.raises(AssertionError, match=r"\['aa-new-key', 'zz-new-dir'\]"):
        check_ocu_checkout()


@pytest.mark.parametrize(
    ('dirs', 'manager', 'reason'),
    [
        ((), None, 'missing OCU checkout: .*absent.*constraints.yaml ocu_checkout.sha.*OCU_CHECKOUT'),
        ((), f'{DESCRIPTIONS} = {{}}\n', 'has no skills/public/'),
        (('docx',), None, 'has no computer-use-server/skill_manager.py'),
        (('docx',), 'OTHER = {"docx": "x"}\n', f'no module-level {DESCRIPTIONS} assignment'),
        (('docx',), f'{DESCRIPTIONS} = dict(docx="x")\n', f'{DESCRIPTIONS} is not a dict literal'),
        (('docx',), f'{DESCRIPTIONS}: dict[str, str]\n', f'{DESCRIPTIONS} is not a dict literal'),
        (('docx',), f'{DESCRIPTIONS} = {{1: "x"}}\n', f'{DESCRIPTIONS} has a non-string key: 1'),
        (('docx',), f'{DESCRIPTIONS} = {{**BASE}}\n', f'{DESCRIPTIONS} has a non-string key: \\*\\*'),
    ],
    ids=['no-checkout', 'no-public', 'no-manager', 'no-assignment', 'not-dict', 'bare-annotation', 'int-key', 'spread'],
)
def test_broken_checkout_fails_with_reason(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, dirs: tuple[str, ...], manager: str | None, reason: str
) -> None:
    checkout = tmp_path / 'absent' if not dirs and manager is None else fake_checkout(tmp_path, dirs, manager)
    monkeypatch.setenv('OCU_CHECKOUT', str(checkout))
    with pytest.raises(pytest.fail.Exception, match=reason):
        check_ocu_checkout()
