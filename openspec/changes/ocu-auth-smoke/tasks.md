# Tasks

Issue #5 / Plan 1 group 1, task 1.3.

Selected: Public API / CLI / script entry — hurl hits `GET /api/v1/ocu/auth`. Auth / permissions / secrets — owner 200 vs anonymous 401. Error handling / rollback / partial outputs — empty body. Documentation / migration notes — Verification Matrix row.

Not selected: Config (harness flag already on); Schema; File IO; Concurrency; Resource limits; Legacy; Release.

- [x] 1.3a Owner smoke in `smoke/api.hurl`: after the existing signin capture, `POST /api/v1/chats/new` as the seed admin with `{chat:{title:"ocu-auth-smoke"}}`, capture `chat_id` from `$.id`. `GET /api/v1/ocu/auth` with `Authorization: Bearer {{token}}` and `X-Chat-Id: {{chat_id}}` asserts HTTP 200, `header "X-User-Id" exists`, `header "X-User-Email" exists`, and empty body via `body == ""` (hurl 8.0.1 rejects `bytes == 0` on a genuine zero-byte body: actual `bytes <>` vs expected `integer <0>`). Edit the Pending comment so it no longer names `/api/v1/ocu/auth`; keep the `GET /api/v1/ocu/workspaces/{chat_id}` Pending line for #8. Do not put the anonymous 401 row in this file: hurl keeps a cookie store per file (`make smoke` does not pass `--no-cookie-store`…
- [x] 1.3a2 Anonymous smoke in a separate file `smoke/ocu-auth-anon.hurl` (fresh cookie store, no signin): `GET /api/v1/ocu/auth` with `X-Chat-Id: smoke-anon` and no Authorization/Cookie asserts HTTP 401 and `body == ""`. `make smoke` already globs `smoke/*.hurl`.
- [x] 1.3b AGENTS.md Verification Matrix: add a live row for `GET /api/v1/ocu/auth` with command `make smoke` and evidence "HTTP 200 + identity headers + empty body (owner); HTTP 401 + empty body (anonymous)". Drop `/api/v1/ocu/auth` from the Pending row; leave workspace describe / UI paths there. Verify: `make smoke` and `make doc-gate` exit 0.

Non-goals: workspace describe smoke (#8); 403/flag-off/invalid-id (TestClient); endpoint code.
