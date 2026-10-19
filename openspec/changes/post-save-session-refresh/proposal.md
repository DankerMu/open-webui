## Why

After a successful profile/variables save (`Settings/Account.svelte`) or a status save/clear (`Sidebar/UserMenu.svelte`), the follow-up `getSessionUser` refresh writes its result straight into the `user` store. `getSessionUser` resolves `null` when the fetch rejects without a response (transport failure: `err.detail` is undefined, so nothing is thrown). The store then becomes `null`, and `src/routes/(app)/+layout.svelte` treats a null user as signed out and routes to `/auth`, although the token and session are still valid (#462). #421 fixed the same class at root bootstrap and deliberately kept the shared helper contract.

## What Changes

- Add one fork helper, `refreshSessionUser(lookup, setUser)` in `src/lib/utils/session-refresh.ts`: it awaits the lookup, writes the store only when a user is returned, keeps the current user when the lookup resolves `null`/`undefined`, and lets thrown errors propagate unchanged.
- `Account.svelte` and the two `UserMenu.svelte` refreshes (status modal `onSave`, clear-status) call it. Account keeps its existing thrown-error behavior (toast, store set to `null`) and still returns `true` after a successful save.
- `getSessionUser`, root bootstrap (#421) and the 401 confirmation path are unchanged.

## Capabilities

### Modified Capabilities

- `webui-auth-bootstrap`: post-update session refreshes do not convert a transport-failure `null` into sign-out.

## Impact

`src/lib/utils/session-refresh.ts` (+ test), minimal edits in upstream `Account.svelte` and `UserMenu.svelte`, component tests, one Playwright case in `e2e/auth-bootstrap.e2e.ts`. No backend, API helper or route-guard change.

## Triage

- Issue type: bugfix
- Fixture level: expanded — authenticated session state shared across the app, and edits to upstream components.
- Upstream suggested level: absent
- Blast radius: an authenticated user bounced to `/auth` after a save; or, if wrong the other way, a genuinely invalid session kept alive.
- Selected risk packs: Auth / permissions / secrets; Concurrency / shared state / ordering; Error handling / rollback / partial outputs; Legacy compatibility
- Evidence floor: helper + component tests red before / green after (`make test-frontend` scope via `npx vitest run <files>`), Playwright Account-save case under an aborted refresh with no `/auth` redirect (`make e2e-auth-bootstrap` on a running harness), `make typecheck`, `make lint-scoped`, `make verify-ui`
