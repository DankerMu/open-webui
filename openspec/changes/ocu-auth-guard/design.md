# Design

## Context

The control plane is WebUI; source and runtime tests are in sibling OCU. REST already uses the internal token as Bearer (archived `ocu-client/design.md`). MCP uses Bearer for a distinct MCP_API_KEY. FastAPI dependencies alone cannot cover the raw MCP route; HTTP middleware alone cannot cover CDP/ttyd WebSockets.

## Goals / Non-Goals

Governing invariant: no chat operation or identity interpretation occurs before internal service authorization; invalid chat identifiers never create or reuse a shared sandbox.
Must preserve: authorized route payloads, existing traversal rejection, MCP_API_KEY checks when configured, public health probes and unrelated runtime-cli behavior.
Non-goals: server tool/filter caller migration (#10/#11), proxy (#22), L3 network isolation (#24/#25), lifecycle policy (#13), deployment to LAN.
Sibling surfaces: files/archive/outputs/uploads/preview, browser/CDP, terminal/ttyd, identity endpoints, raw MCP mount/context initialization, Docker startup, existing test clients and CI smoke clients.

## Decisions

- REST and WebSocket upstream handshakes require `Authorization: Bearer <OCU_INTERNAL_TOKEN>`. MCP requires `X-OCU-Internal-Token`; its Bearer header retains MCP_API_KEY semantics. Distinct secrets must both succeed when MCP_API_KEY is configured; neither credential substitutes for the other. This avoids a cross-repo REST protocol migration or weakening MCP authentication. #10 must implement this composition.
- Use one central policy covering HTTP and WebSocket scopes before handler execution, including MCP before context or prompt construction. Route identity must not be inferred from a substring that misses encoded paths or alternate methods; enumerate actual routes and parameter sources. Reuse existing sanitization rather than duplicate traversal rules.
- Missing/blank internal token prevents startup. Validate configured subnet and origin; malformed values fail loudly. Unset subnet means no application deny range (L3 enforcement remains separate); unset origin means no cross-origin permission, never wildcard. Token is mandatory independently of those optional controls.
- Deny sandbox peers before authorization or handler work. Read the transport peer, not client-supplied forwarded headers; packaged uvicorn must not rewrite it from an untrusted header. This is defense in depth, not user identity or a substitute for L3 isolation.
- Identity endpoints require the token even without user_email. All MCP header-derived context is behind service authorization. Authenticate before rendering prompts and restore request context on completion/error; no cross-request identity or credential carryover.
- Reject empty/default and temporary:/local:/channel: IDs after canonical normalization, irrespective of SINGLE_USER_MODE. Explicit valid IDs must not be remapped to default by the MCP tool path. Authenticated identity calls without a chat ID may retain their non-chat diagnostic behavior; supplied invalid IDs are rejected.
- HTTP missing/wrong credentials return 401; sandbox peers return 403; invalid IDs return 4xx. WebSocket requests never upgrade when rejected; use HTTP denial responses when supported, otherwise a documented pre-accept close. No filesystem/container/prompt side effects precede denial.
- Production multi-worker command needs preflight before supervisor startup; a worker-only lifespan exception is insufficient. Preserve worker count and add the module to explicit Docker COPY inputs. Health remains unauthenticated except the peer deny rule.

## Risks / Trade-offs

[Caller transition] → #9 deliberately denies old production callers until #10/#11; do not deploy an intermediate epic state.
[Packaging drift] → propagate configuration through existing compose/Helm examples and CI smoke clients, without changing networks/ports or untracked overlay files. Test credentials are deterministic non-secret fixtures.
[Security scope width] → document necessary wiring and test migrations; no general cleanup or dependency changes.

## Required Evidence and Migration

Seams: real FastAPI app, mounted MCP transport, HTTP/WS handshakes, packaged multi-worker startup. Negative cases must prove no protected downstream work and have corresponding authorized positive cases. Test both distinct MCP credentials independently; cover aliases, alternate methods, normalized/encoded invalid IDs and successive contexts. Run new behavior tests against pre-change source for semantic red, then green; retain outputs outside tracked source.
Run the configured OCU non-Docker suite and structure check; CI must collect root auth tests and exercise the packaged startup/MCP path. Docker-backed checks are required before merge, locally or observed CI. Report unavailable local Docker rather than substituting mocks for image evidence.
Migration: configure token on server and upstream service clients before deploying the complete epic. Roll back the paired server/client configuration and image together; never enable an unauthenticated fallback.
