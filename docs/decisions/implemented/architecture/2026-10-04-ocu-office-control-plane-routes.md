---
id: 2026-10-04-ocu-office-control-plane-routes
title: DocumentServer source and callback routes authenticate with ticket and JWT
kind: architecture
status: implemented
date: 2026-10-04
supersedes: none
references: 2026-09-21-ocu-mcp-service-credentials, 2026-09-20-lan-topology-external-reverse-proxy, DankerMu/open-webui#133, ocu-office-editing D7
---

# DocumentServer source and callback routes authenticate with ticket and JWT

## Problem

DocumentServer must fetch the bound Office source and post callbacks on the control-plane network. Those requests cannot carry OCU's internal token: granting DocumentServer the internal token would also grant unrelated service authority, while an independent JWT plus a purpose-bound ticket limits credential use. Browser Office routes already require the internal token through the existing chat-bound guard.

## Decision

`GET /office/source/{ticket}` authenticates only a short-lived HMAC ticket derived from the internal token and bound to chat, file, version and session. A valid ticket returns the stored immutable version bytes, not the current workspace file. `POST /office/callback/{chat}/{session}` authenticates only a DocumentServer JWT verified with `OCU_OFFICE_JWT_SECRET`. A header Bearer token signs a nested `payload` object; a body `token` signs callback fields directly. A present Authorization header is authoritative and never falls back to the body.

Neither route is a gateway row. Both remain exempt from the internal-token carrier and still reject sandbox-subnet transport peers with 403 before handler work. When Office editing is not enabled they answer 404 without evaluating credentials or storage. A missing chat directory is checked without creating it and before the canonical lock: source returns 401 `invalid_ticket`, callback returns 404 `unknown_session`. Until callback processing lands, an authenticated callback answers 503 `callback_processing_unavailable` and changes no state.

This does not supersede the MCP/internal credential split. REST still uses Bearer `OCU_INTERNAL_TOKEN`; MCP still requires `X-OCU-Internal-Token` plus `MCP_API_KEY` when configured. DocumentServer JWT and source tickets are additional control-plane credentials, not substitutes for either service secret.

## Alternatives considered

- **Authenticate both routes with the internal token** — DocumentServer never holds that secret; injecting it would expand the editor's trust boundary.
- **Accept the internal token as a fallback credential** — a leaked service token would fetch any ticketed version or admit a callback.
- **Key control-plane routes by `file_id` without a chat segment** — OCU does not hold chat ownership and would need a second authorization path.
- **Acknowledge authenticated callbacks with HTTP 200 `{"error": 0}` before processing** — DocumentServer would treat admission as a completed save.

## Consequences

Source tickets appear in DocumentServer fetch URLs, so Uvicorn access logs redact the ticket segment and any `ticket` query value without disabling ordinary access logs. Callback rejection diagnostics name chat, session and reason and omit the token. Callback status handling, download, persist and publish remain later work. Gateway denial of `/ocu/office/source/…` and `/ocu/office/callback/…` remains a proxy-table change.
