# Proposal

Issue type: test
Fixture level: expanded
Upstream suggested level: expanded (agree — auth on a shared entrypoint; smoke is the Critical Path evidence for `routers/ocu_workspaces.py`)
Blast radius: a missing or wrong smoke row lets a 401/403/200 regression ship past CI layer3; a 404 in the owner row makes later proxy smoke (#23) untrustworthy.
Selected risk packs: Public API / CLI / script entry; Auth / permissions / secrets; Error handling / rollback / partial outputs; Documentation / migration notes
Evidence floor: `make smoke` exits 0 with owner 200 + anonymous 401 rows; `make doc-gate` exits 0 after the Verification Matrix row is live.

`design.md` is required at expanded (auth smoke on a shared entrypoint).

## Why

Issue #4 landed `GET /api/v1/ocu/auth`. `make smoke` still does not hit it; AGENTS.md Verification Matrix still lists it under **Pending**. Task 1.3 and issue #5 require the hurl rows and the matrix row in the same PR now that the route exists.

## What Changes

- `smoke/api.hurl`: create a seed-admin-owned chat, `GET /api/v1/ocu/auth` as owner (200, identity headers, empty body). Keep the Pending comment for workspace describe (#8).
- `smoke/ocu-auth-anon.hurl`: a separate file so hurl's per-file cookie store cannot reuse the signin `token` cookie; anonymous GET → 401, empty body.
- AGENTS.md Verification Matrix: replace the `/api/v1/ocu/auth` half of the Pending row with a live `make smoke` row. Leave workspace describe / UI paths Pending (#8 / #36).
- Parent `openspec/changes/ocu-workspace-integration/tasks.md` task 1.3 stays the source checklist; this change is the slice fixture.

No workspace-route smoke (#8). No flag-off / 403 matrix in hurl (TestClient already covers those; harness flag is on). No UI.

## Capabilities

### New Capabilities

- `ocu-auth-smoke`: harness smoke of session-mode owner 200 and anonymous 401 for `/api/v1/ocu/auth`, plus the Verification Matrix row.

### Modified Capabilities

- `ocu-auth-endpoint`: smoke now exercises the live endpoint (requirement already in the archived spec's harness-flag scenario).

## Impact

- Harness: `smoke/api.hurl`, `smoke/ocu-auth-anon.hurl`, AGENTS.md Verification Matrix.
- Downstream: CI layer3 `make smoke`; proxy smoke (#23) will reuse the same owner/anonymous contract.
