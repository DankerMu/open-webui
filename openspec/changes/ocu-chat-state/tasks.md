# Tasks

Issue #3 / Plan 1 group 2. Atomic: model + migration + tests + D1/D2 records.

## 1. Model, migration, tests, decision records

- [ ] 1.1 Add `backend/open_webui/models/ocu_chat_state.py`: ORM `OcuChatState` (`chat_id` PK Text, `last_seen_revision` Integer not null default 0, `prefs` JSON not null default `{}`, `updated_at` BigInteger not null; no ForeignKey); Pydantic `OcuChatStateModel`; accessor class `OcuChatStates` with async `get(chat_id)`, `upsert_prefs(chat_id, prefs)`, `advance_cursor(chat_id, revision)` via `get_async_db_context`; module singleton `OcuChatStates = OcuChatStateTable()`. Cursor uses `>` so equal/stale values do not decrease it. Verify: file exists and imports.
- [ ] 1.2 Add Alembic revision `add_ocu_chat_state` with `down_revision = 'd4c1a8e37b62'` (current head). `upgrade` inspector-guards `create_table` (Text PK, Integer not null default 0, JSON not null default `{}`, BigInteger not null; no FK). `downgrade` drops the table. Do not edit `models/chats.py`. Verify: `make db-verify` exits 0.
- [ ] 1.3 Add `backend/open_webui/test/models/test_ocu_chat_state.py` (pytest-asyncio, real harness DB): prefs upsert/get round trip; `advance_cursor(7)` then `advance_cursor(5)` keeps 7; `advance_cursor(5)` then `7` stores 7; `get` missing → None and no insert; writing C does not create C2; table has no FK (inspector). Tests must go red against pre-change source (ImportError / missing table) and green after. Verify: `cd backend && uv run pytest -q -p no:cacheprovider open_webui/test/models/test_ocu_chat_state.py` exits 0.
- [ ] 1.4 Decision records `docs/decisions/implemented/architecture/2026-09-20-ocu-chat-state-table.md` (D1) and `docs/decisions/implemented/architecture/2026-09-20-ocu-cross-repo-home.md` (D2): frontmatter per `docs/decisions/TEMPLATE.md`, kind architecture, status implemented, supersedes none, `## Alternatives considered` filled from parent design D1/D2. Grep active records first; do not archive the LAN-topology or path-grant records. Verify: `make decisions-verify` exits 0.
- [ ] 1.5 Scoped hygiene on the change list. Verify: `make lint-scoped` and `make coverage-gate` exit 0 (fork-added `ocu_chat_state.py` ≥ 80% lines, no assertion-free padding).

## Risk packs

- Schema / columns / units / field names — selected — 1.2 inspector + 1.3 column/FK assertions + `make db-verify`.
- Error handling / rollback / partial outputs — selected — 1.2 downgrade + 1.3 stale-advance.
- Documentation / migration notes — selected as decision records only — 1.4.
- Public API / CLI / script entry — not selected — no route (explicit non-goal).
- Config / project setup — not selected — no env (explicit non-goal).
- File IO / path safety / overwrite — not selected — DB only.
- Auth / permissions / secrets — not selected — no owner check here (explicit non-goal).
- Concurrency / shared state / ordering — not selected — no lock in this module.
- Resource limits / large input / discovery — not selected — prefs cap is #7.
- Legacy compatibility / examples — not selected — new table.
- Release / packaging / dependency compatibility — not selected — no deps.
