## Context

These paths are in the sibling `open-computer-use` checkout, at `origin/main` `0782df3`.

- **Canonical helper:** `tests/file_route_module_ownership.py`. `_FILE_ROUTE_MODULES` holds 12 names. `isolated_file_route_modules()` is a `contextmanager` that does three things:
  - snapshots owned keys (names plus the `mcp_resources` prefix);
  - pops them;
  - in `finally`, pops every owned key and then calls `sys.modules.update(snapshot)`.

  Its consumers are `test_file_response.py::workspace` and `test_files_headers.py::app_module`. It is covered by `test_file_route_module_ownership.py`, which checks present and absent entry, with restoration asserted in a finalizer after the real fixture teardown.

- **Auth owner:** `tests/test_auth_guard.py::app_module` (`:130-173`) takes `monkeypatch`, applies the environment, evicts 33 names plus the `mcp_resources*` prefix, then runs `import app` and returns it.
- **WebSocket owner:**
  - `tests/orchestrator/test_ws_recheck.py::_reload_server` (`:63-78`) evicts 10 names plus the `mcp_resources*` and `cli_adapters*` prefixes, then calls `importlib.import_module("app")`.
  - `app_module` (`:81-95`) calls it, then monkeypatches the loaded app and `docker_manager`.
  - `:653` calls `_reload_server()` directly inside a test.

## Decisions

- **Generalize, don't duplicate.**
  - Add `isolated_modules(names, prefixes=())` to `tests/file_route_module_ownership.py`. Its body is the current one, parameterized; a key is owned when it is in `names` or starts with any prefix.
  - `isolated_file_route_modules()` returns `isolated_modules(_FILE_ROUTE_MODULES, ("mcp_resources",))`.
  - The file name stays, so the change stays minimal. The module docstring is updated to say the helper is shared by the file-route, auth-guard and WebSocket fixtures.
- **Move first.** Before any behavior change, extract the existing sets into `_AUTH_GUARD_MODULES` (`test_auth_guard.py`) and `_WS_SERVER_MODULES` (`test_ws_recheck.py`). The current eviction loops use them unchanged. This lets the regressions import the sets, so byte-identity shows in the diff, and lets red run against unchanged fixture behavior.
- **Auth owner.**
  - Prefixes: `("mcp_resources",)`. `app_module` becomes:

    ```python
    with isolated_modules(_AUTH_GUARD_MODULES, ("mcp_resources",)):
        _apply_env(monkeypatch)
        import app as loaded
        yield loaded
    ```

  - The inline eviction loop is deleted, because the helper evicts at entry. `monkeypatch` is set up first (the autouse `isolated_office_env` requests it), so its undo runs after module restoration and only touches the discarded fresh modules.
  - **Import resolution (P1).** CI runs the bare console `pytest tests/test_auth_guard.py -v` (`.github/workflows/build.yml:252`). That uses the default prepend import mode with no `PYTHONPATH`, and `tests/` has no `__init__.py`. A `from tests.file_route_module_ownership import …` would raise `ModuleNotFoundError` there.
    - Add the existing repo-root `sys.path` insert pattern (`tests/test_tools.py:30-32`) next to the `SERVER_DIR` insert at `test_auth_guard.py:27-29`, before the `tests.` import. Follow `test_tools.py`'s order (root first, then `SERVER_DIR` at index 0), so the server directory stays first.
    - The CI workflow is not edited.

- **WebSocket owner.**
  - Prefixes: `("mcp_resources", "cli_adapters")`.
  - Add a fixture `ws_server_modules` that runs `with isolated_modules(_WS_SERVER_MODULES, ...): yield`.
  - `app_module` takes `ws_server_modules` as its first parameter, so eviction precedes the env setup and the import. The `:653` test adds `ws_server_modules` to its parameters.
  - `_reload_server()` drops its eviction loop and only imports `app`.
  - The only callers are `:84` and `:653`. `test_ws_recheck.py` already imports `tests.` modules and runs under CI's `python -m pytest tests/orchestrator/` (`build.yml:251`), so it needs no path change.
