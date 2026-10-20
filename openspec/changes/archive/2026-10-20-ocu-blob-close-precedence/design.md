## Context

Paths are in the sibling `open-computer-use` checkout at `origin/main` `1df0b19`.

- **Production (unchanged):**
  - `computer-use-server/descriptor_io.py::close_final_directories`: closes every fd once; with a primary error it appends the close failures to `primary_error.close_errors` and returns; without one it raises `close_errors[0]` with `.close_errors` set to the whole tuple in close order.
  - `computer-use-server/office/versions.py:401-485` (`_publish_blob`): the `close_final_directories` call is wrapped; a close-only failure becomes `BlobCloseError(close_error.errno, close_error.strerror)` with `close_errors` copied and `raise ... from close_error`.
  - `versions.py:134-137` (`store_version`) and `:221-226` (`commit_publication_lineage`): `except OSError as extra: raise _storage_error(extra) from extra`; `_storage_error` (`:79-82`) converts only ENOSPC and otherwise returns the same object, so the primary error is re-raised as itself.
  - `computer-use-server/office/callback.py:73-79`: `except BlobCloseError` gives `state_close_failed`; `except OSError` gives `storage_low` for ENOSPC, otherwise `state_corrupt`.
- **Fault helper:** `tests/orchestrator/_office_store.py:458-535` (`_owner_close_fault(monkeypatch, store_cls, module, owner, *, fail_role=None, close_error=None)`). It records the owner call's directory closes by role, fails the one listed role once, records retried closes as invalid, and on exit computes `still_owned`. `_state_write_fault` (`:341-440`) in the same file takes `close_errors` as a dict and raises `close_errors[role]` after the real close.
- **Wrappers:** `tests/orchestrator/test_office_versions.py:1071-1082` (`_blob_owner_fault(store_mod, monkeypatch, owner, fail_role, close_errno=errno.EIO)`, ten call sites: nine tests in `test_office_versions.py` plus `_blob_fault`; returns `(versions_mod, close_error, fault)`) and `tests/orchestrator/test_office_callback_processing.py:1685-1694` (`_barrier_fault`). `_blob_fault` (`:1795-1798`) returns only the trace.
- **Existing tests:** `test_office_versions.py:1069` `_BLOB_CLOSES = ["staging", "versions", "office", "ocu", "root", "base"]`; `:1105-1125` patches `os.fsync` inline to refuse the `versions` role inside the window; `:1241-1258` is the `store_version`-level ENOSPC shape; `test_office_callback_processing.py:1801-1873` are the route-level close-only cases using `_blob_fault`, `_content_origin`, `recorded_status_2_payload`, `_post` and `_assert_refusal`.
- No test drives `commit_publication_lineage` directly.

## Decisions

- **Dict-shaped faults on the one helper.** `_owner_close_fault(monkeypatch, store_cls, module, owner, *, close_errors=None, sync_errors=None)`:
  - `close_errors: dict[str, OSError]`: after the real close of a listed role, raise its error once. The `armed` flag becomes per-role (a listed role fires once; `invalid_close_attempts` still catches a retry).
  - `sync_errors: dict[str, OSError]`: when non-empty, the helper also patches `os.fsync` inside the window; when `trace["active"]` and the fd is the listed role's owned fd, raise its error once, otherwise call the original. When `sync_errors` is empty the helper does not touch `os.fsync` at all, because two existing tests (`test_office_versions.py:1150`, `test_office_callback_processing.py:1720`) patch `os.fsync` with the fixture `monkeypatch` while inside the helper's context, and their teardown would otherwise restore the helper's wrapper instead of the real function. This is the inline patch from `test_office_versions.py:1110-1116`, moved into the helper so the three precedence tests share it.
  - `_blob_owner_fault` gains a trailing `sync_errors=None` keyword and passes `close_errors={fail_role: close_error}` plus `sync_errors`; `_blob_fault` gains the same `sync_errors=None` pass-through to `_blob_owner_fault`. `_barrier_fault` keeps its signature and passes the one-entry dict. Every existing caller is unchanged, and the tests' `close_error` identity assertions keep holding. All three precedence tests reach the helper through these wrappers; none calls `_owner_close_fault` directly.
  - The existing fsync-primary test (`:1105-1125`) uses `sync_errors={"versions": sync_error}` instead of its inline patch and keeps every assertion.
  - Alternative rejected: a second multi-fault helper beside `_owner_close_fault`, which would duplicate the close recorder.
