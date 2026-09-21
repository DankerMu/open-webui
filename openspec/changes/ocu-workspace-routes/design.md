# Design

## Context

Parent D4, D7, D9, D11, D13. Issue #7 is tasks 3.2–3.3. Client is #6; table is #3; auth is #4.

## Goals / Non-Goals

**Goals:** four flag-gated owner-only routes; CONTEXT.md rows.

**Non-Goals:** smoke (#8); UI; OCU-side launch (#13).

## Decisions

Change surface: `backend/open_webui/routers/ocu_workspaces.py` (add routes; keep `/auth` always registered), `backend/open_webui/test/routers/test_ocu_workspaces.py`, `CONTEXT.md`.

Must preserve: `/auth` 200/401/403 empty-body contract; `get_verified_user`; `is_saved_chat_id and != default` before owner check.

Must add: four routes; D7 mapping; D11 cursor; D4 header; token bucket 1/2s burst 3; prefs whitelist.

Governing invariant: only the chat owner with a valid session and the flag on reaches OCU; mutating routes without `X-Requested-With: ocu-workspace` 403 before `is_chat_owner` and before the client; describe never starts a sandbox; `OcuUnreachable` is 200 unavailable, never 409; launch `OcuNeverCreated` is 409.

Sibling surfaces: producers (#6 client, #3 state); validators (D10 predicate, D4 header); storage (`OcuChatStates`); entrypoints (four routes + existing `/auth`); consumers (#8, #28); failure paths (401/403/404/409/422/429).

Seams under test: TestClient + stubbed `OcuClient` (inject/monkeypatch the client used by the router). Real `get_verified_user`. Harness DB.

Required evidence: the task 3.3 list, each as a TestClient case.

Non-goals: listed.

Review focus:

1. Flag off: four routes 404; `/auth` still 403-not-404.
2. Header check after auth, before owner, client uncalled.
3. D7: running → running; paused/exited/created/absent+meta → stopped; never_created → unavailable/never_created; OcuUnreachable → unavailable/ocu_unreachable views [].
4. Describe never calls launch.
5. Refresh 429 + Retry-After; cursor 5 vs broker 7 stopped → 7 stored.
6. CONTEXT.md Public Interfaces lists five routes and 401/403/404/409/422; Core Invariants credential line is D13 ("reach only the sandbox of the chat they were scoped to").

Risk packs:

- Public API — selected: four routes. Evidence: TestClient.
- Auth — selected: owner 404, header 403, anonymous 401. Evidence: 3.3.
- Error handling — selected: 409/422/429/unavailable. Evidence: 3.3.
- Concurrency — selected: token bucket. Evidence: burst 3/5 → 429.
- Schema/field names — selected: describe payload + prefs whitelist. Evidence: 3.3.
- Documentation — selected: CONTEXT.md. Evidence: `make doc-gate`.
- Config — not selected: flag already in router.
- File IO — not selected.
- Legacy — not selected.
- Release — not selected.

## Risks / Trade-offs

- [flag-gated include vs per-route] → register extra routes on the same always-included router only when the flag is true at import/startup (module-level `ENABLE_OCU_WORKSPACE` already in the file). Tests monkeypatch the flag and re-bind routes, or call the handlers; prefer adding routes at module load when flag is true, matching D9. For TestClient flag-off: patch before app import is hard; implement as runtime check returning 404 when flag is off so tests can monkeypatch the module flag (same as `/auth` flag-off 403). Document: D9 "not registered" is satisfied for production (flag false at import → routes not added) AND a runtime 404 guard so tests and a late env toggle cannot expose them. Prefer **runtime 404 when flag off** plus **also skip add_api_route when flag is false at import**. Tests monkeypatch `ENABLE_OCU_WORKSPACE` on the router module for the flag-off case (routes still exist in TestClient because the harness sets the flag true before import, same as `/auth`). This matches `/auth`'s flag-off pattern (403 vs 404).
- [rate limit in-process] → lost on restart; accepted (D4).
- [base_url] → `/ocu` (proxied prefix).

## Migration Plan

None. Additive routes. Flag default false.
