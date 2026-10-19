---
id: 2026-10-17-auth-bootstrap-ownership
title: Preserve unverified bootstrap credentials under session ownership
kind: bug-fix
status: implemented
date: 2026-10-17
supersedes: none
references: 'https://github.com/DankerMu/open-webui/issues/421; openspec/specs/webui-auth-bootstrap'
---

# Preserve unverified bootstrap credentials under session ownership

## Problem

A missing or unusable session response does not establish that persisted credentials are invalid. Mapping the shared session helper's null result to logout loses valid credentials after transport, abort or parsing failures. Separately, an asynchronous 401 confirmation can outlive the token, user or document that authorized it.

Source: [session-bootstrap defect](https://github.com/DankerMu/open-webui/issues/421).

## Decision

The [ownership module](../../../../src/lib/utils/auth-bootstrap.ts) owns bootstrap leases and the authenticated-fetch confirmation lifetime. The [root layout](../../../../src/routes/+layout.svelte) owns auth state, expiry/sign-out policy and route admission; there is no second auth store.

Each authenticated request and each confirmation dispatch captures the current token, observed user reference and document generation. A response may start confirmation or invalidate a session only while its ownership remains current. Bootstrap adoption requires the same ownership; its own adoption advances the expected user reference, while independent user replacement invalidates it. Refreshed config and subsequent timezone/desktop token effects remain lease-guarded after awaits. Backend-origin and Authorization-header filtering, original request credentials and confirmation credentials remain intact.

Classification stays at the root boundary. The [shared getSessionUser helper](../../../../src/lib/apis/auths/index.ts) retains its return/rejection contract and seven non-root invocations. Null, rejection, non-401 HTTP failure and malformed session JSON alone do not clear credentials or synthesize an authenticated user. Only the independently confirmed, still-current 401 path invalidates the session.

A persisted token without a verified user admits neither the login form nor authenticated route children. The root renders the existing translated `Server connection failed` and `Check Again` labels; the button reloads the document, with no automatic retry. A cleared token permits normal sign-in routing, and a newer adopted user remains intact.

Pagehide retires in-flight ownership; ordinary visibility hiding does not. Pageshow permits fresh requests without reviving retired results. Interrupted bootstrap can finish local recovery rendering while retired. Disposal prevents a pending bootstrap result from being adopted. Auth cleanup is registered synchronously with onDestroy because an async onMount return cannot register it. Cleanup removes the owned lifecycle listeners and restores fetch only if this owner's wrapper is still installed; unrelated root cleanup is outside this decision.

## Alternatives considered

- **Change the shared helper's error contract** — broadens the fix to callers that rely on its existing null/rejection behavior instead of correcting the root's invalid inference.
- **Treat any failed lookup as sign-out** — mistakes unavailable verification for authoritative invalidity and destroys otherwise usable credentials.
- **Retry automatically or retain authenticated children while unverified** — changes recovery policy or admits identity-dependent content without a verified user.
- **Add a second auth store or duplicate the fetch guard** — splits session authority and increases the root layout instead of extracting its existing request guard.

## Consequences

The [deterministic tests](../../../../src/lib/utils/auth-bootstrap.test.ts) exercise the real shared helper over controlled fetch responses, deferred replacement, confirmation, retirement and wrapper-cleanup boundaries. The [actual-root browser matrix](../../../../e2e/auth-bootstrap.e2e.ts) uses real server sessions, transport rejection, actual AbortError, non-401/parse failures, real backend 401, replacement and manual recovery. Focused commands are `make test-auth-bootstrap` and `make e2e-auth-bootstrap`.

Browser lifecycle evidence dispatches synthetic pagehide/pageshow events; it does not certify native BFCache entry or restoration. Actual document reload exercises document replacement. Delayed cases hold native fetch settlement, and subsequent header-authenticated and cookie-authenticated requests check the current server identity. JavaScript ownership guards do not fence the browser's Set-Cookie processing or change cookie policy.

The existing [shared worker-auth fixture](../../../../e2e/ocu-auth.ts) supplies isolated contexts from one real login; only token-replacement scenarios require additional signins. This keeps the matrix within the existing signin limiter without production-limit changes, sleeps or retries. OCU credential variables retain priority over the standard seed fallback. Native input events keep login credentials out of locator.fill failure logs. This spec disables automatic trace/video/screenshots and captures explicit evidence only after populated login fields are absent. The destructive 401 case removes its copied token cookie before sign-out so it cannot revoke the shared worker session.

Rollback reverts the ownership module, root integration, focused tests, shared fixture changes, Make targets and this record together. No database migration, backend/proxy auth policy or deployment configuration requires rollback.
