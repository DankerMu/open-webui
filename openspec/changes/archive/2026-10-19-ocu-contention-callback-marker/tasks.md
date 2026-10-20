## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Add module-level `_MARKER_NAMESPACE` (exec of `_MARKER_WRITER`) and `_record_contention`, with an interim direct-write body. Wire `contend`'s `denied` and `acquired` writes to it. The owner and startup tests stay green.
- [x] 2.2 Add the in-process regression in `test_office_crash_markers.py`: hold the namespace's `_marker_write`, run `_record_contention` in a thread, then assert in order: final path absent, one empty `0600` stage, release and join, exact `denied`, no stage left. Capture red on the not-exists assertion. Add the call-site guard: run the real owner test with `contention._record_contention` replaced by a recording delegate, and assert the recording is `[("callback-process-contended", "denied")]`. Capture its red with `contend`'s `denied` line temporarily reverted to `write_text`.
- [x] 2.3 Switch `_record_contention` to `_MARKER_NAMESPACE["_publish_marker"]`. The regression turns green.
- [x] 2.4 Update `tests/README.md`. In the marker-protocol paragraph, `callback-process-contended` is under the protocol and the thread holder is Event-based. In the `test_office_crash_markers.py` paragraph, describe the in-process hold at the namespace's `_marker_write`, the call-site guard, and the in-process seam next to the embedded one.

## 3. Verify

- [x] 3.1 Run both regressions (direct and call-site guard, each red then green), the concurrency, startup, crash-marker and store modules, the full `tests/orchestrator/` suite on Darwin (#551 failures reported), `./tests/test-project-structure.sh` and the commit hooks.

## Risk packs

Selected:

- Concurrency: the regression proves the writer/reader ordering, the thread always terminates, and the owner oracles stay unchanged.
- File IO / path safety: the stage is a fixture-owned `0600` sibling, and no stage remains.

Not selected:

- Production behavior, schema, dependencies, release/packaging and secrets: none of these change.
