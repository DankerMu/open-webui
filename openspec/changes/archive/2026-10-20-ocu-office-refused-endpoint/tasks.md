## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Capture red. On this host, record `--durations` for the 5 cases at `origin/main`, where each takes over 5 s, and show that a direct probe of a bound, non-listening port times out.
- [x] 2.2 Add the shared refused-endpoint helper to `tests/orchestrator/test_office_commands.py`. It binds, reads the port, closes the socket, probes once with a short timeout, requires `ConnectionRefusedError` with a diagnostic otherwise, and returns the URL.
- [x] 2.3 Use the helper in the lifecycle `connection` cases, the sweep refused case and the commands refused case. Keep every existing assertion.
- [x] 2.4 Show green and the guards:
  - Durations: the 6 cases each take under 1 s in the `--durations=0` `call` phase, comparable to the sibling `http` and `invalid_code` cases.
  - Mutants: the helper keeps a socket that calls `listen(1)` and stays open (host-independent), and separately keeps a socket that is bound but not listening (host-dependent). In both, the probe fails with its diagnostic. Revert each mutant afterwards.
  - Grep: across every `bind(("127.0.0.1", 0))` site in `tests/`, no bound, non-listening socket is held open across a connect. `deploy/test_deployment_smoke.py:246-254` is either checked path by path or named as not checked.
  - Production untouched: `git diff --name-only origin/main...HEAD` lists only the three test modules.

## 3. Verify

- [x] 3.1 Run:
  - the three modules;
  - after review is clean, the two-phase clean-clone evidence: the full documented unit command minus `tests/deploy` in parallel with the CI form `python -m pytest tests/orchestrator/`, then `tests/deploy` alone. Nothing is deselected;
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

Recorded at archive:

- Merged as DankerMu/open-computer-use#148 (`fa98053`, head `834c8ea`).
- On the reporting host (macOS, Tailscale connected), a bound, non-listening port timed out after 7.84 s, while a closed port refused after 0.001 s.
  - Red: the 5 cases took 7.80–7.87 s each.
  - Green: the 6 refused cases took ≤0.01 s each; the sibling `http`/`invalid_code` cases stayed at 0.06 s.
- Probe-guard mutants:
  - a `listen(1)` socket kept open (works on any host): `probe connected`;
  - a bound socket kept open: `probe raised TimeoutError`.
- Review round 1: both seats clean, no fix pass.
  - P3, out of scope: `tests/deploy/test_smoke_native.py` and `deploy/smoke_deployment.py` keep their own refused-port idiom in the deploy suite.
  - Residual: a caller that bypasses the helper is caught only by the bind-site audit and review, since no test asserts timing.
- Clean `git clone` of the head, Python 3.13.3, nothing deselected:
  - full unit command minus `tests/deploy`: 3671 passed;
  - CI form `python -m pytest tests/orchestrator/`, run in parallel: 2893 passed, 3 subtests passed;
  - then `tests/deploy` alone: 419 passed.

## Risk packs

Selected:

- Test isolation / environment dependence: each test asserts the refused precondition instead of assuming host behavior.

Not selected:

- Production behavior, auth, schema, dependencies, packaging: none of these change.
