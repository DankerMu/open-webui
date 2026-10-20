## Context

These paths are in the sibling `open-computer-use` checkout, at `origin/main` `27e0146`.

- **Helper:** `descriptor_io.close_final_directories(directory_fds, *, resource, committed_and_synced, primary_error)`.
  - It closes every non-`None` fd once.
  - With a primary, it sets `primary.close_errors` and adds a note, then returns.
  - Otherwise, if `committed_and_synced` is true, it raises `CommittedCloseError(resource, …)`.
  - Otherwise it raises the first close error, with `.close_errors` set.
  - Its existing users are `uploads.write_import_receipts`, `office/store.py` (`:290`) and the outputs index.
- **`_publish_blob`** (`versions.py:393-463`). The order is:
  1. `_open_tree(create=True)` gives the four tree fds;
  2. open `staging` and `versions`;
  3. fsync `office`;
  4. reuse an existing blob and return `False`, **or** write and fsync a temporary file, link it into `versions` (`claimed = True`), fsync `versions`, `office`, `ocu`, `root` and `base`, and return `True`.

  An `except BaseException` handler unlinks a claimed blob. The `finally` unlinks the temporary file and then closes six fds in sequence. Callers wrap `OSError` through `_storage_error` (ENOSPC becomes `StorageLowError`, anything else passes through) and record metadata only after the function returns (`:126-160`, `:214-257`).

- **`_unlink_blob`** (`:466-487`) is called from callers' exception handlers when `store.update` fails after a blob they own was published.
- **`_replay_barrier`** (`callback.py:445-458`). `_open_tree(create=False)` returning `None` maps to `state_durability`. The fsync failure maps to `CallbackRefusal(500, "state_durability")`. Four sequential closes follow. It is called in two places: on final-receipt replay (`:102`), before `_drive_receipt_publication`, and in `_replay_forcesave` (`:245`) for an existing status 6/7 receipt. Neither caller wraps the barrier in a `try`.
- **Route mapping** (`callback.py:42-77`). `CallbackRefusal` produces `{"reason": extra.reason}` with its status, and a bare non-ENOSPC `OSError` produces 500 `state_corrupt`.

## Decisions

- **Reuse the shared helper.** `close_final_directories` already lives in `descriptor_io` and is shared across modules. That makes the issue's "alternative" a reuse, not a new abstraction. Every call passes `committed_and_synced=False`. None of these owners commits an atomic resource that a close failure could misreport: the blob link is not a version record, unlink is a removal, and the barrier is only a sync. `resource="office_version_blob"` / `"office_tree"` is only a label, and it is unreachable when `committed_and_synced` is false.
- **`_publish_blob`.**
  - The handler becomes `except BaseException as error: primary_error = error`.
  - The claimed-blob unlink keeps running and keeps tolerating `FileNotFoundError`. Any other `OSError` from it is recorded on the primary with the #474 rule (`cleanup_errors` plus a note) and does not replace it. The primary that is recorded on is therefore always the exception that actually propagates.
  - In `finally`:
    1. Attempt the staged-temporary unlink when `staging_fd` is not `None`, tolerating `FileNotFoundError`. Handle any other `OSError` like this:
       - **With a primary:** record it on the primary as `cleanup_errors` plus a note, using the #474 wording and attribute.
       - **Without a primary:** that unlink error becomes the primary for the next step.
    2. Call `close_final_directories((staging_fd, versions_fd, office_fd, ocu_fd, root_fd, base_fd), resource="office_version_blob", committed_and_synced=False, primary_error=primary_error or unlink_error)`.
    3. If there was no original primary and the unlink failed, raise the unlink error after the helper returns. Any close failures are already recorded on it.
    4. If neither failed, the helper raises a close-only failure itself.
  - **Commit boundary.** A close-only failure after `return True` makes the call raise the close `OSError`. The caller's `except OSError` passes it through `_storage_error` and never reaches `store.update`, so no version metadata is recorded. The linked blob stays. It is content-addressed, so a later attempt verifies and reuses it through `_blob_stat` / `_verify_blob`. Do not unlink it after the closes: the `versions_fd` close may itself be the uncertain one, and descriptors are never used after their close attempt.

