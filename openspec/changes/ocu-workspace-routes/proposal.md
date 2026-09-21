# Proposal

Issue type: feature
Fixture level: expanded
Upstream suggested level: expanded (agree — public API, persisted state, rate limiting, auth)
Blast radius: a wrong 200 on describe/launch lets a non-owner start a sandbox; a missing X-Requested-With check lets a same-site form post launch; a timeout mapped as never_created offers launch on an unreachable OCU.
Selected risk packs: Public API / CLI / script entry; Auth / permissions / secrets; Error handling / rollback / partial outputs; Concurrency / shared state / ordering; Schema / columns / units / field names; Documentation / migration notes
Evidence floor: TestClient matrix in task 3.3 + `make lint-scoped` + `make coverage-gate` + `make test-backend` + `make doc-gate`

`design.md` is required at expanded.

## Why

#4 landed auth; #3 landed `ocu_chat_state`; #6 landed `OcuClient`. The sidebar still has no describe/launch/refresh/prefs routes.

## What Changes

- Four routes on the existing `ocu_workspaces` router, registered only when `ENABLE_OCU_WORKSPACE` is true.
- CONTEXT.md Public Interfaces row + D13 credential line.

No smoke (#8). No UI. No OCU launch implementation.

## Capabilities

### New Capabilities

- `ocu-workspace-routes`: owner-only describe/launch/refresh/prefs with D7 mapping, D11 cursor, D4 header, token-bucket refresh.

### Modified Capabilities

- `ocu-auth-endpoint`: same router module grows four flag-gated routes; auth stays always-registered.

## Impact

- `routers/ocu_workspaces.py`, `test/routers/test_ocu_workspaces.py`, CONTEXT.md.
- Downstream: #8 smoke; #28 frontend client.