- **`store_version`-level precedence**, in `test_office_versions.py` next to `:1241`: `_blob_owner_fault(store_mod, monkeypatch, "_publish_blob", "ocu", sync_errors={"versions": sync_error})` with `sync_error = OSError(errno.EIO, "versions fsync refused")`. Drive `_store(store_mod, SAVE, source="save", parent=1, published=True)` under `pytest.raises(Exception)`. Assert: `failure.value is sync_error`; `type(failure.value) is not versions_mod.BlobCloseError`; `failure.value.close_errors == (close_error,)`; `trace["attempts"] == _BLOB_CLOSES`; `trace["still_owned"] == []`; state bytes unchanged; `not _blob(data, SAVE).exists()`; staging empty.
- **Route-level precedence**, in `test_office_callback_processing.py` next to `:1801`: open a session, set `editing`, snapshot state bytes, serve `CHANGED` through `_content_origin`, and under `_blob_fault(monkeypatch, "root")` plus `sync_errors={"versions": OSError(errno.EIO, ...)}` post a status-2 payload. Assert: `_assert_refusal(failed, 500, "state_corrupt")`; `trace["calls"] == 1`; `trace["attempts"] == _BLOB_CLOSES`; `trace["still_owned"] == []`; `_state(data).read_bytes() == before`; the versions list unchanged; no blob at `_sha(CHANGED)`. `_blob_fault` gains a `sync_errors=None` pass-through.
- **Several close failures**, in `test_office_versions.py` next to `:1085`: `_owner_close_fault(monkeypatch, store_mod.OfficeStore, versions_mod, "_publish_blob", close_errors={"versions": first, "root": second})` with `first = OSError(errno.EIO, "versions close refused")` and `second = OSError(errno.EBADF, "root close refused")`, so errno and message differ; this is the one test that passes two roles, so it calls the helper directly. Call `versions_mod._publish_blob(...)` under `pytest.raises(versions_mod.BlobCloseError)`. Assert: `failure.value.close_errors == (first, second)`; `failure.value.errno == first.errno` and `failure.value.strerror == first.strerror`; `failure.value.__cause__ is first`; `trace["attempts"] == _BLOB_CLOSES`; `trace["still_owned"] == []`; the blob is present (`_blob(data, SAVE).read_bytes() == SAVE`, because a close-only failure happens after the link succeeded and the blob is unlinked only on a primary failure, `versions.py:458-467`); staging empty. The order follows `_BLOB_CLOSES`, which is the `close_final_directories` tuple order.
- **Red oracle.** The baseline is green by construction. Each new test is proven by its mutant, applied to a copy and reverted:
  - F: `callback.py:73-75` becomes `except OSError as extra: if getattr(extra, "close_errors", ()): _reject(...); return 500 state_close_failed` placed before the ENOSPC branch. The route test's `_assert_refusal(..., "state_corrupt")` fails.
  - G: in `store_version` (`versions.py:136-137`), wrap any non-ENOSPC `OSError` that is not already a `BlobCloseError` and carries `close_errors` as `BlobCloseError` before `_storage_error`. The `store_version` test keeps both `failure.value is sync_error` and `type(failure.value) is not versions_mod.BlobCloseError`; the identity assertion kills a re-wrap and the type assertion kills an in-place class swap. (A G that re-wrapped `BlobCloseError` itself is already killed by the existing `__context__ is close_error` check at `:1197`, so it would not prove the new test.)
  - L: `versions.py:483` becomes `blob_error.close_errors = (close_error,)`. The multi-close test's `close_errors == (first, second)` fails.

Must preserve:

- Every existing assertion in the three test files, including the `close_error` identity checks, `trace["attempts"] == _BLOB_CLOSES`, `still_owned == []`, and `invalid_close_attempts == []` on normal exit.
- The existing call forms of `_blob_owner_fault`, `_blob_fault` and `_barrier_fault` (the new keyword is optional) and the behavior of their callers.
- The state-writer tests (`test_office_store.py`) and `_state_write_fault`.
- Production code.

Governing invariant: on the blob path a primary error stays primary through `_publish_blob`, `store_version` and the callback, carrying every close failure; a close-only failure carries every close failure in close order.

## Test Plan

All commands run in `open-computer-use` with the proxy variables unset:

```
uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest … --import-mode=importlib
```

- **Baseline green** after the helper change and before the new tests: `test_office_versions.py`, `test_office_callback_processing.py`, `test_office_store.py` (the helper's existing callers).
- **New tests green** at the head.
- **Mutants F, G, L** each on a fresh copy of the production file, reverted and byte-compared: F fails the route test; G fails the `store_version` test; L fails the multi-close test. Record the failing assertion text for each.
- **Green, during review:** the Office module set (versions, callback_processing, callback_publish, callback_process_evidence, history, resolution, save_as, sessions, session_lifecycle, save_close, store).
- **After review is clean:** the two-phase clean-clone evidence at the PR head.
- `./tests/test-project-structure.sh`; the commit hooks.

Non-goals:

- `commit_publication_lineage` (no test drives it directly; it shares the `store_version` wrap and is reported as a sibling).
- The state writer and the replay barrier.
- `_unlink_blob`.
- Production code.

Review focus:

- Does each mutant die at the assertion the design names, not incidentally?
- Does the dict-shaped helper fail each listed role exactly once and still flag retries?
- Are the ten `_blob_owner_fault` call sites and `_barrier_fault` unchanged in behavior, and is `os.fsync` left alone when `sync_errors` is empty?
- Does the route test's primary come from the `versions` fsync inside the owner window, not from an earlier stage?
