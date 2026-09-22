---
id: 2026-09-21-ocu-mcp-service-credentials
title: Separate MCP client and internal service credentials
kind: architecture
status: implemented
date: 2026-09-21
supersedes: none
references: 2026-09-20-lan-topology-external-reverse-proxy, Plan 1 D12, DankerMu/open-webui#9
---

# Separate MCP client and internal service credentials

## Problem

REST service callers use Authorization Bearer for OCU_INTERNAL_TOKEN. MCP uses the same header for MCP_API_KEY; treating those secrets as interchangeable would grant identity-header trust to callers holding only the MCP credential.

## Decision

REST and WebSocket upstream handshakes use Authorization Bearer with OCU_INTERNAL_TOKEN. MCP requires X-OCU-Internal-Token before interpreting identity or credential headers, and additionally requires Authorization Bearer with MCP_API_KEY when that key is configured. Neither secret substitutes for the other. Both values remain server-side and are excluded from URLs, responses, logs and sandbox environments.

Open WebUI tool callers read OCU_INTERNAL_TOKEN directly from the process environment, not from Valves. Valve schemas and stored values are browser-facing APIs; an environment-defaulted Valve still permits persistence and browser disclosure. Client cache identity includes the current environment credential so rotation cannot retain a stale token.

## Alternatives considered

- **Replace MCP_API_KEY with the internal token** — removes a distinct existing authentication boundary.
- **Accept either secret** — lets an MCP credential authorize forged chat/user headers.
- **Move all internal callers to a dedicated header** — forces an unnecessary REST client migration; the separate carrier is needed only where Authorization is occupied.
- **Internal-token Valve** — makes a service trust credential browser-configurable and persistable through tool Valve APIs; process environment keeps it outside that channel.

## Consequences

MCP service clients supply both headers when MCP_API_KEY is configured. Tool/filter migration and server rollout are coordinated across the epic; intermediate server-only changes are not deployed. Tests use distinct secrets and reject each missing/wrong credential independently. This complements the external reverse-proxy topology record rather than superseding it.
