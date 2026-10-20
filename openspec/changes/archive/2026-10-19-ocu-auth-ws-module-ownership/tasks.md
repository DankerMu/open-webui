## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Generalize `tests/file_route_module_ownership.py` with `isolated_modules(names, prefixes=())`. `isolated_file_route_modules()` delegates to it unchanged, and its existing tests stay green.
- [x] 2.2 Move only: extract `_AUTH_GUARD_MODULES` and `_WS_SERVER_MODULES`, used by the unchanged eviction loops.
- [x] 2.3 Add regressions in `test_file_route_module_ownership.py` using the per-owner ownership table:
  - normal completion, owner × {present, absent};
  - a real body failure, owner × {present, absent}, as a JUnit-parsed subprocess child with a record test, a sentinel-fail test and a restored test.

  Bind only the existing owner fixtures. Capture red on the restoration assertions, not on a collection or setup error.

- [x] 2.4 Convert `test_auth_guard.py::app_module` to `isolated_modules(_AUTH_GUARD_MODULES, ("mcp_resources",))` as a yield fixture, and add the repo-root `sys.path` insert next to `:27-29`.
- [x] 2.5 Add the `ws_server_modules` fixture. Have `app_module` and the `:653` test request it, and reduce `_reload_server` to the import. Bind `ws_server_modules` in the regression module and in the child.
- [x] 2.6 Update the `tests/README.md` module-ownership section.

## 3. Verify

- [x] 3.1 Run the following:
  - regressions red then green;
  - the auth, WebSocket, file-route, response and header modules green;
  - bare `pytest tests/test_auth_guard.py -v` from a clean clone root (CI parity);
  - collect-only node-ID lists of the two owner files equal before and after;
  - the full documented unit command in a clean `git clone`, exit 0;
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

Recorded at archive:

- `design.md` said `test_ws_recheck.py` already imported `tests.` modules. It did not. Its `tests/orchestrator/conftest.py` does, and CI's `python -m pytest tests/orchestrator/` puts the cwd on `sys.path`, so no path change was needed. Prepend-mode `test_ws_recheck.py` gave 70 passed.
- Full unit command in a clean `git clone` of the merged head: 4058 passed, 5 skipped. CI-parity console `pytest tests/test_auth_guard.py`: 165 passed.
- Follow-ups: #557 (the direct-caller and prefix-branch regressions do not go red, and child output can be lost) and #558 (the auth owned set misses modules that `app` imports; pre-existing).

## Risk packs

Selected:

- Shared state / ordering: exact restoration of entry objects and absence, for both owners.
- Error / rollback: restoration after a real failing test body; the failure itself stays visible in the child's outcome.

Not selected:

- Production, auth semantics, schema, dependencies and secrets: none of these change. The auth 401/403/404 assertions and the revocation assertions stay unchanged.
