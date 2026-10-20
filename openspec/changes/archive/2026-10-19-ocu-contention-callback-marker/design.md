## Context

These paths are in the sibling `open-computer-use` checkout, at `origin/main` `5ad6093`.

- **Producer:** the `contend` closure inside `instrumented`, in the owner test `test_callback_waits_for_ordinary_process_holder_while_health_progresses` (`tests/orchestrator/test_office_control_plane_concurrency.py:170-185`).
  - On `BlockingIOError` it runs `Path(contended).write_text("denied")` (`:180`) and then blocks on `LOCK_EX`.
  - On an unexpected grant it writes `acquired` (`:183`) and raises `AssertionError`.
- **Barrier:** `await asyncio.to_thread(_wait_marker, contended, holder, ...)` (`:226`). `_wait_marker` (`_office_store.py:310-315`) checks existence only and aborts early if `holder.poll()` reports an exit.
- **Consumer:** `assert contended.read_text(encoding="utf-8") == "denied"` (`:227`).
- **Canonical writer:** `_MARKER_WRITER` (`_office_store.py:35-67`). It is embedded source that defines `_publish_marker(path, text)`. The function uses module-global saved primitives (`_marker_open`, `_marker_write`, `_marker_sync`, `_marker_close`, `_marker_replace`, `_marker_unlink`) and writes an `O_EXCL` `0600` sibling stage, fsyncs and closes it, then `os.replace`s it. On failure it unlinks the stage.
- **Existing sibling regression:** `test_process_holder_entered_marker_is_absent_until_complete` (`test_office_crash_markers.py`) uses `_HELD_IO` for a child process. That seam is not usable in-process.

## Decisions

- **In-process reuse of the canonical writer** (the issue's recommended option):
  - Run `_MARKER_NAMESPACE: dict = {}` and `exec(_MARKER_WRITER, _MARKER_NAMESPACE)` once at module level.
  - Define `_record_contention(path, outcome)` as `_MARKER_NAMESPACE["_publish_marker"](Path(path), outcome)`.
  - `contend` calls `_record_contention(contended, "denied")` and `_record_contention(contended, "acquired")` in place of the two `write_text` lines.
  - No new writer code. `_publish_marker` stays the single writer implementation.
  - Only `docker._combined_lock` and `fcntl.flock` are patched in the owner test, so the saved-primitive aliasing is harmless here.
- **Rejected alternatives:**
  - Factoring `_publish_marker` into a real function in `_office_store.py` (Alternative A). It touches the constant that every crash worker embeds, which is a larger blast radius.
  - A `threading.Event` with a recorded outcome (Alternative B). It loses `_wait_marker`'s `holder.poll()` early abort and diverges from the shared marker pattern.
  - An inline temp-file plus `os.replace`. It would be a second writer.
- **Regression design** (in `test_office_crash_markers.py`, next to the holder regression; import `_MARKER_NAMESPACE` and `_record_contention`):
  - **Hold.** Use `monkeypatch.setitem(_MARKER_NAMESPACE, "_marker_write", held_write)`. `held_write`:
    - sets `reached`;
    - waits on `release` with a bounded timeout, raising if it expires, so the thread can never hang;
    - then delegates to the saved original.

    `_publish_marker` resolves `_marker_write` from the namespace globals at call time, so the hold sits after the stage is opened and before any byte is written.

  - **Writer thread.** A `threading.Thread` runs `_record_contention(markers / "callback-process-contended", "denied")` and sets `reached` in a `finally`, so a writer that never calls `_marker_write` (the reverted `Path.write_text`) also unblocks the main thread. `markers` is a fresh subdirectory of `tmp_path`.
  - **Assertions, in this order:**
    1. `reached.wait(5)` is true.
    2. The final path does not exist. This is the red assertion for a reverted producer: the thread has already finished and the final path holds `denied`.
    3. Exactly one `.callback-process-contended.*.stage` exists, empty and mode `0600`.
    4. Set `release` and join the thread with a timeout. The thread is not alive and raised nothing; capture exceptions through a holder list.
    5. The final path reads exactly `denied`, and no stage remains.
  - Set `release` and join in `finally`.
  - No sleeps or polling loops.

- **Call-site guard.** The direct regression proves the helper, not the `contend` call site. A second test in the same module guards the producer that issue #552 names.
  - It runs the real owner test, `contention.test_callback_waits_for_ordinary_process_holder_while_health_progresses(office_world)`, the way `test_office_contention_startup.py:62-77` does. Use `office_world` imported from `test_office_sessions`.
  - It patches `contention._record_contention` with a delegate that records `(Path(path).name, outcome)` and then calls the original. `contend` resolves the module global at call time.
  - It asserts that the recording equals `[("callback-process-contended", "denied")]`.
  - If `contend` reverts to `Path(contended).write_text`, the recording is empty and the guard goes red. The owner test's own oracles still run unchanged inside it.
- **Red before the fix, without a plumbing error.** First add `_MARKER_NAMESPACE` and `_record_contention`, with `_record_contention`'s body temporarily `Path(path).write_text(outcome, encoding="utf-8")` and `contend` wired to it. Add the direct regression and capture red on assertion 2. Then switch the body to `_publish_marker`. The owner test stays green at both steps. Separately, capture the call-site guard red by temporarily reverting `contend`'s `denied` line to `Path(contended).write_text(...)`: the recording is empty. Restore the line before committing.
- **Keep the consumers.** `_wait_marker` stays existence-only, and the exact `== "denied"` read stays.

Must preserve:

- The owner test's oracles:
  - `not pending.done()` before and after `/health`;
  - `/health` returns 200 `{"status": "healthy"}`;
  - the watchdog/`health_progress` handshake;
  - callback 200 `{"error": 0}`;
  - holder exit 0 with `released`;
  - restored patches;
  - `editing` state;
  - `origin.hits == 0`.
- The in-function imports of `_wait_marker` / `_stop_child` that `test_office_contention_startup.py` patches by late lookup.
- `_PROCESS_HOLDER` and its regression.
- `test_office_contention_startup.py`, unchanged.
- `_MARKER_WRITER` source, unchanged.
- `_HELD_IO` and the existing `test_office_crash_markers.py` cases, including #140's holder regression, unchanged.

Governing invariant: when `callback-process-contended` exists, it contains exactly the complete outcome text.

## Seams and Evidence

All commands run in `open-computer-use`:

```
env -u ALL_PROXY -u HTTPS_PROXY -u HTTP_PROXY -u all_proxy -u https_proxy -u http_proxy \
  uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt \
  -- python -m pytest … -q --import-mode=importlib
```

- **Red:** the direct regression against the interim direct-write body fails on assertion 2, and the call-site guard fails on its recording assertion with `contend`'s `denied` line temporarily reverted.
- **Green:** after the switch, run the regression module together with `test_office_control_plane_concurrency.py`, `test_office_contention_startup.py` and `test_office_store.py`.
- **Full suite:** run `tests/orchestrator/` on Darwin and record pass, skip and fail counts. The three known `test_mcp_discovery.py` failures under CPython 3.14.2 (#551) are reported as pre-existing; any other failure blocks.
- Run `./tests/test-project-structure.sh`.
- The commit hooks pass.

Non-goals: production code; `_wait_marker`; `_MARKER_WRITER`; the thread holder (Event-based); the #512 crash markers; Linux requalification.

Review focus:

- Does the hold sit before the payload is complete, and does a reverted `write_text` helper fail on the not-exists assertion?
- Does a reverted `contend` call site fail the call-site guard?
- Does the thread always terminate?
- Is the owner test byte-identical apart from the two producer lines?
- Is there no second writer?
