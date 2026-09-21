---
id: 2026-09-20-ocu-chat-state-table
title: Per-chat workspace state lives in table ocu_chat_state
kind: architecture
status: implemented
date: 2026-09-20
supersedes: none
references: docs/plans/2026-09-20-workspace-artifact-integration.md (A1); openspec/changes/ocu-workspace-integration design D1, D14; DankerMu/open-webui#3
---

# Per-chat workspace state lives in table ocu_chat_state

## Problem

Plan 1 A1 needs a per-chat last-seen workspace revision cursor and UI preferences that survive reload. Nothing in this fork records that state. Plan 1 leaves the store as either `chat.meta` or a small table; the table choice is what makes the named migration required.

## Decision

Workspace state is persisted in `ocu_chat_state` (`chat_id` text primary key, `last_seen_revision` integer not null default 0, `prefs` JSON not null default `{}`, `updated_at` bigint not null) in `backend/open_webui/models/ocu_chat_state.py`. There is no foreign key to `chat`. Accessor `OcuChatStates` offers `get`, `upsert_prefs` and `advance_cursor`; the cursor uses `>` so equal or stale values leave the row unchanged, including `updated_at`. One additive Alembic revision `add_ocu_chat_state` creates the table.

## Alternatives considered

- **`chat.meta`** — upstream rewrites `meta` wholesale on tag, pin and folder updates, so fork fields would race with those writes and every fork write would touch an upstream write path.
- **Client-only storage (localStorage)** — loses cross-device consistency and gives history restore no server truth for the last-seen revision; Plan 1 requires restore from the backend describe.

## Consequences

The migration sits on the Alembic Critical Path (`make db-verify`). Feature-flag rollback keeps the table and hides the UI. A deleted chat leaves an orphan row that owner-gated routes cannot read; backup prune of orphans is a later procedure. Prefs key whitelist and size cap are enforced on the prefs route, not in this table.
