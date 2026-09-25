# Proposal

## Why

The browser needs a default-deny same-origin gateway to OCU, with per-chat owner checks and generated-content isolation. Native nginx permits runtime verification without the Docker execution the user deferred.

## What Changes

- Add only new OCU deploy/proxy files: reviewed route table, nginx renderer and token-free template/config source, ignore rules for rendered secrets, and operating instructions.
- Render a private nginx.conf consumed by the existing WebUI proxy-dev launcher; no launcher, production overlay, WebUI runtime or CI changes in this issue.
- Enforce session/owner auth, trusted headers, mutation-origin policy, WebSocket forwarding, prefix rules and MIME-dependent file isolation.

## Capabilities

### New Capabilities

- `ocu-reverse-proxy`: external table-driven gateway policy and fail-loud rendering. This is the proxy slice of parent ocu-access-gateway, not a new WebUI authentication mode.

### Modified Capabilities

None.

## Impact

OCU deploy/proxy is currently absent; existing untracked deploy/production-like-test and docs/decisions remain untouched. Native nginx with auth_request is required (locally installed 1.31.6); no application dependency upgrade. Issue23 owns the durable smoke-proxy matrix, stub enhancements, CI and pinned checkout. Issues24–27 own compose/network/firewall integration.

## Fixture triage

Expanded: auth/security (cookie owner check, credential confinement, status provenance), routing/compatibility (exact allowlist, encoded paths, static prefix), configuration/secrets (safe private rendering), runtime evidence (native nginx and real WebUI auth). Must preserve existing owner predicate and backend error statuses; no cookie-less grants, anonymous static bypass, generic OCU catch-all or WebUI-side proxy.
