## 1. Fixture

- [x] 1.1 Minimal fixture, read-only fixture review and strict validation before implementation.

## 2. Implementation

- [x] 2.1 Red: `make verify-ui-ocu-repeat SPEC=ocu-workspace.e2e.ts REPEAT=2 GREP='A-T10 empty'` (the bare `A-T10` also matches the Office case at `:617`) on the unchanged tree fails on repetition 2 at the first `report.html` click; record the log.
- [x] 2.2 `e2e/ocu-workspace.e2e.ts` A-T10: before the first assertion, `setScenario('deleted', 'deleted')` and `setScenario('partial', 'partial')`, then `PUT /api/v1/ocu/workspaces/{chat}/prefs` with body `{}` for `context.chats.deleted` and `context.chats.partial` through `page.request` (relative URL) with header `X-Requested-With: ocu-workspace`, authenticated by the context's `token` cookie (as `scripts/verify-ui-ocu.py:263` does), each asserted HTTP 200. Nothing else in the test changes.
- [x] 2.3 Green: the red command passes 2 of 2; whole-spec `REPEAT=3` passes; `make verify-ui-ocu` passes.

## 3. Verify

- [x] 3.1 `make lint-scoped`; `make typecheck` ratchet.

## Recorded at archive

- Implemented by DankerMu/open-webui#588 (merge `5e4a9bd`, reviewed head `e50cb82`); DankerMu/open-webui#586 closed.
- Deviations: none in the change. The PR's first red description named the stale selection as the cause, but the red run proved only the row cause; a rows-only control (prefs reset removed) then failed in the `partial` chat at `:602`, so both resets are needed.
- Evidence (macOS): red 1 passed / 1 failed at `:567`; green `GREP='A-T10 empty' REPEAT=2` 2 passed; whole-spec `REPEAT=3` 15 passed; `make verify-ui-ocu` 40 passed; `make lint-scoped`, `make typecheck` 7775/7775, prettier.
- Review: one round, one seat (correctness, test evidence, spec compliance), clean; one note on the red attribution, settled by the control.
- Open: duplicate `setScenario` helpers in `e2e/ocu-fixtures.ts` and `e2e/ocu-workspace.e2e.ts`; the in-memory per-chat refresh limiter is not reset between repetitions.
