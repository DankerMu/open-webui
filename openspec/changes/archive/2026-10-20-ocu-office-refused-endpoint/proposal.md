## Why

Two Office tests are meant to cover the DocumentServer "connection refused" branch. Both build their endpoint by binding a socket to `127.0.0.1:0` and keeping it open, never listening, while the client connects (#566). The sites, on OCU `5b6aeda`:

- `tests/orchestrator/test_office_session_lifecycle.py:247-252`: `test_unavailable_lookup_preserves_every_persisted_byte`, `connection` cases (editing, saving, closing, conflict);
- `tests/orchestrator/test_office_sweep.py:765-769`: `test_refused_connection_leaves_overdue_saving_session_and_pending_allocation_unchanged`.

Whether a bound, non-listening port refuses depends on the host. On macOS with the Tailscale system network extension connected, such a connect times out after about 8 s, while a closed port refuses in 0.0 s.

The five cases therefore exercise the client timeout branch, not the refused branch. They still pass, because both errors map to `UNREACHABLE` (`computer-use-server/office/commands.py:121`). Each case costs about 8 s. During #468 verification they were deselected for that reason.

The sibling `test_office_commands.py:250-256` already uses the deterministic idiom: bind, read the port, close the socket, then connect.

## What Changes

Test-only, in the sibling `open-computer-use` repository. No production change.

- **Shared helper.** `tests/orchestrator/test_office_commands.py` gains one helper, for example `_refused_docserver_url()`. The lifecycle and sweep modules already import `_command_origin` from this module. The helper:
  1. binds a socket to `127.0.0.1:0`, reads the port and closes the socket;
  2. probes the closed port once with a short client timeout (about 1 s);
  3. requires `ConnectionRefusedError` from the probe and fails the test with a diagnostic if the probe returns anything else (success, timeout or another error);
  4. returns `http://127.0.0.1:<port>`.

  Step 3 makes the precondition explicit: the endpoint refuses on this host, so the test cannot silently fall back to the timeout branch.

- **Callers.** The two sites above use the helper. `test_refused_connection_is_unreachable_for_forcesave_and_lookup` in `test_office_commands.py` also uses it, so the idiom has a single implementation.
- **Assertions unchanged.** Every existing assertion stays as it is:
  - lifecycle cases: 502 `documentserver_unavailable`, a byte-identical data snapshot and `recording.hits == 0`;
  - sweep case: the store, the snapshot and the state inode are unchanged;
  - commands case: both outcomes are `UNREACHABLE`.

## Capabilities

### Modified Capabilities

- `ocu-http-test-origins`: adds the requirement "Refused DocumentServer endpoints refuse deterministically".

## Impact

- **Code** in the sibling `open-computer-use` repository: `tests/orchestrator/test_office_commands.py`, `test_office_session_lifecycle.py` and `test_office_sweep.py`.
- **Unchanged:** `commands.py` and its 10 s limits, and the other `bind(("127.0.0.1", 0))` sites, which already close the socket or call `listen()` before use (#566 Boundary). No test-runner plugin is added.
- **This repository** receives the fixture and its archive only.

## Triage

- **Issue type:** test-evidence correction.
- **Fixture level:** standard. Three test modules, one established idiom.
- **Upstream suggested level:** absent.
- **Blast radius:** test evidence and runtime only.
- **Selected risk packs:**
  - Test isolation / environment dependence: the refused precondition is asserted per test, not assumed.
- **Evidence floor:**
  - **Red,** on this host while a bound, non-listening port times out:
    - each of the 5 cases takes over 5 s before the change (`--durations`);
    - a direct probe of the old idiom times out instead of refusing.
  - **Green:**
    - each of the 5 cases, plus the commands case, finishes in under 1 s (`--durations=0`), and every existing assertion passes;
    - durations are measured in the `call` phase and compared with the sibling `http` and `invalid_code` cases of the same parametrization, which serve as a baseline;
    - the helper's probe rejects a non-refusing endpoint, shown with two temporary mutants:
      - host-independent: the socket calls `listen(1)` and stays open, so the probe connects and must fail with its diagnostic;
      - host-dependent: the socket stays bound but not listening, so the probe times out on this host and must fail with its diagnostic.
  - **Grep:** no remaining test keeps a bound, non-listening socket open across a client connect. The grep covers every `bind(("127.0.0.1", 0))` site in `tests/`. `deploy/test_deployment_smoke.py:246-254` is checked on each path that reaches a connect, or the result names it explicitly as not checked.
  - **Production untouched:** `git diff --name-only origin/main...HEAD` lists only the three test modules.
  - **Modules:** the three modules pass, and the CI form `python -m pytest tests/orchestrator/` passes without deselection.
  - **Clean clone:** the full documented unit command passes, run through the two-phase evidence script (`tests/deploy` runs alone).
  - **Repo checks:** `./tests/test-project-structure.sh` and the commit hooks pass.
