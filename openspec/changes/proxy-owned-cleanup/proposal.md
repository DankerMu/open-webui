# Proxy owned cleanup

## Why

An HTTP or transport failure aborts owned-data cleanup before later objects are attempted. The smoke run remains red, but leaves avoidable harness data behind.

## What Changes

- Attempt every run-owned chat, user ID and exact-email fallback despite individual failures.
- Report one aggregate containing operation kinds and HTTP statuses or exception classes, never identifiers, credentials or exception messages.
- Preserve lifecycle cleanup ordering and existing nonzero exit status.

## Capabilities

### Modified Capabilities

- `ocu-proxy-smoke`: add best-effort owned-data cleanup with redacted aggregate failures.

## Impact

`scripts/smoke-proxy.py`, focused backend harness tests and the existing smoke documentation. No production API or dependency change.

## Risk triage

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded because cleanup deletes shared harness data.
Blast radius: test-data ownership, diagnostic privacy and smoke exit status.
Selected risk packs: Public API / CLI / script entry; File IO / path safety / overwrite; Auth / permissions / secrets; Legacy compatibility / examples; Error handling / rollback / partial outputs; Documentation / migration notes.
Evidence floor: injected HTTP and transport failures, real loopback HTTP cleanup probe, focused pytest, make lint-scoped, make doc-gate, make decisions-verify, make smoke-proxy.
