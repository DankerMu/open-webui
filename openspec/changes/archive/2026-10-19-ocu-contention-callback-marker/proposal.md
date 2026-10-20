## Why

The owner test `test_callback_waits_for_ordinary_process_holder_while_health_progresses` lives in OCU `tests/orchestrator/test_office_control_plane_concurrency.py`. Inside it, the in-process `contend` hook (installed as `fcntl.flock`) records a LOCK_NB denial with `Path(contended).write_text("denied")` (`:180` on OCU `5ad6093`). That call creates the final pathname before the payload is complete.

The parent then does two things:

- It waits in another thread through `_wait_marker` (`:226`), which checks existence only.
- It asserts `contended.read_text() == "denied"` (`:227`).

So an empty or partial marker can raise a false `AssertionError` before the test reaches its real oracle: the callback stays pending while `/health` answers (#552). This is the same window #521 closed for `callback-process-entered`, but here the writer is a thread inside the pytest process. #140's approach, concatenating `_MARKER_WRITER` into a child script's source, does not apply as is. This is a latent, source-verified window in a test harness. No production defect is claimed.

## What Changes

- Load the canonical embedded writer once in-process: `exec(_MARKER_WRITER, _MARKER_NAMESPACE)` at module level.
- Add a module-level `_record_contention(path, outcome)` that calls `_MARKER_NAMESPACE["_publish_marker"](Path(path), outcome)`.
- `contend` publishes both `denied` and `acquired` through it. Every other line of the owner test stays the same.
- Add an in-process behavioral regression. It runs `_record_contention` in a thread while holding the namespace's saved write primitive, so the hold sits before the payload is complete.
  - While the thread is held, the final `callback-process-contended` path does not exist.
  - After release, the path holds exactly `denied` and no stage remains.
  - The regression fails if `_record_contention` reverts to `Path.write_text`.
- Add a call-site guard that runs the real owner test with `_record_contention` replaced by a recording delegate. It asserts that `contend` published exactly `denied` through the helper, so a revert at the call site also fails.
- Update `tests/README.md`. The `test_office_crash_markers.py` paragraph describes the in-process hold and the call-site guard. The marker-protocol paragraph changes as follows:
  - bring `callback-process-contended` under the protocol;
  - describe the thread holder accurately: it signals through `threading.Event`, not a file marker.

## Capabilities

### Modified Capabilities

- `ocu-contention-test-lifetime`: the successful-evidence requirement now also requires the callback contention marker to imply complete text.

## Impact

Code in the sibling `open-computer-use` repository, test harness only:

- `tests/orchestrator/test_office_control_plane_concurrency.py`
- `tests/orchestrator/test_office_crash_markers.py`, which gets the regression
- `tests/README.md`

This repository receives the OpenSpec fixture and its archive only. The change does not touch production code, `_wait_marker` or `_MARKER_WRITER`. It adds no dependencies, sleeps, retries or skips.

## Triage

- Issue type: bugfix (test harness)
- Fixture level: standard. One producer pair, reusing the reviewed canonical writer from #512 and #521.
- Upstream suggested level: absent
- Blast radius: a false failure in the callback contention owner test; none in production.
- Selected risk packs:
  - Concurrency: ordering between the in-process writer thread and the reader thread.
  - File IO / path safety: the stage is a fixture-owned `0600` sibling, and replacement is atomic.
- Evidence floor:
  - the direct regression is red against the direct-write helper, and the call-site guard is red against a reverted `contend` line; both are green after;
  - the concurrency, startup, crash-marker and store modules pass;
  - the full `tests/orchestrator/` suite runs on Darwin, with the known CPython 3.14 failures (#551) reported, not hidden;
  - `./tests/test-project-structure.sh` passes;
  - the commit hooks pass.
