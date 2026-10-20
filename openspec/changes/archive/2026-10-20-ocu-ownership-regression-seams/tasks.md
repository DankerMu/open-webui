## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Pure move: extract `_run_child_pytest(child, junit, env, timeout=180)` in `tests/test_file_route_module_ownership.py`, running the child with `-s`. The body-failure test calls it with every assertion kept. Green, behavior unchanged.
- [x] 2.2 Add the diagnostics regression (`test_child_run_failure_reports_captured_output`, timeout, crash and unparsable children) and capture red against the step-1 helper: uncaught `TimeoutExpired`, `FileNotFoundError` and `ET.ParseError`, not a `pytest.fail` and not a setup error.
- [x] 2.3 Make the helper fail with the captured child output on timeout (bytes or `None` decoded), missing JUnit and parse error. Green.
- [x] 2.4 Add `_WS_SCOPE` in `tests/orchestrator/test_ws_recheck.py`; `ws_server_modules` yields it; `_reload_server(ws_server_modules)` requires and checks it; `app_module` and the direct caller pass it. Run mutant (a) and record the error text.
- [x] 2.5 Import `mcp_resources` at the caller level (`:93-95` and `test_1_entry`) and inside the owned scope (after `getfixturevalue`, gated on prefixes, and in the auth and WebSocket child preludes). Run mutants (b) and (c) and record which in-process and child cases go red.
- [x] 2.6 Rewrite `tests/README.md:95-98` for the required-scope seam.

## 3. Verify

- [x] 3.1 Run:
  - the ownership, auth, response and header modules;
  - the CI-form orchestrator suite;
  - `--collect-only -q` of `test_ws_recheck.py` before and after;
  - after review is clean, the two-phase clean-clone evidence: the full unit command and the CI form, then `tests/deploy` alone;
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

## Risk packs

Selected:

- Shared state / ordering: a prefix-owned key created inside an owned scope is retired or restored; the reload cannot run outside the scope.
- Error / rollback: the child's captured output reaches the failure message on timeout, crash, missing and unparsable JUnit.
- Documentation / migration notes: the README seam sentence, task 2.6.

Not selected:

- Production, auth semantics, schema, dependencies and secrets: unchanged.

## Recorded at archive

- OCU PR: DankerMu/open-computer-use#152, head `caa341fba1eda526a98619f5eea9579c0cabc21c`, merged at `76866297fd0ffa5df2eda8c47a3dbe2b37be38a6`. #557 was closed automatically by the commit-message keyword; later commit bodies reference issues as `(#N)`.
- Review: standard cross-review. Round 1 at `353484f`: correctness+integration clean; test-evidence+spec one P3 coverage gap (stderr-only marker). Fix pass 1 at `caa341f` added a stdout marker asserted in every shape, each branch proven by a helper mutant. Round 2 clean.
- Clean-clone evidence at the head: full unit command minus `tests/deploy` 3681 passed, 5 skipped; CI-form orchestrator 2897 passed, 5 skipped, 3 subtests passed; `tests/deploy` alone 419 passed; all exit 0.
- Earlier evidence: step-1 red (`TimeoutExpired`, `FileNotFoundError`, `ET.ParseError`); module 27 passed; four modules 437 passed; mutants (a), (b), (c) killed with a control run; `test_ws_recheck.py` collect-only unchanged; `./tests/test-project-structure.sh` OK.
- Body-only evidence, not re-run: mutant (a), the step-1 red run and the control run have raw output only in the PR body; both reviewers' code reading agrees with the claims.
- Reported, not fixed: `tests/README.md` ~`:111-123` does not describe the prefix-key and child-diagnostics regressions; a caller that passes `_WS_SCOPE` literally bypasses the seam (outside AC1).
