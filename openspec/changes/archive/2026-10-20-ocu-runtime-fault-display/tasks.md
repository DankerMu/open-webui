## 1. Fixture

- [x] 1.1 Standard fixture, read-only fixture review and strict validation before implementation.

## 2. Implement (in open-computer-use)

- [x] 2.1 Harness: `terminalFixture`, `FAULT_DETAIL`, the stub changes (browser fault payload, terminal fault and stopped payloads, `start-ttyd` 503 under `stopped`, `restart-container` 200, expected console error for the 503), the embedded browser case, the two terminal cases and the shell browser case at the positions design.md names, each restoring its fixture, plus the `runtimeFault` summary line. Red: run the harness against the unchanged SPA and record the aborting assertion (embedded browser case: alert never appears, "Shared AI Browser" shown).
- [x] 2.2 `locale.js`: `browser_fault_title`, `terminal_fault_title`, `runtime_fault_desc` in `en` and `ru`.
- [x] 2.3 `preview.js`: `runtimeFault` helper; embedded poll `'fault'` state; shell `browserFault` state passed as `fault=${browserActive ? null : browserFault}`; `BrowserView` `fault` prop with the alert panel and `.runtime-fault-detail`; `TerminalView` `readTerminalFault`, `faultRef`, the Phase 1 read, the post-recovery read in `handleRestart`, and the `'__fault__'` rendering. Green: the complete harness from the repository root; JSON lines and screenshots retained.
- [x] 2.4 Mutants A, B and B2 per design.md; record the failing case for each; restore byte-identical (`cmp`).

## 3. Verify

- [x] 3.1 Run:
  - the complete `node tests/orchestrator/preview_embedding_browser.cjs` with `OCU_PREVIEW_PYTHON` (Python 3.12, server requirements, pytest) and Playwright/Chromium resolvable; record exact Playwright and Chromium versions;
  - `./tests/test-project-structure.sh`;
  - the commit hooks;
  - after review is clean, the two-phase clean-clone evidence (no server change; it confirms nothing else moved).

## Risk packs

Selected:

- Compatibility: every existing status outcome renders and behaves as before; existing harness cases are the control and run unchanged after the new cases restore the fixtures; the stopped-container branch gains a control case; `meta_exists` and `terminal_fail` stay review-only.
- UI contract: `role="alert"` panels with `reason` and `detail` as text; distinct from the empty state and from "Browser unavailable"; no recover button on the fault; a connected shell viewer is never unmounted by a fault payload.
- Documentation / i18n: both locales.

Not selected:

- Production server, auth, lookup contract, schema, dependencies, secrets: unchanged.
- Resource limits: one extra status GET per terminal start or recovery.

## Recorded at archive

- Implemented by DankerMu/open-computer-use#158 (merge `8c23438`, reviewed head `44ec089`; issue DankerMu/open-webui#579 closed).
- Deviations from design.md: terminal code lives in `TerminalSession` (not `TerminalView`); the detail line reuses `empty-example runtime-fault-detail`; harness request tracking also covers `start-ttyd`, `restart-container` and the terminal status read under the `status-error` fixture; new screenshots disable animations; the shell poll classifies `reason` only on `resp.ok`.
- Evidence: baseline `result: ok` on `837af23`; red on the unchanged SPA at the embedded browser case (a harness revision before the pending-request exemption; red re-established by the mutants); green on `c57c0d0` and `44ec089` (`runtimeFault: ok`, `result: ok`, listingRequests 150, implementer and orchestrator runs); mutants A, B, B2 (round 1) and C, D, E (fix pass 1: sticky shell viewer, inactive control, terminal status-error) each fail at the predicted case and were restored byte-identical; Playwright 1.63.0, chromium-1243 (153.0.8010.12), Node v22.23.2, Python 3.12.12 venv; `test-project-structure.sh` 24 passed; pre-commit, `git diff --check`, `test-no-cyrillic.sh` passed; clean-clone on `44ec089`: full 3705 passed / 6 skipped, CI form 2907 / 6 / 3 subtests, `tests/deploy` 419, all exit 0; `identity-lint` success.
- Review: round 1 two seats (seven confirmed P3 coverage/evidence items) → fix pass 1 → round 2 one seat, 7/7 closed, no findings. Review-only: `meta_exists` and `terminal_fail` branches. Non-blocking notes kept: the inactive control asserts right after "Shared AI Browser" appears, which also renders during `'loading'`, so the mutant D kill is timing-dependent; the `readTerminalFault` catch branch has no harness case (the server always returns JSON).
- Open: native Linux engine not exercised; #442's Linux row and AC2 stay open.
