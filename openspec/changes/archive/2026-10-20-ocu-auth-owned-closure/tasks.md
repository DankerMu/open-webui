## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Record `--collect-only -q tests/test_auth_guard.py` (165 node IDs). Add the drift guard and the two-generation identity test to `tests/test_auth_guard.py` per `design.md`. Capture red on the current set: the guard lists the unowned modules; the identity test fails on `admission.docker_manager`. Not a collection or setup error.
- [x] 2.2 Replace the owned set with the 18-name `_AUTH_GUARD_MODULES` and add `_AUTH_GUARD_PREFIXES = ("mcp_resources", "office.", "cli_adapters.")`; `app_module` passes both. Update `tests/test_file_route_module_ownership.py:36` to read `_AUTH_GUARD_PREFIXES`. Green: `test_auth_guard.py` 167 passed, `test_file_route_module_ownership.py` 27 passed.
- [x] 2.3 Run the two mutants (drop `cli_runtime`; drop `office.`) and record which assertions go red. Restore byte-identical.
- [x] 2.4 Rewrite `tests/README.md:89` and `:94` for the new owner description.
- [x] 2.5 File the sibling follow-up (WebSocket and file-route sets) through the issue-scribe; reference it from the PR body. Filed as #574.

## 3. Verify

- [x] 3.1 Run:
  - `test_auth_guard.py`, `test_file_route_module_ownership.py`, `test_file_response.py`, `test_files_headers.py`;
  - CI-parity console `pytest tests/test_auth_guard.py -v` from a clean clone root, 167 passed;
  - `--collect-only -q` of `test_auth_guard.py` before and after: the 165 IDs plus exactly the two new ones;
  - after review is clean, the two-phase clean-clone evidence: the full unit command and the CI form, then `tests/deploy` alone;
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

## Risk packs

Selected:

- Shared state / ordering: every server-local module inside the auth scope is owned; the second generation binds only current modules; exact restoration still holds with the larger set.
- Compatibility: the `:36` reader and the child template follow the new prefixes; the WebSocket and file-route sets are untouched.
- Documentation / migration notes: the README owner description, task 2.4.

Not selected:

- Production, auth semantics, schema, dependencies and secrets: unchanged. The 401/403/404 assertions are untouched.

## Recorded at archive

- OCU PR: DankerMu/open-computer-use#153, head `e34f0a032ec83a22da9d6481acce4ca6f71e371a`, merged at `1df0b19c820236503145690f653a8349e0e5f786`.
- Review: standard cross-review. Round 1 at `cea69fb`: correctness+integration clean with a note, test-evidence+spec one P3, both on the lazy-import blind spot of the `sys.modules`-only guard. Fix pass 1 at `e34f0a0`: the guard also derives module names from every `.py` under `computer-use-server/` outside `drawio/`; the `docs_html` mutant now fails under `-k TestModuleOwnership`. Round 2 clean on both seats.
- Clean-clone evidence at the head: full unit command minus `tests/deploy` 3683 passed, 5 skipped; CI-form orchestrator 2897 passed, 5 skipped, 3 subtests passed; `tests/deploy` alone 419 passed; all exit 0.
- Earlier evidence: red on the old set (10 unowned modules listed; identity test fails at `admission.docker_manager`); green 167/27/439; CI-parity console run 167 passed from the working tree; three mutants killed; collect-only 165 to 167 with exactly the two new IDs; `test_prepare_drawio.py` before the guard in one process 12 passed at the head; `./tests/test-project-structure.sh` OK.
- Deviations accepted: the red baseline defined `_AUTH_GUARD_PREFIXES = ("mcp_resources",)`; `_import_owned_app` helper; the guard reads both `sys.modules` and the files on disk (the design named only the former before the fix pass).
- Reported, not fixed: a developer-local `computer-use-server/.venv/` would make the file scan fail loudly; no lint step covers the OCU test files. Sibling owners tracked in #574.
