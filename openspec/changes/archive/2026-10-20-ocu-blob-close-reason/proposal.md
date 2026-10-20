## Why

#473 made `office/versions.py::_publish_blob` attempt every owned directory close. When only a close fails, with no write, link or fsync error before it, `close_final_directories(..., committed_and_synced=False, primary_error=None)` re-raises the first close failure as a bare `OSError` (`descriptor_io.py`). This can happen in two places:

- after a new blob was linked and synchronized;
- after an existing blob was verified and `return False` was reached. Two places lead there: `_blob_stat` finding the blob already present (`versions.py:410-413`, the testable path), and the `FileExistsError` link race (`:435-437`). Both share the same `finally`.

On OCU `6e8c08c`, `store_version` passes that error through unchanged (`_storage_error` converts only `ENOSPC`). The callback route `_persist_content` does not map it, and `process_authenticated_callback` turns every non-`ENOSPC` `OSError` into HTTP 500 `{"reason": "state_corrupt"}` (`office/callback.py:73-76`).

Nothing is corrupt in this case. No version metadata was recorded, and a retry with the same content verifies and reuses the content-addressed blob. The replay barrier already reports the same close-only condition as `state_close_failed` (#473). `computer-use-server/README.md` documents this gap as a known residual (#564).

## What Changes

The code changes are in the sibling `open-computer-use` repository.

- `office/versions.py` gains `BlobCloseError(OSError)`, a close-only failure from version-blob publication. In `_publish_blob`, an `OSError` raised by `close_final_directories` is re-raised as `BlobCloseError`. That happens only on the close-only path: the helper raises only when there is no primary error, and the temporary-unlink error counts as primary there. The new error keeps:
  - the first close failure's errno and message;
  - `close_errors`;
  - `__cause__` pointing to the first close failure.

  Primary-error precedence, the temporary-unlink outcome and commit semantics are unchanged.

- `office/callback.py`:
  - `_persist_content` is unchanged. `BlobCloseError` is not in its recovery tuple (download, content and storage errors), so it already propagates without `_recover_outstanding`. A status-6 callback therefore keeps `pending_save_seq` and the `saving` state, the same as `StateDurabilityError` and `CommittedCloseError`. A test pins this.
  - `process_authenticated_callback` maps `BlobCloseError` to HTTP 500 `{"reason": "state_close_failed"}` before the generic `OSError` branch. It also logs the refusal through `_reject`, as the replay barrier's `CallbackRefusal` does.
  - A `BlobCloseError` whose errno is `ENOSPC` follows the existing conversion to `StorageLowError` in `store_version`, with its existing status-6 recovery.
  - A `BlobCloseError` from `commit_publication_lineage` that reaches the callback is mapped the same way. It can arrive through `_settle_resolve` publication recovery, post-commit `drive_obligation`, or `_orphan_session`. On that path the no-version and retry claims are not made.
- Other `_publish_blob` callers are unaffected because `BlobCloseError` is an `OSError` subclass:
  - session create (`sessions.py`);
  - restore (`restore.py`);
  - `commit_publication_lineage`.

  Each keeps its existing `OSError` handling. Whether those routes should get a distinct reason is out of scope.

- `computer-use-server/README.md` updates both contract sentences: "The reason covers only this replay barrier." (`:139-140`) and the "still reports it as `state_corrupt`" residual (`:141-142`). The new text states the new contract. It makes no claim about commit or power-loss durability. `CHANGELOG.md` gets an Unreleased/Fixed entry.

## Capabilities

### Modified Capabilities

- `ocu-atomic-write-outcomes`:
  - adds the requirement "Callback reports a close-only version-blob failure as state_close_failed";
  - modifies "Office blob and replay-barrier cleanup attempts every owned close", whose sentence "This reason applies only to the replay barrier" would otherwise contradict it.

## Impact

- Code in the sibling `open-computer-use` repository:
  - `computer-use-server/office/versions.py`
  - `computer-use-server/office/callback.py`
  - `computer-use-server/README.md`
  - `CHANGELOG.md`
  - tests under `tests/orchestrator/`
- Unchanged:
  - blob and version commit semantics;
  - the replay barrier;
  - `_unlink_blob`;
  - `CommittedCloseError` for the state writer;
  - the session create and restore routes;
  - dependencies.
- This repository receives the fixture and its archive only.

## Triage

- Issue type: bugfix (error classification on a public callback reason).
- Fixture level: expanded. It adds a public callback reason path and changes how status-6 recovery treats this error.
- Upstream suggested level: absent.
- Blast radius: a rare close-only failure during callback save or close is mislabelled. Retry is already safe.
- Selected risk packs:
  - Error / rollback / partial outputs: no version is recorded, the blob stays reusable, and primary precedence holds.
  - Public API: `state_close_failed` on the callback content path is additive; the other reasons are unchanged.
  - Compatibility: the sibling routes keep their existing `OSError` handling.
- Evidence floor: see `design.md`.
