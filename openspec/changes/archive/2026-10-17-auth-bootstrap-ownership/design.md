# Design

## Context

The root maps `getSessionUser`'s null result to logout. Its global fetch wrapper separately confirms a 401 with a current-token lookup, but does not fence completion of that recheck. Account, UserMenu, OAuth and two prompt-input callers share the helper; several do not catch rejected promises. App layout redirects an absent user to auth, and the error route redirects back when config exists.

## Goals / Non-Goals

Governing invariant: only an authoritative result still owned by the active document and requested session may mutate authentication state; a missing response establishes neither authentication nor invalidity.

Must preserve: successful user population, existing confirmed-401 sign-out effects, token-expiry behavior, backend-origin plus Authorization-header filtering, backend request credentials, and all existing helper callers' return/rejection contract.

Non-goals: automatic retries, Office behavior or #300 tests, backend/proxy auth policy, migration of other helper consumers, general root-layout listener/socket cleanup, and changes to deployment or dependencies.

## Decisions

Use the issue's narrower root-boundary alternative. A missing/failed lookup is unverified unless the existing independently confirmed current-session 401 path has cleared it. Do not infer invalidity from null, thrown detail, parse failure or a failed confirmation probe. Optional AbortSignal forwarding must not alter existing callers' error semantics.

Extract the existing authenticated-fetch classification/recheck logic into a focused auth ownership module, rather than duplicating it. Root layout is already over its size threshold: its line count must not increase. Keep expiry/sign-out policy in the root; the helper owns request lifetimes and admission checks, not a second auth store.

Capture the request token, observed user identity and document generation before awaiting. Guard user adoption, refreshed config and subsequent token-bearing side effects after awaits. Own user adoption must not accidentally invalidate its remaining authorized side effects; a replacement user/token must. A stale result never clears or adopts replacement state.

Render a root-level connection-failure state using existing translated `Server connection failed` and `Check Again` labels. With a persisted but unverified token, do not mount authenticated children or the login form. The button reloads the document; no automatic retry. An actually cleared token retains normal login routing. An already adopted newer user is not erased by an old failure.

Register owner retirement synchronously with onDestroy, not the ignored Promise returned by async onMount. Pagehide retires in-flight ownership; ordinary visibility hiding does not. Pageshow after BFCache restoration permits fresh authenticated requests without reviving retired results. If interrupted bootstrap has no verified identity, retain the manual-reload surface instead of a permanent splash. Restore window.fetch only if it is still this owner's wrapper.

Sibling surfaces: root bootstrap and post-success config/timezone/desktop updates; authenticated-fetch 401 recheck; expiry invalidation; pagehide/pageshow/onDestroy; app/auth/error route admission; shared helper consumers listed above. Audit these while keeping their unrelated behavior unchanged.

## Risks / Trade-offs

- Shared helper callers remain unable to classify transport failure; intentionally unchanged to avoid broad rejection-contract breakage.
- Browser response-cookie processing occurs outside JavaScript store guards. Preserve existing cookie policy; do not claim that post-await guards fence server Set-Cookie effects. Runtime replacement scenarios must inspect subsequent authenticated behavior, not only localStorage.
- Async root mount has existing unrelated cleanup debt; install working cleanup for new ownership only, without a broad listener rewrite.
- A swallowed transport error can look like logout unless route admission is tested on the actual root surface. Unit tests alone are insufficient.

## Verification / Rollback

Use a normal focused implementation plan, not a separate architecture project: browser regression first; parent observes semantic RED; implement ownership and deferred-result tests; parent runs focused GREEN and real browser matrix; document decision; review and merge. No data migration. Revert the focused source/tests/decision change to roll back.
