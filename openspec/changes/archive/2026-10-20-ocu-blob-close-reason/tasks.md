## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Add the versions-level and callback-route tests from `design.md` (Test Plan). Update the two `failure.value is close_error` tests (`test_office_versions.py:1095`, `:1193`) and extend `:1181` as described there. Capture red on `origin/main`.
- [x] 2.2 Add `BlobCloseError(OSError)` to `office/versions.py`. Raise it from `_publish_blob` when `close_final_directories` raises, keeping errno, strerror, `close_errors` and `__cause__`.
- [x] 2.3 In `office/callback.py`, map `BlobCloseError` in `process_authenticated_callback`, before the generic `OSError` branch: `_reject(..., "state_close_failed")`, then HTTP 500 `state_close_failed`. `_persist_content` stays unchanged: the error already bypasses its recovery tuple, and the status-6 test pins that.
- [x] 2.4 In `computer-use-server/README.md`, update both the "covers only this replay barrier" sentence and the blob-publication `state_corrupt` residual to the new contract. Add the `CHANGELOG.md` Unreleased/Fixed entry.
- [x] 2.5 Show green and kill the three named mutants. Record what a callback reaching `commit_publication_lineage` returns on a close-only failure.

## 3. Verify

- [x] 3.1 Run:
  - the Office module set;
  - after review is clean, the two-phase clean-clone evidence: the full unit command and the CI form, then `tests/deploy` alone;
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

## Risk packs

Selected:

- Error / rollback / partial outputs: no version is recorded on close-only failure, the blob stays reusable, and primary precedence holds.
- Public API: callback `state_close_failed` is additive for the content path.
- Compatibility: sibling `store_version` and `_publish_blob` callers keep their `OSError` handling.

Not selected:

- Auth, schema, dependencies, concurrency (locks unchanged), packaging.

## Recorded at archive

- OCU PR: DankerMu/open-computer-use#151, head `b04c6873e9c0dd60d29b0a463459ee4a0f7c88b4`, merged at `f4fdaea970e55bacc2b22f632ae3e5e6c283b3c3`.
- Review: expanded cross-review, round 1, all three seats clean; no fix pass. Surviving P2 test gaps tracked in #571.
- Clean-clone evidence at the head: full unit command minus `tests/deploy` 3678 passed, 5 skipped; CI-form orchestrator 2897 passed, 5 skipped, 3 subtests passed; `tests/deploy` alone 419 passed; all exit 0.
- Earlier evidence: Office module set 1013 passed; red at `6e8c08c` (7 failed); 15 mutants killed; `./tests/test-project-structure.sh` OK.
- Decision record `2026-10-03-ocu-office-file-store.md` now states that a callback close-only version-blob failure returns `state_close_failed`.
