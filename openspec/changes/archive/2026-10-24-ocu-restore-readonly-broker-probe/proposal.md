## Why

#627 (confirmed from code at OCU `main` `54be6fb`). Restore's cursor check runs the selected release's broker **reconcile** over every live chat with a recorded cursor and an index, then refuses any change:

- `_require_cursor_lag` (`deploy/recovery_resources.py:1528-1550`) calls `_broker_listing` (`:1481-1509`), which runs `recovery_helper.py listing` → `OutputsBroker().reconcile` (`deploy/recovery_helper.py:15-27`) over a read-write mount of the restored chat directory, then refuses a counter change (`:1500-1502`), a vanished or re-identified indexed path (`:1503-1506`) or a revision change (`:1507-1508`).
- The index only advances on a live listing or a host write; agents write `outputs/` directly through the read-write sandbox mount (`computer-use-server/docker_manager.py:1237`), and backup never reconciles (the only `run_broker_helper` caller in `deploy/` is `:1486`). So any file an agent added, deleted or resized after the chat's last listing makes reconcile record an event at restore time, and the whole deployment restore aborts after verify passed, before `.restored`.
- The tests never see it: `_seed_chat` reconciles after every write (`tests/deploy/test_recovery.py:228-262`), and the unit tests mock `_broker_listing` (`:3197-3218`).
- The existing requirement already says "Broker file IDs, revisions and counters SHALL remain unchanged" (`ocu-backup-rollback`, "Coherent database and workspace recovery"); a reconcile at restore is the only thing that can change them.

## What Changes

In `open-computer-use`:

- `recovery_helper.py listing` is replaced by a read-only probe that returns `OutputsBroker().current_revision(chat_id)` (`computer-use-server/outputs_broker.py:128-135`): it validates the restored index through `_read_index`/`_validate_index` with the selected release's broker, without scanning `outputs/`, creating or writing an index. The subcommand name changes with its meaning (for example `revision`); nothing else calls `listing`.
- `_broker_listing` (renamed to match, for example `_broker_revision`, with the helper docstring and its error texts no longer saying "listing") runs the probe, compares the returned counter with `_index_snapshot`'s counter (they must agree), and keeps the before/after snapshot comparison as a no-write assertion. `_require_cursor_lag` compares the cursor with that counter as today.
- Files the index does not know about are indexed by the first live listing after activation, as they would have been on the source.
- `deploy/BACKUP-RESTORE.md` states what restore checks about broker state and that unindexed `outputs/` files are indexed on the first listing after activation.

Must preserve:

- cursor lead refused (`test_recovery.py:1930-1969`), a missing index with cursor > 0 refused (`deploy/recovery_resources.py:1537-1542`), a corrupt or unreadable index refused before `.restored`, the canonical chat id rule (#609);
- the restored `.ocu/index.json` bytes unchanged by restore;
- the helper still runs in the selected release's image, so an index that release cannot read is refused.

Out of scope: backup-time reconcile (rejected in #627: it mutates the source during a cold capture), the outputs broker's scan rules (#617).

## Capabilities

### Modified Capabilities

- `ocu-backup-rollback`: new requirement "Restore validates broker state without scanning outputs".

## Impact

A deployment restore no longer aborts because an agent changed files after the last listing; the restored broker state is exactly the captured one, and the first listing after activation catches up.

## Triage

```text
Issue type: bug (restore correctness)
Fixture level: expanded
Upstream suggested level: issue gives none; expanded: restore critical path, selected-release helper contract
Blast radius: every deployment restore; a wrong probe accepts an index the selected release cannot read, or refuses a valid one
Selected risk packs: Invariant / state (captured broker state unchanged, cursor lag); Error handling (corrupt/missing index refusals); Integration (helper contract inside the selected image)
Evidence floor: restore CLI tests with an index lagging the tree (new file, deleted indexed file, resized indexed file) red on 54be6fb and green after, captured index bytes unchanged; cursor-lead, missing-index and corrupt-index refusals still refuse; helper unit test that the probe neither creates nor writes an index; tests/deploy in the CI-shaped container (non-root) and root-only cases; ./tests/test-project-structure.sh
design.md: present
```
