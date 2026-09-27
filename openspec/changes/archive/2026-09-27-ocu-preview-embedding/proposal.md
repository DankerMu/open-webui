# Proposal

## Why

Issue84 is the user-approved prerequisite of issue29. The OCU SPA owns Office rendering but has no parent selection interface; WebUI must not duplicate those renderers or call every Office file corrupt.

## What Changes

Add explicit Files-only embedding to the existing preview route with a strict parent message contract, authoritative file_id resolution, generation-aware results and no runtime-control side effects. Standalone rendering stays intact.

## Capabilities

### Modified Capabilities

- `ocu-preview-spa`: restricted embedding, selection/result messages and read-only embedded lifecycle.

## Impact

OCU `computer-use-server/static/preview.js`, existing request/selection helpers, preview shell only if required, paired source/browser tests and integration documentation. WebUI runtime changes remain issue29. No proxy/auth rows, dependencies or Docker operations.

## Fixture triage

Expanded. Risk packs: trust boundary (parent source/origin and generated documents), concurrency (listing/render generations), resource lifecycle (effects/cleanup), error handling (partial listing versus missing), compatibility (standalone SPA). Required proof: actual browser SPA integration, semantic-fault qualification and relevant non-Docker regression. Real engine/image acceptance remains issue36.
