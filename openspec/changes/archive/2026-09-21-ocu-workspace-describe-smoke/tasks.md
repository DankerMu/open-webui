# Tasks

Issue #8 / Plan 1 group 3, task 3.4.

Selected: Public API / CLI / script entry — hurl hits `GET /api/v1/ocu/workspaces/{chat_id}`. Auth / permissions / secrets — owner 200 vs foreign-chat 404. Documentation / migration notes — Verification Matrix row.

Not selected: Config (harness flag already on); Schema; File IO; Concurrency; Resource limits; Legacy; Release; Error handling (empty-body 401 is TestClient + auth smoke).

- [ ] 3.4a Owner + foreign-chat smoke in `smoke/api.hurl`: reuse the captured `chat_id` from the existing `POST /api/v1/chats/new`. `GET /api/v1/ocu/workspaces/{{chat_id}}` with `Authorization: Bearer {{token}}` asserts HTTP 200 and `jsonpath "$.status" exists` (harness without OCU is 200 `unavailable`). `GET /api/v1/ocu/workspaces/not-a-real-chat-id` with the same session asserts HTTP 404. Delete the Pending comment that names this path.
- [ ] 3.4b AGENTS.md Verification Matrix: add a live row for `GET /api/v1/ocu/workspaces/{chat_id}` with command `make smoke` and evidence "HTTP 200 + `status` (owner, OCU down → unavailable); HTTP 404 (foreign chat id)". Drop that path from the Pending row; leave UI sidebar paths. CONTEXT.md Public Interfaces test-seam: smoke rows are live, not pending. Verify: `make smoke` and `make doc-gate` exit 0.

Non-goals: launch/refresh/prefs smoke; proxy smoke (#23); 401/flag-off/invalid-id (TestClient); endpoint code.
