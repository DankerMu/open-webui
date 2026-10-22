## 1. Fixture

- [ ] 1.1 Compact fixture, read-only fixture review, `openspec validate webui-account-menu-locator --strict --no-interactive`.

## 2. Implement

- [ ] 2.1 Red evidence that the old locator depends on the badge. Run the case locally with the badge forced to render before the click: stub `/api/usage` in the test run only, or wait for its response, returning `user_count: 1`. Record that `getByRole('button', { name, exact: true })` times out. Keep the stub out of the committed test unless it is needed to make the case deterministic.
- [ ] 2.2 `e2e/auth-bootstrap.e2e.ts:451`: locate the Account button inside `getByRole('menu')` by the user's name without requiring an exact full accessible name. The locator must still match exactly one button, either with the name as a prefix or with `filter({ hasText: name })`. Then click it. No `.first()`/`.nth()`: Playwright strict mode must enforce that exactly one button matches. With a regex, escape `name` and anchor it with `^`.
- [ ] 2.3 Green: `make e2e-auth-bootstrap` locally in three forced states (scratch stubs, not committed unless 2.1 requires one):
  - Badge present: `/api/usage` stubbed to `user_count: 1`. Before the click, record that `getByRole('menu').getByRole('button', { name: 'Harness Admin 1', exact: true })` is visible, which proves the badge rendered. The case passes.
  - Badge absent: `/api/usage` stubbed to `user_count: 0`, so `{#if … usage?.user_count}` is false. The case passes.
  - Unstubbed: the case passes.

  Then run `make verify-ui`.

- [ ] 2.4 Guard check, after the 2.2 locator is in place: revert the #462 fix in a scratch run (the `Account.svelte` post-save refresh clearing the user). The case must fail on `'a transport-failed refresh keeps the live user store'` or on the `/auth` URL check. Record the failure line, restore the fix, and do not commit the revert.

## 3. Verify

- [ ] 3.1 Hosted CI on the PR: `Runtime verification (smoke + migrations + UI)` passes, and passes again on `gh run rerun`. `All checks passed` is green.
- [ ] 3.2 After this PR merges, rebase #598 (or rerun its checks) and record the run id with `All checks passed` green; this closes the issue's fourth acceptance criterion.

## Risk packs

Selected:

- Test evidence: the locator change must not weaken the case. Its assertions are unchanged, 2.4 shows it still catches the #462 regression, and 2.1 and 2.3 show it no longer depends on the badge.

Not selected:

- Concurrency: the root cause is the race between the click and `/api/usage`. No product concurrency changes; the race is covered by the forced badge-present and badge-absent runs in 2.3.
- Auth, schema, config, file IO, compatibility, documentation: no product code changes.
