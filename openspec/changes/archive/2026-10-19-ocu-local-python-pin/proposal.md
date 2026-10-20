## Why

OCU `AGENTS.md:35` documents the local unit-test command as `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/ -q --import-mode=importlib --ignore=tests/integration`, and `:41` states "Baseline: the unit command passes". The command pins no interpreter. On this workstation, uv resolves CPython 3.14.2.

CPython 3.14.0 through 3.14.8 carry gh-134331's eager `asyncio.shield` exception log. The fix, gh-156321, is on the 3.14 branch but not yet in a release. Under those interpreters, three `failure-*` parametrizations of `test_cancelled_discovery_keeps_admission_until_worker_ends_and_recovers` (`tests/orchestrator/test_mcp_discovery.py:517`, `assert errors == []`) fail with `DiscoveryError exception in shielded future`. The same tests pass on CPython 3.13 and 3.12 (#551).

CI runs the orchestrator suite on `python-version: '3.13'` (`.github/workflows/build.yml:236-238`). The documented local baseline is therefore red for reasons that have nothing to do with OCU.

## What Changes

- Add a repo-root `.python-version` containing `3.13` to the OCU checkout. This matches CI's minor version.
  - `uv run --no-project` honors it from the root and from subdirectories. A probe with uv 0.9.18 confirmed this: it resolved 3.13.3 with the file present and 3.14.2 without it.
  - Every documented `uv run --no-project` command without an explicit `--python` therefore selects 3.13 unchanged. That covers:
    - `AGENTS.md:35-36`;
    - the four unpinned `tests/README.md` blocks (`:24`, `:65`, `:146`, `:210`);
    - the docstring command in `tests/test_sandbox_path_references.py:18`.
  - `tests/README.md:274` passes `--python 3.12` explicitly, and that flag still wins.
- Add a short note to `tests/README.md` under "Python selected unit tests". It says:
  - the pin matches CI and keeps the CPython 3.14.0–3.14.8 shield-logging regression out of the local baseline;
  - an explicit `--python` or `UV_PYTHON` overrides the pin;
  - offline machines without a 3.13 should run `uv python install 3.13` first.

## Capabilities

### Modified Capabilities

- `ocu-pytest-discovery`: adds the requirement "Local unit command matches the CI interpreter".

## Impact

Changes in the sibling `open-computer-use` repository:

- new `.python-version`
- `tests/README.md`

Unchanged:

- `AGENTS.md`. Its command and baseline claim become true as written, so no governance-file edit is needed.
- `test_mcp_discovery.py` and its `assert errors == []` oracle.
- `mcp_resources.py`.
- the CI workflow.
- the Dockerfile and its `python:3.12-slim` base. Neither the Dockerfile nor `actions/setup-python` with an explicit `python-version` reads `.python-version`.
- dependencies.

This repository receives the fixture and its archive only.

## Triage

- Issue type: bugfix (local test harness configuration)
- Fixture level: standard. One config file plus one doc sentence, with runtime evidence.
- Upstream suggested level: absent
- Blast radius: local `uv` interpreter selection inside the OCU checkout. With the pin, uv uses a discovered or managed CPython 3.13.
- Selected risk packs: Config / project setup.
- Evidence floor:
  - the documented command on `test_mcp_discovery.py` is red without the pin (3.14.2: 3 failed) and green with it (55 passed);
  - the interpreter is shown by the same invocation;
  - the full documented unit command exits 0 with 0 failed under the pin. Any failure, even one unrelated to the pin, means `AGENTS.md`'s baseline claim (AC4) is unmet: stop and report instead of claiming completion;
  - red and green both run in a clean `git archive` export of the committed ref;
  - `./tests/test-project-structure.sh` passes;
  - the commit hooks pass.
