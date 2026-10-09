---
id: 2026-10-09-ocu-documentserver-origin
title: DocumentServer on a session-authenticated second proxy origin
kind: architecture
status: implemented
date: 2026-10-09
supersedes: 2026-09-25-ocu-proxy-only-compose-topology (publication count only)
references: ocu-office-editing D17, issue 168, 2026-10-03-ocu-office-editor-selection
---

# DocumentServer on a session-authenticated second proxy origin

## Problem

Document content must not execute on WebUI's origin or read its localStorage credentials. The LAN deployment has no dedicated DNS setup, and publishing DocumentServer directly would bypass session authentication.

## Decision

The existing proxy publishes two ports: the WebUI/OCU gateway maps to container8082, and DocumentServer maps to container8083 through `OCU_OFFICE_PROXY_PORT`. Both exist regardless of the editing flag. DocumentServer remains on the control-plane network without a host publication.

The second listener forwards only to DocumentServer. Each request and WebSocket handshake first passes cookie-only WebUI session authentication. The cookie, Authorization and OCU token/identity headers are withheld on the DocumentServer hop. The measured [B1 selection](2026-10-03-ocu-office-editor-selection.md) establishes that the selected editor works without the WebUI cookie; it does not replace the listener's own denial and containment tests.

Host and forwarded host preserve the browser-facing port; forwarded scheme and client address come from nginx, not client forwarding headers. WebSocket read/send idle timeouts are3600seconds. The renderer requires both Office listener inputs without defaults; Compose supplies the upstream from `OCU_OFFICE_DOCSERVER_URL`. The gateway's reviewed route table, owner authentication and mutation guard remain unchanged.

This partially supersedes the one-publication clause of [proxy-only Compose topology](2026-09-25-ocu-proxy-only-compose-topology.md). Its private resolved startup, network isolation and proxy-only publication guarantees remain in force. The guard accepts exactly the two configured mappings; the smoke counts distinct ports, requiring IPv4 and allowing an IPv6 twin for each.

## Alternatives considered

- **Same-origin path prefix** — exposes WebUI origin credentials to editor-origin script.
- **Separate subdomain** — requires LAN DNS configuration this deployment does not provide.
- **Direct DocumentServer publication** — bypasses the WebUI session gate.
- **Conditional listener or service** — creates two topology policies and can leave nginx with an unresolved upstream while editing is disabled.

## Consequences

DocumentServer consumes resources even when WebUI hides editing. Cookies are not port-scoped: the listener may use the WebUI cookie for admission but must never forward it upstream. Operators must supply distinct browser origins and publish the configured ports. Native nginx and Compose-model evidence proves source behavior, not real-image rendering, deployment isolation or the later pinned WebUI harness integration.
