## Context

These paths are in the sibling `open-computer-use` checkout.

- **Producer:** `tests/orchestrator/test_office_control_plane_concurrency.py`, in the `holder_source` string inside `test_callback_waits_for_ordinary_process_holder_while_health_progresses` (`:121-137`). It holds `docker_manager._combined_lock(chat)`, writes `ENTERED` directly, then waits for `RELEASE` with an 8-second deadline.
- **Barrier:** `_wait_marker` (`_office_store.py:310-315`), which checks existence only.
- **Consumer:** `test_office_contention_startup.py:52-59` reads the marker and requires exact `held` text before it raises the injected exception. The owner's cleanup oracle sits at `:82-105`.
- **Canonical writer:** `_MARKER_WRITER` (`_office_store.py:35-67`). It is embedded source that defines `_publish_marker(path, text)` with saved `os` primitives, an `O_EXCL` `0600` sibling stage, a complete write loop, fsync, close, and then `os.replace`; on failure it unlinks the stage.
- **Existing regression seam:** `_HELD_IO` (`test_office_crash_markers.py:18-42`). It holds every `os.open` / `io.open` until stdin gives `release`, and short-writes via `os.write`.

## Decisions

- **Reuse `_MARKER_WRITER`.** Do not introduce a second writer (canonicality).
  - Define a module-level `_PROCESS_HOLDER = _MARKER_WRITER + r'''…'''` holding the current holder body, with the `write_text` line replaced by `_publish_marker(Path(os.environ["ENTERED"]), "held")`.
  - The owner test passes `_PROCESS_HOLDER` where it passed `holder_source`.
  - The rest of the holder (lock, release wait, deadline, `print("released")`) and every parent-side assertion stay byte-identical.
- **Keep the consumers.** `_wait_marker` stays existence-only. Making readers tolerate empty text would hide the broken producer contract (#512 precedent).
- **Regression design.**
  - Run `_PROCESS_HOLDER` as a real child: `[sys.executable, "-c", <hold prelude> + _PROCESS_HOLDER, <ENTERED>, "held", <write limit>]`. It uses the same env the owner builds: `PYTHONPATH` = `SERVER_DIR`, `BASE_DATA_DIR` = a tmp data dir, `OCU_CHAT`, and `ENTERED` / `RELEASE`. `ENTERED` lives in its own empty subdirectory of `tmp_path`, so that stage counting sees only marker entries.
  - **Generalize `_HELD_IO`. Do not copy it.** Keep its argv convention: argv[1] is the marker path, which doubles as the hold filter key, and argv[3] is the short-write limit. The existing crash-marker case does exactly one `os.open` (its stage) under the same filter, so its behavior is unchanged.
  - **Filter rules.**
    - Opens whose first argument is not `str` / `PathLike` pass through untouched. For example, `_CombinedLock._open_file` calls `os.fdopen(lock_fd, "r+")`, which in CPython 3.13/3.14 forwards an integer fd to the patched `io.open`.
    - `str` / `PathLike` arguments are normalized with `os.fspath`.
    - The hold fires only when the basename equals argv[1]'s basename, or starts with `.` + that basename + `.`, and the parent equals argv[1]'s parent.
    - Lock-file opens (`.lifecycle.lock`, chat-id, relative with `dir_fd`) never match.
  - **Assertions, in this order:**
    1. The child reaches the held boundary.
    2. The final `ENTERED` path does not exist, and exactly one `.callback-process-entered.*.stage` exists in the marker subdirectory, empty and mode `0600`.
    3. Create `RELEASE` first, then `communicate("release\n")`.
    4. `returncode == 0`, stdout is `released\n`, the final path reads exactly `held`, and no stage remains.

    Child exit implies the publication finished, so no polling is needed.

  - `_stop_child` runs in `finally`.
  - **Red before the fix, without a plumbing error:**
    1. First move only: extract `_PROCESS_HOLDER` (already prefixed with `_MARKER_WRITER`) and keep the old `write_text` line. The owner test stays green.
    2. Then add the regression and capture red. The old `Path.write_text` reaches the patched `io.open` with the final path (CPython 3.13 `pathlib/_local.py:537`; 3.14 likewise), so the hold fires on the final path and the failing assertion is the not-exists check.
    3. Then switch the line to `_publish_marker`.

- **Rejected:** a pipe-framed readiness channel (the issue's alternative; more IPC plumbing for no gain); patching `Path.write_text` (it ties the oracle to one implementation); and sleeps or retries, which the acceptance criteria forbid.

Must preserve:

- `test_office_contention_startup.py` unchanged, including `caught is injected`, the exact `held` read, watchdog join, Docker lock and `fcntl.flock` restoration, holder exit and closed pipes.
- The owner's real contention, health progress, callback and zero-origin assertions.
- The 8-second holder deadline.
- `_wait_marker`, and the owner's in-function imports of `_wait_marker` / `_stop_child`, which `test_office_contention_startup.py:72-73` patches by late lookup. Only `_MARKER_WRITER` may be imported at module level.
- The existing `test_office_crash_markers.py` cases.

Governing invariant: when the process holder's `callback-process-entered` path exists, it contains exactly `held`.

## Seams and Evidence

All commands run in `open-computer-use`, using `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest … --import-mode=importlib` (OCU AGENTS.md).

- **Red:** the new regression against the old holder body fails on the final path existing at the hold.
- **Green:** after the producer change, run the regression module together with `test_office_contention_startup.py`, `test_office_control_plane_concurrency.py`, `test_office_crash_markers.py` and `test_office_store.py`.
- **Full suite:** run `tests/orchestrator/` under the module-entry command on Darwin and record pass, skip and fail counts. Any failure unrelated to this change is reported, not hidden.
- Run `./tests/test-project-structure.sh`.
- Record the interpreter version. Locally, `uv run --no-project` resolves CPython 3.14.2; the #512 image used 3.13.
- The commit hooks (pre-commit, commit-msg) must pass.

Non-goals:

- Linux-image requalification. The change is test-only Python using portable POSIX primitives already qualified for `_MARKER_WRITER` in #512.
- The remaining contention markers (`CONTENDED`, the thread holder).
- Production code.

Review focus:

- Does the hold filter observe only marker opens?
- Is the red caused by readiness, not by an import or plumbing error?
- Is the owner test still running the exact same holder?
- Is there no duplicate of `_HELD_IO` or `_publish_marker`?
