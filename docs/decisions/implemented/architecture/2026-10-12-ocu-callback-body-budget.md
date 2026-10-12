---
id: 2026-10-12-ocu-callback-body-budget
title: Header-first callback admission bounds body-token metadata
kind: architecture
status: implemented
date: 2026-10-12
supersedes: none
references: 2026-10-04-ocu-office-control-plane-routes, DankerMu/open-webui#252, ocu-callback-body-budget
---

# Header-first callback admission bounds body-token metadata

## Problem

DocumentServer header credentials need no request body for authentication.
Body-token compatibility requires JSON metadata, but buffering that metadata
without an admission bound exposes callback handling to unbounded accumulation
before credential verification. The
[owner-approved policy](https://github.com/DankerMu/open-webui/issues/252#issuecomment-6094900704)
sets a fixed protection boundary without changing callback processing.

## Decision

The existing `office/control_plane.py` owner in `open-computer-use` selects any
present Authorization header before body reception, streaming or body JSON
parsing. Header verification retains the nested JWT payload and raw-header
last-value semantics. Invalid, empty, whitespace and non-Bearer values return
the existing HTTP 401 `{"reason":"invalid_token"}`; none falls back to a body
credential.

Only absent-header requests enter body-token admission. The fixed budget is
1 MiB = 1,048,576 actual raw bytes, inclusive. Admission consumes chunks and
checks the new total before appending. Overflow immediately returns HTTP 413
with exactly `{"error":1,"reason":"callback_body_too_large"}`, without
appending the crossing chunk, requesting another chunk or parsing body JSON.
Rejected admission does not download, persist, publish or change Office state
or files. Rejection diagnostics name chat, session and reason, not credentials
or body content. Within-budget JSON and JWT failures retain the existing 401
envelope.

Content-Length is ignored; missing or forged lengths cannot replace actual byte
counting. This limit covers callback metadata/JWT envelopes, not document bytes
fetched separately from an authenticated callback URL. No deployment setting,
dependency, gateway or image change accompanies the bound.

The [routing and authentication decision](2026-10-04-ocu-office-control-plane-routes.md)
remains authoritative for control-plane placement, internal-token exemption,
sandbox-peer-first denial, Office-disabled behavior, source tickets and
session/key binding. Authenticated callback processing stays with its existing
owners. This record adds capacity policy and does not supersede that decision.
The canonical
[callback admission specification](../../../../openspec/specs/ocu-callback-body-budget/spec.md)
owns the additional boundary requirements.

## Alternatives considered

- **Buffer the whole body, then check its size** — permits unbounded accumulation
  before rejection and cannot protect admission.
- **Trust Content-Length or only configure a proxy limit** — misses absent or
  dishonest framing and leaves the owning ASGI boundary unprotected.
- **Remove body-token compatibility** — rejects an established credential mode
  that the approved policy preserves.
- **Make the limit configurable** — introduces deployment policy beyond the
  approved fixed protection boundary.

## Consequences

Body-token metadata above the limit is refused even if its credential is valid.
Header authentication remains independent of body size, and ordinary
DocumentServer processing and source delivery retain their existing contracts.

The transport can allocate an input chunk larger than the budget before the
application sees it. This boundary guarantees bounded application accumulation,
not bounded transport chunks, total-process memory, concurrent admission
capacity or a deployment/environment capacity certification. It does not certify
all DocumentServer deployments or document-content compatibility.

Rollback reverts the callback-admission change without a persisted-format
migration. It restores pre-budget buffering exposure as well as the preceding
admission behavior.
