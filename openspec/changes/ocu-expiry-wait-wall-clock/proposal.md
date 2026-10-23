## Why

#606. `expireDocument` in `e2e/ocu-resource-fixtures.ts:346-352` computes one delay from the wall clock (`expiry * 1000 - Date.now() + 150`), lets Node's `setTimeout` measure it on the monotonic clock, then asserts `Date.now() > expiry * 1000`. On 2026-10-22 macOS `timed` stepped the wall clock back by about 200 ms inside the A-T01 direct case's wait window, and the assertion `actual signed expiry crossed` failed once (40/41; the rerun passed 41/41 and 30/30 A-T01 repeats). `playwright.ocu.config.ts` runs with `retries: 0`, so one step fails `make verify-ui` and, on hosted CI, `All checks passed`. All three A-T01 cases (`e2e/ocu-resources.e2e.ts:86`, `:165`) use this wait. The server judges expiry on the same wall clock (`ocu_resource_grants.py:124`, `:276`), so the assertion is right; the one-shot wait is the defect.

## What Changes

- A pure helper in a new `e2e/ocu-wall-clock.ts`: `waitPastWallClock(deadlineMs, { now, sleep, marginMs, capMs })`. `now` and `sleep` are injected; production callers pass `Date.now` and a `setTimeout` promise. Contract:
  - If `now() > deadlineMs` on entry, it returns without sleeping.
  - Otherwise it sleeps `deadlineMs - now() + marginMs` once. This first sleep does not count against the cap.
  - After every sleep it reads `now()` again. If `now() > deadlineMs` it returns, including when the wall clock jumped forward past `deadlineMs + capMs`: the server judges on the same wall clock.
  - Otherwise the next sleep is `deadlineMs - now() + marginMs`. The cap is a budget for these re-arm sleeps, measured as the sum of the durations passed to `sleep`, never on the wall clock: if `spent + next <= capMs` it sleeps and adds `next` to `spent`; if `spent + next > capMs` it throws without sleeping. The error names a wall-clock regression and the deadline.
  - A backward step of `S` ms with `S >= marginMs` needs re-arm sleeps totalling `S` (the margin cancels; a smaller step needs none), so any step with `S <= capMs` is tolerated and a frozen or repeatedly stepped-back clock fails after at most `capMs` of extra sleep.
- `expireDocument` uses it with margin 150 ms and cap 2 000 ms. The `actual signed expiry crossed` assertion stays, on `Date.now()`.
- A Vitest unit test `e2e/ocu-wall-clock.test.ts` (picked up by the existing `e2e/**/*.test.ts` include, like `e2e/ocu-wire-rows.test.ts`).

## Capabilities

### Modified Capabilities

- `ocu-browser-failure-evidence`: new requirement "Expiry waits cross the server's wall-clock deadline".

## Impact

- A backward wall-clock step of at most 2 s during the wait no longer fails A-T01; the probe still runs only after `Date.now()` has passed the signed expiry.
- `refused()` (#601) and the server expiry logic are unchanged.

## Triage

```text
Issue type: test
Fixture level: compact
Upstream suggested level: absent (issue says S); compact: one test fixture plus a pure helper, no product code
Blast radius: the three A-T01 browser cases; a wrong wait either probes too early (false pass/fail) or hangs
Selected risk packs: Concurrency / ordering (clock and timer); Error handling (bounded failure message)
Evidence floor: the new unit test red before the helper exists / with the old one-shot logic, green after; make test-frontend; make verify-ui-ocu; make verify-ui-ocu-repeat SPEC=ocu-resources.e2e.ts REPEAT=10
design.md: omitted at compact level
```
