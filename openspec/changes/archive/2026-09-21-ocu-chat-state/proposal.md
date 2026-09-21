# Proposal

Issue type: feature
Fixture level: expanded
Upstream suggested level: expanded (agree)
Blast radius: a wrong schema or a cursor that moves backwards poisons every later describe/refresh; a FK or chats.py delete-path edit would put an upstream Critical Path file on the spine.
Selected risk packs: Schema / columns / units / field names; Error handling / rollback / partial outputs
Evidence floor: model tests (upsert/get round trip; `advance_cursor(5)` after 7 keeps 7; missing chat returns None; chats do not inherit rows) + `make db-verify` + `make decisions-verify` + `make lint-scoped` + `make coverage-gate`

`design.md` is required at expanded (schema, persisted state, migration Critical Path).

## Why

Plan 1 A1 needs a per-chat last-seen revision cursor and UI preferences that survive reload. Nothing in this fork records that state today. Design D1 chooses a new table over `chat.meta` or client-only storage; the migration Plan 1 names conditionally therefore ships with this issue, together with the D1 and D2 decision records (AGENTS.md same-PR rule).

## What Changes

- New table `ocu_chat_state(chat_id TEXT PK, last_seen_revision INTEGER NOT NULL DEFAULT 0, prefs JSON NOT NULL DEFAULT '{}', updated_at BIGINT NOT NULL)` with no foreign key (D14).
- Accessor `OcuChatStates`: `get`, `upsert_prefs`, `advance_cursor` (cursor never decreases).
- One additive Alembic migration `add_ocu_chat_state` revising current head `d4c1a8e37b62`.
- Decision records in `docs/decisions/implemented/architecture/` for D1 (table vs `chat.meta` / client-only) and D2 (cross-repo home).

No routes, no UI, no env flags, no edits to `models/chats.py`.

## Capabilities

### New Capabilities

- `ocu-chat-state`: per-chat workspace persistence — table shape, monotonic revision cursor, prefs upsert, chat isolation, no FK.

### Modified Capabilities

None. `openspec/specs/` is empty; the epic change `ocu-workspace-integration` already carries the parent requirement and is not archived by this issue.

## Impact

- New files only: `backend/open_webui/models/ocu_chat_state.py`, `backend/open_webui/test/models/test_ocu_chat_state.py`, one Alembic version, two decision records.
- Critical Path: `backend/open_webui/migrations/versions/` (`make db-verify` + plan-named migration).
- Downstream consumers (not in this PR): workspace describe/refresh/prefs routes (#7) read and write this table; backup prune (#34) may drop orphan rows.
