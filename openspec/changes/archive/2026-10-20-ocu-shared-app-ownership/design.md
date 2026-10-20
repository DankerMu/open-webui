## Context

Paths are in the sibling `open-computer-use` checkout at `origin/main` `cec0a91`.

- **Helper module:** `tests/file_route_module_ownership.py`. `_FILE_ROUTE_MODULES` (`:8-12`, 12 names); `isolated_modules(names, prefixes=())` (`:15-30`); `isolated_file_route_modules()` (`:33-34`) returns `isolated_modules(_FILE_ROUTE_MODULES, ("mcp_resources",))`. Consumers: `test_file_response.py:18,31` and `test_files_headers.py:17,33`.
- **Auth owner (#558):** `tests/test_auth_guard.py`. `_AUTH_GUARD_MODULES` (`:52-56`, 18 names), `_AUTH_GUARD_PREFIXES` (`:57`), `DRAWIO_DIR` (`:58`), `app_module` (`:144-150`), `_server_local_modules()` (`:1390-1399`), `_server_local_files()` (`:1402-1411`), `_import_owned_app` (`:1414-1418`), `TestModuleOwnership` (`:1421-1439`) with the drift guard and the two-generation test. `ROOT` and `SERVER_DIR` are set at `:27-32`.
- **WS owner:** `tests/orchestrator/test_ws_recheck.py`. `_WS_SERVER_MODULES` (`:50-61`), `_WS_SCOPE` and `_reload_server` (`:78-84`), `ws_server_modules` (`:87-90`), `app_module` (`:93-106`) which monkeypatches `docker_manager.BASE_DATA_DIR` after the reload.
- **Readers of the constants:** `tests/test_file_route_module_ownership.py:19` (imports `_FILE_ROUTE_MODULES`), `:33-39` (`OWNERSHIP`), `:142` and `:148` (child imports of `_AUTH_GUARD_MODULES` and `_WS_SERVER_MODULES`); `tests/README.md:89-100`.
- **Fourth copy:** `tests/test_file_response.py:57-68`, the ambient `module_names` set and prefix tuple inside `test_workspace_keeps_receipt_producer_and_app_exception_identity_coherent`, equal to the #558 set.
- **Ownership regression module:** `tests/test_file_route_module_ownership.py`. The in-process test (`:85-137`) imports `app`, `descriptor_io`, `mcp_resources` and `uploads` at the caller level, records the entry snapshot, registers the restoration finalizer, then `request.getfixturevalue(owner)` and in-scope checks. `AMBIENT_NAMES`/`AMBIENT_PREFIXES` (`:41-47`) are unions over `OWNERSHIP` plus extras. `CHILD_OWNERS` (`:140-160`) and `CHILD_TEMPLATE` (`:161-197`); the child helper `_run_child_pytest` (`:213-242`).

## Decisions

- **One shared set in the helper module.** In `tests/file_route_module_ownership.py`:

  ```python
  ROOT = Path(__file__).resolve().parents[1]
  SERVER_DIR = ROOT / "computer-use-server"
  DRAWIO_DIR = SERVER_DIR / "drawio"
  _SERVER_MODULES = {  # the 18 names from #558, unchanged
      "app", "auth_guard", "ws_recheck", "mcp_tools", "docker_manager", "outputs_broker",
      "context_vars", "security", "system_prompt", "skill_manager", "uploads", "file_response",
      "descriptor_io", "docs_html", "sandbox_dns", "cli_runtime", "cli_adapters", "office",
  }
  _SERVER_PREFIXES = ("mcp_resources", "office.", "cli_adapters.")
  ```

  `isolated_file_route_modules()` returns `isolated_modules(_SERVER_MODULES, _SERVER_PREFIXES)`. `_FILE_ROUTE_MODULES` is deleted. `_server_local_modules()` and `_server_local_files()` move here verbatim from `test_auth_guard.py`, using this module's `SERVER_DIR`/`DRAWIO_DIR`. The module docstring says it is the shared ownership of every fixture that imports the server.

- **Auth owner.** `test_auth_guard.py` deletes `_AUTH_GUARD_MODULES`, `_AUTH_GUARD_PREFIXES`, `DRAWIO_DIR`, `_server_local_modules` and `_server_local_files`, and imports `_SERVER_MODULES`, `_SERVER_PREFIXES`, `_server_local_modules`, `_server_local_files` from `tests.file_route_module_ownership` (the `tests.` import already exists at `:34`). `app_module` and the two `TestModuleOwnership` tests use the shared names; their assertions and node IDs are unchanged, so the CI-run guard stays.
- **WS owner.** `test_ws_recheck.py` deletes `_WS_SERVER_MODULES`; `ws_server_modules` becomes `with isolated_modules(_SERVER_MODULES, _SERVER_PREFIXES): yield _WS_SCOPE`. The `_WS_SCOPE` seam, `_reload_server` and `app_module` are otherwise unchanged. Its `docker_manager.BASE_DATA_DIR` monkeypatch now reaches the same `docker_manager` the fresh Office modules bind; the binding-coherence test below asserts that identity for the `ws_app_module` owner.
- **Fourth copy.** `test_file_response.py:57-68` replaces its literal set and tuple with `_SERVER_MODULES` and `_SERVER_PREFIXES`; the test's assertions are unchanged.
- **Ownership regression module.**
  - `OWNERSHIP` maps `workspace`, `app_module`, `auth_app_module` and `ws_app_module` to `(_SERVER_MODULES, _SERVER_PREFIXES)`; `alias_runtime_modules` is unchanged. The child imports at `:142` and `:148` import `_SERVER_MODULES as OWNED_NAMES` from `tests.file_route_module_ownership`; the owner fixture imports stay. `AMBIENT_NAMES`/`AMBIENT_PREFIXES` keep their shape and now cover the same set.
  - `APP_OWNERS = ("workspace", "app_module", "auth_app_module", "ws_app_module")`.
  - **Drift guard**, parametrized over `APP_OWNERS`: `_isolate_ambient_modules`, the service env plus `BASE_DATA_DIR`, `request.getfixturevalue(owner)`, then assert `sorted(name for name in _server_local_files() | set(_server_local_modules()) if name not in owned_names and not name.startswith(owned_prefixes)) == []`. Red today for the three non-auth owners (at least `office.*`, `cli_runtime`, `sandbox_dns` listed).
  - **Binding coherence**, parametrized over `APP_OWNERS`: `_isolate_ambient_modules`, the service env plus `BASE_DATA_DIR` as at `:90-91`, `import app` at the caller level (so the caller generation holds `office.lookup_admission` and `cli_runtime` bound to the caller's `docker_manager`), then `request.getfixturevalue(owner)`, then inside the scope:

    ```python
    manager = sys.modules["docker_manager"]
    assert manager is not caller_manager
    admission = sys.modules["office.lookup_admission"]
    assert admission.docker_manager is manager
    assert admission.StateCorruptError is sys.modules["office.store"].StateCorruptError
    assert sys.modules["cli_runtime"]._execute_bash_capture is manager._execute_bash_capture
    ```

    Red today at `admission.docker_manager is manager` for `workspace`, `app_module` and `ws_app_module` (their sets own `docker_manager` but not `office.lookup_admission` or `cli_runtime`); green for `auth_app_module`. This is the issue's two-generation check with the caller as generation one, which is what the in-process regression already models.

  - The existing restoration, child, startup-warning and alias cases are unchanged.

- **README.** `:89-110` (the owner bullets) and the coverage paragraph at `:112-121`, which gains one sentence naming the two owner-parametrized regressions: the three app-importing owners "share `_SERVER_MODULES` plus `_SERVER_PREFIXES`: the whole server directory except the standalone `drawio/` script"; the file-route bullet keeps the `uploads` coupling sentence; the auth bullet keeps the CI drift-guard sentence; the WS bullet keeps the `_reload_server` seam sentence.

Must preserve:

- Every assertion in `test_auth_guard.py` (including the 401/403/404 matrix and both #558 tests), `test_ws_recheck.py` (revocation and the `_WS_SCOPE` seam), `test_file_response.py` (including `test_workspace_keeps_receipt_producer_and_app_exception_identity_coherent`), `test_files_headers.py` and the existing cases in `test_file_route_module_ownership.py`.
- `isolated_modules` body; `_WS_SCOPE`/`_reload_server`; `_ALIAS_RUNTIME_MODULES`; `_DOCKER_MANAGER_*`.
- The 18 names and three prefixes exactly as #558 set them.
- `--collect-only -q` node IDs of `test_auth_guard.py` (167) and `test_ws_recheck.py` (70).
- Production code.

Governing invariant: every fixture that imports the server owns the same closure, so inside any owner's scope every server-local module belongs to that scope's generation, and after teardown every owned key holds its exact entry-time object or is absent.

## Test Plan

All commands run in `open-computer-use` with the proxy variables unset:

```
uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest … --import-mode=importlib
```

- **Red:** add the two parametrized tests before changing the sets (the helpers can be imported from `test_auth_guard` for the red run, or added first as a pure move). Expect `[workspace]`, `[app_module]`, `[ws_app_module]` red in both tests, `[auth_app_module]` green; the drift guard's message lists the unowned names; the coherence test fails at `admission.docker_manager is manager`. A collection or setup error is not red.
- **Green:** unify the sets and helpers; `test_file_route_module_ownership.py` (27 + 8 = 35 passed), `test_auth_guard.py` 167, `test_file_response.py`, `test_files_headers.py`, CI-form `tests/orchestrator/`.
- **Mutant:** drop `"cli_runtime"` from `_SERVER_MODULES`: all four owners red in both new tests, plus the two auth-guard CI tests. Restore byte-identical.
- **Unchanged:** `--collect-only -q` of `test_auth_guard.py` and `test_ws_recheck.py` equal before and after.
- **After review is clean:** the two-phase clean-clone evidence at the PR head.
- `./tests/test-project-structure.sh`; the commit hooks.

Non-goals:

- `alias_runtime_modules` and the startup-warning owners (they do not import `app`).
- Changing `isolated_modules` or the owned names.
- Production code.

Review focus:

- Is every reader of the three old constants moved, with no stale name left (grep)?
- Does the receipt/exception-identity test still pass unchanged with the larger file-route set?
- Is the coherence test red for the right reason on the current sets, and is the auth owner green?
- Does the WS owner's `BASE_DATA_DIR` monkeypatch now reach the Office modules' `docker_manager` (identity asserted by the coherence test)?
