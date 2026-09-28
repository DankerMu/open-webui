# Design

## Context

`OcuChatStates.advance_cursor` returns the authoritative row, including prefs. The answered describe path ignores that return. Unreachable describe already reads the row for its cursor. PUT /prefs returns `{prefs: row.prefs}` using `view`, `selected_file_id`, `open`; the frontend's speculative top-level camelCase reader has no shipped backend contract.

## Goals / Non-Goals

Expose the same persisted object on authorized200 describe responses. Preserve all owner/flag/saved-ID gates and the502 reason-only response. No write-semantics change, default filling, preference cache, new DB query, migration, frontend changes, sandbox start or Docker operation.

## Decisions

- Add nested `prefs` mirroring PUT /prefs. Preserve missing keys and explicit nulls; do not translate keys or synthesize defaults. Top-level fields would collide with runtime metadata and perpetuate the unused frontend shape.
- Answered path uses the row returned by the existing cursor advance. Unreachable path uses its existing lookup, or `{}` when absent. Preferences come only from WebUI storage, never an OCU payload's similarly named field.
- Read gates precede dependency/local-state access. Upstream HTTP failure remains502 with only its fixed reason; no preference recovery is bolted onto that error path.
- Keep tests on real FastAPI routes and harness DB, mocking only OcuClient. Persist through PUT, then read using an independent client/request; latest-write and null-clearing cases reject a process-local cache or filled defaults. Existing authorization/cursor/failure matrix stays in force.

## Risks / Trade-offs

Wrong-chat or upstream-provided prefs → owner/foreign isolation and conflicting upstream-prefs case. Preference loss when cursor advances → assert DB preferences unchanged across successful describe and unreachable fallback. Existing consumers ignore the additive field; issue32 explicitly owns nested-pref migration.

## Migration Plan

Ship backend addition first, then issue32 consumes it. No data migration. Rollback removes the extra response field while retaining existing stored preferences. Parent runs RED/GREEN route evidence, scoped gates and smoke, then independent expanded review and exact-head CI. Actual deployment/restart UI acceptance remains the consuming issue and final Docker stage.
