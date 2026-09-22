# Proposal

Issue type: feature
Fixture level: expanded
Upstream suggested level: expanded (agree: shared authorization entrypoint)
Blast radius: unauthorized sandbox access, forged identity, broken MCP and startup.
Selected risk packs: Public API / CLI / script entry; Config / project setup; File IO / path safety / overwrite; Auth / permissions / secrets; Concurrency / shared state / ordering; Legacy compatibility / examples; Error handling / rollback / partial outputs; Release / packaging / dependency compatibility; Documentation / migration notes.
Evidence floor: real-app HTTP/WebSocket/MCP rejection and positive cases, production startup subprocess, configured non-Docker OCU suite, structure check, CI, three-seat cross-review.

## Why

OCU trusts identity on unauthenticated routes. Issue DankerMu/open-webui#9 establishes the service authorization boundary required by the workspace gateway.

## What Changes

- **BREAKING**: require a configured internal token at startup and on chat-bound and identity requests; reject shared/default and transient chat identifiers regardless of SINGLE_USER_MODE.
- Enforce sandbox-subnet denial and restrict CORS to the configured WebUI origin.
- Preserve REST `Authorization: Bearer <OCU_INTERNAL_TOKEN>`. On MCP, require `X-OCU-Internal-Token` separately from the existing optional `Authorization: Bearer <MCP_API_KEY>` credential.
- Wire the guard atomically through HTTP, WebSocket and MCP, with packaging, existing test clients and deployment examples required to exercise that boundary.

## Capabilities

### New Capabilities

- `ocu-auth-guard`: OCU startup and request authorization, peer denial and identity trust.

### Modified Capabilities

None. The parent change `ocu-workspace-integration` remains the epic contract.

## Impact

Implementation belongs in sibling `open-computer-use`; the fixture and issue remain in this repository. Source includes `auth_guard.py`, minimal `app.py`/`mcp_tools.py`/security wiring, Docker startup packaging, test fixtures and affected documentation/configuration. No dependency upgrades. Tool/filter production callers are #10/#11; proxy is #22. Atomic security wiring may exceed 400 lines; report actual size and justification rather than splitting a partially protected server.
