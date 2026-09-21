# Proposal

Issue type: test
Fixture level: compact
Upstream suggested level: expanded (override: this slice is task 3.4 only — hurl rows against the already-shipped describe route; no new entrypoint, schema, or persisted-state write. Auth/404 matrix already lives in TestClient. Same override class as a docs/smoke add after the route PR.)
Blast radius: a missing owner row lets describe 404/500 ship past CI layer3; a 200 on a foreign chat_id means owner-only 404 is not exercised at the harness boundary.
Selected risk packs: Public API / CLI / script entry; Auth / permissions / secrets; Documentation / migration notes
Evidence floor: `make smoke` exits 0 with owner 200 and foreign-chat 404; `make doc-gate` exits 0 after the Verification Matrix describe row is live.

`design.md` omitted (compact).

## Why

Issue #7 landed `GET /api/v1/ocu/workspaces/{chat_id}`. `make smoke` still does not hit it; AGENTS.md Verification Matrix still lists it under **Pending**. Task 3.4 and issue #8 require the hurl rows now that the route exists.

## What Changes

- `smoke/api.hurl`: after the existing seed-admin chat capture, `GET /api/v1/ocu/workspaces/{{chat_id}}` as owner (200, JSON `status` exists). `GET /api/v1/ocu/workspaces/not-a-real-chat-id` with the same session (404). Remove the Pending comment for this path.
- AGENTS.md Verification Matrix: live row for `GET /api/v1/ocu/workspaces/{chat_id}` with command `make smoke`. Leave UI sidebar paths Pending (#36).
- CONTEXT.md Public Interfaces test-seam cell: drop "pending rows" for describe now that smoke covers it.

Harness has no OCU broker. Describe maps `OcuUnreachable` to HTTP 200 `unavailable`/`ocu_unreachable`; owner smoke asserts 200 + `status`, not `running`. No launch/refresh/prefs smoke (#28 UI / #23 proxy). No anonymous describe file (GET describe uses session auth like other `api.hurl` rows; 401 is TestClient-covered).

## Capabilities

### New Capabilities

- `ocu-workspace-describe-smoke`: harness smoke of owner 200 and foreign-chat 404 for describe, plus the Verification Matrix row.

### Modified Capabilities

- `ocu-workspace-routes`: smoke now exercises the live describe endpoint.

## Impact

- Harness: `smoke/api.hurl`, AGENTS.md Verification Matrix, CONTEXT.md test-seam wording.
- Downstream: CI layer3 `make smoke`; proxy smoke (#23) still out of scope.
