## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Record `--collect-only -q` of `tests/test_auth_guard.py` (167) and `tests/orchestrator/test_ws_recheck.py` (70). Pure move: `_server_local_modules()`, `_server_local_files()`, `ROOT`/`SERVER_DIR`/`DRAWIO_DIR` into `tests/file_route_module_ownership.py`; `test_auth_guard.py` imports them. Green.
- [x] 2.2 Add the owner-parametrized drift guard and binding-coherence test to `tests/test_file_route_module_ownership.py` over `APP_OWNERS`. Capture red on the current sets: `[workspace]`, `[app_module]`, `[ws_app_module]` red in both, `[auth_app_module]` green; the coherence test fails at `admission.docker_manager is manager`. Not a collection or setup error.
- [x] 2.3 Add `_SERVER_MODULES` and `_SERVER_PREFIXES` to the helper module; `isolated_file_route_modules()`, `test_auth_guard.py::app_module`, `test_ws_recheck.py::ws_server_modules` and the `test_file_response.py:57-68` ambient list use them; delete `_FILE_ROUTE_MODULES`, `_AUTH_GUARD_MODULES`, `_AUTH_GUARD_PREFIXES`, `_WS_SERVER_MODULES`; update `OWNERSHIP` and the child imports. Green: ownership 35, auth 167, file_response, files_headers, CI-form orchestrator.
- [x] 2.4 Mutant: drop `"cli_runtime"` from `_SERVER_MODULES`; record the red set (four owners in both new tests, plus the auth-guard CI tests); restore byte-identical.
- [x] 2.5 Rewrite the README owner bullets (`tests/README.md:89-110`) and add one sentence to the coverage paragraph (`:112-121`) naming the two owner-parametrized regressions.

## 3. Verify

- [x] 3.1 Run:
  - `test_file_route_module_ownership.py`, `test_auth_guard.py`, `test_file_response.py`, `test_files_headers.py`;
  - the CI-form orchestrator suite;
  - `--collect-only -q` of `test_auth_guard.py` and `test_ws_recheck.py` before and after, equal;
  - after review is clean, the two-phase clean-clone evidence: the full unit command and the CI form, then `tests/deploy` alone;
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

## Risk packs

Selected:

- Shared state / ordering: one ownership set for every app-importing owner; inside each owner's scope the Office and CLI-runtime modules bind that scope's `docker_manager`; exact restoration still holds (existing cases).
- Compatibility: every reader of the three old constants moves to the shared one; the receipt/exception-identity test and the WS `BASE_DATA_DIR` monkeypatch keep working.
- Documentation / migration notes: the README owner bullets, task 2.5.

Not selected:

- Resource limits: each WS and file-route test now re-imports about 30 more modules per generation, the cost the auth owner already pays across its 167 tests; the CI-form orchestrator timing is recorded in the clean-clone evidence.
- File IO / path safety: the guard only reads module file paths; no file is written.
- Production, auth semantics, schema, dependencies and secrets: unchanged.

## Recorded at archive

- OCU PR: DankerMu/open-computer-use#156, head `f4a0c07d8fdc4d3d6c4c7c936d6fb55dd61dc871`, merged at `9b0faf3360ea18aef9aeb02e8abf897ce70d96fc`.
- Review: standard cross-review, round 1 at `f4a0c07` clean on both seats (correctness+integration, test-evidence+spec); 0 fix passes. One P3 noted, not fixed: each WS and file-route test scope reloads `office.*`, so `app.py:522` re-installs the `uvicorn.access` redaction filter per scope (test-process-only growth; the auth owner has behaved this way since #558).
- Clean-clone evidence at the head: full unit command minus `tests/deploy` 3694 passed, 5 skipped; CI-form orchestrator 2900 passed, 5 skipped, 3 subtests passed; `tests/deploy` alone 419 passed; all exit 0.
- Earlier evidence: red on the old sets (drift guard 32/32/29 unowned names for `workspace`/`app_module`/`ws_app_module`, coherence failing at `admission.docker_manager is manager`, `auth_app_module` green); green 35/167/97/148 (447 in one run) and the CI-form orchestrator 2900; mutant `cli_runtime` red for all four owners in both new tests and in both auth-guard CI tests, helper restored byte-identical; collect-only 167 and 70 unchanged; `./tests/test-project-structure.sh` OK.
- Deviations accepted: `test_file_response.py` also replaced the second prefix copy inside `restore_ambient_state` and dropped the `module_names` alias; `test_auth_guard.py` keeps its own `ROOT`/`SERVER_DIR` for `sys.path` ordering (design.md says so; task 2.1's wording was looser).
- Reported, not fixed: the README heading "File-route fixture module ownership" now describes shared ownership for every app-importing owner; `SERVER_DIR`/`sys.path` setup is repeated across several test files; `AMBIENT_NAMES`/`AMBIENT_PREFIXES` extras are now covered by the shared set.
