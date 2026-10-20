## Why

`computer-use-server/uploads.py::write_import_receipts` writes a private temporary file, fsyncs it, then runs `os.replace` into `.ocu/imports.json`. If any of those steps fails before the commit, the outer `except BaseException:` handler (`:644-647` on OCU `af7ff41`) runs `temporary.unlink(missing_ok=True)` and then a bare `raise`.

If that unlink raises an `OSError` other than a missing file (for example `PermissionError` or `EIO`), the cleanup error replaces the initiating failure. The initiating failure survives only as implicit `__context__`.

The upload route then returns HTTP 500 with `detail=f"Failed to save file: {str(e)}"` (`app.py:745-746`). The client therefore sees the cleanup error, not the write, fsync or replace failure that started the cleanup (#474). No data loss is claimed: before the commit, the predecessor receipt file is untouched. The existing temporary-descriptor close in the inner `finally` keeps its current behavior; if it raises, its error is what enters cleanup.

The repository already has the canonical rule for this class in `descriptor_io.close_final_directories` (`:66-93`). When a primary error exists, it appends the secondary failures to an attribute on the primary error, adds a note to it, and lets the primary propagate. The spec `ocu-atomic-write-outcomes` already requires that "An earlier write, replacement or synchronization failure SHALL remain the primary inspectable error" for final-directory cleanup. Temporary-file cleanup in this writer is not yet covered.

## What Changes

- In `write_import_receipts`, the pre-commit handler becomes `except BaseException as error:`.
  - It still attempts `temporary.unlink(missing_ok=True)` when the write has not committed.
  - On an `OSError` from that unlink, it records the error on the primary as `error.cleanup_errors` (a tuple, appended to any existing one) and calls `error.add_note("Temporary receipt cleanup also failed: <Type>: <text>")`.
  - It then re-raises the initiating error with the bare `raise`.
  - A missing temporary file is still tolerated through `missing_ok=True`.
  - Successful writes, the committed path, directory fsync and `close_final_directories` are unchanged.
- The upload route stays unchanged. `str(error)` excludes notes, so its HTTP 500 detail now carries the initiating failure's text. The status code and envelope are unchanged.
- Tests in `tests/test_upload_claim.py`:
  - Direct writer cases inject a pre-commit failure at the write, fsync or replace step, combined with a non-missing unlink failure on the temporary path. Each asserts four things: the initiating exception object is raised; it carries `cleanup_errors == (unlink_error,)` and the note; the predecessor `imports.json` is byte-identical; no committed classification is reported.
  - A missing-temp control: when the temporary path is already gone at cleanup, the initiating error propagates with no `cleanup_errors`.
  - A route case: an upload with the receipt replace and the temporary unlink both failing returns HTTP 500 whose `detail` names the replace failure and does not contain the cleanup error text.

## Capabilities

### Modified Capabilities

- `ocu-atomic-write-outcomes`: adds the requirement "Receipt temporary cleanup retains the primary failure".

## Impact

Code in the sibling `open-computer-use` repository:

- `computer-use-server/uploads.py`
- `tests/test_upload_claim.py`

The change does not affect:

- `app.py`, `descriptor_io.py` or the post-replace directory-close behavior (#365);
- the sibling temporary-unlink blocks in `outputs_broker.py`, `office/store.py` and `office/versions.py`, which are not audited or claimed here;
- HTTP status, receipt replay or idempotency;
- dependencies.

This repository receives the fixture and its archive only.

## Triage

- Issue type: bugfix (error provenance)
- Fixture level: standard. One handler, following an established in-repo rule.
- Upstream suggested level: absent
- Blast radius: misreported upload failure text when two failures coincide; no data loss.
- Selected risk packs:
  - Error / rollback / partial outputs: primary-error precedence and the untouched predecessor.
  - File IO / path safety: the temporary-file cleanup.
- Evidence floor:
  - the new cases are red against the current handler and green after;
  - `tests/test_upload_claim.py` and `tests/test_file_route_module_ownership.py` (receipt identity) pass;
  - the exact CI form from `build.yml:248-253` (`pytest tests/test_upload_claim.py tests/test_tools.py -v` with its environment) passes;
  - the full documented unit command passes in a clean `git clone`;
  - `./tests/test-project-structure.sh` and the commit hooks pass.