- **`_unlink_blob`.**

  ```python
  base_fd, root_fd, ocu_fd, office_fd = opened
  versions_fd = None
  primary_error = None
  try:
      versions_fd = store._open_dir(...)
      if versions_fd is None:
          return
      try:
          os.unlink(digest, dir_fd=versions_fd)
      except FileNotFoundError:
          pass
  except BaseException as error:
      primary_error = error
      raise
  finally:
      close_final_directories((versions_fd, office_fd, ocu_fd, root_fd, base_fd), resource="office_version_blob", committed_and_synced=False, primary_error=primary_error)
  ```

  Close order is unchanged: `versions_fd` first, then office, ocu, root, base.

- **`_replay_barrier`.**

  ```python
  primary_error = None
  try:
      try:
          store_module.os.fsync(office_fd)
      except OSError as extra:
          raise CallbackRefusal(500, "state_durability") from extra
  except BaseException as error:
      primary_error = error
      raise
  finally:
      try:
          close_final_directories((office_fd, ocu_fd, root_fd, base_fd), resource="office_tree", committed_and_synced=False, primary_error=primary_error)
      except OSError as close_error:
          raise CallbackRefusal(500, "state_close_failed") from close_error
  ```

  - The helper only raises when there is no primary, so the conversion applies only to close-only failures.
  - The `CallbackRefusal` carries the close errors through `__cause__`, which is the first close error, with `.close_errors` holding all of them.
  - The route's `_reject` logs the reason.
  - `state_close_failed` is a new stable reason with status 500, and it is never `state_corrupt`. The `opened is None` → `state_durability` path is unchanged.

- **Rejected alternatives:**
  - Inline close loops per owner, which would duplicate the helper.
  - Mapping a replay close-only failure to `committed_close_failed`, which would claim a resource was committed in this request when nothing was written.
  - Retrying closes.
  - Changing the route's generic `OSError` mapping.

**Tests.** They go in `tests/orchestrator/test_office_versions.py` and `tests/orchestrator/test_office_callback_processing.py`, or wherever the existing owner tests for these functions live. The implementer greps for the closest existing seam.

- **Close recorder.**
  - `versions.os`, `store_module.os`, `callback.os` and `descriptor_io.os` are all the same module, so patching `os.close` globally is fine (as in `test_office_versions.py:671`). The real hazard is fd-number reuse: `_probe_free_space_fd`, `_load`, the `_open_tree` partial-failure path, `store.read` and `_drive_receipt_publication` all close and reopen descriptors.
  - Learn the owned fds only from that owner's own `_open_tree` / `_open_dir` calls.
  - Arm the injection once, only for the selected owned fd.
  - Count closes only inside that owner's call window. Wrap the owner function so recording starts and stops around it.
  - The recorder performs the real close, then raises `OSError(errno.EIO, "close refused")` for the selected fd.
  - Assert that every owned fd appears exactly once in the window.
  - Drive the position tests directly against each owner function.
- **Positions.** For each owner, inject at an early position and at an intermediate position:
  - `_publish_blob` (six fds): early is `staging_fd`, intermediate is `ocu_fd`.
  - `_unlink_blob` (five fds): early is `office_fd`. Its current outer `finally` already closes all four tree fds after a `versions_fd` close failure, so `versions_fd` would not be red. Intermediate is `root_fd`.
  - `_replay_barrier` (four fds): early is `office_fd`, intermediate is `root_fd`.
- **Primary plus close.**
  - `_publish_blob`: fail `fsync` of `versions_fd` after the link, so that claimed-blob cleanup runs. Assert:
    - the raised exception is the fsync sentinel;
    - `close_errors` holds the injected close error;
    - the claimed blob is gone;
    - every fd is closed once.
  - `_unlink_blob`: fail `os.unlink(digest, dir_fd=…)` with `EIO`. Assert the sentinel is primary and the close error is recorded.
  - `_replay_barrier`: fail `fsync`. Assert it raises `CallbackRefusal` with `reason == "state_durability"` and with `close_errors` holding the close error.
