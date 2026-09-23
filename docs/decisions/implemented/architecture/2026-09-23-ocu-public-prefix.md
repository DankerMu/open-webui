---
id: 2026-09-23-ocu-public-prefix
title: Separate OCU public prefix from WebUI-owned addresses
kind: architecture
status: implemented
date: 2026-09-23
supersedes: none
references: 'Plan 1 D15/D16; issues #14/#17/#22; 2026-09-22-filter-public-link-contract'
---

# Separate OCU public prefix from WebUI-owned addresses

## Problem

Root-absolute OCU asset and browser addresses collide with WebUI paths under a same-origin proxy. WebUI describe requests must not receive the OCU prefix.

## Decision

OCU_PUBLIC_PREFIX is empty by default or a canonical slash-led path without a trailing slash. Invalid syntax and prefixes placing the static mount in an existing guarded chat namespace fail startup. The guard's existing path classification is the authority; no copied reserved-name list or authorization bypass. The user selected rejection over changing the auth boundary. Shell OCU URLs receive the prefix exactly once; describeUrl remains the WebUI route. Static assets mount only at the configured public path. The proxy strips the prefix for chat endpoints but preserves it for that static mount.

Browser-viewer discovery and WebSockets derive their path from the module URL, keeping the same-origin protocol pairing. The shell and browser-address slice retains issue14's explicit boundary; issue17 owns remaining imports, worker/script URLs and fetch wrapper. Empty-prefix behavior remains unchanged.

## Alternatives considered

- **Prefix every address** — sends the WebUI describe request to the wrong service.
- **Expose both static mounts** — retains an obsolete address instead of a clean configurable mount.
- **Move browser addresses to issue17** — changes issue14's explicit scope unnecessarily; built-in Node VM tests can exercise the class without new dependencies.

## Consequences

A nonempty prefix is not a full-SPA deployment until issue17 completes its JavaScript cutover. Deploy overlays must wait for that prerequisite. Direct OCU static assets retain their existing public behavior; the external proxy owns session authorization for the prefixed static path.
