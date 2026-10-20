## Why

#558 fixed the auth-guard fixture's owned module set, but the two sibling owners that also run `import app` still own hand-written subsets (#574). Paths are in the sibling `open-computer-use` checkout at `origin/main` `cec0a91`.

- `tests/orchestrator/test_ws_recheck.py::_WS_SERVER_MODULES` (`:50-61`): 10 names plus the prefixes `mcp_resources` and `cli_adapters`. It owns no `office.*` module, no `cli_runtime`, `descriptor_io`, `sandbox_dns`, `uploads`, `context_vars` or `docs_html`.
- `tests/file_route_module_ownership.py::_FILE_ROUTE_MODULES` (`:8-12`): 12 names plus `mcp_resources`. It owns `descriptor_io` and `uploads` but no `office.*`, `cli_runtime`, `cli_adapters*`, `sandbox_dns`, `ws_recheck` or `docs_html`. Its consumers are `test_file_response.py::workspace` and `test_files_headers.py::app_module`.
- A fresh `import app` loads 43 server-local modules; the WS owner misses 28 of them and the file-route owner 31. Every `office.*` module and `cli_runtime` bind `docker_manager` at import (`office/lookup_admission.py:12-15`, `cli_runtime.py:28-34`), so a second fixture generation reuses modules bound to the first generation's `docker_manager`. No current WS or file-route test reaches those bindings; the risk is latent and order-dependent.
- There is also a fourth copy of the "fresh `import app`" set: the ambient-restore list in `test_file_response.py:57-68` already holds the 18 names and three prefixes #558 adopted for the auth owner.

## What Changes

Tests only, in `open-computer-use`.

- **One shared ownership set.** `_SERVER_MODULES` (the 18 names from #558) and `_SERVER_PREFIXES = ("mcp_resources", "office.", "cli_adapters.")` move into `tests/file_route_module_ownership.py`, next to `isolated_modules`. `_FILE_ROUTE_MODULES`, `_AUTH_GUARD_MODULES`/`_AUTH_GUARD_PREFIXES` and `_WS_SERVER_MODULES` are replaced by it: `isolated_file_route_modules()`, `test_auth_guard.py::app_module` and `test_ws_recheck.py::ws_server_modules` all call `isolated_modules(_SERVER_MODULES, _SERVER_PREFIXES)`. The ambient list in `test_file_response.py:57-68` imports the same constants. One set cannot drift on its own.
- **Shared guard helpers.** `_server_local_modules()` and `_server_local_files()` from #558 move into `tests/file_route_module_ownership.py` with `SERVER_DIR` and the `drawio/` exclusion. The auth-guard drift guard and two-generation test keep running under CI's `pytest tests/test_auth_guard.py`, now through the shared helpers and constants.
- **Owner-parametrized regressions** in `tests/test_file_route_module_ownership.py`, over the four app-importing owners (`workspace`, `app_module`, `auth_app_module`, `ws_app_module`; `alias_runtime_modules` imports only `cli_runtime` and is left out):
  - a drift guard: inside the owner's scope, every server-local module in `sys.modules` and every server module file on disk is owned;
  - a binding-coherence check: inside the owner's scope, `office.lookup_admission.docker_manager` and `cli_runtime._execute_bash_capture` belong to the scope's `docker_manager`, and `lookup_admission.StateCorruptError is office.store.StateCorruptError`. The test imports `app` at the caller level first, so the caller generation plays the role of generation one; this is red today for the WS and both file-route owners.
- **README** owner descriptions describe the one shared set.

## Capabilities

### Modified Capabilities

- `ocu-pytest-discovery`: the #558 requirement is renamed to cover every app-importing owner and modified to require one shared ownership set with owner-parametrized regressions.

## Impact

- `tests/file_route_module_ownership.py` (constants, helpers)
- `tests/test_auth_guard.py` (imports the shared constants and helpers; its two #558 tests stay)
- `tests/orchestrator/test_ws_recheck.py` (imports the shared constants)
- `tests/test_file_response.py` (ambient list imports the shared constants)
- `tests/test_file_route_module_ownership.py` (`OWNERSHIP`, child imports, two new parametrized tests)
- `tests/README.md`

No production code. `isolated_modules` itself, the `_WS_SCOPE` seam, every auth, WS, file-response and files-headers assertion, and the receipt/exception-identity test stay unchanged. This repository receives the fixture and its archive only.

## Triage

- Issue type: bugfix (test isolation), follow-up of #558
- Fixture level: standard. Test-only, size S to M, on the reviewed #504/#510/#558 helper and pattern.
- Upstream suggested level: absent (issue says p3)
- Blast radius: test-order dependence inside one pytest process; none in production.
- Selected risk packs:
  - Shared state / ordering: one ownership set for every app-importing owner; current-generation bindings inside each owner's scope.
  - Compatibility: every reader of the three old constants moves to the shared one; the `uploads`/`descriptor_io` coupling test and the WS `docker_manager` monkeypatch keep working.
  - Documentation / migration notes: the README owner descriptions.
- Evidence floor:
  - the binding-coherence test red for `workspace`, `app_module` and `ws_app_module` on the current sets and green after; the drift guard red for the same three;
  - one mutant: drop `"cli_runtime"` from `_SERVER_MODULES`, red for all four owners in both new tests and in the auth-guard CI tests;
  - `test_file_route_module_ownership.py`, `test_auth_guard.py`, `test_file_response.py`, `test_files_headers.py` and the CI-form `python -m pytest tests/orchestrator/` green, with no assertion weakened;
  - `--collect-only -q` of `test_auth_guard.py` and `test_ws_recheck.py` unchanged;
  - after review is clean, the two-phase clean-clone evidence;
  - `./tests/test-project-structure.sh` and the commit hooks pass.
