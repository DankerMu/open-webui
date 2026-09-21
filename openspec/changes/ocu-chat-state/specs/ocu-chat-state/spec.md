# Spec Delta

## Purpose

Persists per-chat OCU workspace state — a last-seen revision cursor and a preferences object — in a table with no foreign key to chat, so later describe/refresh/prefs routes have a server-side truth that does not race with upstream `chat.meta` rewrites.

## ADDED Requirements

### Requirement: Per-chat state table shape

The fork SHALL persist workspace state in table `ocu_chat_state` with columns `chat_id` (text primary key), `last_seen_revision` (integer, not null, default 0), `prefs` (JSON object, not null, default empty object), and `updated_at` (bigint, not null). The table SHALL have no foreign-key constraint to `chat` (design D14). One additive Alembic migration named `add_ocu_chat_state` SHALL create the table and SHALL round-trip under `make db-verify` (upgrade head, downgrade -1, upgrade head).

#### Scenario: Migration round-trip

- **WHEN** `make db-verify` runs against the harness SQLite database
- **THEN** it exits 0 after upgrading to head, downgrading the latest revision, and upgrading to head again, and the table exists at head with the four columns above and no foreign key

#### Scenario: Fresh row defaults

- **WHEN** the accessor first writes prefs or advances the cursor for a chat that has no row
- **THEN** the stored row has `last_seen_revision` 0 unless the write itself advanced it, `prefs` equal to the written object or `{}`, and a non-zero `updated_at`

### Requirement: Revision cursor never decreases

`last_seen_revision` SHALL be a read cursor: `advance_cursor(chat_id, revision)` SHALL set the stored value to `revision` when `revision` is greater than the stored value, SHALL leave the stored value unchanged when `revision` is less than or equal to it, and SHALL create the row at `revision` when none exists. `get(chat_id)` SHALL return the row or None; it SHALL NOT create a row.

#### Scenario: Cursor behind a higher revision

- **WHEN** the stored cursor is 5 and `advance_cursor` is called with 7
- **THEN** a subsequent `get` returns `last_seen_revision` 7

#### Scenario: Stale advance is ignored

- **WHEN** the stored cursor is 7 and `advance_cursor` is called with 5
- **THEN** a subsequent `get` still returns `last_seen_revision` 7

#### Scenario: Missing chat has no row

- **WHEN** `get` is called for a chat_id that has never been written
- **THEN** the result is None and no row is inserted

### Requirement: Prefs upsert is isolated per chat

`upsert_prefs(chat_id, prefs)` SHALL create or replace that chat's `prefs` JSON object and update `updated_at`. It SHALL NOT copy or inherit another chat's row. Branching or cloning a chat is out of this module: a distinct `chat_id` starts with no row.

#### Scenario: Prefs round trip

- **WHEN** `upsert_prefs("C", {"view": "terminal", "selected_file_id": "f1"})` runs and then `get("C")` is called
- **THEN** `prefs` equals that object

#### Scenario: Distinct chats do not inherit

- **WHEN** chat `C` has a row and `get("C2")` is called for a different id
- **THEN** the result is None

### Requirement: Chat deletion leaves an unread orphan (D14)

Deleting a chat SHALL NOT be implemented in this change. The table SHALL remain readable only through the accessor keyed by `chat_id`; a later owner-gated route (out of scope) cannot authorize a missing chat, so an orphan row is unreadable through the API. Backup prune of orphans is owned by #34.

#### Scenario: Accessor still returns an orphan by id

- **WHEN** a row for `C` exists and no chat row for `C` exists
- **THEN** `get("C")` still returns the stored state (the accessor is not owner-gated); no cascade delete runs
