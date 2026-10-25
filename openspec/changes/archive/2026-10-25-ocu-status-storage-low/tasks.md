## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-status-storage-low --strict --no-interactive`.

## 2. Implement (in open-computer-use, from `main` `1dba74e` or later)

- [x] 2.1 Tests first (`tests/orchestrator/test_office_notice.py` or `test_office_sessions.py`, following `test_store_write_failures_stay_explicit` at `test_office_notice.py:585-600`):
  - patch the store module's `os.write` to raise `OSError(errno.ENOSPC)`; the status read answers 503 `{"reason":"storage_low"}` and the state snapshot is unchanged;
  - remove the patch; the next status read answers 200;
  - the existing EIO case still answers 500 `state_corrupt`.
  - Record red on `1dba74e`.
- [x] 2.2 `office/sessions.py` `session_status`: in `except OSError`, answer 503 `storage_low` when `errno == ENOSPC`, otherwise 500 `state_corrupt` as today. Correct the comment at `static/office-editor.js:19`.
- [x] 2.3 Editor coverage is already there, so no editor test is added. This departs from #638's criterion "add an editor-level test" because the editor never parses the body of a 503 after the first status (`office-editor.js:251`). Name these existing tests in the PR:
  - `tests/orchestrator/test_office_editor.py:637` (503 with JSON body keeps the loaded editor usable);
  - `:656` (back-off and reset after a successful status);
  - `:721` (a 503 before the first status still ends the editor).
- [x] 2.4 Green: touched modules on macOS, then the office test modules in the CI-shaped container; `./tests/test-project-structure.sh`.

## 3. Acceptance

- [x] 3.1 B-T11 ENOSPC rerun on the acceptance host once a release with the fix is deployed. If the deployment is not updated in this round, say so on #638.

## Risk packs

Selected:

- **Error handling:** only ENOSPC becomes transient; corruption and other OS errors still end the editor, 2.1.

Not selected:

- **State / invariants:** no state is written differently.
- **Security:** no new data in responses.
- **Documentation:** no operator-visible procedure changes.
