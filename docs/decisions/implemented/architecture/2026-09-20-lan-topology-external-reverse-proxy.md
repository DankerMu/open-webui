---
id: 2026-09-20-lan-topology-external-reverse-proxy
title: OCU workspace access goes through an external reverse proxy with auth_request, not a proxy inside WebUI
kind: architecture
status: implemented
date: 2026-09-20
supersedes: none
references: docs/plans/2026-09-20-workspace-artifact-integration.md §1-2
---

# OCU workspace access goes through an external reverse proxy with auth_request

## Problem

Plan 1 must let the browser reach OCU's preview SPA, file downloads, CDP and ttyd WebSockets under the WebUI session, on a LAN, without a second origin or ticket exchange. The first draft put an HTTP+WebSocket proxy module inside the WebUI Python process.

## Decision

nginx/Caddy fronts both WebUI and the `/ocu/` prefix. Every `/ocu/*` request passes `auth_request` to WebUI's `GET /api/v1/ocu/auth`, which answers only `is_chat_owner` with 200/401/403 (403 mapped to 404 by the proxy) and returns identity headers the proxy copies upstream together with an internal token. WebUI adds no proxy code; the allowlist is default-deny; HTML/SVG/XML responses under `/ocu/files/*` get `Content-Security-Policy: sandbox allow-scripts allow-forms` so model-generated pages never execute on the WebUI origin, whether embedded or opened top-level.

## Alternatives considered

- **In-process WebUI proxy module** — a second WebSocket proxy to maintain in Python; the deploy overlay already mandates an internal reverse proxy, so the guarantee is available for free.
- **Separate workspace origin + one-time tickets** — right for public deployments; trimmed under the LAN trust model (trusted employees, no anonymous entry).
- **Sandbox network `internal: true`** — rejected during review: the agent must browse the web, and internal networks do not publish ports. Isolation is a separate bridge plus `DOCKER-USER` DROP rules to the control-plane subnet.

## Consequences

Authorization has exactly one predicate (`Chats.is_chat_owner`). Any new OCU endpoint must be added to the proxy allowlist explicitly. The proxy configuration becomes part of the deploy overlay (OCU repo) and of A-T08 acceptance.
