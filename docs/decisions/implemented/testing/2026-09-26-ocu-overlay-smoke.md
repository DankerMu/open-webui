---
id: 2026-09-26-ocu-overlay-smoke
title: Causal overlay smoke with owned product terminal observation
kind: testing
status: implemented
date: 2026-09-26
supersedes: none
references: 2026-09-25-ocu-proxy-only-compose-topology, 2026-09-25-ocu-sandbox-egress-guard, 2026-09-26-ocu-sandbox-dns, issue-27
---

# Causal overlay smoke with owned product terminal observation

## Problem

A failed connection alone does not establish isolation: the listener may be dead, DNS may fail, or the timeout may occur after connection. An environment flag does not establish the terminal's actual foreground process. A successful stop response does not establish cleanup.

## Decision

The operator smoke in the OCU deployment checkout inspects all three running Compose stacks, requires only the intended proxy publication and probes the explicitly supplied former OCU entry for connection refusal. Exact live control endpoints are established before sandbox connection-phase timeouts count as isolation. An explicitly allowlisted IPv4 HTTP destination must return success without redirects. A valid deny-all deployment is unsuitable for this complete smoke and receives a named nonzero prerequisite, never a partial pass or a policy change.

Terminal evidence uses an operator-designated exclusive sandbox, strict absence checks, authenticated product start and a held ttyd WebSocket. The product pane's real process/session/foreground data must remain Bash throughout the bounded observation. A pre-start baseline distinguishes newly observable terminal-associated processes; it does not claim attribution of arbitrary detached daemons. Ambiguous starts are reconciled, existing sessions remain untouched, and cleanup success requires observed absence rather than HTTP status alone.

Native TCP, HTTP, WebSocket and PTY fixtures complement the fake engine CLI. The PTY consumer drains actual output and observes real Bash/child transitions through the production collector. Signal races count as cleanup success only when both the owned group and recorded child are observed absent; inspection errors and surviving processes remain failures. Independent semantic faults qualify the principal judges in disposable Git exports.

## Alternatives considered

- **Any failed curl proves isolation** — conflates unavailable service, DNS and post-connect timeout with policy.
- **NO_AUTOSTART alone proves plain Bash** — configuration is not runtime foreground evidence.
- **Trust stop HTTP 200** — misses surviving terminal state.
- **Create or reset an arbitrary sandbox** — risks unrelated user state; the operator supplies an exclusive fixture.

## Consequences

The smoke requires live positive controls and explicit operator inputs. Test fixtures may fail when local fixed ports are occupied; process-exit uncertainty fails loud. Development proof does not establish real Docker namespace routing, packet filtering or image behavior. Consolidated real-engine execution remains mandatory in issue36 after development, including the exact product terminal path and cleanup on the deployed image.
