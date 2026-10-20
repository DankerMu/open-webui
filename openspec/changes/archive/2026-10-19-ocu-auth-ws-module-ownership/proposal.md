## Why

Two OCU test fixtures change the global import state and never restore it (#510).

- **`tests/test_auth_guard.py::app_module`** (`:130-173`) does three things:
  - removes a fixed set of app modules (33 names, including `uploads`) plus every `mcp_resources*` key from `sys.modules`;
  - imports a fresh `app`;
  - returns it.
- **`tests/orchestrator/test_ws_recheck.py::_reload_server`** (`:63-78`) does the same with its own set (10 names plus the `mcp_resources*` and `cli_adapters*` prefixes). It is called by the `app_module` fixture (`:81-95`) and directly by `TestAdmissionDeniesBeforeBackend::test_missing_auth_url_closes_1008_without_backend_lookup` (`:653`).

Neither fixture snapshots the entry-time module objects. Neither registers a restoration. Later tests in the same process can therefore see different cached module objects than they had before. This is latent order-dependence debt; no consumer failure has been demonstrated.

The repository already has the canonical repair for this class (#504): `tests/file_route_module_ownership.py::isolated_file_route_modules`. It snapshots the owned keys, evicts them, and on exit retires replacement modules and restores the exact entry objects or their absence. It is hard-wired to the file-route module set.

## What Changes

- Generalize the existing helper in place.
  - Add `isolated_modules(names, prefixes=())` to `tests/file_route_module_ownership.py`, carrying the current snapshot/evict/restore body.
  - `isolated_file_route_modules()` becomes a call to it with the unchanged file-route set and `("mcp_resources",)`, so its two existing consumers keep their exact behavior.
- **Auth fixture.** `test_auth_guard.py::app_module` moves its existing name set into a module constant. It runs the environment setup and the `import app` inside `isolated_modules(...)` and becomes a yield fixture. The owned set and prefixes stay exactly as they are today. It adds the existing repo-root `sys.path` insert so that the `tests.` import also resolves under CI's bare `pytest tests/test_auth_guard.py` (`build.yml:252`).
- **WebSocket fixture.**
  - `test_ws_recheck.py` moves its set into a module constant and adds a fixture that holds `isolated_modules(...)` for the test's lifetime.
  - `app_module` and the direct `_reload_server()` caller at `:653` request that fixture.
  - `_reload_server` keeps importing a fresh `app` inside the owned scope.
- Add ownership regressions that cover both owners. They live in `test_file_route_module_ownership.py`, which no CI selection runs, so they execute in the local full step, as with #504. Each owner is tested with the owned modules present and absent at entry, after normal completion and after a real pytest test-body failure.
- Update `tests/README.md`'s "File-route fixture module ownership" section to cover the two new owners and the generalized helper.

## Capabilities

### Modified Capabilities

- `ocu-pytest-discovery`: adds the requirement "Auth and WebSocket fixtures restore module ownership".

## Impact

Code in the sibling `open-computer-use` repository, tests only:

- `tests/file_route_module_ownership.py`
- `tests/test_auth_guard.py`
- `tests/orchestrator/test_ws_recheck.py`
- the regression module
- `tests/README.md`

No production auth or WebSocket change. Every auth assertion (including the 401/403/404 cases) and every WebSocket revocation assertion stays unchanged. There is no suite-wide `sys.modules` reset. This repository receives the fixture and its archive only.

## Triage

- Issue type: bugfix (test isolation)
- Fixture level: standard. It reuses the reviewed #504 helper and pattern on two more owners.
- Upstream suggested level: absent
- Blast radius: test-order dependence inside one pytest process; none in production.
- Selected risk packs:
  - Shared state / ordering: `sys.modules` ownership.
  - Error / rollback: restoration after a body failure.
- Evidence floor:
  - the new regressions are red against the current fixtures and green after;
  - `test_auth_guard.py`, `test_ws_recheck.py`, `test_file_route_module_ownership.py`, `test_file_response.py` and `test_files_headers.py` pass;
  - bare `pytest tests/test_auth_guard.py -v` (CI parity) passes;
  - the owner files' collected node IDs are unchanged;
  - the full documented unit command passes in a clean `git clone`;
  - `./tests/test-project-structure.sh` passes;
  - the commit hooks pass.
