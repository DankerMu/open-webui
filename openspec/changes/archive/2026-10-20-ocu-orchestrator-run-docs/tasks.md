## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Capture red in a clean `git clone` of `origin/main`. The six documented `cd computer-use-server` commands each exit 4 with `No module named 'tests'`, and `python tests/orchestrator/test_startup_warnings.py`, with no `PYTHONPATH`, fails on the same import. Record the root-form per-file counts as the green baseline.
- [x] 2.2 Replace the six docstring `Run:` lines with the checkout-root form `python -m pytest tests/orchestrator/<file>.py -v`.
- [x] 2.3 In `test_startup_warnings.py`, add `from pathlib import Path` and the guarded `parents[2]` checkout-root insert from `tests/deploy/support.py:25-27`. Place it after the `computer-use-server` insert and before the `tests.*` import.
- [x] 2.4 Show green in a clean `git clone` of the branch:
  - each `Run:` command, extracted from its file and executed as written, passes with the baseline per-file counts and exit code 0;
  - the `__main__` script entry passes;
  - `--import-mode=importlib` from `computer-use-server/` passes for `test_startup_warnings.py`;
  - negative control: the root console `pytest tests/orchestrator/test_startup_warnings.py` still exits 4, unchanged;
  - the grep finds no active stale instruction;
  - `CHANGELOG.md` is unchanged;
  - `git diff --name-only origin/main...HEAD` lists only the six test modules.

## 3. Verify

- [x] 3.1 Run:
  - after review is clean, the two-phase clean-clone evidence: the full unit command and the CI form `python -m pytest tests/orchestrator/`, then `tests/deploy` alone;
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

Recorded at archive:

- Merged as DankerMu/open-computer-use#149 (`d45489d`, head `ab96824`).
- Red at `fa98053`: the six old `Run:` commands each exited 4 at the conftest `tests` import. The script entry exited 1 with the same error.
- Green, with each command extracted from its file and run as written: the six root commands passed with the baseline counts 10, 15, 14, 13, 6 and 15, each exiting 0. The script entry returned OK. The `computer-use-server/` importlib form still passed. The root console form still exits 4 (negative control).
- Grep: no stale instruction anywhere, and `CHANGELOG.md` unchanged.
- Review round 1: both seats clean, with no fix pass. The green run used `origin/main` plus the working-tree diff; the test-evidence seat re-ran it at the committed head.
- Clean `git clone` of the head, nothing deselected:
  - full unit command minus `tests/deploy`: 3671 passed;
  - CI form, run in parallel: 2893 passed;
  - then `tests/deploy` alone: 419 passed.

## Risk packs

Selected:

- Test discovery / invocation: every documented per-module command and the retained script entry collect from a clean checkout root.

Not selected:

- Production behaviour, auth, schema, dependencies, CI, packaging. None of these change.
