## Why

#604. The B-T13 case `B-T13 listing refresh that drops the open file names the saved copy` (`e2e/ocu-office.e2e.ts`) asserts the panel notice `Selected file was removed` in `walkRemovalNotice` (`e2e/ocu-office-leave-fixtures.ts:701-740`) through `afterRelease`, right after `gate.release()` in `departHeldOfficeClose` (`:324-325`). The notice lives at most about 3 s:

- the removing refresh sets `notice` and clears the selection (`src/lib/components/chat/workspace-reconciliation.ts:427-435`), then awaits the prefs write (`:437`);
- when that run ends, `finishRun` → `schedule()` arms the next poll after `visibleDelay = 3_000` (`:39`, `:117-124`, `:521-531`), and the next `run()` sets `notice: ''` before it fetches anything (`:552-555`); the notice never comes back because the selection is already cleared (`:405`, `:432`).

The hold phase before release (arrivals poll, held-frame asserts, a full-page screenshot) plus the guard's 1 s status poll all run inside that window. On a slow runner the notice is cleared before the assertion, which then false-fails `make verify-ui-ocu` and `All checks passed`. A longer `toBeVisible` timeout cannot help.

## What Changes

- In `walkRemovalNotice`: before clicking Refresh, hold the removing refresh's prefs write, `PUT /api/v1/ocu/workspaces/<chat>/prefs` with `selected_file_id: null` in its JSON body (client `src/lib/apis/ocu/index.ts:219-220`; a same-origin page request, `page.route` precedent at `e2e/ocu-controls.e2e.ts:644`). While it is pending the reconciliation run stays `running`: `run('poll')` only sets `requested` (`workspace-reconciliation.ts:535-538`), `visibilitychange` is blocked by `!running` (`:184`), and `schedule()` is only called from `finishRun`, so the run-start `notice: ''` (`:552-555`) cannot execute.
- Uniqueness: the body alone does not identify the write, because `writePrefs` sends `{ ...serverPrefs, ...patch }` (`:248`) and after it `serverPrefs.selected_file_id` stays null for every later PUT (`ChatControls.svelte:262`, `WorkspaceArtifact.svelte:331`). What makes the held write the only one is `queueWorkspacePrefs`' per-chat serialization (`src/lib/stores/ocu.ts:34-49`): no second prefs PUT is sent while it is pending. The route handler holds only the first match and continues every later one.
- Canonicality: the hold reuses `holdOfficeCloseBeforeBroker` (`e2e/ocu-office-leave-fixtures.ts:168-201`), extended with a method and a request predicate (for example `select: (request) => boolean`), instead of a second inline gate closure. Its existing `arrivals !== 1 → continue` rule gives the first-match-only behaviour (`:183`).
- The held write is released through the helper's existing path, `route.fetch()` + `route.fulfill({ response })` (`e2e/ocu-office-leave-fixtures.ts:184-187`), the same path that gives `departHeldOfficeClose` its 202 for the four existing walks; switching the helper to `route.continue()` is out of scope. The extension defaults `method` to `'POST'` and the request predicate to "accept everything", and both checks run before `arrivals += 1`, as the method check does today (`:181-182`), so non-matching requests are never counted and the existing `expect.poll(() => gate.arrivals()).toBe(1)` (`:316`) keeps its meaning. The case asserts one held prefs arrival before release, releases only after the notice assertion passes, and reads the 2xx from the fulfilled PUT response. A `finally` releases the write if still held, unroutes and awaits the handler, so a failing assertion never leaves it pending; it is never aborted (an aborted write replaces the notice with `…; preference could not be cleared`, `:438-442`).
- Timing after release: once the write completes, `finishRun` (`:521-531`) may `poke()` immediately when `requested` or dirty is set, so the notice can disappear within milliseconds. The notice is asserted only before release; nothing after release (including `office-removal-notice-saved.png`) relies on it.
- The comment at `:715-717` describes the hold instead of the 3 s window.
- No deadlock (fixture review, from source): the guard's poll, finish, release and publish (`office-leave-guard.ts:224-249`, `:295-322`) call only `getOfficeSessionStatus`; the editor retire callback `stopEditor` (`WorkspaceArtifact.svelte:351-358`, `:734`) writes no prefs; the Refresh button is not wrapped in `guardOfficeAction` (`:338-341`, `:434`); the prefs request has no client abort signal. After `publish` clears `holding`, `retainOfficeWorkspace` (`office-leave-guard.ts:189`) returns the live store, whose `notice` is still the one set at `:433-435`.

The product-side observation in the issue (every panel notice lasts at most `visibleDelay` while the panel is visible; a real user whose Office close takes over 3 s sees the notice already cleared) is filed as its own issue, not changed here.

## Capabilities

### Modified Capabilities

- `ocu-office-workspace-ui`: new requirement "The removal-notice case does not depend on hold-phase duration".

## Impact

- The B-T13 removal-notice case passes regardless of how long the hold phase takes.
- No product code changes.

## Triage

```text
Issue type: test
Fixture level: compact
Upstream suggested level: absent (issue says S); compact: one e2e fixture function, no product code
Blast radius: one B-T13 browser case; a wrong route match holds the wrong request (hang) or none (race stays)
Selected risk packs: Concurrency / ordering (held request versus guard poll and reconciliation timer); Error handling (held request always continued)
Evidence floor: a temporary >3 s delay before gate.release() passes (then removed, stated in the PR); make verify-ui-ocu; make verify-ui-ocu-repeat SPEC=e2e/ocu-office.e2e.ts GREP="B-T13 listing refresh" REPEAT=10; make typecheck; make lint-scoped
design.md: omitted at compact level
```
