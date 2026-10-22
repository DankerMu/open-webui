## Why

#599: the account-save browser case (`e2e/auth-bootstrap.e2e.ts:436`, added in `f2c2cbd0c` for #462) has never passed on hosted CI. Run `39719541994` failed it twice, both times at `:451`:

```
waiting for getByRole('menu').getByRole('button', { name: 'Harness Admin', exact: true })
```

The locator never resolved. The upstream user menu renders the Account button (`src/lib/components/layout/Sidebar/UserMenu.svelte:121-158`) as `{$user.name}` followed by an active-user badge `<span>{usage.user_count}</span>`. The badge appears when `showActiveUsers` is set (default `true`, `:49`) and `/api/usage`, fetched when the menu opens (`:87-93`), reports at least one active user. A signed-in admin always counts as active (`backend/open_webui/models/users.py:789-796`, refreshed on every JWT request at `backend/open_webui/utils/auth.py:436`). Once the badge renders, the button's accessible name is `Harness Admin 1` and `exact: true` cannot match. `make verify-ui` fails, and so does the required check `All checks passed` on every PR (#598 and #597 are blocked).

## What Changes

- `e2e/auth-bootstrap.e2e.ts:451`: the account-save case opens Account settings from the user menu with a locator that matches the button by the user's name and ignores the badge text after it. Must preserve, checked mechanically: the committed diff to `e2e/auth-bootstrap.e2e.ts` changes only line `:451` (plus an `/api/usage` stub only if task 2.1 shows one is needed for determinism), verified with `git diff`; every other assertion of the case (`:456` Name prefilled before save, the save responses, aborted post-save lookups, kept user store, URL, token, `:488-489` tab and controls visible, `:497-507` fresh session matching the saved profile, console diagnostics) is untouched.
- No product change. `UserMenu.svelte` and the badge stay upstream behaviour.

`design.md` is omitted (compact fixture).

## Capabilities

### Modified Capabilities

- `webui-auth-bootstrap`: new requirement "Account-save browser case is independent of the active-user badge".

## Impact

- `make verify-ui` and `make e2e-auth-bootstrap` pass whether or not the badge has rendered when the menu is clicked.
- Hosted CI: the `Runtime verification` job can pass, which unblocks `All checks passed` and therefore `make pr-merge`.

## Triage

```text
Issue type: test bugfix
Fixture level: compact
Upstream suggested level: absent (issue says size S, one locator)
Blast radius: one e2e case; no product code
Selected risk packs: Test evidence (the case must still fail on the #462 regression it guards)
Evidence floor: make e2e-auth-bootstrap locally; hosted CI Runtime verification green including a rerun
```
