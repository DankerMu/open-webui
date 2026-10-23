## 1. Fixture

- [ ] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-expiry-wait-wall-clock --strict --no-interactive`.

## 2. Implement

- [ ] 2.1 Test first, `e2e/ocu-wall-clock.test.ts`, injected clock and sleep (the fake `sleep` advances the fake clock by its duration, plus any scripted step):
  - (a) the clock steps back 200 ms during the first sleep: the helper re-arms once with a 200 ms sleep and resolves only once `now() > deadline`; red against the one-shot logic (record the failing run against a first implementation that mirrors today's one-shot wait);
  - (b) normal clock: exactly one sleep of `deadline - now + margin`;
  - (c) cap boundary: a back step of `capMs - 1` resolves; a back step of `capMs + 1` throws without a further sleep, message names the wall-clock regression and the deadline;
  - (d) frozen clock (`now` never advances) with `deadline - now = 100` on entry, margin 150, cap 2000: one uncounted first sleep of 250, then exactly 8 re-arm sleeps of 250 (total 2000, allowed because the bound is `<=`), then a throw with no 9th sleep; this pins that `spent` accumulates and the boundary;
  - (e) forward jump during the first sleep past `deadline + capMs`: returns after that one sleep, no error;
  - (f) deadline already past on entry: returns without sleeping.
- [ ] 2.2 `e2e/ocu-wall-clock.ts` and the `expireDocument` change; keep the `actual signed expiry crossed` assertion and the error text of the first assertion.
- [ ] 2.3 Green: `make test-frontend` (or the Vitest run covering `e2e/**/*.test.ts`), `make typecheck`, `make lint-scoped`, `make verify-ui-ocu`, `make verify-ui-ocu-repeat SPEC=ocu-resources.e2e.ts REPEAT=10`. The PR carries fresh output from this session for the last two: command, exit code and pass counts (issue AC3).

## Risk packs

Selected:

- **Concurrency / ordering:** wall clock versus timer clock, (a), (b), (e), (f).
- **Error handling:** bounded wait with a named failure, (c), (d).

Not selected:

- **Auth:** no grant or credential logic changes; `refused()` untouched.
- **Documentation:** test-only change.
- **Legacy compatibility:** callers keep the same `expireDocument` signature.
