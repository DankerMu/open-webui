## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-restore-readonly-broker-probe --strict --no-interactive`.

## 2. Implement (in open-computer-use, from `main` `54be6fb` or later)

- [x] 2.1 Tests first (design evidence plan); record the three drift cases red on `54be6fb`; the refusal cases are regression guards, green before and after.
- [x] 2.2 `recovery_helper.py`: the read-only `revision` subcommand replaces `listing`; the module docstring follows (D1, D3).
- [x] 2.3 `recovery_resources.py`: `_broker_revision` replaces `_broker_listing` (D2, D3); `_require_cursor_lag` uses it; error texts no longer say "listing".
- [x] 2.4 `deploy/BACKUP-RESTORE.md`: what restore checks about broker state; unindexed files are indexed on the first listing after activation.
- [x] 2.5 Green: touched test modules on macOS, then `tests/deploy` in the CI-shaped container as uid 1001 and the root-only cases as uid 0; `./tests/test-project-structure.sh`.

## Risk packs

Selected:

- **Invariant / state:** captured broker state unchanged by restore; cursor lag rule unchanged, 2.1, 2.3.
- **Error handling:** missing, corrupt or unreadable index refused before `.restored` with its cause, 2.1, 2.3.
- **Integration:** the probe runs inside the selected release's image and reads the index with that release's broker, 2.2.

Not selected:

- **Concurrency:** restore runs on an isolated target with the stack stopped; the probe takes the chat's combined lock as before.
- **Security:** no new mount or path; the helper mount is unchanged.
- **Documentation beyond BACKUP-RESTORE:** none.
