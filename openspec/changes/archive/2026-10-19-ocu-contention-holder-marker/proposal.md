## Why

The process holder in `tests/orchestrator/test_office_control_plane_concurrency.py` writes its readiness marker with `Path(ENTERED).write_text("held")`. That call creates the final pathname before the payload is complete. `_wait_marker` (`tests/orchestrator/_office_store.py:310-315`) returns as soon as the path exists. The startup-failure test (`tests/orchestrator/test_office_contention_startup.py:52-59`) then requires exact `"held"` text before it raises its injected exception.

An incomplete marker can therefore fail that exact-text assertion. The owner then sees an `AssertionError` instead of the injected exception, and `caught is injected` fails before the cleanup oracle is checked (#521). This is a latent, source-verified window in a test harness. No production defect is claimed.

The repository already has the canonical fix for this class: the embedded `_MARKER_WRITER` / `_publish_marker` (#512). It writes to an exclusively owned sibling stage, syncs, closes and then atomically replaces the final path. Its README section explicitly left contention-only markers out of scope.

## What Changes

- Move the holder's embedded source out of the test function into a module-level constant, prefixed with `_MARKER_WRITER`, and publish `ENTERED` with `_publish_marker(Path(os.environ["ENTERED"]), "held")`. The owner test runs the same constant, so the producer under test is the real one.
- Add a behavioral regression that runs that real holder source with a path-filtered hold at the marker's open:
  - while the child is held, the final `callback-process-entered` path does not exist;
  - after release, the final path holds exactly `held`.

  Reuse or generalize the existing `_HELD_IO` seam in `test_office_crash_markers.py` instead of copying it.

- Update the `tests/README.md` marker-protocol paragraph to cover this contention marker. The remaining contention markers stay outside the protocol.

## Capabilities

### Modified Capabilities

- `ocu-contention-test-lifetime`: the first-process-readiness scenario now requires the holder's readiness marker to imply complete text.

## Impact

Code in the sibling `open-computer-use` repository, test harness only:

- `tests/orchestrator/test_office_control_plane_concurrency.py`
- the regression's module (`test_office_crash_markers.py` or the contention module)
- `tests/README.md`

This repository receives the OpenSpec fixture and its archive only. The change touches no production code and no dependencies, adds no sleeps, retries or skips, and keeps `_wait_marker` and every exact-text and cleanup oracle in `test_office_contention_startup.py`.

## Triage

- Issue type: bugfix (test harness)
- Fixture level: standard. The change is a test-harness synchronization fix on one producer and reuses an established, reviewed helper.
- Upstream suggested level: absent
- Blast radius: a false failure in the contention startup oracle; none in production.
- Selected risk packs: Concurrency (readiness publication ordering); File IO / path safety (stage ownership and atomic replace in fixture-owned directories).
- Evidence floor:
  - the new regression is red against the current direct write and green after;
  - the contention, startup, crash-marker and shared-store modules pass;
  - the complete orchestrator suite passes under the module-entry command on Darwin;
  - `./tests/test-project-structure.sh` passes.
