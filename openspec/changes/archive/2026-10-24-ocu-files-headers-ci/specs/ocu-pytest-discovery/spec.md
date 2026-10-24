## ADDED Requirements

### Requirement: Main CI runs the file-serving contract tests

The OCU main build workflow's non-image pytest step SHALL run the complete `tests/test_files_headers.py` module in its own `python -m pytest` invocation, separate from the `tests/orchestrator/` selection, without a filtering expression, swallowed status or `continue-on-error`, so that a failure in that module fails the step. Evidence SHALL record actual execution separately from collection, and local step execution SHALL NOT be described as a hosted Ubuntu run.

#### Scenario: Edited step executed locally

- **WHEN** the `pytest-orchestrator` step's `run:` script is extracted from `build.yml` and executed with `bash -e` from the checkout root on Python 3.13 with the job's pip installs and step environment
- **THEN** `tests/test_files_headers.py` is executed in its own pytest invocation and passes, and the existing selectors still pass

#### Scenario: Module failure fails the step

- **WHEN** a test in `tests/test_files_headers.py` fails during that script
- **THEN** the script exits non-zero
