## Why

Three Office cleanup owners close their owned directory descriptors one after another, with no guard around each close (#473). All line numbers below refer to OCU `27e0146`.

- **`office/versions.py::_publish_blob`** (`:393-463`). Its `finally` first unlinks the staged temporary file, then closes `staging_fd`, `versions_fd`, `office_fd`, `ocu_fd`, `root_fd` and `base_fd` in sequence.
- **`office/versions.py::_unlink_blob`** (`:466-487`). It closes `versions_fd` in an inner `finally`, then the four tree descriptors in an outer `finally`.
- **`office/callback.py::_replay_barrier`** (`:445-458`). It maps an fsync failure to `CallbackRefusal(500, "state_durability")`, then closes the four tree descriptors in `finally`.

The same failures follow from all three:

- **Skipped closes.** If one close raises, every later close is skipped.
- **Lost primary error.** A close that raises from `finally` replaces the operation or fsync error that was already in flight.
- **Misreported replay.** In `_replay_barrier`, a close-only error reaches `process_authenticated_callback` as a bare `OSError` and is reported as HTTP 500 `state_corrupt` (`callback.py:74-77`). The receipt it just read is valid.

The repository already has the canonical shared helper for this: `descriptor_io.close_final_directories` (`:66-93`). It attempts every owned close exactly once and never retries. When a primary error exists, it records the close failures on that error (`close_errors` plus a note). When there is no primary, it raises the first close error carrying all of them, or `CommittedCloseError` for a committed and synced atomic resource. The JSON writers already use it (#365).

## What Changes

- **`_publish_blob`.**
  - Capture the primary error (`except BaseException as error`).
  - A non-missing failure in the claimed-blob unlink is recorded on the primary, not raised in its place. One reported reason changes as a consequence. When a post-link fsync fails with ENOSPC and the claimed unlink then fails with EIO, the ENOSPC is now kept, so the response is 503 `storage_low` instead of `state_corrupt`. AC2 requires this.
  - In `finally`, keep the staged-temporary unlink. A non-missing `OSError` from it is recorded on the primary as `cleanup_errors` plus a note (the #474 rule). If there is no primary, it is raised after the closes have been attempted.
  - Then call `close_final_directories((staging_fd, versions_fd, office_fd, ocu_fd, root_fd, base_fd), resource="office_version_blob", committed_and_synced=False, primary_error=…)`.
  - Do not touch the blob/version commit boundary. A close-only failure after the link and the directory fsyncs raises from `_publish_blob`, so `store_version` and `commit_publication_lineage` never record version metadata for that attempt.
  - The already-linked, content-addressed blob is left in place. A later publication of the same digest verifies and reuses it. A close is never retried, and an uncertain descriptor is never used after its close attempt.
- **`_unlink_blob`.** Collapse the nested `finally` blocks into one. Capture the primary, then call `close_final_directories((versions_fd, office_fd, ocu_fd, root_fd, base_fd), resource="office_version_blob", committed_and_synced=False, primary_error=…)`.
- **`_replay_barrier`**, which serves both final-receipt replay and `_replay_forcesave`. The fsync failure stays `CallbackRefusal(500, "state_durability")` and becomes the recorded primary. Closes go through `close_final_directories`. A close-only failure is converted to `CallbackRefusal(500, "state_close_failed")`, chained from the close error. This gives a stable reason that is not corruption. The callback route already maps `CallbackRefusal` to `{"reason": …}`, so no route change is needed.
- **Tests** cover every owner:
  - deterministic close-error injection at an early and at an intermediate descriptor position, showing that every owned descriptor gets exactly one close attempt;
  - a coinciding primary failure plus close failure;
  - a close-only failure;
  - for `_publish_blob` close-only through `store_version`: no new version metadata;
  - for replay: a close-only failure gives HTTP 500 `state_close_failed`, not `state_corrupt`, while fsync failure stays `state_durability` and replay ordering is unchanged.

## Capabilities

### Modified Capabilities

- `ocu-atomic-write-outcomes`: adds the requirement "Office blob and replay-barrier cleanup attempts every owned close".

## Impact

Code in the sibling `open-computer-use` repository:

- `computer-use-server/office/versions.py`
- `computer-use-server/office/callback.py`
- Office tests under `tests/orchestrator/`

The change does not touch:

- `descriptor_io.py`;
- the three atomic JSON writers covered by #365;
- blob, version and receipt commit semantics;
- callback replay order;
- the temporary-file descriptor close inside `_publish_blob`'s write `except` branch;
- other Office descriptor owners, which are not audited;
- dependencies.

The new callback reason `state_close_failed` is additive and documented in the OCU `computer-use-server/README.md` and `CHANGELOG.md`. In this repository, the decision record `2026-10-03-ocu-office-file-store.md` gains one sentence in the archive PR.

Known residual, filed as a follow-up: a `_publish_blob` close-only failure on the callback route still reports `state_corrupt`. It does not claim a commit, and a retry reuses the blob.

## Triage

- Issue type: bugfix (cleanup and error classification)
- Fixture level: expanded. It spans three owners in two modules and adds a public callback reason.
- Upstream suggested level: absent
- Blast radius:
  - descriptor leaks after one close failure;
  - lost primary errors;
  - a valid replay misreported as `state_corrupt`.

  No data loss.

- Selected risk packs:
  - Error / rollback / partial outputs;
  - File IO / path safety: owned descriptors, no retry;
  - Public API: the additive callback reason;
  - Compatibility: existing reasons unchanged.
- Evidence floor:
  - the position, primary-plus-close and replay close-only cases are red against the current owners and green after. The `store_version` metadata/reuse and `state_durability` cases are characterization tests;
  - the Office versions, callback, publication, history, resolution and save-as modules pass;
  - CI form `python -m pytest tests/orchestrator/` passes;
  - the full documented unit command passes in a clean `git clone`;
  - `./tests/test-project-structure.sh` and the commit hooks pass.
