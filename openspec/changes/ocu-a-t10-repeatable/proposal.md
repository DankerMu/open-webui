## Why

#586: the A-T10 identity-transition case (`e2e/ocu-workspace.e2e.ts:534-615`) passes once per owned stack but fails when it is repeated against the same stack (`make verify-ui-ocu-repeat SPEC=ocu-workspace.e2e.ts REPEAT=3`: repetitions 2 and 3 time out at the first `report.html` click, `:567`). The case changes state it never restores:

- `setScenario('deleted', 'renamed')` and `setScenario('deleted', 'deleted_after')` (`:573`, `:580`) leave the `deleted` chat's stub row on `deleted_after`, whose listing has no `report.html` (`scripts/ocu-stub.py:189-190`); `setScenario('partial', 'partial_after')` (`:607`) leaves the `partial` chat on its post-refresh listing (`:192-193`), whose first page also lacks `report.html`.
- The UI persists the sidebar selection through `PUT /api/v1/ocu/workspaces/{chat}/prefs` (`backend/open_webui/routers/ocu_workspaces.py:270-279`; `OcuChatStates.upsert_prefs` replaces the whole prefs object, and the UI merges its patch into the last server prefs before sending, `src/lib/components/chat/workspace-reconciliation.ts:248`). The `partial` section ends with `report.html` selected, so a later run opens that chat with the preview already requested, before the test registers its `waitForGrantedFile` and clicks.

The harness provisions the rows as `{<chat id>: <scenario name>}` (`scripts/verify-ui-ocu.py:262`); the initial row of each chat is its scenario name. A-T01 repeats cleanly (`GREP=A-T01`), so this is the only known non-idempotent case in the spec; the repeat entry point (#95) is what exposes it.

Paths are in this repository at `origin/main` `bb43b98`.

## What Changes

Test only; no product, stub, harness, timeout or dependency change.

- At the start of A-T10, before its first assertion: restore the stub rows of the `deleted` and `partial` chats to their initial scenario names through the spec's existing `setScenario` (`e2e/ocu-workspace.e2e.ts:171-177`), and reset the persisted sidebar preferences of those two chats with `PUT /api/v1/ocu/workspaces/{chat}/prefs` and body `{}` through `page.request` (relative URL; `baseURL` is set in `playwright.ocu.config.ts`), with header `X-Requested-With: ocu-workspace` (the only check of `_gate(mutating=True)`, `ocu_workspaces.py:95`) and authenticated by the context's `token` cookie as the harness's own prefs request does (`scripts/verify-ui-ocu.py:263-269`), asserting HTTP 200 for each. `{}` is what `describe` returns for a chat with no stored state (`ocu_workspaces.py:153`), so the reset reproduces a fresh chat exactly.
- Resetting at the start, not in a `finally`, also covers a previous repetition that failed midway.

## Out of scope

- The duplicate `setScenario` helpers in `e2e/ocu-fixtures.ts:182-188` and `e2e/ocu-workspace.e2e.ts:171-177` (canonicality debt; reported, not merged here).
- The upstream sign-in limiter (`backend/open_webui/routers/auths.py:91`, 15 per 180 s per email): each repetition gets its own Playwright worker and signs in once, so long repeat runs of any spec are split across stacks (recorded in the #95 decision record).

## Fixture level and risk

- Level: minimal (one test body, no shared helper or harness change).
- Risk packs: harness contract (the default `make verify-ui-ocu` path keeps passing and A-T10 asserts the same states); evidence (red/green with the repeat entry point).
- Must preserve: every existing A-T10 assertion and screenshot, the order of the transitions, and the `seen.errors` / `expectedListing503` checks; a first run on a fresh stack behaves exactly as before (the reset writes the provisioned rows and stores prefs `{}`, which `describe` reports exactly as for a chat without stored state; the `:589-593` assertion still holds because `selectFile` (`workspace-reconciliation.ts:673`) sends `view`/`open`/`selected_file_id` before the `deleted_after` refresh).

## Evidence floor

- Red before the change: `make verify-ui-ocu-repeat SPEC=ocu-workspace.e2e.ts REPEAT=2 GREP='A-T10 empty'` fails on repetition 2 at the same `report.html` step.
- Green after: the same command passes 2 of 2; `make verify-ui-ocu-repeat SPEC=ocu-workspace.e2e.ts REPEAT=3` (whole spec) passes; `make verify-ui-ocu` passes (default path).
- `make lint-scoped`; `make typecheck` ratchet.
