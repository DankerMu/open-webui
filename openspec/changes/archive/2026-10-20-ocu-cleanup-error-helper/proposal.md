## Why

When a secondary cleanup fails while a primary error is propagating, OCU records the cleanup failure on the primary with a fixed rule. It appends the error to `primary.cleanup_errors` (a tuple) and calls `primary.add_note("<what> cleanup also failed: <Type>: <error>")`. That rule now has two implementations (#563). On OCU `d45489d`:

- inline in `computer-use-server/uploads.py::write_import_receipts` (`:646-652`, added by #474);
- `computer-use-server/office/versions.py::_record_cleanup_error` (`:476-478`, added by #473), called at `:453` (`"Claimed version blob"`) and `:466` (`"Temporary version blob"`).

The sibling rule for close failures already has a single owner, `descriptor_io.close_final_directories`. The two copies can drift apart, for example by renaming the attribute, switching to a list, or rewording the note. That would break callers and tests that inspect `cleanup_errors` or `__notes__`. This violates the canonicality rule in AGENTS.md. Nothing is broken at runtime today.

## What Changes

The code lives in the sibling `open-computer-use` repository. Behavior is unchanged.

- Add `record_cleanup_error(primary: BaseException, error: OSError, *, what: str) -> None` to `computer-use-server/descriptor_io.py`, next to `close_final_directories`. It sets `primary.cleanup_errors = getattr(primary, "cleanup_errors", ()) + (error,)` and calls `primary.add_note(f"{what} cleanup also failed: {type(error).__name__}: {error}")`. A one-line docstring distinguishes it from `DescriptorTypeError.cleanup_error`, which is a deferred close error that replaces the original.
- In `uploads.py`, replace the inline block with `descriptor_io.record_cleanup_error(error, cleanup_error, what="Temporary receipt")`.
- In `office/versions.py`, delete `_record_cleanup_error` and call the shared helper at both sites with the existing labels.
- The note text, the attribute name, the tuple type and the accumulation order all stay byte-identical. Existing assertions do not change:
  - `tests/test_upload_claim.py:1544-1546`: exact note and `cleanup_errors`;
  - `tests/orchestrator/test_office_versions.py:1154`: order.
- Add unit tests in `tests/test_descriptor_io.py`:
  - first record: `cleanup_errors == (error,)` and the exact note;
  - accumulation: two records keep their order, and both notes are present in order;
  - independence: on a primary that already carries `close_errors`, recording sets `cleanup_errors == (error,)` with the exact note and leaves `close_errors` untouched; on a primary without `close_errors`, it does not create one.

## Capabilities

### Modified Capabilities

- `ocu-atomic-write-outcomes`: adds the requirement "Secondary cleanup failures share one recording rule".

## Impact

- Code, in the sibling `open-computer-use` repository:
  - `computer-use-server/descriptor_io.py`
  - `computer-use-server/uploads.py`
  - `computer-use-server/office/versions.py`
  - `tests/test_descriptor_io.py`
- Unchanged:
  - `close_final_directories` and the close-failure rule;
  - which errors count as primary;
  - `cleanup_errors` order and note wording;
  - HTTP behavior;
  - dependencies.
- This repository receives the fixture and its archive only.

## Triage

- Issue type: refactor (canonicality).
- Fixture level: standard. One helper and two call sites, with behavior pinned by existing tests.
- Upstream suggested level: absent.
- Blast radius: error metadata on two rare double-failure paths; output stays identical.
- Selected risk packs:
  - Error / rollback / partial outputs: the primary error identity, `cleanup_errors` order and note text are unchanged.
- Evidence floor:
  - Red: each new helper test fails when the helper is stubbed to do nothing. Every test, including the independence test, asserts the recorded `cleanup_errors` and note. For each failure, record the assertion that caught it.
  - Residual coverage, stated in the PR:
    - `tests/test_descriptor_io.py` is outside the CI pytest commands in `build.yml`. CI guards the rule only through the two caller tests; the helper tests run in the full unit command.
    - No caller test asserts the versions labels `"Claimed version blob"` and `"Temporary version blob"`. A mislabelled call site would be caught only by review.
  - Green:
    - the new helper tests pass;
    - `tests/test_upload_claim.py` and `tests/orchestrator/test_office_versions.py` pass with unchanged assertions;
    - `tests/test_descriptor_io.py` passes.
  - Mutants on the shared helper, each caught by both the helper tests and at least one existing caller test:
    - a list instead of a tuple;
    - reversed accumulation;
    - changed note wording.
  - Grep:
    - `grep -rn "cleanup_errors =" computer-use-server/` returns only the helper;
    - no `_record_cleanup_error` remains;
    - `uploads.py` has no inline cleanup `add_note`.
  - CI console form: `pytest tests/test_upload_claim.py tests/test_tools.py -v` (`build.yml`) passes.
  - Clean clone, after review is clean: the two-phase run passes. That is the full unit command and the CI form `python -m pytest tests/orchestrator/`, then `tests/deploy` alone.
  - `./tests/test-project-structure.sh` and the commit hooks pass.