- **Regressions.** These go in `tests/test_file_route_module_ownership.py`. This module is not in any CI selection (`build.yml:251-253`), so the new regressions run in the local full step, the same as for #504.
  - **Bindings.** Import `tests.test_auth_guard as auth_tests` and `tests.orchestrator.test_ws_recheck as ws_tests`.
    - Bind the owner fixtures under distinct names, for example `auth_app_module = auth_tests.app_module` and `ws_app_module = ws_tests.app_module`.
    - Pytest resolves fixture dependencies by name, so the module must also bind every fixture name the owners request that is not built in. After task 2.5, that includes `ws_server_modules = ws_tests.ws_server_modules`.
    - The red run binds only the existing WebSocket `app_module`. The `ws_server_modules` binding, both in-process and in the child, lands together with task 2.5.
  - **Per-owner ownership table.** Each owner gets its own `(names, prefixes)`:
    - file-route: `_FILE_ROUTE_MODULES`, `("mcp_resources",)`;
    - auth: `_AUTH_GUARD_MODULES`, `("mcp_resources",)`;
    - WebSocket: `_WS_SERVER_MODULES`, `("mcp_resources", "cli_adapters")`.

    The entry snapshot, the absent-case eviction and the restoration check all use that owner's names and prefixes. The ambient snapshot and emergency cleanup use the union of every owner's names and prefixes plus the existing ambient extras. The `uploads`/`descriptor_io` present-state asserts and the coherence asserts (`:89-92`, `:97-105`) stay file-route-only.

  - **Normal completion**, owner × {present, absent}. Follow the existing pattern:
    - record entry objects;
    - register the restoration-assert finalizer before `request.getfixturevalue(owner)`, so it runs after the owner's real teardown.

    The current auth and WebSocket fixtures leave a fresh `app`, so this fails. That is the red.

  - **Real body failure**, owner × {present, absent}. A parametrized parent test writes a child test module under `tmp_path` and runs `subprocess.run([sys.executable, "-m", "pytest", child, "--import-mode=importlib", "-p", "no:cacheprovider", "-p", "no:randomly", "--junitxml", xml], cwd=root, env=child_env, timeout=…)`.
    - `child_env` is built explicitly:
      - strip the proxy variables and `OCU_OFFICE_*`;
      - set `PYTHON_DOTENV_DISABLED=1`, `PYTHONPATH=root`, and the service variables the existing regression sets (`:50-60`).
    - The child module imports the owner fixture, plus `ws_server_modules` for the WebSocket owner after task 2.5, and has three tests in definition order:
      1. `test_1_entry` imports the owned family, pops it for the absent case, and records `{name: module}` for that owner's owned keys in a module-level dict.
      2. `test_2_body` uses the owner fixture, then fails with the sentinel `assert False, "ocu-module-ownership-planned-body-failure"`.
      3. `test_3_restored` asserts that the owned keys equal the recorded dict exactly, by identity and presence.
    - The parent asserts on the child result:
      - `returncode == 1`;
      - parsing the JUnit XML by testcase name: test 1 passed, test 2 has a `<failure>` (not an `<error>`) whose message contains the sentinel, and test 3 passed.

      Nothing calls `generator.throw`.

  - No sleeps, retries or skips.

- **Red, then green.**
  - Add the regressions after the move-only step and capture red.
  - The normal-completion cases for both owners must fail on the restoration assertion.
  - The child result must show test 3 failing on restoration. A collection, import or setup error does not count as red.
  - Then convert the auth owner, and then the WebSocket owner with its bindings.

Must preserve:

- Every assertion and test in `test_auth_guard.py` and `test_ws_recheck.py`.
- The owned name sets, exactly.
- `isolated_file_route_modules()` behavior and its two consumers.
- The existing `test_file_route_module_ownership.py` cases.
- Production code.

Governing invariant: after either owner's fixture is torn down, each owned key holds its exact entry-time object, or is absent if it was absent at entry.

## Seams and Evidence

All commands run in `open-computer-use` with the proxy variables unset:

```
uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest … --import-mode=importlib
```

The repo pins Python 3.13 via `.python-version`.

- **Red:** run the new regressions against the current fixtures.
- **CI parity (P1):** from a clean clone root, run the console script, not `python -m pytest` (which would add the cwd to `sys.path` and hide the failure): `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- pytest tests/test_auth_guard.py -v`, with no `PYTHONPATH` and no `--import-mode`. This matches `build.yml:252`. Record a non-zero collected count.
- **Unchanged and active (AC3):** `--collect-only -q` node-ID lists for `test_auth_guard.py` and `orchestrator/test_ws_recheck.py` must be equal before and after the change.
- **Green:** run the regressions plus `test_auth_guard.py`, `orchestrator/test_ws_recheck.py`, `test_file_response.py` and `test_files_headers.py`.
- **Full:** run the documented unit command (`tests/ --import-mode=importlib --ignore=tests/integration`) in a clean `git clone` of the committed head. It must exit 0. Any failure stops the issue and is reported.
- Run `./tests/test-project-structure.sh`.
- The commit hooks pass.

Non-goals:

- Other fixtures that evict modules, such as #507's owners.
- A suite-wide reset.
- Subprocess isolation as a substitute for the repair.
- Changing the owned sets.
- Production code.

Review focus:

- Are the owned sets byte-identical to today's?
- Does each owner restore after normal completion and after a real body failure?
- Is the finalizer ordering right?
- Does every `_reload_server` caller sit inside the owned scope?
- Is there no second copy of the restore logic?
- Residual risk: non-owned modules newly imported during a test can keep references to the discarded owned modules. The clean-clone full run is the guard, and any order failure stops the issue.
