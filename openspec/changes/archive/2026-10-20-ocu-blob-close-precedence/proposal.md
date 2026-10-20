## Why

The #564 close-only reason (`BlobCloseError` to `state_close_failed`) landed with two test gaps (#571). Production is correct; the suite would not catch a regression in either property. Paths are in the sibling `open-computer-use` checkout at `origin/main` `1df0b19`.

- **Primary precedence is pinned only at the `_publish_blob` level.** `test_blob_publication_fsync_failure_stays_primary_over_close_failure` (`tests/orchestrator/test_office_versions.py:1105-1125`) injects an EIO fsync primary plus a close failure but calls `_publish_blob` directly. The only `store_version`-level precedence test uses an ENOSPC primary (`:1128-1160`), which takes the `StorageLowError` branch. The two route-level blob tests (`tests/orchestrator/test_office_callback_processing.py:1801-1873`) inject a close failure only. A change that classifies "has `close_errors`" as close-only, in `callback.py:73-79` or in `store_version` (`versions.py:134-137`), would turn a real EIO link/fsync primary into `state_close_failed` and pass the Office module set.
- **Only one close failure is ever injected on the blob path.** `_owner_close_fault` (`tests/orchestrator/_office_store.py:458-519`) takes one `fail_role` and disarms after it fires, so every blob-path assertion is `close_errors == (close_error,)`. The `BlobCloseError` re-wrap at `versions.py:481-485` copies `close_error.close_errors`; a change that kept only the first failure would break the spec's "every close failure retained" without failing a test. `test_office_store.py:443-466` does assert two close failures, but on the state writer through `_state_write_fault`, which already takes a `close_errors` dict.

## What Changes

Tests only, in `open-computer-use`.

- **One fault helper, dict-shaped.** `_owner_close_fault` takes `close_errors: dict[role, OSError]` (each listed role fails once, in close order) and `sync_errors: dict[role, OSError]` (the role's `os.fsync` raises once inside the window), the shape `_state_write_fault` already uses. `_blob_owner_fault` and `_blob_fault` gain an optional `sync_errors` keyword; `_barrier_fault` keeps its signature; all build the one-entry close dict, so every existing caller is unchanged. `os.fsync` is patched only when a sync fault is requested. The inline `os.fsync` patch in the existing fsync-primary test moves onto `sync_errors`.
- **Primary precedence through `store_version`.** A non-ENOSPC fsync primary plus a close failure, driven through `_store(...)`: the raised error is the primary `OSError` itself, not `BlobCloseError`, with the close failure on `close_errors`; every owned close attempted once; no version recorded; no blob left.
- **Primary precedence on the callback route.** The same fault under a status-2 callback: HTTP 500 `state_corrupt`, not `state_close_failed`; state bytes unchanged; no version recorded.
- **Several close failures in one cleanup.** `_publish_blob` with two failing roles (different errno and message) raises `BlobCloseError` whose `close_errors` holds both errors in `_BLOB_CLOSES` order, whose errno and message come from the first, and whose `__cause__` is the first close error; all six owned closes attempted once; the linked blob stays present.
- **Mutants F, G and L** from the issue are the red oracle; the baseline is green by construction.

## Capabilities

### Modified Capabilities

- `ocu-atomic-write-outcomes`: the requirement "Office blob and replay-barrier cleanup attempts every owned close" gains the precedence-through-callers and multiple-close-failure scenarios.

## Impact

- `tests/orchestrator/_office_store.py` (the helper)
- `tests/orchestrator/test_office_versions.py`
- `tests/orchestrator/test_office_callback_processing.py`

No production code. `callback.py`, `versions.py` and `descriptor_io.py` are untouched. The state-writer and replay-barrier tests keep their assertions. This repository receives the fixture and its archive only.

## Triage

- Issue type: test gap (follow-up of #564)
- Fixture level: standard. Test-only, size S, on the reviewed #473/#564 fault helper.
- Upstream suggested level: absent (issue says P3)
- Blast radius: regression strength on a rare error path; none in production.
- Selected risk packs:
  - Error / rollback / partial outputs: primary precedence and every-close-failure retention on the blob path, pinned at every layer the callback crosses.
  - Compatibility: the helper's existing callers keep their behavior.
- Evidence floor:
  - mutants F, G and L each make at least one new test red, with the failing assertion named;
  - the Office module set green at the head;
  - the fault helper's existing callers unchanged in behavior (their tests green, their assertions untouched);
  - after review is clean, the two-phase clean-clone evidence;
  - `./tests/test-project-structure.sh` and the commit hooks pass.
