## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review and strict validation before implementation.

## 2. Oracle and trace

- [ ] 2.1 Before any edit: in `node_modules/playwright-core/lib/server/coreBundle.js` locate `FrameSession._initialize` by `allInitScripts()` and `Runtime.runIfWaitingForDebugger` and record that the init-script installs are pushed before the resume on the same session; quote the block in the PR.
- [ ] 2.2 `e2e/ocu-fixtures.ts`: export `FIXTURE_COLLECTOR_SOURCE` (self-guarding, per design.md); `e2e/ocu-workspace.e2e.ts:303-309` and `e2e/ocu-resources.e2e.ts:30-38` pass it to `addInitScript`; `POPUP_DOCUMENT_EXPRESSION` adds `collector` and `posted`; `readPopupDocument` names both in its timeout message, deadlines unchanged; `scripts/ocu_stub_nested.py` sets `window.__fixturePosted = Date.now()` before each `postMessage`.
- [ ] 2.3 Repeat entry point: `scripts/verify-ui-ocu.py` `repeat_selection()` (called before `run_owned_lifecycle`) (both unset → default; one set, empty string, unknown spec, non-positive or non-integer repeat → `fail` before any owned service starts; allowed specs are `REQUIRED_SPECS` plus `DIAGNOSTIC_SPECS`); `OCU_UI_SPEC` is added to the allow-listed `browser_env`; `verify_test_discovery` lists only the selected spec; Playwright command appends the spec and `--repeat-each`; timing bounds scale only on the opt-in path; `playwright.ocu.config.ts` derives `testMatch` from `OCU_UI_SPEC` when set; optional `OCU_UI_GREP` (valid only with the pair, non-empty, forwarded as `--grep`, no-match fails at discovery); Makefile targets `verify-ui-ocu-repeat` and `test-verify-ui-ocu-repeat`; AGENTS.md rows; unit test `scripts/test_verify_ui_ocu_repeat.py` covering the matrix (none, pair, each alone, `''`, unknown spec, diagnostic spec, `0`, `abc`, `-1`).
- [ ] 2.4 Red: apply the page-level mutation (design.md Decision 2: `page.addInitScript` at `ocu-workspace.e2e.ts:303`, `direct.addInitScript` after `:498`, `page` install in `ocu-resources.e2e.ts` `beforeEach`), run `make verify-ui-ocu-repeat SPEC=ocu-workspace.e2e.ts REPEAT=1`, record `collector: absent` from the pre-change observer for the HTML and SVG popups while the sidebar and direct-tab polls pass; restore byte-identical.
- [ ] 2.5 `observeNativeOcuPopup` (signature unchanged; `popupTrace()` calls `test.info()` itself; export `POPUP_DOCUMENT_EXPRESSION` and `sourceTargetContext`): for the selected target, `Page.enable` + `Page.addScriptToEvaluateOnNewDocument { source: FIXTURE_COLLECTOR_SOURCE }` awaited before the `finally` resume; the trace writer (`popupTrace`, design.md) with every mark listed in proposal.md, file named from `test.info().titlePath` and `repeatEachIndex`, written under `.run/ui-evidence/popup-trace/`; `.github/workflows/ci.yml` adds `.run/ui-evidence/popup-trace/**` to the `workspace-browser-failure` artifact (flag in the PR).
- [ ] 2.6 Green: apply the same mutation again, the post-change observer reports `<n> events` for both popups and all A-T01 assertions pass; restore byte-identical (`cmp`); `make verify-ui-ocu` passes on macOS.
- [ ] 2.7 macOS idempotence: `make verify-ui-ocu-repeat SPEC=ocu-workspace.e2e.ts REPEAT=3 GREP=A-T01` passes with the same chats reused; a grep that matches nothing fails at discovery.

## 3. Native Linux diagnosis (VPS, no Docker)

- [ ] 3.1 Experiment: `e2e/ocu-popup-release.e2e.ts` per design.md (never resumes from the observer session; polls the full projection; records request sent/`page` exposed/`readyState`/`proof` with timestamps; retires through `retireBrowserTargets`); `make verify-ui-ocu-repeat SPEC=ocu-popup-release.e2e.ts REPEAT=5` on the VPS; record outcome A or B verbatim.
- [ ] 3.2 `make verify-ui-ocu-repeat SPEC=ocu-workspace.e2e.ts REPEAT=20 GREP=A-T01` on the VPS with the pre-change observer (2.2 in place, 2.4 not yet) and again with the post-change observer; collect the traces; tabulate per repetition.

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
