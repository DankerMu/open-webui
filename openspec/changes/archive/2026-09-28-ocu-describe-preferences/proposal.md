# Proposal

## Why

Issue92 unblocks issue32 history restoration: preferences are persisted by PUT /prefs but absent from describe. The user chose a separate backend prerequisite rather than expanding the frontend PR.

## What Changes

Authorized describe200 responses expose nested `prefs` from the existing WebUI state row, including the unreachable fallback and an empty object when no preferences exist. Existing errors, ownership, cursor and sandbox lifecycle remain unchanged.

Fixture level: expanded — public response shape and owner-gated persisted state. Selected risk packs: API/schema compatibility (nested existing preference keys), authorization/data isolation (owner-only reads), persistence/error semantics (local state on dependency outage). Not selected: migrations, frontend/runtime lifecycle, deployment/network, dependencies; none changes here.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-workspace-routes`: describe includes the persisted preference object without changing error or lifecycle semantics.

## Impact

Production: `backend/open_webui/routers/ocu_workspaces.py` only. Evidence: existing route TestClient module and smoke. No frontend integration, new endpoint, OCU modification, migration or dependency. Additive amendment to umbrella design D4; issue32 consumes nested `prefs`, not speculative top-level frontend fields.
