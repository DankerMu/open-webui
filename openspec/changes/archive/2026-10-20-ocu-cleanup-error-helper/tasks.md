## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Add the helper unit tests to `tests/test_descriptor_io.py`: first record, accumulation order across two records, and independence from `close_errors`. The independence test also asserts the recorded `cleanup_errors` and note. Capture red for every test against a do-nothing stub of `record_cleanup_error`.
- [x] 2.2 Add `descriptor_io.record_cleanup_error(primary, error, *, what)`.
- [x] 2.3 Switch the `uploads.py` inline block and both `office/versions.py` sites to the helper, and delete `_record_cleanup_error`.
- [x] 2.4 Show green:
  - helper tests, `tests/test_descriptor_io.py`, `tests/test_upload_claim.py` and `tests/orchestrator/test_office_versions.py`, with existing assertions unchanged;
  - the CI console form `pytest tests/test_upload_claim.py tests/test_tools.py -v`;
  - three helper mutants (list, reversed order, reworded note), each caught by both the helper tests and an existing caller test, then reverted;
  - the grep checks.

## 3. Verify

- [x] 3.1 Run:
  - after review is clean, the two-phase clean-clone evidence (full unit command and CI form, then `tests/deploy` alone);
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

Recorded at archive:

- Merged as DankerMu/open-computer-use#150 (`6e8c08c`, head `fb57dc9`).
- Red: against a do-nothing stub, all three helper tests failed on `cleanup_errors`. Against a stub that records the error but adds no note, all three failed on the exact note.
- Green: 145 passed across the helper and caller modules, and 135 passed in the CI console form.
- Mutants:
  - list instead of tuple: caught by both callers;
  - reversed order: caught by `test_office_versions` only;
  - reworded note: caught by `test_upload_claim` only.

  The test-evidence seat added six more mutants, and all six were caught. Swapping the two versions labels survives, as disclosed.

- Review round 1: both seats were clean, with no fix pass.
- Residual coverage:
  - `tests/test_descriptor_io.py` is not in the CI commands. So a hard-coded label, or a helper that overwrites `__notes__` instead of appending, would pass CI and be caught only by the full unit command.
  - The versions labels are guarded by review only.
- Clean `git clone` of the head:
  - full unit command minus `tests/deploy`: 3674 passed;
  - CI form, run in parallel: 2893 passed;
  - `tests/deploy` alone: 419 passed.

## Risk packs

Selected:

- Error / rollback / partial outputs: primary identity, `cleanup_errors` order and note text are byte-identical.

Not selected:

- Auth, schema, dependencies, concurrency, packaging, public API. None of these change.