- **Close-only.**
  - `_publish_blob` via `store_version`: inject a close failure at an early or intermediate position (not `base_fd`) on a successful publication of new content. Assert:
    - the call raises the close `OSError`, or its storage mapping for ENOSPC (not used here);
    - the document's version list in state is unchanged, with no new record;
    - all fds were closed once.

    Separately, a following `store_version` of the same content without injection succeeds and records exactly one new version that reuses the existing blob.

    The metadata assertion and the reuse follow-up are characterization tests. They pass today, because the close error already escapes before `store.update`. The red in this case comes from the closes skipped after the injected position.

  - `_unlink_blob`: the close error is raised with `close_errors`.
  - **Replay routes.** Inject a close failure in `_replay_barrier`. For both callers, assert HTTP 500 `{"reason": "state_close_failed"}`, not `state_corrupt`:
    - the existing final-receipt replay fixture;
    - one status-6 receipt replay through `_replay_forcesave`.

    The fsync-failure case, which must stay 500 `state_durability`, is a characterization test. It passes today. Extend the existing barrier fsync child test in `test_office_callback_process_evidence.py` (`OCU_FAIL_BARRIER`, `:280`) to assert the reason as well as the status. The existing replay-order tests remain unchanged.

- **Red, then green.** Against the current code:
  - the position tests fail, because later fds are not closed;
  - the primary-plus-close cases fail, because the close error replaces the primary;
  - both replay close-only cases fail, because the reason is `state_corrupt`.

  The characterization cases listed above pass on both sides.

**Docs (AC5).**

- OCU `computer-use-server/README.md:111-121` lists the Office callback reasons. Add `state_close_failed`: HTTP 500, raised when a receipt replay's barrier closes fail after a successful synchronization. The text claims nothing about power loss or the state of a descriptor after a failed close. Note there that a blob close-only failure is still reported as `state_corrupt`.
- Add an entry to the `CHANGELOG.md` Unreleased section, following the #365 precedent `d95497a`.
- In this repository, the WebUI archive PR adds one sentence to `docs/decisions/implemented/architecture/2026-10-03-ocu-office-file-store.md:23`. That paragraph presents `CommittedCloseError` as the only close-only outcome.

Must preserve:

- blob and version commit semantics, and the claimed-blob unlink on in-flight failure;
- receipt replay order;
- `state_durability` for a missing tree and for an fsync failure;
- every existing reason and status;
- `descriptor_io` unchanged;
- the #365 writers;
- every existing test.

Governing invariant: in each of the three owners, every owned directory descriptor receives exactly one close attempt; an earlier failure stays primary with all close failures recorded on it; and a close-only failure stays observable, surfacing as `state_close_failed` on the replay barrier.

## Seams and Evidence

All commands run in `open-computer-use` with proxy variables unset, using `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- …`. Python 3.13 is pinned.

- **Red:** run the new cases against the current owners.
- **Green:** run, with `--import-mode=importlib`, the new cases plus `tests/orchestrator/test_office_versions.py`, `test_office_callback_processing.py`, `test_office_callback_publish.py`, `test_office_callback_process_evidence.py`, `test_office_history.py`, `test_office_resolution.py` and `test_office_save_as.py`.
- **CI form:** `python -m pytest tests/orchestrator/`, with the `build.yml:248-251` environment.
- **Full:** run the documented unit command in a clean `git clone` of the committed head. It must exit 0.
- Run `./tests/test-project-structure.sh` and the commit hooks.

Non-goals: the #365 writers, other Office descriptor owners, the temporary-file descriptor close, caller-level masking when `_unlink_blob` runs inside a caller's handler, any power-loss claim, and any claim about descriptor state after an uncertain close.

Known residual:

- A `_publish_blob` close-only failure reaching the callback route still returns 500 `state_corrupt`. The path is `store_version` → `_storage_error` passthrough → `_persist_content` → `callback.py:74-77`. The sessions caller and `commit_publication_lineage` keep their existing mappings the same way.
- This is inside the issue boundary: the non-corruption reason is for the replay barrier only. The response does not claim a commit, and an ONLYOFFICE retry verifies and reuses the blob.
- It is handed to a follow-up issue, and the docs must not say a close-only failure is never corruption.

Review focus:

- Does each owner make exactly one close attempt per fd, with no retry and no use of an fd after its close?
- Does the primary keep precedence?
- Is the `_publish_blob` close-only boundary correct: no metadata recorded, and the blob reusable?
- Is replay close-only reported as `state_close_failed`, with `state_durability` unchanged?
