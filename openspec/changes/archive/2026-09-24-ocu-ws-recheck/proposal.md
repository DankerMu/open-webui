# Proposal

## Why

Issue19 closes long-lived CDP/ttyd relays when the captured WebUI session loses authorization. Existing handshake-only internal-token checks cannot revoke an already open connection.

## What Changes

- One shared relay authorization supervisor for both existing WS paths, with captured session cookie and periodic WebUI owner checks.
- Fail closed on denied/unavailable authorization, close4401, stop forwarding and await task cleanup.
- Explicit auth endpoint configuration and deterministic clock/real loopback WS evidence; no Docker or production proxy changes.

## Capabilities

### New Capabilities

- `ocu-ws-recheck`: session-bound periodic authorization and deterministic relay shutdown.

### Modified Capabilities

None; parent gateway revocation requirement is implemented by this focused fixture.

## Impact

Expanded auth/async fixture. Minimal app.py relay integration, one shared server module if no equivalent exists, Dockerfile COPY, .env.example and existing docs, CI-discovered tests/orchestrator/test_ws_recheck.py. No WebUI auth implementation, CI file or deployment overlay edits. Task11.2 test placement follows existing CI discovery instead of uncollected root path.
