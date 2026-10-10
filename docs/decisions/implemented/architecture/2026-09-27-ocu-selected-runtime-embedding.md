---
id: 2026-09-27-ocu-selected-runtime-embedding
title: Selected runtime embedding reuses canonical clients
kind: architecture
status: implemented
date: 2026-09-27
supersedes: none
references: 2026-09-27-ocu-restricted-office-embedding, 2026-09-23-ocu-preview-lifecycle, issue-89, issue-30
---

# Selected runtime embedding reuses canonical clients

## Problem

WebUI owns the sidebar view selection while OCU owns the CDP and ttyd clients. Embedding the standalone SPA introduces competing tabs and background clients; embedding a raw WebSocket URL does not render a view.

## Decision

The authenticated preview route supports framed `embed=browser` and `embed=terminal` beside the separate Files-only protocol. A mode mounts only its existing runtime client, without outputs discovery or view autoselection. Invalid/repeated modes and non-framed use fail visibly. Parent selection changes remove the prior runtime iframe rather than retaining hidden clients.

A runtime frame owns one heartbeat and non-overlapping Browser status polling. Cancellation retires pending status/connection work; canonical clients own their reconnect, delayed callbacks and connection cleanup. Removing a frame closes client transports but does not guarantee an unload-time stop-ttyd POST; server process lifetime remains with explicit terminal controls and sandbox lifecycle. No stopped sandbox is launched implicitly.

Standalone and embedded terminal dashboards share upload handling. HTTP refusal or request/body-read rejection shows localized filename/retry feedback as text and releases the selected temporary input. Response-body consumption is awaited before status classification, retaining the existing request-settlement boundary. A selection stops at its first failure without retry or rollback of earlier files; only complete success refreshes the mounted dashboard and optional standalone Files listing. A new selection clears stale feedback. Picker cancellation and an abort-on-unmount upload protocol are outside this contract.

Runtime responses carry a same-origin CSP with a fresh nonce for configuration, local script sources, narrowly required style/data/blob exceptions and no external connections or nested frames. Files-only and standalone policies remain separate. The parent sandbox stays `allow-scripts allow-same-origin allow-forms`.

Browser evidence serves captured authenticated production preview responses, not a test-owned copy of HTML or policy. Recording transports exercise genuine CDP/ttyd WebSocket clients and account for actual close handshakes and peer FIN. Owned-request cancellation is distinguished from unexpected failures by request and retiring-frame identity.

## Alternatives considered

- **Duplicate runtime clients in WebUI** — splits transport, reconnect and authorization behavior.
- **Standalone SPA in every tab** — mounts unrelated clients and can switch away from the parent selection.
- **Keep closed runtime frames hidden** — retains polling, connections and ambiguous ownership.
- **Hand-copy CSP into the browser fixture** — proves the fixture policy, not the response shipped by the application.

## Consequences

Twenty paired mount/remove cycles and delayed completion checks cover client lifecycle under synthetic transports, not real sandbox interactivity. A-T05/A-T09 still require the final deployed acceptance. Source and consumer pins must advance together; no additional dependency or proxy route is required.
