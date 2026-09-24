# Proposal

## Why

Issue17 completes the SPA half of merged prefix14, lifecycle13 and outputs16. Root-absolute imports/requests, mtime refresh and runtime-cli badge requests cannot satisfy the same-origin proxy and broker contracts.

## What Changes

- Relative imports and module-relative script/worker assets; one explicit-provenance request wrapper and prefixed terminal WebSocket.
- Broker revision refresh with revision-consistent pagination and visible more control; no older/partial response replaces current state.
- Describe-sourced badge, shared launch alias, wrapper-managed heartbeat.
- Visible Office content-preview label and uncomputed XLSX formulas; real browser refresh screenshots without Docker.

## Capabilities

### New Capabilities

- `ocu-preview-spa`: prefix-safe SPA requests, paginated revision refresh and Office content presentation.

### Modified Capabilities

None; parent outputs-reconciliation defines the intended migration, while this focused capability supplies its executable SPA acceptance.

## Impact

Expanded fixture: static/preview.js, browser-viewer.js, locale.js, one shared request module if absent, minimal app.py heartbeat emission removal, existing prefix/JS tests, host-only browser evidence fixture. No WebUI sidebar, auth policy, dependencies, vendored library edits or Docker acceptance. Existing terminal/browser behavior and opaque HTML isolation remain.
