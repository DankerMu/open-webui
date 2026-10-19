## Context

Change surface: `src/lib/components/chat/Settings/Account.svelte` (`updateProfileHandler` refresh), `src/lib/components/layout/Sidebar/UserMenu.svelte` (`UserStatusModal` `onSave`; clear-status handler); new `src/lib/utils/session-refresh.ts`.

Consumers of the `user` store null transition: `src/routes/(app)/+layout.svelte` null-user guard → `gotoAuth`; `src/routes/auth/+page.svelte` redirect-back only when `$user` is truthy.

## Decisions

- Helper (one implementation for three call sites): `refreshSessionUser<User>(lookup: () => Promise<User | null | undefined>, setUser: (user: User) => void): Promise<User | null>`. Truthy result → `setUser(result)`; `null`/`undefined` → no store write; thrown error → propagates (no store write inside the helper).
- Distinguishing outcomes: `getSessionUser` throws `err.detail` for HTTP errors with a JSON detail (including 401 `Not authenticated`), and resolves `null` for transport/parse failures without detail. The helper keys only on that existing contract; `getSessionUser` stays unchanged (#421 boundary).
- Account: wrap in try/catch; catch keeps today's behavior (`toast.error`, `user.set(null)`). Returns `true` after a successful save regardless of the refresh outcome (unchanged).
- UserMenu: both refreshes call the helper; thrown errors propagate as they do today (no new handling).
- Not chosen: extending `getSessionUser` to expose transport failure (changes the shared contract and all callers).

Must preserve: profile/variables save result and `setVariableRows`; Account thrown-error toast + null; UserMenu success toasts; `getSessionUser` signature/behavior; root bootstrap and 401 confirmation (`auth-bootstrap.ts`); upstream diff minimal (calls only).

Governing invariant: a post-update session refresh replaces the current user only with a user returned by the server; a resolved `null` never clears an existing user.

Sibling surfaces: other `user.set(await getSessionUser(...))` call sites outside the three named flows (grep and list; report only, non-goal); root bootstrap (#421, unchanged).

## Seams and Evidence

- Unit (`src/lib/utils/session-refresh.test.ts`): user → `setUser` called once with it, returns it; `null` and `undefined` → `setUser` not called; thrown error → rejects with the same error, `setUser` not called.
- Component (jsdom). Drive the **real** `getSessionUser` with a stubbed `fetch` (precedent `src/lib/utils/auth-bootstrap.test.ts`): fetch rejecting with `TypeError` → resolves `null`; fetch returning a 401/503 with JSON `detail` → throws. Order responses so the mount-time `/auths/` call (Account `onMount`) and the post-save call are distinguished. Mock other API modules (`updateUserProfile`, `updateUserVariables`, `getUserVariables`, `updateUserStatus`, …) as needed. Test environment setup:
  - Account: preset a non-empty `profile_image_url` and do not change `name` in the save (avoids `generateInitialsImage` → `ImageData`/canvas, unavailable in jsdom).
  - UserMenu: stub `ResizeObserver` (Dropdown content uses it via `use:portal`); `vi.mock('$app/navigation')` and `vi.mock('$app/stores')` (UserMenu/UserStatusModal import them); `vi.mock('focus-trap')` with a no-op trap (Modal's trap throws in jsdom because tabbable sees no client rects).
  - Account cases: profile and variables updates succeed, post-save refresh fetch rejects (`TypeError`) → `user` store keeps the prior user, the `saveHandler` prop is called once, and the rows from the variables response are rendered (`setVariableRows` applied); post-save refresh returns a 401 with `detail` → toast and store `null` (unchanged behavior).
  - UserMenu cases: status modal save (`updateUserStatus` succeeds, then `onSave`) and clear-status with the refresh rejecting → store keeps the prior user; refresh returning a new user → store updated. AC4 on the UserMenu side is covered by the helper's propagation unit case: current behavior already never writes the store on a thrown lookup, and the helper preserves that.
  - Each new-behavior component case is red against the current components.
- E2E (`e2e/auth-bootstrap.e2e.ts`, real harness): sign in, open Settings → Account and wait for it to render, then `page.route(sessionUrl, abort)` (or the existing counting pattern near the 401-confirmation test) and click Save. Assert both save requests (`/api/v1/auths/update/profile`, variables update) returned 200, the post-save `GET /api/v1/auths/` was aborted at least once, the URL never becomes `/auth`, the user remains shown, the token is unchanged, and after `unroute` a fresh lookup returns the saved profile. Allow the expected console line via `allowAuthFailure(…, ['transport'])`; otherwise zero unexpected console errors. The UserMenu no-redirect outcome follows from the unchanged store, because the `(app)/+layout.svelte` guard reads only `$user`; the Account e2e is the end-to-end redirect proof.
- Commands: `npx vitest run src/lib/utils/session-refresh.test.ts <component test files>`, `make test-frontend`, `make typecheck`, `make lint-scoped`, `make dev-bg` + `make e2e-auth-bootstrap`, `make verify-ui`, `make dev-stop`.

Non-goals: changing `getSessionUser`, root bootstrap, backend, retry policy; other call sites. Residual risks kept as-is: (1) Account's thrown-refresh path still sets the user to `null` for any HTTP error carrying a `detail` (e.g. 503), which redirects to `/auth`; the issue requires the existing thrown handling, even though the bootstrap spec treats non-401 as non-authoritative. (2) No ownership/lease for post-save refresh results (a late result after sign-out could write a user back) — pre-existing, not addressed here.

Review focus: null keeps the user while thrown errors keep existing behavior; save result unaffected; upstream diffs limited to call sites; the e2e proves no `/auth` redirect.
