## Design

Change surface:

- `deploy/recovery_resources.py`:
  - the pre-quiesce cursor check, called from `establish_quiescence` next to `_scan_before_quiesce`;
  - a shared "leads" helper with its message;
  - `_require_cursor_lag`, whose messages change.
- `deploy/recovery_db.py`: one public read of chat-state rows plus live chat ids, reused by `inspect_restored_state`.
- `deploy/BACKUP-RESTORE.md`.

Must preserve:

- `_require_cursor_lag`: which states it refuses, its use of `_broker_revision`, and the message prefixes.
  - `test_cursor_lead_rejects_and_activation_keeps_workspaces_stopped` (`tests/deploy/test_recovery.py:1991`) and `test_missing_index_under_positive_cursor_refuses_before_restored` (`:2073`) keep passing.
  - The unit tests at `:3642-3666` keep passing.
- Backup of a healthy deployment is unchanged. The existing fixture (cursor 2, source counter 3; orphan row with cursor 9) still backs up.
- No service is stopped, no stage is allocated and nothing is captured when the check refuses.
- Queries stay read-only (`_exec_postgres(read_only=True)`).
- No broker helper runs on live chat data.
- The restore-time `prune_orphans` and `inspect_restored_state` behaviour is unchanged.

Must add/change: see proposal "What Changes".

Governing invariant: backup publishes a set only if every live chat's cursor is at or below its captured broker counter, as restore requires. Restore keeps refusing any set that breaks this.

Sibling surfaces:

- **Restore guard** `_require_cursor_lag`: shares the "leads" rule and the message.
- **`recovery_db.inspect_restored_state`:** shares the queries.
- **`_scan_before_quiesce`:** the placement model, outside the `try` that stops writers.
- **`_index_snapshot`:** the index reader for both, with no-follow and ELOOP refusal.
- **CLI:** `cmd_backup` turns `RecoveryError` and `OSError` into a one-line refusal (#664).

Seams under test: `tests/deploy/test_recovery.py` runs `recovery.py backup` as a subprocess against `tests/deploy/fakebin/docker`.

- `postgres.json` gives the source rows (`chat_state`, `chats`). The fake `psql` serves `CHAT_STATE_QUERY` / `LIVE_CHATS_QUERY` from them.
- The source chat tree holds `<chat>/.ocu/index.json`.
- `ops.log` shows every docker call. A refusal before quiescence means no `docker stop`, no `stopped.log` and no destination.

Required evidence:

- a. **Cursor leads the counter.** The live chat has cursor 1 and a source index with counter 0.
  - Backup exits 1.
  - stderr is one line naming the chat, cursor 1, counter 0 and both remedies.
  - There is no `docker stop` in `ops.log`, no `stopped.log` and no destination.
- b. **Missing index.** The live chat has cursor 2 and no `.ocu/index.json`. The same refusal, with counter 0.
- c. **Two offending chats.** Both appear in the one message.
- d. **Nothing to refuse.** Each case backs up as today:
  - the cursor equals the counter;
  - the cursor is below the counter (the existing fixture);
  - an orphan row (chat not live) has a cursor greater than any counter;
  - a live chat has no row.
- e. **Restore messages.** The existing cursor-lead and missing-index restore tests also assert the remedy text. Their prefix assertions are unchanged.
- f. **Shared query.** `recovery_db` tests, or an existing restore test, show `inspect_restored_state` still returns `chat_state` and `live_chats` unchanged.

Non-goals: see proposal Impact.

Review focus:

- The check runs before anything stops, outside the `try`, and is read-only.
- The rule is identical to restore's and computed in one place. Orphans and live chats without a row are skipped.
- The restore guard is unchanged apart from its messages.
- The remedy text is accurate: deleting the chat drops its row through `prune_orphans` at restore, and SQL with the stack stopped can lower the cursor.
