---
id: 2026-09-24-ocu-websocket-recheck
title: Session-bound WebSocket rechecks and owned cleanup
kind: architecture
status: implemented
date: 2026-09-24
supersedes: none
references: 2026-09-21-ocu-mcp-service-credentials, 2026-09-20-lan-topology-external-reverse-proxy, issue-19
---

# Session-bound WebSocket rechecks and owned cleanup

## Problem

An accepted WebSocket outlives its handshake authorization. CDP and ttyd must observe owner-access revocation without leaking credentials to sandbox services or leaving cleanup detached from route lifetime.

## Decision

One OCU supervisor captures the handshake token cookie and canonical chat ID, checks the explicit WebUI auth endpoint before backend lookup, and rechecks every 30 seconds from initial success. Requests have a 5-second deadline, do not follow redirects, and use neither environment proxies nor a cookie jar.

The callback carries Cookie, X-Chat-Id and X-OCU-Internal-Token, not Authorization: WebUI resolves a Bearer credential before its session cookie. The internal header does not independently authenticate this WebUI endpoint. This callback direction is distinct from the gateway-to-OCU credentials governed by the service-credentials record.

A failed recheck stops forwarding and closes the frontend with 4401 before bounded backend cleanup. The route owns and awaits relay tasks and resource cleanup. Cancellation during one cleanup step is recorded while remaining owned closes are attempted; cancellation propagates after cleanup. Each close has a 5-second bound. Normal backend EOF closes the frontend with 1000.

## Alternatives considered

- **Handshake-only authorization** — cannot observe subsequent ownership or account changes.
- **Internal Bearer token on the callback** — overrides the user cookie in WebUI authentication.
- **Detached cleanup task** — route completion cannot establish that owned cleanup has terminated.
- **Synchronous Docker lookup on the event loop** — blocks authorization timers for unrelated connections. Lookup runs off-loop with a bounded asynchronous wait.

## Consequences

An underlying blocked lookup thread cannot be forcibly cancelled. Missing callback configuration denies WebSockets before backend access; malformed nonempty configuration fails startup. Deployment must supply endpoint reachability. Logout without server-side revocation state is not an immediate invalidation guarantee. Docker topology and integrated acceptance remain separate deployment responsibilities.
