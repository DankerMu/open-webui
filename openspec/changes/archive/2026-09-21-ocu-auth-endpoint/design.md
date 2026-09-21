# Design

## Context

See proposal.md for why. Parent design: `openspec/changes/ocu-workspace-integration/design.md` D3, D9, D10. Issue #4 implements only the auth endpoint those decisions name; workspace routes land in #7; smoke rows in #5.

Constraints: new behaviour in a new router module; `main.py` and `env.py` touched with one-line hooks (AGENTS.md Module Boundaries); Critical Path row for this router (401/403/404 matrix tests).

## Goals / Non-Goals

**Goals:**

- Always-registered `GET /api/v1/ocu/auth` with the D3 matrix, D10 predicate, D9 flag-off 403.
- Env flags and harness assignment so later issues can call the endpoint.

**Non-Goals:**

- Describe/launch/refresh/prefs (#7).
- Smoke rows (#5).
- Edits to `utils/chat_id.py`.
- Cookie-less grant mode (D19).
- Calling OCU or minting tokens.
- Decision records (D3/D9/D10 already live in the parent design; this issue implements them).

## Decisions

Change surface: `backend/open_webui/routers/ocu_workspaces.py` (`APIRouter`, prefix `/api/v1/ocu` at include time), `backend/open_webui/test/routers/test_ocu_auth.py`, `backend/open_webui/env.py` (three flags), `backend/open_webui/main.py` (one `include_router` after the existing `/api/v1/*` block), `scripts/dev-bg.sh` (one export).

Must preserve: every existing `/api/v1/*` route; `get_verified_user` 401 semantics; `is_saved_chat_id` in `utils/chat_id.py`.

Must add/change: the auth route; three env names; harness flag on.

Governing invariant: only the chat owner with a valid session and the flag on receives 200; every other authenticated failure is 403 with an empty body; invalid chat ids never reach `is_chat_owner`; the endpoint never returns 404.

Sibling surfaces: producers (proxy `auth_request` in #22, OCU WS re-check in #19 — not built here); validators (D10 predicate in this module); storage (none — no DB write); entrypoints (this GET); consumers (proxy copies `X-User-Id`/`X-User-Email`; later workspace routes share the router file); failure paths (401 no session, 403 matrix, flag off). Reviewers at expanded check these named siblings even though #19/#22 are not in the diff: confirm the 200/401/403 contract those siblings will call is present and that this PR does not invent a second auth mode.

Seams under test: FastAPI `TestClient` against the harness DB (owner/shared/admin/invalid ids). Do not require a live proxy.

Required evidence:

- TestClient goes through the real `get_verified_user` dependency (no `app.dependency_overrides` for it).
- Owner session + `X-Chat-Id: C` + flag on → 200, headers present, zero-byte body.
- No session → 401, zero-byte body.
- Shared / folder / admin / missing chat → 403, zero-byte body.
- Missing `X-Chat-Id` → 403, zero-byte body.
- `temporary:` / `local:` / `channel:` / `""` / `"default"` → 403, zero-byte body, `is_chat_owner` call count 0 (patch/spy).
- Flag off → 403, zero-byte body, never 404.
- Empty-body handling is endpoint-local: another existing authenticated route still returns its usual error body.
- No OCU HTTP client constructed or called (assert by absence of import/call, or a stub that would fail if hit).

Non-goals: listed above.

Review focus:

1. `get_verified_user` is the only auth dependency; no custom cookie parser.
2. Invalid ids short-circuit before `is_chat_owner`.
3. Flag off is 403 not 404 (nginx 404→500).
4. Empty body on every status.
5. `include_router` is unconditional; workspace routes stay unregistered in this PR.
6. `OCU_INTERNAL_TOKEN` is never logged.

Risk packs:

- Public API / CLI / script entry — selected: the GET is a shared entrypoint. Evidence: TestClient matrix.
- Auth / permissions / secrets — selected: owner-only, session, no token in logs. Evidence: 401/403 cases + spy on `is_chat_owner`.
- Config / project setup — selected: three env flags, harness assignment. Evidence: flag-off test; `dev-bg.sh` contains `ENABLE_OCU_WORKSPACE=true`.
- Error handling / rollback / partial outputs — selected: 401/403 matrix, never 404, empty body. Evidence: TestClient.
- Schema / columns / units / field names — not selected: no table.
- File IO / path safety / overwrite — not selected.
- Concurrency / shared state / ordering — not selected: stateless GET.
- Resource limits / large input / discovery — not selected.
- Legacy compatibility / examples — not selected: new route.
- Release / packaging / dependency compatibility — not selected.
- Documentation / migration notes — not selected: D3/D9/D10 already in parent design.

## Risks / Trade-offs

- [nginx treats non-2xx/401/403 as 500] → endpoint never 404s; flag off is 403.
- [Admin 403 vs WebUI's own admin chat access] → workspace surface is owner-only (CONTEXT.md); admin 403 is required, not a bug.
- [Token in env unused this PR] → reserved for #6/#7; unused is fine; never log it.

## Migration Plan

None. Additive route. Flag default false hides it from production until overlay sets the flag.
