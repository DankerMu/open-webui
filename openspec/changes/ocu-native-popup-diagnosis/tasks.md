## 1. Fixture

- [ ] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Diagnose (native Linux host, no Docker)

- [ ] 2.1 Harness repeat entry point: `scripts/verify-ui-ocu.py` honours `OCU_UI_SPEC` + `OCU_UI_REPEAT` (both or neither; spec must be one of `REQUIRED_SPECS` or the diagnostic spec `ocu-popup-release.e2e.ts`; repeat a positive integer; otherwise `fail` before the stack starts); when set, the Playwright command runs only that spec with `--repeat-each`, and `verify_test_discovery` checks that spec alone. Makefile target `verify-ui-ocu-repeat` (`SPEC`, `REPEAT`); AGENTS.md daily-commands row. Unit test for the validation (env combinations → fail/accept) next to the harness.
- [ ] 2.2 Trace and projection: `observeNativeOcuPopup` writes the sanitized timestamped JSONL described in proposal.md (one file per observation under `.run/ui-evidence/popup-trace/`); `POPUP_DOCUMENT_EXPRESSION` reports `collector` (`absent` | `empty` | `<n> events`) and `__fixturePosted`; `readPopupDocument`'s timeout message includes both; `scripts/ocu_stub_nested.py` sets `window.__fixturePosted = Date.now()` immediately before each `postMessage` in `page.html` and `diagram.svg`. No deadline, retry or assertion change.
- [ ] 2.3 Sharp experiment: `e2e/ocu-popup-release.e2e.ts` (diagnostic only; same launch flags, same bridge, same modified click on the `link` chat's SVG link) attaches with `waitForDebuggerOnStart: true` and never resumes from the observer session; records, with timestamps, whether the document reaches `readyState=complete` within 20 s, and whether Playwright exposes a `page` for it; cleanup resumes and retires the target as the bridge already does. Run on the VPS through the repeat entry point (`REPEAT=5`); record the outcome verbatim in the evidence document.
- [ ] 2.4 Native Linux repetitions, pre-change: `make verify-ui-ocu-repeat SPEC=ocu-workspace.e2e.ts REPEAT=20` on the VPS (Chromium and Playwright versions recorded); collect the popup traces; tabulate per repetition: outcome, collector state at the first poll, `__fixturePosted` versus the observer's resume ack versus `Runtime.executionContextCreated`, Playwright `page` event time if any.

## 3. Oracle (only if 2.3 shows first-resume release)

- [ ] 3.1 The observer installs the collector on the attached session with `Page.addScriptToEvaluateOnNewDocument` before `Runtime.runIfWaitingForDebugger`; the trace records the install ack before the resume send. Mutant: install after resume (or omitted) → under the 2.4 repetitions at least one first poll reports `absent`/`empty` (red); green: every first poll reports `<n> events`, all A-T01 assertions and the four call sites unchanged.
- [ ] 3.2 If 2.3 shows per-session release: stop, revise this fixture with the evidence, and run the fixture review again before any oracle change.

## 4. Verify

- [ ] 4.1 `make verify-ui-ocu` on macOS (default path, unchanged behaviour, screenshots and zero console errors); `make lint-scoped`; `make typecheck` ratchet; the harness unit test; `make doc-gate`; `make decisions-verify` if a decision record is added (one is expected: the oracle owns the collector; `docs/decisions/implemented/testing/`).
- [ ] 4.2 Evidence document `docs/evidence/issue-95/` with the experiment record, the repetition table, sanitized trace excerpts and the version table; #95 comment with mechanism, oracle and what remains unattributed; archive this change.

## Risk packs

Selected:

- Evidence: timestamped, sanitized, correlated captures on native Linux; the experiment settles the release semantics before the oracle changes.
- Security assertions preserved: no popup assertion, deadline, CSP, sandbox or retry change; traces redact grants and chat ids.
- Harness contract: the repeat entry point is opt-in, validated, and leaves `make verify-ui-ocu` unchanged.

Not selected:

- Product popup behaviour, proxy, CSP, sandbox, dependencies: unchanged.
- Docker-based reproduction: excluded by the issue.
