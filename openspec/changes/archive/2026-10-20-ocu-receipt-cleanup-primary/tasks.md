## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Add the mixed-failure writer cases (write, fsync, replace), the missing-temp control and the route case to `tests/test_upload_claim.py`. Capture red.
- [x] 2.2 Change the `write_import_receipts` pre-commit handler to retain the primary failure and record any temporary-unlink `OSError` as `cleanup_errors` plus a note.

## 3. Verify

- [x] 3.1 Run the following:
  - red then green;
  - `tests/test_upload_claim.py` and `tests/test_file_route_module_ownership.py`;
  - the exact CI form `pytest tests/test_upload_claim.py tests/test_tools.py -v` with the `build.yml:248-251` environment;
  - the full documented unit command in a clean `git clone` (exit 0);
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

Recorded at archive:

- Clean `git clone` of the merged head:
  - CI form: 135 passed;
  - full unit command: 4076 passed, 5 skipped.
- Review P3, not fixed: the mixed cases inject only `PermissionError`. A handler narrowed to `except PermissionError`, or widened to `except BaseException`, would still pass. A future hardening would parametrize an `OSError(EIO)` cleanup failure and add a non-`OSError` unlink case that must propagate.

## Risk packs

Selected:

- Error / rollback / partial outputs: the primary keeps its identity and classification, the cleanup error is retained, and the predecessor is byte-identical before commit.
- File IO / path safety: unlink is attempted once, only on the private temporary file, and a missing temporary file is tolerated.

Not selected:

- Auth, schema, dependencies, concurrency and packaging: none of these change. The HTTP status and envelope are unchanged.
