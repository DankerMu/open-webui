## 1. Fixture

- [ ] 1.1 Expanded fixture, read-only fixture review and strict validation before implementation.

## 2. Oracle and trace

- [ ] 2.1 Before any edit: read `node_modules/playwright-core/lib/server/chromium/crPage.js` and record (file, lines) the order in which Playwright installs init scripts (`Page.addScriptToEvaluateOnNewDocument`) and resumes a new target (`Runtime.runIfWaitingForDebugger`); quote it in the PR.
- [ ] 2.2 `e2e/ocu-fixtures.ts`: export `FIXTURE_COLLECTOR_SOURCE` (self-guarding, per design.md); `e2e/ocu-workspace.e2e.ts:303-309` and `e2e/ocu-resources.e2e.ts:30-38` pass it to `addInitScript`; `POPUP_DOCUMENT_EXPRESSION` adds `collector` and `posted`; `readPopupDocument` names both in its timeout message, deadlines unchanged; `scripts/ocu_stub_nested.py` sets `window.__fixturePosted = Date.now()` before each `postMessage`.
- [ ] 2.3 Red: with both `addInitScript` calls temporarily removed, run A-T01 (`make verify-ui-ocu-repeat SPEC=ocu-workspace.e2e.ts REPEAT=1` once 2.6 exists, else the full `make verify-ui-ocu`) and record `collector: absent` from the pre-change observer for the HTML and SVG popups; restore the calls.
- [ ] 2.4 `observeNativeOcuPopup`: for the selected target, `Page.enable` + `Page.addScriptToEvaluateOnNewDocument { source: FIXTURE_COLLECTOR_SOURCE }` awaited before the `finally` resume; the trace writer (`popupTrace`, design.md) with every mark listed in proposal.md, file named from `test.info().titlePath` and `repeatEachIndex`, written under `.run/ui-evidence/popup-trace/`; `.github/workflows/ci.yml` adds `.run/ui-evidence/popup-trace/**` to the `workspace-browser-failure` artifact (flag in the PR).
- [ ] 2.5 Green: with the `addInitScript` calls removed again, the post-change observer reports `<n> events` on every run of both popups and all A-T01 assertions pass; restore the calls byte-identical; `make verify-ui-ocu` passes on macOS.
- [ ] 2.6 Repeat entry point: `scripts/verify-ui-ocu.py` `repeat_selection()` (both unset → default; one set, empty string, unknown spec, non-positive or non-integer repeat → `fail` before any owned service starts; allowed specs are `REQUIRED_SPECS` plus `DIAGNOSTIC_SPECS`); `verify_test_discovery` lists only the selected spec; Playwright command appends the spec and `--repeat-each`; timing bounds scale only on the opt-in path; `playwright.ocu.config.ts` derives `testMatch` from `OCU_UI_SPEC` when set; Makefile targets `verify-ui-ocu-repeat` and `test-verify-ui-ocu-repeat`; AGENTS.md rows; unit test `scripts/test_verify_ui_ocu_repeat.py` covering the matrix (none, pair, each alone, `''`, unknown spec, diagnostic spec, `0`, `abc`, `-1`).
- [ ] 2.7 macOS idempotence: `make verify-ui-ocu-repeat SPEC=ocu-workspace.e2e.ts REPEAT=3` passes with the same chats reused.

## 3. Native Linux diagnosis (VPS, no Docker)

- [ ] 3.1 Experiment: `e2e/ocu-popup-release.e2e.ts` per design.md (never resumes from the observer session; polls the full projection; records request sent/`page` exposed/`readyState`/`proof` with timestamps; retires through `retireBrowserTargets`); `make verify-ui-ocu-repeat SPEC=ocu-popup-release.e2e.ts REPEAT=5` on the VPS; record outcome A or B verbatim.
- [ ] 3.2 `make verify-ui-ocu-repeat SPEC=ocu-workspace.e2e.ts REPEAT=20` on the VPS with the pre-change observer (2.2 in place, 2.4 not yet) and again with the post-change observer; collect the traces; tabulate per repetition.

## 4. Verify and record

- [ ] 4.1 `make lint-scoped`; `make typecheck` ratchet; `make test-verify-ui-ocu-repeat`; `make doc-gate`; `make decisions-verify` (decision record `docs/decisions/implemented/testing/`: the popup oracle owns its collector).
- [ ] 4.2 Evidence document `docs/evidence/issue-95/` (experiment record, repetition tables, sanitized trace excerpts, version table, what remains unattributed); #95 comment; archive this change.

## Risk packs

Selected:

- Evidence: timestamped, sanitized, correlated captures on native Linux; the experiment attributes the mechanism; the mutant gate proves the oracle no longer depends on Playwright's injection.
- Security assertions preserved: no popup assertion, deadline, CSP, sandbox or retry change; traces redact grants and chat ids.
- Harness contract: the repeat entry point is opt-in, validated (empty string included), and leaves `make verify-ui-ocu` unchanged; idempotence run before the 20.
- CI change: one artifact path, flagged in the PR.

Not selected:

- Product popup behaviour, proxy, CSP, sandbox, dependencies: unchanged.
- Docker-based reproduction: excluded by the issue.
