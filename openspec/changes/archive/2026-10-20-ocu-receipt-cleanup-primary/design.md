## Context

These paths are in the sibling `open-computer-use` checkout, at `origin/main` `af7ff41`.

- **Writer:** `computer-use-server/uploads.py::write_import_receipts` (`:602-647`). The sequence is:
  1. `os.open` an `O_EXCL` `0600` temporary file;
  2. write it fully;
  3. `os.fsync`;
  4. `os.close` (in `finally`);
  5. `os.replace(temporary, destination)` and set `committed = True`;
  6. open, fsync and close the directory through `descriptor_io.close_final_directories`.

  The outer `except BaseException:` unlinks the temporary file when the write has not committed, then re-raises.

- **Canonical secondary-failure rule:** `descriptor_io.close_final_directories` (`:66-93`). With a primary error, it sets `primary_error.close_errors = getattr(primary_error, "close_errors", ()) + close_errors`, calls `primary_error.add_note("Final directory cleanup also failed: " + …)`, and returns, so the primary propagates.
- **Route:** `app.py:745-746`, `except Exception as e: raise HTTPException(500, detail=f"Failed to save file: {str(e)}")`. `CommittedCloseError` and `CorruptReceiptsError` are mapped earlier.

## Decisions

- **Retain the primary, record the cleanup failure** (the issue's recommended option). The code:

  ```python
  except BaseException as error:
      if not committed:
          try:
              temporary.unlink(missing_ok=True)
          except OSError as cleanup_error:
              error.cleanup_errors = getattr(error, "cleanup_errors", ()) + (cleanup_error,)
              error.add_note(
                  f"Temporary receipt cleanup also failed: {type(cleanup_error).__name__}: {cleanup_error}"
              )
      raise
  ```

  - It mirrors `close_final_directories`: a tuple attribute plus a note, and the primary keeps its type, identity, `__cause__` and classification.
  - The attribute name is `cleanup_errors`, distinct from `close_errors`, which keeps its meaning of final-directory close failures.
  - Only `OSError` is caught from the unlink. Any other exception there is a programming error and still propagates.

- **Rejected:** an aggregate or `ExceptionGroup`, because it changes the caller-visible type and would need re-classification in the route. Also rejected: a new shared helper in `descriptor_io`. One call site does not justify it, and the sibling writers are out of scope.
- **Route unchanged.** `str(exception)` does not include notes, so the 500 detail names the initiating failure. Status and envelope stay the same.
- **Tests,** all in `tests/test_upload_claim.py`, next to the existing writer failure cases (`:1300-1430`):
  - **Mixed failure,** parametrized over stage ∈ {write, fsync, replace}.
    - Identify the temporary file by wrapping `os.open` to record the descriptor of the `.imports.*.tmp` open, as the tests at `:1137` and `:1342` do.
    - Monkeypatch `os.write`, `os.fsync` or `os.replace` so that it raises a sentinel `OSError(errno.EIO, "<stage> refused")`. Apply it only to the temporary file's descriptor or path; directory fsync and unrelated calls pass through.
    - Monkeypatch `pathlib.Path.unlink` so that it raises `PermissionError(errno.EACCES, "cleanup refused")` only for `.imports.*.tmp` paths under the control directory.
    - Assert all of the following:
      - the raised exception `is` the sentinel;
      - `cleanup_errors == (cleanup_error,)`;
      - one note names the cleanup failure;
      - it is not a `CommittedCloseError`;
      - a pre-existing `imports.json` is byte-identical, and `read_import_receipts` returns the predecessor;
      - the unlink filter fired exactly once, on the temporary path;
      - `.ocu/` lists `imports.json` plus the one refused `.imports.*.tmp` file. Do not copy the `== ["imports.json"]` listing assertion from `:1297` or `:1768`.
  - **Missing-temp control.** Inject a replace failure and have the unlink filter delete the temporary file before delegating, so that `missing_ok=True` applies. Assert the sentinel propagates with no `cleanup_errors` attribute and no note.
  - **Route.** Use the existing `upload_server` fixture and `_upload(..., attachment_id=…)` helper; without `X-OCU-Attachment-Id`, no receipt is written. Inject the receipt replace failure, filtered on the `imports.json` destination, and the temporary unlink failure. Assert:
    - HTTP 500;
    - `detail` starts with `Failed to save file:` and contains the replace sentinel text;
    - `detail` does not contain `cleanup refused`;
    - earlier receipts are unchanged, as `:913` checks.
  - The existing successful-write and committed-close tests stay as they are.
- **Red, then green.** Against the current handler:
  - the mixed cases fail, because the raised exception is the `PermissionError`;
  - the route case fails, because the detail contains `cleanup refused`;
  - the missing-temp control is green on both sides.

Must preserve:

- `missing_ok=True` tolerance.
- The committed path, `close_final_directories` and `CommittedCloseError` mapping.
- `CorruptReceiptsError` mapping.
- Receipt validation, idempotency and replay.
- HTTP status codes and envelopes.
- The #365 behavior.
- Every existing test.

Governing invariant: when a pre-commit receipt write fails, the exception that entered the pre-commit cleanup propagates, and any temporary-cleanup `OSError` is retained on it. The existing temporary-descriptor close in the inner `finally` (`uploads.py:620-625`) is unchanged. If that close raises after a write or fsync failure, the close error is what enters cleanup; the target spec keeps that behavior (`ocu-atomic-write-outcomes` "Existing temporary-file-close behavior … SHALL remain unchanged").

## Seams and Evidence

All commands run in `open-computer-use` with the proxy variables unset. Python 3.13 is pinned. The runner is `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- …`.

- **Red:** the new cases fail against the current `uploads.py`.
- **Green:** `python -m pytest tests/test_upload_claim.py tests/test_file_route_module_ownership.py --import-mode=importlib`, plus the exact CI form from `build.yml:248-253`, run from the root: `OCU_INTERNAL_TOKEN=ci-internal-token MCP_API_KEY=ci-mcp-token … -- pytest tests/test_upload_claim.py tests/test_tools.py -v`.
- **Full:** the documented unit command in a clean `git clone` of the committed head must exit 0.
- Run `./tests/test-project-structure.sh` and the commit hooks.

Non-goals:

- the sibling temporary-unlink owners;
- final-directory close (#365);
- Office descriptor close (#473);
- parent fsync (#214);
- any claim about power loss.

Review focus:

- Does the primary keep its identity and classification?
- Is the cleanup error retained?
- Is only `OSError` caught?
- Is a missing temporary file still tolerated?
- Does the route detail name the initiating failure?
