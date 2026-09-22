# Proposal

Issue type: feature
Fixture level: expanded
Upstream suggested level: compact (override: service credentials cross MCP, probes, uploads and cached client configuration).
Blast radius: OCU tools fail authorization or operate against a shared default chat; credentials or forged identity reach a wrong request.
Selected risk packs: Public API / CLI / script entry; Config / project setup; Auth / permissions / secrets; File IO / path safety / overwrite; Concurrency / shared state / ordering; Legacy compatibility / examples; Error handling / rollback / partial outputs; Documentation / migration notes.
Evidence floor: behavioral tool tests red/green, real guard compatibility without Docker, configured OCU non-Docker suite and cross-review. Docker verification remains in epic task 19.0 after all development.

## Why

Issue #10 migrates the OCU tool caller to the service boundary implemented by #9. MCP calls, preflight probes and upload requests must use the correct credential carrier, without coercing absent chat metadata into a shared sandbox.

## What Changes

- Supply server-configured OCU_INTERNAL_TOKEN on all OCU requests: dedicated MCP header alongside MCP_API_KEY; Bearer on REST/probes/uploads.
- Derive X-User-Email only from injected server-side **user**, never tool arguments or request headers.
- Return a tool error for absent/empty chat metadata before upload, health probe or MCP execution.
- Include credential configuration in cached-client invalidation; document server-side provisioning.

## Capabilities

### New Capabilities

- `ocu-tool-auth`: authenticated OCU tool and upload requests with explicit chat identity.

### Modified Capabilities

None. The `ocu-auth-guard` service contract is unchanged.

## Impact

Sibling OCU `openwebui/tools/computer_use_tools.py`, existing `tests/test_tools.py`, directly relevant tool documentation/changelog. Filter is #11. No dependency, server policy, proxy, lifecycle or event change.
