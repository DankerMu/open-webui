## Why

Six orchestrator test module docstrings tell readers to run `cd computer-use-server && python -m pytest ../tests/orchestrator/<file>.py -v` (#560). The six files, with line numbers on OCU `fa98053`:

- `test_docker_manager.py:9`
- `test_mcp_tools.py:7`
- `test_single_user_mode.py:9`
- `test_sandbox_addressing.py:10`
- `test_startup_warnings.py:10`
- `test_view_image.py:5`

Since `31edafb` (#123), `tests/orchestrator/conftest.py` has imported `tests.orchestrator._office_store`, which needs the checkout root on `sys.path`. Following any of these instructions therefore exits with code 4 at the conftest import (`ModuleNotFoundError: No module named 'tests'`) before a single test runs. The same files pass with the checkout-root form `python -m pytest tests/orchestrator/<file>.py -v`, which is the convention in `tests/README.md:129-132` and is already used by `test_system_prompt_endpoint.py:9`.

There is a second entry point in the same state. Since OCU #144 (#507), `test_startup_warnings.py` imports `tests.file_route_module_ownership` at module level. Its retained `if __name__ == "__main__": unittest.main()` entry now fails when run as `python tests/orchestrator/test_startup_warnings.py` from the root: the script directory is `sys.path[0]`, so `tests` cannot be resolved. It is the only orchestrator module with a `__main__` entry that imports `tests.*` at module level.

## What Changes

These changes are in the sibling `open-computer-use` repository.

- Each of the six docstring `Run:` lines becomes `Run: python -m pytest tests/orchestrator/<file>.py -v`, matching `test_system_prompt_endpoint.py:9`. Each line keeps its file and `-v`, and the command text can be copied and executed as written from the checkout root.
- `test_startup_warnings.py` inserts the checkout root into `sys.path` before its `tests.*` import. It follows the existing guarded `parents[2]` idiom in `tests/deploy/support.py:25-27`: `ROOT = Path(__file__).resolve().parents[2]`, inserted only if absent. The module needs `from pathlib import Path` added, and the insert goes after the existing `computer-use-server` insert (`:20`) and before the `tests.*` import (`:22`). With it, the retained `__main__` script entry works again from the root. The #560 comment authorises this one added `sys.path` line, which overrides the issue's AC4 for this line only.
- Nothing else changes:
  - CI;
  - `CHANGELOG.md`, which is a historical record;
  - the existing test-local `computer-use-server` `sys.path` lines;
  - the console form from the root (`pytest tests/orchestrator/...`), which stays unsupported: pytest loads `tests/orchestrator/conftest.py` before any test module, and that conftest imports `tests.orchestrator`. #515 deliberately removed bare console instructions for the orchestrator directory;
  - fixtures and test behaviour;
  - production code.

## Capabilities

### Modified Capabilities

- `ocu-pytest-discovery`: adds the requirement "Orchestrator module run instructions resolve the checkout namespace".

## Impact

- Code in the sibling `open-computer-use` repository, all under `tests/orchestrator/`: the six module docstrings, plus the root insert in `test_startup_warnings.py`.
- This repository receives the fixture and its archive only.

## Triage

- Issue type: documentation and test-entry correction.
- Fixture level: standard. The change is 6 one-line docstring edits plus one import and a 3-line guarded insert that follows an existing idiom.
- Upstream suggested level: absent.
- Blast radius: local instructions only; CI and the documented unit command are unaffected.
- Selected risk packs:
  - Test discovery / invocation: the documented commands collect from a clean checkout.
- Evidence floor:
  - Red at `origin/main` in a clean `git clone`:
    - each of the six documented `cd computer-use-server && python -m pytest ../tests/orchestrator/<file>.py -v` commands exits 4 with `No module named 'tests'`;
    - `python tests/orchestrator/test_startup_warnings.py`, with no `PYTHONPATH`, fails with the same import error.
  - Green in a clean `git clone` of the head, on CPython 3.13 with the declared test dependencies and no `PYTHONPATH`:
    - each documented command is extracted from its file (`sed -n 's/^Run: //p'`) and executed as written. Each collects and passes, with per-file counts equal to the root-form counts on `origin/main` and exit code 0;
    - `python tests/orchestrator/test_startup_warnings.py` passes;
    - `--import-mode=importlib` from `computer-use-server/` still passes for `test_startup_warnings.py`;
    - negative control: the console form `pytest tests/orchestrator/test_startup_warnings.py` from the root still exits 4 at the conftest import, unchanged from `origin/main`.
  - A repo-wide grep for `cd computer-use-server && python -m pytest` and `pytest ../tests/` finds no active instruction, and `CHANGELOG.md` is unchanged.
  - The two-phase clean-clone run passes: the full unit command plus the CI form.
  - `./tests/test-project-structure.sh` and the commit hooks pass.
