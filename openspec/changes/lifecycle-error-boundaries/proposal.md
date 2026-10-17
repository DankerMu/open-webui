# Proposal

## Why

Issue #306 identifies Docker exceptions that bypass the existing lifecycle error contract at get/create and describe lookup, and launch's post-lookup preparation/readiness windows. MCP can expose its generic fallback, while HTTP loses the established structured lifecycle response. The finding was static; this change will establish controlled error-path evidence without claiming a real-daemon incident.

## What Changes

- Normalize Docker exceptions only at the named request-driven lifecycle service boundaries using the existing status500 / `launch_failed` contract.
- Preserve initial launch lookup mapping, missing-container semantics, specific network errors, restart timeout and retirement behavior.
- Add a focused error-boundary test module reusing existing engine/app fixtures, plus parent-owned service/consumer probes and an existing decision-record update.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-lifecycle`: typed Docker failures at the specified lifecycle request boundaries, including MCP text and existing HTTP envelope consumption.

## Impact

OCU `computer-use-server/docker_manager.py` and focused lifecycle tests. MCP/app production catch layers and unrelated raw lookup consumers remain unchanged. WebUI owns fixture, evidence and lifecycle decision updates; its consumer parsing is tracked separately in #467.

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded for shared service entrypoints, error contracts and state ordering.
Blast radius: request lifecycle failure responses and launch preparation ordering.
Selected risk packs: Public API / CLI / script entry; Auth / permissions / secrets; Concurrency / shared state / ordering; Legacy compatibility / examples; Error handling / rollback / partial outputs; Documentation / migration notes.
Evidence floor: hash-bound semantic RED/GREEN, actual service plus MCP/HTTP consumer error paths, operation-specific fault injection and preservation controls, adjacent regression modules and independent cross-review.
