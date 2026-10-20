## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Reshape `_owner_close_fault` to `close_errors: dict[role, OSError]` and `sync_errors: dict[role, OSError]`, each listed role failing once inside the window; patch `os.fsync` only when `sync_errors` is non-empty. `_blob_owner_fault` and `_blob_fault` gain a trailing `sync_errors=None` keyword; `_barrier_fault` keeps its signature; all build the one-entry close dict. Move the existing fsync-primary test onto `sync_errors`. Baseline green: `test_office_versions.py`, `test_office_callback_processing.py`, `test_office_store.py`.
- [x] 2.2 Add the `store_version`-level precedence test (EIO `versions` fsync primary plus an `ocu` close failure through `_store`). Green.
- [x] 2.3 Add the route-level precedence test (status 2, same fault, `state_corrupt`, state and versions unchanged, no blob). Green.
- [x] 2.4 Add the multi-close `_publish_blob` test (`versions` EIO and `root` EBADF fail; `close_errors == (first, second)`, errno, strerror and `__cause__` from the first; blob present; staging empty). Green.
- [x] 2.5 Run mutants F, G and L on copies of `callback.py` and `versions.py`, record the failing assertion per mutant, restore byte-identical.

## 3. Verify

- [x] 3.1 Run:
  - the Office module set;
  - after review is clean, the two-phase clean-clone evidence: the full unit command and the CI form, then `tests/deploy` alone;
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

## Risk packs

Selected:

- Error / rollback / partial outputs: primary precedence through `store_version` and the callback; every close failure retained in close order; no version recorded and no blob left under a primary failure.
- Compatibility: the helper's ten `_blob_owner_fault` call sites, `_blob_fault` and `_barrier_fault` keep their behavior; `os.fsync` is untouched when no sync fault is requested; the state-writer helper is untouched.

Not selected:

- File IO / path safety / overwrite: production blob link, unlink and close code is unchanged; blob presence or absence is asserted under the error pack.
- Production, auth, schema, dependencies, concurrency and secrets: unchanged.
- Documentation: no README or decision-record sentence changes; the spec delta is the record.

## Recorded at archive

- OCU PR: DankerMu/open-computer-use#154, head `2efb42405a1170f7ebb897eed7fa6c374f8d8f21`, merged at `cec0a91cd0301b44af69bf4fcb45ffd0740c48a8`.
- Review: standard cross-review, round 1, both seats clean; no fix pass.
- Clean-clone evidence at the head: full unit command minus `tests/deploy` 3686 passed, 5 skipped; CI-form orchestrator 2900 passed, 5 skipped, 3 subtests passed; `tests/deploy` alone 419 passed; all exit 0.
- Earlier evidence: Office module set 1054 passed; versions + callback_processing + store 129 passed; mutants F, G and L each killed at the design-named assertion, production files restored byte-identical; `./tests/test-project-structure.sh` OK; commit hooks passed.
- Deviations accepted: the route test's extra `close_errors` strerror assertion plus `trace["calls"] == 1` and `origin.hits == 0`; the in-place class-swap variant of G not run because built-in `OSError` refuses `__class__` assignment.
- Body-only evidence: the post-reshape 126 baseline has no saved log; the mutant logs predate the commit but match the head line for line.
- Reported, not fixed: `commit_publication_lineage` (`versions.py:224-226`) shares the `store_version` wrap and has no direct test.
