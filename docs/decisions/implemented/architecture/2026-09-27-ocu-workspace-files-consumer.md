---
id: 2026-09-27-ocu-workspace-files-consumer
title: Chat-owned Files selection with isolated preview surfaces
kind: architecture
status: implemented
date: 2026-09-27
supersedes: none
references: 2026-09-27-ocu-restricted-office-embedding, 2026-09-27-ocu-consumer-failures, 2026-09-27-ocu-workspace-controls
---

# Chat-owned Files selection with isolated preview surfaces

## Problem

The Files sidebar must preserve selected identity across broker pagination and asynchronous chat changes without treating unavailable data as deletion. Generated documents and the trusted Office application require different iframe capabilities.

## Decision

The authenticated feature flag gates Files mounting on a saved chat. Unsaved activation obtains that identity through the workspace-controls persistence contract. The Chat-owned reconciliation controller supplies data through the chat-keyed OCU store; the Files component owns preview surfaces and the local file-tree presentation, and delegates data commands. The shared preference queue preserves write order across component mounts. Request generations retire obsolete completions. Only complete coherent enumeration can clear missing selection; failures retain known data and expose retryable state.

Generated HTML/SVG/XML uses cookie-path iframe navigation with fixed `allow-scripts allow-forms`. User sandbox preferences cannot widen it. Office uses the existing restricted parent-selection protocol with exact source/origin/chat/file/generation checks and bounded ready/result deadlines. The parent owns download and explicit retry; it never duplicates Office rendering. Selected-file presentation is a compact metadata bar plus a remaining-height framed surface: decorative kind icon, truncated display basename with full-name tooltip, nested directory from canonical row membership, canonical formatted size, and one icon download named `Download <name>` with the original href and download attribute. Generated, Office pending/error/retry and unsupported branches render inside the framed surface; unsupported adds a secondary `Download` anchor. Frame sandbox, source, title, bindings, keyed lifecycle, message validation and deadlines stay unchanged.

Browser evidence runs actual WebUI and pinned OCU assets through the native gateway on isolated owned ports. Ordinary WebUI HTTP and WebSocket forwarding must work, including HMR and Socket.IO, rather than hiding their console errors. The harness backend allows its exact browser origin. Relative generated resources remain denied without credentials; Chromium ORB requires exact-request failure observation plus anonymous 401 and zero-upstream-arrival evidence.

## Alternatives considered

- **Message-derived artifact state** — streaming updates can rebuild workspace frames.
- **Instance-local preference queues** — unmount/remount permits obsolete writes to overtake new selection.
- **Partial listing means missing** — deletes a valid selection on later pages or failed enumeration.
- **Shared iframe policy** — either exposes generated documents to the parent origin or breaks trusted Office rendering.
- **Ignore WebSocket console errors** — hides a broken deployment transport and invalidates runtime acceptance.

## Consequences

Files remains behind the deployment flag. Browser/Terminal controls and history/event reconciliation have separate lifecycle ownership. Office content previews are not layout-fidelity editing. Selected HTML and unsupported screenshots live in `docs/evidence/issue-182/`; tree list screenshots remain in `docs/evidence/issue-181/`. Browser screenshots use viewport capture for top-level SVG because full-page capture stalls in Chromium even when the entire document fits the viewport; functional isolation assertions remain unchanged. Real container/network acceptance is separate from the native browser harness.
