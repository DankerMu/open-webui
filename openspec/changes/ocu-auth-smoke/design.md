# Design

## Context

Parent: `openspec/changes/ocu-workspace-integration/` D3. Issue #4 implemented the endpoint; this issue adds the smoke + Verification Matrix row (task 1.3).

## Goals / Non-Goals

**Goals:**

- `make smoke` asserts owner 200 and anonymous 401 for `GET /api/v1/ocu/auth`.
- AGENTS.md Verification Matrix has a live row whose command is `make smoke`.

**Non-Goals:**

- Workspace describe smoke (#8).
- 403 matrix, invalid ids, flag-off (TestClient in #4).
- UI / Playwright.
- Changing the endpoint.

## Decisions

Change surface: `smoke/api.hurl`, `smoke/ocu-auth-anon.hurl`, `AGENTS.md` Verification Matrix.

Must preserve: existing hurl rows (`/api/config`, `/api/version`, signin, `/api/models`, `/api/v1/chats/`); harness seed admin; `ENABLE_OCU_WORKSPACE=true` from `scripts/dev-bg.sh`; the Pending comment's workspace-describe half.

Must add/change: after signin, `POST /api/v1/chats/new` with `{chat:{title:"ocu-auth-smoke"}}`, capture `$.id`; `GET /api/v1/ocu/auth` with `Authorization: Bearer {{token}}` and `X-Chat-Id: {{chat_id}}` → HTTP 200, `header "X-User-Id" exists`, `header "X-User-Email" exists`, empty body (`body == ""`; hurl 8.0.1 rejects `bytes == 0`). Anonymous 401 lives in `smoke/ocu-auth-anon.hurl` (no signin; hurl cookie store is per file and `make smoke` does not pass `--no-cookie-store`; signin sets a `token` cookie that `get_verified_user` accepts).

Governing invariant: the live harness answers 200 only for the seed admin with a chat they just created, and 401 with no session; never 404.

Sibling surfaces: producers (none — smoke is the consumer); validators (D10 predicate already in the endpoint); storage (chat created via `/api/v1/chats/new`); entrypoints (`GET /api/v1/ocu/auth`); consumers (CI layer3, later proxy smoke #23); failure paths (anonymous 401). Reviewers check the hurl assertions match the archived spec's Owner subrequest and Anonymous request scenarios, and that the Pending row still names only unimplemented surfaces.

Seams under test: hurl against the running harness (`make smoke`).

Required evidence:

- Owner: HTTP 200, `X-User-Id` and `X-User-Email` present, body length 0.
- Anonymous: HTTP 401, `body == ""`.
- `make smoke` exit 0.
- `make doc-gate` exit 0.
- Verification Matrix command for the new row is `make smoke` (doc-gate forbids a command with no Makefile target).

Non-goals: listed above.

Review focus:

1. Owner row uses a real saved chat id from `/api/v1/chats/new`, not `"default"` or a fabricated uuid.
2. Anonymous row is a separate hurl file with no Authorization and no Cookie (not a second request in `api.hurl`).
3. Pending comment/row no longer lists `/api/v1/ocu/auth` but still names workspace describe.
4. Existing smoke rows still pass.

Risk packs:

- Public API / CLI / script entry — selected: hurl hits the shared GET. Evidence: smoke rows.
- Auth / permissions / secrets — selected: owner vs anonymous. Evidence: 200/401.
- Error handling / rollback / partial outputs — selected: empty body on both statuses. Evidence: `body == ""`.
- Documentation / migration notes — selected: Verification Matrix. Evidence: `make doc-gate`.
- Config / project setup — not selected: harness flag already set in #4.
- Schema / columns / units / field names — not selected.
- File IO / path safety / overwrite — not selected.
- Concurrency / shared state / ordering — not selected.
- Resource limits / large input / discovery — not selected.
- Legacy compatibility / examples — not selected.
- Release / packaging / dependency compatibility — not selected.

## Risks / Trade-offs

- [hurl has no chat_id until a chat exists] → create via `/api/v1/chats/new` after signin; capture `$.id`.
- [seed admin is an admin; admin non-owner is 403] → the created chat is owned by the seed admin, so 200 is correct.
- [hurl cookie store would turn a same-file anonymous GET into 200] → put 401 in `smoke/ocu-auth-anon.hurl`.
- [403 cases omitted from smoke] → TestClient already covers them; smoke stays the two rows the issue names.

## Migration Plan

None. Additive hurl + docs.
