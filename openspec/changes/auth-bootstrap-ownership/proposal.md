# Proposal

## Why

Issue #421 identifies a destructive root-bootstrap path: a session lookup without an HTTP response becomes `null`, which removes a persisted token. The supplied Office reload timeline is not proof of its cause; this change establishes its own deterministic reproduction.

## What Changes

- Preserve persisted credentials on an unverified bootstrap result and show a connection-failure surface with manual reload, not a sign-in form or fabricated authenticated identity.
- Fence bootstrap commits and current-session 401 rechecks to their document generation, requested token and observed user state.
- Preserve successful bootstrap and confirmed current-session 401 invalidation. Keep the shared session helper's existing error contract.

## Capabilities

### New Capabilities

- `webui-auth-bootstrap`: root bootstrap failure classification and asynchronous session ownership.

### Modified Capabilities

None. Existing OCU auth capabilities govern the separate service boundary, not WebUI root bootstrap.

## Impact

Root layout, a focused frontend ownership module with paired tests, optional signal forwarding in the existing auth API helper, browser regression coverage and a decision record. No backend policy, dependency, schema or Office fixture changes.

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded because auth, shared entrypoint and concurrent state are affected.
Blast radius: bootstrap rendering, session persistence and authenticated-fetch invalidation.
Selected risk packs: Public API / CLI / script entry; Auth / permissions / secrets; Concurrency / shared state / ordering; Legacy compatibility / examples; Error handling / rollback / partial outputs; Documentation / migration notes.
Evidence floor: semantic browser RED, focused deterministic GREEN, real backend 401, successful bootstrap, UI screenshots and scoped checks.
