---
id: 2026-10-10-ocu-resource-grants
title: Session-bound capabilities for opaque-document workspace resources
kind: architecture
status: proposed
date: 2026-10-10
supersedes: none
references: docs/plans/2026-10-10-opaque-document-resources.md; openspec/changes/ocu-resource-grants/design.md (D1–D2); DankerMu/open-webui#295; docs/decisions/proposed/architecture/2026-09-20-ocu-path-grant-for-opaque-documents.md (withdrawn historical input)
---

# Session-bound capabilities for opaque-document workspace resources

## Problem

Generated HTML/SVG retains an opaque origin. Its relative resource requests cannot rely on the WebUI session cookie, but enabling same-origin access or broadening cookie policy would grant generated content authority over unrelated WebUI APIs. Resource possession needs a separate, bounded read authority without changing workspace ownership or login authentication.

## Decision

The WebUI resource-grant router owns issuance and verification. `GET/HEAD /api/v1/ocu/resource-grants/issue` validates a real session JWT, current verified-user role and exact saved-chat ownership before returning an empty relative302. Its Location preserves the encoded ordinary-file path and original query and carries `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. API keys cannot issue grants. `GET /api/v1/ocu/resource-grants/auth` validates the grant independently of holder cookies, Authorization or caller identity headers and returns fresh server-side identity on success. Verifier responses are empty and no-store. Both routes remain registered and refuse403 when the workspace feature is disabled.

A grant is two canonical, unpadded base64url components: UTF-8 JSON and its HMAC-SHA256 signature. The signing key is derived from the existing session secret using the fixed label `ocu-resource-grants`; the purpose is `ocu-resource-read`. The exact typed claims bind the user, one chat, issuing session jti/iat, grant issuance/expiry and optional session expiry. The token is at most4096bytes. Duplicate, unsupported, malformed or noncanonical claims confer no authority. A grant is not a session JWT and never contains the raw session, email or internal OCU credential. Legacy sessions without jti/iat require sign-in.

Authority covers GET/HEAD ordinary-file reads throughout that chat's outputs, not just files shown in a listing. It excludes archive, directory/listing, traversal, other-chat, private Office/control routes and writes. Encoded file names retain their meaning; encoded separators, dot/empty segments, controls and double-decoding hazards are refused. Files intentionally present in ordinary outputs are not excluded by a private-looking name.

Expiry is the earlier of600seconds after issuance and a present session expiry; sessions without expiry still produce bounded grants. Every resource request rechecks signature, time, scope, current user eligibility, exact ownership and the existing issuing-session revocation helper. There is no positive authorization cache. Observable infrastructure failures, including configured Redis without a usable client, revocation-store errors and surfaced authorization-storage errors, fail closed with503. Storage exceptions absorbed by the unchanged `Chats.is_chat_owner` predicate become a negative ownership result and fail closed with403 on both interfaces. Neither response grants access. The shared predicate and upstream authentication remain unchanged; the router does not duplicate the ownership query to distinguish a swallowed failure from nonownership.

Listings, messages and persisted workspace state retain canonical cookie URLs. Expiry rejects subsequent requests, not bytes already delivered. Grants do not renew automatically; reopening the canonical URL with a valid session obtains fresh authorization. Issuance performs no OCU transport.

The [withdrawn path-grant proposal](2026-09-20-ocu-path-grant-for-opaque-documents.md) is historical input only. Its header-selected mode on `/api/v1/ocu/auth` is not adopted: that endpoint stays session-only, and the issuer and verifier are separate interfaces.

## Alternatives considered

- **Select grant authentication with a caller header on the session-only OCU auth endpoint** — rejected: it mixes login and read-capability authority and permits misrouting onto non-file surfaces.
- **Sign an unbound user/chat URL or issue a WebUI session JWT** — rejected: it loses issuing-session revocation or turns resource possession into login authority.
- **Broaden cookies or permit same-origin generated documents** — rejected: it exposes unrelated WebUI state and APIs instead of limiting read authority.
- **Single-file documents or server-side bundling** — does not provide the approved unchanged-document relative-resource behavior across entry modes.
- **Single-file or single-use tickets** — rejected for this contract: relative resources require reusable whole-chat ordinary-file reads for the grant lifetime.

## Consequences

Whole-chat bearer read authority is an accepted trade-off: anyone holding the URL may read ordinary files while the issuing owner remains eligible. Browser history may retain a capability URL. Consumers must keep it out of persisted canonical links, logs, unrelated headers and referrers.

Without Redis, logout cannot revoke a grant immediately; it remains usable only until its bounded expiry, subject to current role/ownership checks. Even with Redis, the existing `invalidate_token` helper stores no per-token logout marker for sessions without exp. Such grants have the same bounded limitation unless effective per-user revocation exists. This decision does not modify upstream signout.

This record remains proposed until group6 browser acceptance. The backend authorization seam does not certify downstream delivery: group2 owns descriptor-confined file transport/HEAD, group3 the preview response base, group4 gateway routing/containment/CORS, group5 real-auth gateway smoke and pinning, and group6 browser rendering, isolation and canonical reopen evidence. No filesystem confinement, proxy activation or browser-resource success follows from route authorization tests alone.
