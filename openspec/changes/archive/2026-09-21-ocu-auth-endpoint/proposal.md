# Proposal

Issue type: feature
Fixture level: expanded
Upstream suggested level: expanded (agree)
Blast radius: a wrong 200 lets a non-owner through the reverse proxy onto OCU; a 404 from this endpoint makes nginx `auth_request` return 500; a 403 that still calls `is_chat_owner` on invalid ids leaks lookup side effects.
Selected risk packs: Public API / CLI / script entry; Auth / permissions / secrets; Config / project setup; Error handling / rollback / partial outputs
Evidence floor: TestClient matrix (owner 200 + headers + empty body; anonymous 401; shared/folder/admin/non-existent 403; invalid ids 403 with `is_chat_owner` uncalled; flag off 403 never 404; no OCU client call) + `make lint-scoped` + `make coverage-gate` + `make test-backend`

`design.md` is required at expanded (auth on a shared entrypoint; 401/403 matrix is a Critical Path).

## Why

The reverse proxy's `auth_request` needs a WebUI endpoint that answers only 200/401/403 with an empty body and identity headers. Nothing in this fork does that. Design D3/D9/D10 specify the contract; this issue lands it before any workspace routes or proxy config exist.

## What Changes

- New router `backend/open_webui/routers/ocu_workspaces.py` with `GET /api/v1/ocu/auth` always registered.
- Env flags `ENABLE_OCU_WORKSPACE` (default false), `OCU_INTERNAL_TOKEN`, `OCU_INTERNAL_URL` in `env.py`.
- One `include_router` line in `main.py`.
- Harness `scripts/dev-bg.sh` sets `ENABLE_OCU_WORKSPACE=true`.
- TestClient suite `backend/open_webui/test/routers/test_ocu_auth.py`.

No describe/launch/refresh/prefs routes (#7). No smoke rows (#5). No edits to `utils/chat_id.py`. No cookie-less grant mode (D19).

## Capabilities

### New Capabilities

- `ocu-auth-endpoint`: session-mode owner check for the reverse proxy — 200/401/403 matrix, chat_id predicate, feature-flag 403, no OCU call.

### Modified Capabilities

None. Parent epic change `ocu-workspace-integration` already carries the parent requirement; this issue's delta is the auth-endpoint slice.

## Impact

- New: `routers/ocu_workspaces.py`, `test/routers/test_ocu_auth.py`.
- Minimal spine: `env.py` (three flags), `main.py` (one `include_router`), `scripts/dev-bg.sh` (one env assignment).
- Critical Path: `routers/ocu_workspaces.py` (auth, permissions) — tests for the 401/403/404 matrix + later `make smoke` (#5).
- Downstream: reverse proxy (#22) `auth_request`; OCU WebSocket re-check (#19); workspace routes (#7) reuse the same router module.
