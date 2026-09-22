# Proposal

Issue type: feature
Fixture level: expanded
Upstream suggested level: compact (override: authenticated fetch/cache, browser links and user-confirmed server startup change).
Blast radius: leaked service credential, stale cross-configuration prompts, invalid public links or startup failure.
Selected risk packs: Public API / CLI / script entry; Config / project setup; Auth / permissions / secrets; Concurrency / shared state / ordering; Legacy compatibility / examples; Error handling / rollback / partial outputs; Release / packaging / dependency compatibility; Documentation / migration notes.
Evidence floor: real non-Docker guard/fetch and redirect tests, prompt baseline, concrete file links, production-command startup rejection, configured non-Docker suite and cross-review. Docker deferred to epic task 19.0.

## Why

Issue #11 migrates the link filter to the service boundary and proxied public link base. The user resolved both ambiguities: reject PUBLIC_BASE_URL with a trailing slash at OCU startup, and target concrete files rather than the preview shell (issue comment 5771923958).

## What Changes

- Authenticate `/system-prompt` with the process-env internal token; prevent redirect leakage and keep the token outside Valve/browser serialization.
- Preserve prompt insertion behavior and per-chat/user cache isolation; do not reuse cached authorization across credential or internal-origin changes.
- **BREAKING**: reject a configured PUBLIC_BASE_URL ending in `/` before the OCU server starts; remove silent normalization of that configuration. ORCHESTRATOR_URL trailing-slash tolerance is unchanged.
- **BREAKING**: preview decoration points to the first current-chat concrete file link. Browser-tool output without a file gets no preview link. Archive decoration remains the cookie path.

## Capabilities

### New Capabilities

- `ocu-filter-auth`: authenticated system-prompt retrieval and concrete-file preview links with strict public-base startup handling.

### Modified Capabilities

None; service-token enforcement and tool callers are unchanged.

## Impact

Sibling OCU filter, tests/test_filter.py, necessary PUBLIC_BASE_URL owner/startup wiring and startup tests, directly related docs. User approved the server-side scope extension. No proxy, SPA prefix implementation (#14), WebUI recognizer (#31/#32), network deployment or Docker execution.
