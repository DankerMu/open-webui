## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Add tests for each owner:
  - close injection at an early and an intermediate position, checking exactly one close attempt per owned fd;
  - a primary failure and a close failure together;
  - a close-only failure.

  Also add:
  - the `store_version` close-only metadata check with the reuse follow-up (a characterization test);
  - replay route close-only cases for both final and forcesave replay (`state_close_failed`);
  - the `state_durability` reason assertion on the existing barrier fsync test (a characterization test).

  Use the windowed, one-shot close recorder. Capture red on the position, primary-plus-close and replay close-only cases.

- [x] 2.2 `_publish_blob`: capture the primary. Record a failed claimed-blob unlink and a failed temporary unlink on the primary with the #474 rule. Then call `close_final_directories` over the six fds.
- [x] 2.3 `_unlink_blob`: a single `finally` with `close_final_directories` over the five fds.
- [x] 2.4 `_replay_barrier`: capture any `BaseException` as the primary (an fsync failure maps to `state_durability`), call `close_final_directories`, and convert a close-only failure to `CallbackRefusal(500, "state_close_failed")`.
- [x] 2.5 Docs: add `state_close_failed` to the OCU `computer-use-server/README.md` callback reasons (with the blob residual) and an entry to the `CHANGELOG.md` Unreleased section.
- [x] 2.6 After the OCU merge, in this repository: add a sentence to the decision record `docs/decisions/implemented/architecture/2026-10-03-ocu-office-file-store.md` in the archive PR, and file the blob-close residual follow-up.

## 3. Verify

- [x] 3.1 Run:
  - red, then green;
  - the Office module set;
  - the CI form `python -m pytest tests/orchestrator/`;
  - the full documented unit command in a clean `git clone` (exit 0);
  - `./tests/test-project-structure.sh`;
  - the commit hooks.

Recorded at archive:

- Merged as DankerMu/open-computer-use#146 (`110cdf2`, head `3a4d57c`).
- Clean `git clone` of the head on Python 3.13.3:
  - full unit command: 4090 passed, 5 skipped;
  - CI form `python -m pytest tests/orchestrator/`: 2893 passed, 5 skipped, 3 subtests passed.
- Review round 1 found one P1 test gap: the windowed recorder skipped already-attempted roles, so a retried close could not fail the exactly-once assertions. Fix pass 1 (test-only) records a close of an already-closed descriptor inside the owner window and fails on it. Three retry mutants (barrier re-close, `_unlink_blob` re-close, helper retry) then failed 4, 1 and 15 tests. Round 2 was clean.
- The red evidence for the committed tests was confirmed against `origin/main` `27e0146` by the test-evidence seat; the earlier position-only red run used a pre-review version of the tests.
- Follow-ups: #563 (one `descriptor_io` helper for cleanup-error recording), #564 (a close-only blob publication failure on the callback route still reports `state_corrupt`).

## Risk packs

Selected:

- Error / rollback / partial outputs: the primary keeps precedence, close failures are retained, and a close-only failure records no version metadata while the blob stays reusable.
- File IO / path safety: one close per owned fd, no retry, no fd used after its close.
- Public API: additive `state_close_failed`; existing reasons unchanged.
- Compatibility: replay order, `state_durability` and the other mappings stay unchanged.

Not selected:

- Auth, schema, dependencies, concurrency (locks unchanged) and packaging.
