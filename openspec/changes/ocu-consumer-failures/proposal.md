# Proposal

## Why

Issue64 is a prerequisite of issue29's error states. OcuClient discards upstream HTTP status, launch/refresh can report failures as success, and the frontend resolves reason-only or non-JSON failures as null.

## What Changes

Introduce typed upstream HTTP failure, bounded WebUI-authored failure responses and one frontend error shape. Preserve exact never_created, authorization precedence and describe transport fallback. No retries or unrelated route refactors.

## Capabilities

### Modified Capabilities

- `ocu-client`: non-success responses cannot become domain payloads.
- `ocu-workspace-routes`: explicit upstream and transport failure rows, safe frontend propagation.

## Impact

Backend OCU client/router and paired tests; frontend OCU API helper/tests; CONTEXT public interface and decision record. No OCU source, proxy, UI component, migration or dependency changes.

## Fixture triage

Expanded: public API/error semantics, credential/detail containment, persistence invariants and frontend compatibility. Parent evidence includes real client/router regressions, Vitest failures, route smoke and scoped gates. Existing issue13 lifecycle contract is preserved. Docker remains deferred to issue36.
