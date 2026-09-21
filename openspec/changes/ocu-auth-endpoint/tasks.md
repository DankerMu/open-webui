# Tasks

Issue #4 / Plan 1 group 1 slice 1.1+1.2.

## 1. Auth endpoint, flags, tests

- [ ] 1.1 Add `ENABLE_OCU_WORKSPACE` (default false), `OCU_INTERNAL_TOKEN`, `OCU_INTERNAL_URL` to `backend/open_webui/env.py`. One `include_router` of `ocu_workspaces.router` at prefix `/api/v1/ocu` in `main.py` (unconditional). `scripts/dev-bg.sh` exports `ENABLE_OCU_WORKSPACE=true`. Verify: `rg ENABLE_OCU_WORKSPACE scripts/dev-bg.sh` matches.
- [ ] 1.2 Add `backend/open_webui/routers/ocu_workspaces.py`: `GET /auth` with `Depends(get_verified_user)`; chat id from `X-Chat-Id`; reject missing header and ids failing `is_saved_chat_id(chat_id) and chat_id != "default"` with 403 before `Chats.is_chat_owner`; 200 + `X-User-Id`/`X-User-Email` + empty body on owner and flag on; 403 when flag off; never 404; never import or call an OCU client. Verify: module imports.
- [ ] 1.3 Add `backend/open_webui/test/routers/test_ocu_auth.py` (TestClient, harness DB, real `get_verified_user` — no dependency override): owner 200 headers+zero-byte body; anonymous 401 zero-byte body; shared/folder/admin/non-existent and missing `X-Chat-Id` 403 zero-byte body; invalid ids 403 zero-byte body with `is_chat_owner` call count 0; flag off 403 never 404, zero-byte body; empty-body handling is endpoint-local (another existing route still has its usual error body); no OCU call. Tests red against pre-change source (route 404) then green. Verify: `cd backend && uv run pytest -q -p no:cacheprovider open_webui/test/routers/test_ocu_auth.py` exits 0.
- [ ] 1.4 Scoped hygiene. Verify: `make lint-scoped`, `make coverage-gate`, `make test-backend` exit 0 (fork-added router ≥ 80%).

## Risk packs

- Public API / CLI / script entry — selected — 1.3 TestClient matrix.
- Auth / permissions / secrets — selected — 1.3 401/403 + `is_chat_owner` spy.
- Config / project setup — selected — 1.1 harness export + 1.3 flag-off.
- Error handling / rollback / partial outputs — selected — 1.3 never-404 / empty body.
- Schema / columns / units / field names — not selected — no table (explicit non-goal).
- File IO / path safety / overwrite — not selected.
- Concurrency / shared state / ordering — not selected — stateless GET.
- Resource limits / large input / discovery — not selected.
- Legacy compatibility / examples — not selected — new route.
- Release / packaging / dependency compatibility — not selected.
- Documentation / migration notes — not selected — D3/D9/D10 already in parent design (explicit non-goal).
