## 1. Fixture

- [x] 1.1 Minimal fixture, read-only fixture review and strict validation before implementation.

## 2. Implementation

- [x] 2.1 Red: `make verify-ui-ocu-repeat SPEC=ocu-workspace.e2e.ts REPEAT=2 GREP='A-T10 empty'` (the bare `A-T10` also matches the Office case at `:617`) on the unchanged tree fails on repetition 2 at the first `report.html` click; record the log.
- [x] 2.2 `e2e/ocu-workspace.e2e.ts` A-T10: before the first assertion, `setScenario('deleted', 'deleted')` and `setScenario('partial', 'partial')`, then `PUT /api/v1/ocu/workspaces/{chat}/prefs` with body `{}` for `context.chats.deleted` and `context.chats.partial` through `page.request` (relative URL) with header `X-Requested-With: ocu-workspace`, authenticated by the context's `token` cookie (as `scripts/verify-ui-ocu.py:263` does), each asserted HTTP 200. Nothing else in the test changes.
- [x] 2.3 Green: the red command passes 2 of 2; whole-spec `REPEAT=3` passes; `make verify-ui-ocu` passes.

## 3. Verify

- [x] 3.1 `make lint-scoped`; `make typecheck` ratchet.
