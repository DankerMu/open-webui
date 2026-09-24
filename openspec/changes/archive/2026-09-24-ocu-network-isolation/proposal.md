# Proposal

## Why

Sandbox creation and recovery still attach containers to the control-plane compose network. Address fallback relies on that shared membership, conflicting with the dedicated-bridge contract.

## What Changes

- Remove compose discovery, attachment, repair fallback and unused imports; resolve service addresses from engine-published gateway ports.
- Select a provisioned sandbox bridge at container creation; enforce sandbox-only membership before successful explicit launch.
- **BREAKING**: incompatible existing port bindings cause an explicit launch failure without deletion. The user selected preservation over automatic reconstruction on 2026-09-24 (issue20 comment5813697898).
- Place membership tests in CI-discovered tests/orchestrator rather than the issue's root-level test path.

## Capabilities

### New Capabilities

- `ocu-network-isolation`: sandbox membership, non-destructive launch migration and gateway addressing. Implements the code slice of parent sandbox-network-isolation; deployment/firewall remain separate.

### Modified Capabilities

None.

## Impact

OCU docker_manager.py, the unused mcp_tools.py import, affected tests, existing README/.env.example/changelog. No compose, firewall, CI, dependency or WebUI runtime edits. Existing user-owned deploy files remain untouched; deploy issue24 must retire the port-binding patch when adopting native configuration.

## Fixture triage

Expanded; atomic membership/address/lifecycle cutover. Risk packs: network/config (bridge and bind validation), state/compatibility (all launch paths, preserved containers), error-handling (fail loud, no success on partial repair), test-evidence (stateful Docker fake; real engine deferred). No schema or new credential contract.

Must preserve multi-worker locks, workspace mounts/meta, stopped-tool refusal, owner checks, launch error propagation, and no automatic container deletion. Actual Docker acceptance is explicitly deferred by the user to consolidated issue36; unit evidence cannot claim L3 reachability.
