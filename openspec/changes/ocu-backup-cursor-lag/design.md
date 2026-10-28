## Design

Change surface:

- `deploy/recovery_resources.py`:
  - the pre-quiesce cursor check, called from `establish_quiescence` immediately **after** `_scan_before_quiesce` returns. After, not before: `_assert_refused_before_quiesce` (`test_recovery.py:3176`) asserts no `docker exec` for scan refusals (`:3183`, `:3199`, `:3229`, `:3238`), and the scan first rejects FIFOs/sockets so the index read meets only regular files, directories, symlinks and missing paths;
  - one per-row helper shared with `_require_cursor_lag`, with the counter source injected;
  - the wrapping of unreadable-index errors;
  - the messages.
- `deploy/recovery_db.py`: one public read of chat-state rows plus live chat ids, reused by `inspect_restored_state`.
- `deploy/BACKUP-RESTORE.md`.

Must preserve:

- **`_require_cursor_lag`:**
  - which states it refuses;
  - its use of `_broker_revision`;
  - the message prefixes;
  - its unsafe-id and mixed-case behaviour. The unit tests at `tests/deploy/test_recovery.py:3636-3666` keep passing.
- **Backup of a healthy deployment is unchanged.** The existing fixture has cursor 2 with source counter 3, plus an orphan row with cursor 9.
- **When the check refuses:** no service is stopped, no stage is allocated and nothing is captured.
- **Reads only:**
  - queries stay read-only (`_exec_postgres(read_only=True)`);
  - no broker helper runs on live chat data.
- **Restore:** `prune_orphans` and `inspect_restored_state` (`chat_state`, `live_chats`, `owners`) are unchanged.

Existing tests that the new check affects. Their restore-time behaviour is unchanged; only the source state they back up from changes:

- `test_missing_index_under_positive_cursor_refuses_before_restored` (`:2073`) and `test_malformed_index_refuses_before_restored` (`:2080`):
  - take a clean backup first;
  - then damage the captured set, as `test_cursor_lead_rejects_and_activation_keeps_workspaces_stopped` (`:1991`) does: remove or corrupt the index in the captured chat-data archive and recompute the `recovery.json` checksums;
  - keep their restore assertions.
  - With the shared wrapping, `:2084`'s `JSONDecodeError` assertion becomes the one-line refusal text.
- `test_empty_and_unlaunched_chats_are_valid_complete_backups` (`:1185`): its live `CHAT_ID` row gets cursor 0, or is dropped. This keeps its subject: empty and unlaunched chats with no broker activity.

Must add/change: see proposal "What Changes".

Governing invariant: backup publishes a set only if every live chat's cursor is at or below its captured broker counter and its index is readable, as restore requires. Restore keeps refusing any set that breaks this.

Sibling surfaces:

- **Restore guard** `_require_cursor_lag`: shares the per-row loop and the message.
- **`recovery_db.inspect_restored_state`:** shares the queries.
- **`_scan_before_quiesce`:** the placement model, outside the `try` that stops writers.
- **`_index_snapshot` / `_open_regular_nofollow`:** the index reader.
- **The postgres check in `_quiesce_and_discover`** (`:569-571`): stays, and is now preceded by the earlier one.
- **CLI:** `cmd_backup` turns `RecoveryError` and `OSError` into one line.

Seams under test: `tests/deploy/test_recovery.py` runs `recovery.py backup` as a subprocess against `tests/deploy/fakebin/docker`.

- `postgres.json` gives the source rows. The fake `psql` serves `CHAT_STATE_QUERY` / `LIVE_CHATS_QUERY` over TCP and strips the `env PGOPTIONS` prefix.
- The source chat tree holds `<chat>/.ocu/index.json`; the fixture's counter is 3.
- `containers.json` controls whether postgres runs.
- `ops.log` shows every docker call. A refusal before quiescence means no `docker stop`, no `stopped.log` and no destination. New tests a/b/e/f assert exactly these three; they cannot reuse `_assert_refused_before_quiesce`, which also forbids `docker exec`.
- The fake docker does not refuse `exec` on a stopped container, so evidence f proves the check exists, not real-daemon behaviour.

Required evidence:

- a. **Cursor leads the counter.** The live chat has cursor 4 and a source index with counter 3.
  - Backup exits 1.
  - stderr is one line naming the chat, cursor 4, counter 3, "delete" (not archive), and the SQL `UPDATE ocu_chat_state SET last_seen_revision = 3 …` steps.
  - There is no `docker stop`, no `stopped.log` and no destination.
- b. **Missing index.** The live chat has cursor 2 and no source `.ocu/index.json`. The same refusal, with counter 0.
- c. **Two offending chats.** Both appear in the one message.
- d. **Nothing to refuse.** Each case backs up as today:
  - the cursor equals the counter;
  - the cursor is below the counter (the existing fixture);
  - an orphan row has a cursor greater than any counter;
  - a live chat has no row.
- e. **Unreadable source index.** Each case refuses in one line naming the chat, with no `Traceback`, no `docker stop` and no destination:
  - `{not json`;
  - a missing `counter`;
  - a directory in place of `index.json`;
  - a symlinked `index.json`.
- f. **PostgreSQL not running.** Stopped or paused: backup refuses naming postgres, before any `docker stop`.
- g. **Same per-row loop at backup.**
  - A live unsafe chat id with a row is refused with `invalid chat id`.
  - A mixed-case live id is canonicalized as at restore.
  - These are backup counterparts of `:3636-3666`.
- h. **Restore messages.**
  - The cursor-lead and missing-index restore tests also assert the remedy text.
  - Their prefix assertions are unchanged.
  - The rebuilt malformed-index restore test asserts the one-line refusal.
- i. **Shared query.** `inspect_restored_state` still returns `chat_state`, `live_chats` and `owners`, checked by an existing restore test or a `recovery_db` test.

Non-goals: see proposal Impact.

Review focus:

- The check runs after the scan and before anything stops, outside the `try`, and is read-only. It checks postgres first, then reads rows, then indexes. The read order is review-only evidence: the fixture has no concurrent writer.
- One per-row loop serves backup and restore, with only the counter source differing. Orphans and live chats without a row are skipped.
- Unreadable indexes are one-line refusals at backup and restore.
- The restore guard refuses the same states as before.
- The remedy text is accurate and actionable: delete, not archive; the SQL steps keep postgres running.
