## 1. Fixture

- [x] 1.1 Compact fixture, read-only fixture review, `openspec validate ocu-removal-notice-hold --strict --no-interactive`.

## 2. Implement

- [x] 2.1 Re-check the no-deadlock and uniqueness evidence lines in proposal.md against current `main`; note any drift.
- [x] 2.2 Red first: add a temporary 4 s wait before `gate.release()` and show the case fails on current `main` (notice cleared).
- [x] 2.3 Extend `holdOfficeCloseBeforeBroker` with `method` (default `'POST'`) and a request predicate (default accept-all), both checked before `arrivals += 1`, release path unchanged (fetch + fulfill); the existing close-hold walks stay green. In `walkRemovalNotice` hold the first `selected_file_id: null` prefs PUT, assert one held arrival before release, release after the notice assertion, read the 2xx from the fulfilled response, and in a `finally` release if held, unroute and await the handler; assert nothing about the notice after release; update the comment.
- [x] 2.4 With the temporary 4 s wait still in place, the case passes; then remove the wait.
- [x] 2.5 Green: `make verify-ui-ocu`, `make verify-ui-ocu-repeat SPEC=e2e/ocu-office.e2e.ts GREP="B-T13 listing refresh" REPEAT=10`, `make typecheck`, `make lint-scoped`.
- [x] 2.6 Orchestrator: file the notice-lifetime observation as its own issue.

## Risk packs

Selected:

- **Concurrency / ordering:** held prefs write versus guard status poll and reconciliation timer, 2.1, 2.2, 2.4.
- **Error handling:** the held write is continued on every path, 2.3.

Not selected:

- **Product behaviour:** no `src/` change; notice lifetime is a separate issue (2.6).
- **Documentation:** test-only change.
- **Other B-T13 case (`walkAutomaticSaveAs`):** asserts durable state only, not a short-lived notice; unchanged.
