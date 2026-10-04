# Tasks

## 1. Panel chrome

- [x] 1.1 Add compact header/count and refresh/close icons, segmented views, state blocks and runtime container. Verify a new mounted-component test file covers count with/without next page and zero files, busy refresh, active/disabled/absent views, each state text/role/action and preserved runtime sandbox. Keep existing component tests/selectors unchanged; record semantic red for a new observable behavior before implementation.
- [x] 1.2 Generate new localization keys using `npm run i18n:parse`; verify no hand-edited locale values or dependency change. Reuse existing Tailwind/icon conventions and document the presentation boundary in the owning workspace plan/decision if required.

## 2. Acceptance

- [x] 2.1 Add light/dark Files screenshots to the existing browser verification path without changing old selectors or weakening assertions. Run `make verify-ui` (includes OCU browser suite) and retain screenshots in `.run/ui-evidence/`, A-T01 pass and zero unexpected console/page errors; attach screenshots to the PR. Inspect the actual screenshots, including panel fit.
- [x] 2.3 Inspect Browser and Terminal remaining-height fit and absence of container overflow in the actual browser harness, using existing captures or browser geometry assertions. Files-only screenshots cannot prove runtime layout; no extra PR image attachment beyond the two Files themes is required.
- [x] 2.2 Run focused component tests, scoped lint/typecheck and coverage, strict OpenSpec and doc/decision gates. Require exact-head clean CI for full frontend/coverage acceptance if local discovery hits separately tracked user-owned `.run` copies; never modify/delete copies, relax discovery or claim a failing full command passed.

## Risk Coverage

- UI/public accessibility and names: 1.1 preserves region `Workspace Files`, view names, refresh/close names, action names, pressed and role semantics; sizes/icons/counts cannot pollute button names.
- Auth/isolation preservation: 1.1 protects every frame attribute and protocol; 2.1 proves A-T01 through the real browser harness.
- Async/busy state: 1.1 verifies disabled refresh and visible progress, without changing request ordering or callbacks.
- Compatibility: 1.1 and 2.1 retain every old test/browser selector, frame lifecycle and existing actions. File list/selected-file behavior is out of scope.
- Errors: 1.1 checks each state role/text/action; 2.1 retains console/page-error assertions.
- Documentation: 1.2 records only live presentation boundaries; 2.2 validates links and records.
- No filesystem, resource policy, config, dependency, API or persisted-schema change; no image/LAN operation.

The new test file avoids growing the existing 796-line suite. The existing workspace browser spec is already 794 lines: do not exceed its 800-line limit or compress unrelated code to fit. Reuse a suitable existing screenshot case or another configured workspace spec; any necessary new spec must be explicitly included and evidenced, not silently undiscovered. Browser harness and tests are verification scope, not permission to alter protected expected behavior.
