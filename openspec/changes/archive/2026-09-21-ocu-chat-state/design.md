# Design

## Context

See proposal.md for why. Parent design: `openspec/changes/ocu-workspace-integration/design.md` D1, D2, D11, D14. Issue #3 implements only the persistence seam those decisions name; routes that consume the cursor land in #7.

Constraints: new behaviour in a new module (AGENTS.md Module Boundaries); migrations are a Critical Path (`make db-verify` + plan-named revision); SQLite harness has `PRAGMA foreign_keys` off (`internal/db.py`); runtime accessors are async via `get_async_db_context`.

## Goals / Non-Goals

**Goals:**

- Table, accessor, additive reversible migration, D1/D2 decision records in one PR.
- Cursor monotonicity and prefs isolation observable without any HTTP route.

**Non-Goals:**

- Routes, env flags, UI, OCU client.
- Foreign key or edits to `models/chats.py` delete paths (D14).
- Prefs key whitelist / 2 KiB cap (enforced on `PUT /prefs` in #7, not here).
- Owner checks (`Chats.is_chat_owner` is a route concern).
- Archiving the parent OpenSpec change.

## Decisions

Change surface: `backend/open_webui/models/ocu_chat_state.py`, `backend/open_webui/test/models/test_ocu_chat_state.py`, `backend/open_webui/migrations/versions/<rev>_add_ocu_chat_state.py`, `docs/decisions/implemented/architecture/2026-09-20-ocu-chat-state-table.md`, `docs/decisions/implemented/architecture/2026-09-20-ocu-cross-repo-home.md`. Alembic `env.py` currently imports a handful of models for metadata; this table is created by explicit `op.create_table` (same pattern as `d4e5f6a7b8c9_add_automation_tables.py`), so env.py is not required. If autogenerate later needs the model registered, add `from open_webui.models.ocu_chat_state import OcuChatState  # noqa: F401` in the same PR — only if the implementer proves autogenerate otherwise misses it. Prefer not touching env.py.

Must preserve: every existing Alembic revision; upstream `chat` / `chat.meta` write paths; `models/chats.py` delete helpers.

Must add/change: the table and accessor; two implemented decision records.

Governing invariant: `ocu_chat_state.last_seen_revision` never decreases for a given `chat_id`; a distinct `chat_id` never reads another chat's row; there is no FK to `chat`.

Sibling surfaces: producers (later describe/refresh/prefs in #7 — not built here); validators (none at this layer; prefs whitelist is #7); storage (this table + Alembic); entrypoints (accessor methods only); consumers (#7, backup prune in #34); failure paths (stale advance, missing row). Reviewers at expanded check these named siblings even though #7/#34 are not in the diff: confirm the accessor contract those siblings will call is present and that this PR does not invent a second store.

Seams under test: `OcuChatStates` against the harness DB (pytest-asyncio); Alembic round-trip via `make db-verify`.

Required evidence:

- `upsert_prefs("C", {view: terminal, selected_file_id: f1})` then `get("C")` → same prefs.
- stored 7, `advance_cursor("C", 5)` then `get` → 7.
- stored 5, `advance_cursor("C", 7)` then `get` → 7.
- `get("missing")` → None, no insert.
- `get("C2")` after writing C → None.
- `make db-verify` exit 0.
- `make decisions-verify` exit 0 with the two new records.
- Inspector on the created table: no foreign keys.

Non-goals: listed above.

Review focus:

1. Cursor comparison is `>` not `>=` rewrite of equal values that would bump `updated_at` needlessly — equal must be a no-op on the stored revision (updated_at may still change or not; prefer no-op entirely when revision does not increase).
2. No FK in `create_table` and no `ForeignKey` on the ORM column.
3. Migration `down_revision` is current head `d4c1a8e37b62`; upgrade is idempotent if the table already exists (inspector guard, same as automation tables).
4. Accessor is async and uses `get_async_db_context`, matching sibling models.
5. Decision records: kind `architecture`, zone `implemented`, supersession grep done (no prior D1/D2 records), `## Alternatives considered` present.

Risk packs (selected / not):

- Schema / columns / units / field names — selected: the table is the schema. Evidence: model tests + `make db-verify` + inspector no-FK assertion.
- Error handling / rollback / partial outputs — selected: migration must reverse; cursor must ignore stale advances. Evidence: `make db-verify`; stale-advance test.
- Public API / CLI / script entry — not selected: no route in this issue.
- Config / project setup — not selected: no env flags (those are #4).
- File IO / path safety / overwrite — not selected: DB row only.
- Auth / permissions / secrets — not selected: accessor is not owner-gated; auth is #4/#7.
- Concurrency / shared state / ordering — not selected: SQLite harness, single-writer cursor; per-chat lock is OCU #13.
- Resource limits / large input / discovery — not selected: prefs size cap is #7.
- Legacy compatibility / examples — not selected: new table.
- Release / packaging / dependency compatibility — not selected: no dependency change.
- Documentation / migration notes — selected only as the two decision records (required by AGENTS.md same-PR rule). Evidence: `make decisions-verify`.

## Risks / Trade-offs

- [Orphan rows after chat delete] → accepted (D14); #34 backup prune. Accessor remains keyed by chat_id so tests can still read an orphan.
- [Migration on Critical Path] → additive, inspector-guarded, `make db-verify`.
- [No pytest.ini / asyncio_mode] → tests mark `@pytest.mark.asyncio` explicitly; live against harness DB via `DATABASE_URL`/`DATA_DIR` like `make db-verify`, not a mocked Session.
- [env.py import omission] → explicit `op.create_table`; do not import the model unless proven necessary.

## Migration Plan

Upgrade creates the table if absent. Downgrade drops it. Rollback of the feature flag (later) leaves the table in place (D1 cost accepted). No data backfill.
