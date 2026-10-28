## Why

(#640.) On the acceptance host (2026-10-25) the following happened:

- A chat's data directory was deleted out of band (Plan 2 B-T10 damage case). Describe polling later recreated a skeleton `.ocu/index.json` with `"counter":0`.
- The WebUI cursor `ocu_chat_state.last_seen_revision` stayed at 1. It only moves forward (`backend/open_webui/models/ocu_chat_state.py:37-42`).
- `recovery.py backup` and `verify` both passed. `restore` then failed after about 2 minutes, with `chat … cursor 1 leads recovered broker counter 0`.

At OCU `main` `3fe7730`:

- **Backup never compares cursor and counter.**
  - `backup_deployment` (`deploy/recovery_resources.py:735-`) captures the database and the chat tree.
  - Neither it nor `verify_recovery_set` reads `ocu_chat_state` or any index.
- **Restore checks only at the end.**
  - `_require_cursor_lag` (`:1519-1538`) runs after image import, chat-data extraction, volume restore, database restore and orphan pruning (call at `:1433`).
  - Its two messages (`:1531`, `:1537`) name the chat but no remedy.
- **The condition is permanent while the chat row exists.** Every backup taken from such a deployment is therefore unrestorable.

**Owner decision (2026-10-28, #640 comment):**

- Backup **refuses**. It does not publish a set with a warning.
- The check runs **before any service is stopped**, as a read-only scan in the `_scan_before_quiesce` pattern.
- The cursor is monotonic, so an early check misses nothing it could catch later.
- `_require_cursor_lag` at restore stays unchanged as the last line of defence.
- Messages name the chat and the remedy:
  - delete the chat in Open WebUI and back up again;
  - or, with the stack stopped, reset that chat's `last_seen_revision` to the current counter with SQL.

## What Changes

**Pre-quiesce cursor check in backup.** `establish_quiescence` calls a new read-only check next to `_scan_before_quiesce`. Like that scan, it sits outside the `try`, so a refusal stops nothing. In order:

1. **PostgreSQL running.** The source PostgreSQL (`identity["postgres_container"]`) must be running and not paused, checked with `container_running` / `container_paused`. Otherwise the refusal names it: `postgres must be running for the cursor check`.
   - Legacy change: this used to fail at `:570`, after admission and writers had stopped. Now it fails before anything stops.
2. **Rows first.** It reads `ocu_chat_state` rows and live chat ids, reusing `recovery_db._chat_state_rows` / `_live_chat_ids`. `recovery_db` exposes them through one small public function; `inspect_restored_state` reuses it, so no query is duplicated.
   - The rows are read **before** any index. The cursor only grows, and it never passes a counter that existed when it was read. Reading the cursor first and the counter second therefore cannot produce a false refusal, even with live writers. The reverse order could.
3. **Counters.** For each live chat with a row, it reads the counter from the source index with the existing `_index_snapshot(identity["chat_dir"], chat_id)`. This is a no-follow read of `<chat>/.ocu/index.json`. No broker helper runs against live data.
4. **One per-row loop for backup and restore.** It goes through the same per-row loop as restore: filter by live id, `canonical_chat_id`, then the missing-index branch, then the comparison. That loop becomes one helper, `_require_cursor_lag`'s body, with only the counter source injected:
   - backup: `_index_snapshot(...)["counter"]`;
   - restore: `_broker_revision(...)`.

   As at restore, an unsafe live chat id with a row is refused (`invalid chat id`), which is never stricter than restore.

**Refusals.** All are one-line `RecoveryError`s raised before any stop or stage. Every offending chat is listed in one message, so one run shows each chat to fix.

- **Cursor leads.** The index is missing and the cursor is greater than 0, or the cursor is greater than the counter. The message names the chat, the cursor, the counter and both remedies.
- **Unreadable index.** The source index is not valid JSON or UTF-8, has no integer `counter`, is not a regular file, or is a symlink (`index path is a symlink`). The message names the chat and the problem.
  - Today `_index_snapshot` lets `JSONDecodeError`, `UnicodeDecodeError`, `ValueError`, `KeyError` and `TypeError` escape.
  - Restore also fails on such an index, so refusing at backup is never stricter.
  - The read stays in `_index_snapshot`, and the wrapping into `RecoveryError` is shared with restore, so restore's own message for these cases also becomes a one-line refusal.

**Not refused:**

- chats whose cursor is at or below the counter;
- rows of non-live chats (orphans, which restore's `prune_orphans` drops);
- live chats without a row.

**Remedies** (the same text in the backup refusal, the restore refusal and the docs):

1. Delete the chat in Open WebUI. Archiving is not enough: an archived chat stays live. Then back up again. The chat's `ocu_chat_state` row becomes an orphan, the next backup skips it, and restore prunes it.
2. Or reset the cursor:
   1. Stop `open-webui` and the OCU server, keeping PostgreSQL running.
   2. Run `UPDATE ocu_chat_state SET last_seen_revision = <counter> WHERE chat_id = '<chat id>';`.
   3. Start the stack (`deploy/up.sh`).
   4. Back up again.

**Restore messages.**

- Both `_require_cursor_lag` messages keep their current prefix, `chat <id> cursor N leads recovered broker counter M`, and append the remedy text.
- Which states restore refuses is unchanged.

**Docs.** `deploy/BACKUP-RESTORE.md`:

- the cursor paragraph (`:102-118`) states that backup now refuses these conditions before stopping anything;
- the Failure recovery section (`:181-`) states how the condition arises (an out-of-band chat directory removal) and the remedies as steps.

## Capabilities

### Modified Capabilities

- `ocu-backup-rollback`: one added requirement, for backup refusing a cursor that leads its counter, before quiescence, and naming the remedy.

## Impact

- OCU:
  - `deploy/recovery_resources.py`, `deploy/recovery_db.py`, `deploy/BACKUP-RESTORE.md`;
  - `tests/deploy/test_recovery.py`.
- Non-goals:
  - weakening `_require_cursor_lag`;
  - editing captured bytes;
  - #637's migration-probe and empty-database failures;
  - whether describe polling should recreate a deleted chat directory (Plan 2 B-T10);
  - an automatic fix (backup never writes the database).

## Fixture

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded: backup/restore (rollback path), production data reads, CLI refusal
Blast radius: a backup refused for a healthy deployment; an unrestorable set still published; a refusal that stops services
Selected risk packs: Public API / CLI / script entry (backup refusal, restore messages); Error handling / rollback / partial outputs (refuse before any stop or stage; postgres-down refusal moves earlier); Legacy compatibility (healthy deployments and orphan rows unaffected; restore guard unchanged; three existing tests rebuilt on captured-set edits); Concurrency / shared state / ordering (live writers during the check: rows read before indexes); File IO / path safety (unreadable, non-regular or symlinked source index refused in one line); Documentation (BACKUP-RESTORE.md)
Not selected: Auth / secrets (read-only queries through the existing psql path); Schema (no change); Resource limits (one query plus one small file per live chat); Release packaging (none)
Evidence floor: OCU unit command for tests/deploy/test_recovery.py and tests/deploy/test_recovery_db.py; new tests a–f in design.md; scripts/docs-lint gates
design.md: present
```
