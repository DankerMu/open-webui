# Proposal

## Why

Issue16 follows merged broker15 and prefix14. The HTTP listing still bypasses broker identity and emits unprefixed URLs; describe still returns revision0 despite persisted authority.

## What Changes

- Replace the endpoint scan with broker-backed metadata, bounded pagination and conditional GET.
- Preserve files/modified for the current SPA; emit correctly encoded prefixed cookie-path URLs.
- Complete parent D11's deferred describe revision wiring using the existing read-only broker accessor.

## Capabilities

### New Capabilities

- `ocu-outputs-endpoint`: authenticated broker-backed listing and HTTP validators.

### Modified Capabilities

- `ocu-lifecycle`: describe reads persisted broker revision instead of the pre-broker zero placeholder.

## Impact

Expanded fixture. OCU app.py listing/describe error seam, minimal docker_manager.py describe revision seam, endpoint tests and existing README/changelog. No broker algorithm, auth policy, preview.js, dependencies, CI or deploy changes. Existing files envelope and modified compatibility remain; ordering becomes broker path order. Real Docker acceptance remains #36.
