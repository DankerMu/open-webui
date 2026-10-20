## Context

`_publish_blob` (`office/versions.py`) owns six directory descriptors: `staging`, `versions`, `office`, `ocu`, `root` and `base`. In its `finally` block it calls `close_final_directories` with one of two primaries: the captured primary error, or the temporary-unlink error when there is no primary. The helper raises only when no primary was passed, and in that case it raises the first close failure as a bare `OSError` carrying `close_errors`. Raising there is therefore exactly the close-only outcome.

## Decisions

1. **Typed error at the source.** `BlobCloseError(OSError)` is defined in `office/versions.py` and raised from `_publish_blob` by wrapping that helper call:

   ```python
   try:
       close_final_directories(...)
   except OSError as close_error:
       blob_error = BlobCloseError(close_error.errno, close_error.strerror)
       blob_error.close_errors = close_error.close_errors
       raise blob_error from close_error
   ```

   Exact construction is up to the implementer. The required properties of the error raised by `_publish_blob`: errno and strerror match the first close failure, `close_errors` holds all of them, and `__cause__` is the first close failure.

   `store_version` re-raises through `raise _storage_error(extra) from extra`. For a non-`ENOSPC` error that rewrites `__cause__` to the error itself, while `__context__` keeps the first close failure. Assertions at the `store_version` level therefore check type, errno, `close_errors` and `__context__`, not `__cause__`. Changing that existing re-raise is out of scope.

   Rejected alternative: duck-typing `close_errors` at the callback. `close_final_directories` also attaches `close_errors` to primary errors, so a real primary failure could be misclassified (#564).

2. **Subclass of `OSError`.** This keeps every existing caller's handling. `store_version`'s `except OSError -> _storage_error` still converts `ENOSPC` to `storage_low`. Session create, restore and `commit_publication_lineage` keep their branches.
3. **Callback mapping.**
   - `_persist_content` needs no change. Its recovery tuple (`DownloadRejected`, `DownloadFailed`, `FileTooLarge`, `CorruptDocumentError`, `StorageLowError`) does not include `BlobCloseError`, so the error propagates past it without recovery. Adding it to the explicit re-raise tuple would be a no-op.
   - `process_authenticated_callback` adds `except BlobCloseError` before `except OSError`. The branch calls `_reject(chat, session_id, "state_close_failed")` so the refusal is logged like the replay barrier's `CallbackRefusal`, then returns HTTP 500 `{"reason": "state_close_failed"}`.
   - The reason string is the one the replay barrier uses, so the callback has one close-only reason.
4. **Recovery contract.** A status-6 close-only failure that is not `ENOSPC` keeps `pending_save_seq` and `saving`, matching `StateDurabilityError` and `CommittedCloseError`. An `ENOSPC` close failure becomes `StorageLowError` and keeps its existing recovery. The retry path is ONLYOFFICE re-sending the callback. On that resend the blob is verified and reused, and the version is recorded.

## Risks

- A future caller that converts `OSError` by errno only, rather than by type, would not see the distinction. That is acceptable, because the class is still an `OSError`.
- `commit_publication_lineage` (`publish.py:1275`, with content) is reachable from the callback through three paths: `_settle_resolve` publication recovery, post-commit `drive_obligation`, and `_orphan_session`. A `BlobCloseError` raised there is mapped to `state_close_failed` too. The spec scopes its no-version and retry claims to callback content storage, because a post-commit obligation may follow a recorded version.

## Test Plan

Tests go in the existing callback and versions test modules, reusing their helpers. That includes the `_owner_close_fault` windowed recorder in `tests/orchestrator/_office_store.py`, which injects one close failure in `_publish_blob`.

- **Versions level:**
  - **Existing tests:** the two tests asserting `failure.value is close_error` (`tests/orchestrator/test_office_versions.py:1095` and `:1193`) are updated. They now assert `isinstance(failure.value, BlobCloseError)` with matching errno, `close_errors` and `__context__`, plus, where the test drives `_publish_blob` directly, `__cause__ is close_error`. The existing `test_store_version_close_failure_records_no_version_and_retry_reuses_blob` (`:1181`) is extended rather than duplicated.
  - **New blob, close-only failure:** `store_version` raises `BlobCloseError`. Every owned close is attempted once, no version metadata is recorded, and a retry with the same content succeeds, records one version and reuses the blob.
  - **Existing blob, close-only failure:** publish content A, then B, then A again so `_blob_stat` finds the blob (`return False`) under close injection. Expect `BlobCloseError`.
  - **Primary failure plus a close failure:** the primary error stays the raised error, not `BlobCloseError`, with `close_errors` attached. Existing tests that cover this must keep passing unchanged.
  - **`ENOSPC` close-only failure:** `StorageLowError`, through the existing conversion.
- **Callback route:**
  - **Close-only failure on a status-2 final save:** HTTP 500 `{"reason": "state_close_failed"}`, and `caplog` holds an error record with `reason=state_close_failed`.
  - **Close-only failure on a status-6 forcesave:** HTTP 500 `state_close_failed`, and `pending_save_seq` and `saving` stay unchanged (`_recover_outstanding` not run).
  - **Retry:** re-sending the same callback afterwards succeeds. The version blob's inode is unchanged and exactly one new version is recorded.
- **Red:** the route cases return `state_corrupt` on `origin/main`, the status-6 case shows the same, and the versions cases raise a bare `OSError`. Capture each with the assertion that fails.
- **Mutants:**
  - mapping `BlobCloseError` to `state_corrupt`;
  - adding `BlobCloseError` to the `_persist_content` recovery tuple together with a reason branch, so status-6 recovery actually runs. The status-6 pending-save assertion must be what catches it, not an `AttributeError` on `extra.reason`;
  - wrapping primary-error closes as `BlobCloseError`;
  - removing the `_reject` call from the new branch, which the status-2 `caplog` assertion must catch.

  Each must be caught by a named test.

- **Docs:** both README contract sentences (`:139-140` and `:141-142`) are replaced, and the `CHANGELOG.md` entry is present.
- **Evidence:**
  - green on the Office module set: versions, callback_processing, callback_publish, callback_process_evidence, history, resolution, save_as, and the session modules that call `store_version`;
  - after review is clean, the two-phase clean-clone run: the full unit command and the CI form, then `tests/deploy` alone;
  - `./tests/test-project-structure.sh` and the commit hooks.
