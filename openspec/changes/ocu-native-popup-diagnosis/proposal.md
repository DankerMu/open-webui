## Why

#95: the A-T01 native link-popup path intermittently fails in Linux CI. Every recurrence recorded since PR 100 (#95 comments on PR 246, 258, 279 and 284) has the same shape for the modified-click SVG: `readyState=complete`, `proof=null|blocked|blocked|blocked`, but `fixtureEvents=[]`, while the same source tree passes on rerun and on macOS. The earlier variant (Playwright `page` event never delivered) predates PR 100, which replaced the `waitForEvent('page')` oracle with a CDP target observer; no `waitForEvent('page')` site remains under `e2e/`, so that variant is historical and is bounded, not diagnosed, by this change.

The popup oracle (`e2e/ocu-fixtures.ts`, `observeNativeOcuPopup` `:546-741`, `readPopupDocument` `:465-490`) reads `window.fixtureEvents` from the popup document. That collector is not part of the document: it is installed by the test's context-level `browser.addInitScript` (`e2e/ocu-workspace.e2e.ts:303-309`, `e2e/ocu-resources.e2e.ts:30-38`), which Playwright injects into a natively created target only once it has attached to it. The fixture SVG posts its event from an inline script that runs during parsing (`scripts/ocu_stub_nested.py` `diagram.svg`: `window.parent.postMessage({type:'fixture-svg',…},'*')`, where `window.parent === window` in a top-level popup); the HTML fixture posts from a larger document after resources load. The observer attaches to the new target through its own `Target.setAutoAttach` with `waitForDebuggerOnStart: true` and resumes it in a `finally` (`ocu-fixtures.ts:629-635`) as soon as its own `Runtime`/`Log`/`Network` domains are enabled. If Chromium releases a paused target on the first `Runtime.runIfWaitingForDebugger` from any attached client, the observer's resume can precede Playwright's `Page.addScriptToEvaluateOnNewDocument` for the init script, the SVG's inline script then runs before the listener exists, and the projection reports `[]`. `readPopupDocument` evaluates `window.fixtureEvents ?? []`, so an absent collector and an empty one are indistinguishable in every capture so far. This is a hypothesis that fits all recorded failures, the SVG-only recurrence and the green reruns; it is not yet established.

Paths are in this repository at `origin/main` `3af0903`.

- `e2e/ocu-fixtures.ts:417-434` (`POPUP_DOCUMENT_EXPRESSION`), `:465-490` (`readPopupDocument`), `:546-741` (`observeNativeOcuPopup`: discovery, auto-attach, `onAttached` job with `Runtime.runIfWaitingForDebugger` in `finally`, destination wait, grant chain, `visitPopupDocument`, retirement).
- `scripts/ocu-target-bridge.mjs` (`openBrowserCdp`, `cdpDeadline`, `retireBrowserTargets` `:328-372`).
- Call sites of the native observer: `e2e/ocu-workspace.e2e.ts:426` (HTML) and `:470` (SVG); `e2e/ocu-resources.e2e.ts:153` and `:179`. The issue's "direct surfaces" line and `e2e/ocu-controls.e2e.ts:592` (a different A-T01, the cookie control) are stale.
- Fixture documents: `scripts/ocu_stub_nested.py` (`page.html` posts `fixture-opaque`, `diagram.svg` posts `fixture-svg`).
- Harness: `scripts/verify-ui-ocu.py` runs the whole `playwright.ocu.config.ts` (`workers: 1`, `retries: 0`, seven required specs, `verify_test_discovery` at `:307-333`) once per `make verify-ui-ocu`; there is no way to repeat one spec against a held stack.
- Native Linux host: a user-owned Ubuntu 24.04 VPS (`giap-vps`, x86_64, Node 22, Python 3.12, nginx 1.24 with `auth_request`, `hurl` 8.0.1, `uv`), the host used for the #442/#582 records; Docker is not used for this diagnosis.

## What Changes

Test and harness surfaces only; no product, proxy, CSP, sandbox, timeout or dependency change.

- **Diagnostic repeat entry point.** `scripts/verify-ui-ocu.py` accepts `OCU_UI_SPEC=<one of REQUIRED_SPECS>` together with `OCU_UI_REPEAT=<positive integer>` and, when both are set, runs only that spec with `--repeat-each <n>` after the same owned stack bring-up; any other combination (one without the other, an unknown spec, a non-integer) fails loud before the stack starts. A Makefile target `verify-ui-ocu-repeat` (`SPEC=… REPEAT=…`) wraps it; `make verify-ui-ocu` is unchanged and keeps the all-specs discovery check.
- **Timestamped popup trace.** `observeNativeOcuPopup` writes one sanitized JSONL record per observation under `.run/ui-evidence/popup-trace/` (wall-clock ISO timestamps; chat ids and grant tokens redacted through `redactOcu`/`sanitizedLocation`): click start/end; `Target.targetCreated`/`attachedToTarget` with `waitingForDebugger`; the observer's `Runtime.runIfWaitingForDebugger` send and ack; `Runtime.executionContextCreated`; `Page.frameNavigated`; the canonical document request, redirect and final response; the context's Playwright `page` event (if any, with its timestamp); and each `readPopupDocument` poll's `collector` state (`absent` | `empty` | `n events`) and `readyState`. The fixture documents record the time their inline script posted (`window.__fixturePosted = Date.now()` in `page.html` and `diagram.svg`), and the projection reports it.
- **Collector state in the projection.** `POPUP_DOCUMENT_EXPRESSION` reports `collector: 'absent'` when `window.fixtureEvents` is undefined; `readPopupDocument` keeps polling until the deadline either way and its timeout message names the collector state. No deadline changes.
- **Sharp experiment (first diagnostic step, before any oracle change).** A diagnostic-only spec `e2e/ocu-popup-release.e2e.ts` (not in `playwright.ocu.config.ts` `testMatch`; run through the repeat entry point only) attaches to a new target with `waitForDebuggerOnStart: true` through the bridge, performs the same modified click, and deliberately never sends `Runtime.runIfWaitingForDebugger` from the observer session. It records whether the popup document still reaches `readyState=complete` within the ordinary deadline (then Chromium releases on the first resume from any client, Playwright's, and the observer's early resume can race the init script) or stays paused until the observer resumes it in cleanup (then release is per-session and the hypothesis is dead). The outcome is recorded verbatim; the fixture does not presume it.
- **Oracle change, conditional on the experiment.** If release is first-resume: the observer installs the collector itself on the attached session with `Page.addScriptToEvaluateOnNewDocument` (the same listener as the context init script) before its `Runtime.runIfWaitingForDebugger`, and the trace records that order; the existing `expectedPopupEvent` assertions, grant chain, CSP/nosniff, console and cleanup checks stay as they are. If release is per-session, the fixture is revised with the evidence before any oracle change (fixture review again).
- **Evidence.** `docs/evidence/issue-95/2026-10-2x-native-linux-popup-trace.md` with the sanitized traces from the native Linux repetitions (before and, if applicable, after the oracle change), the experiment record and the Chromium/Playwright versions; an #95 comment with the mechanism and the oracle; the archive of this change.

## Capabilities

### Modified Capabilities

- `ocu-resource-grants`: new requirement "Deterministic native popup observation" (the e2e oracle for message-link opening).

## Impact

- `e2e/ocu-fixtures.ts`, `e2e/ocu-popup-release.e2e.ts` (new, diagnostic only), `scripts/ocu_stub_nested.py` (two timestamp lines), `scripts/verify-ui-ocu.py`, `Makefile` (one target), `AGENTS.md` (daily-commands row for the new target), `docs/evidence/issue-95/`, `scripts/test_verify_ui_ocu*.py` if a unit test file for the harness exists (the env-pair validation gets a test either way).
- Security surfaces untouched: CSP `sandbox allow-scripts allow-forms`, `nosniff`, grant chain and the cookie/storage/parent probes keep their assertions; the collector script the observer injects is the same listener the context init script installs and runs in the popup's opaque origin.

## Triage

- Issue type: diagnosis with an evidence/oracle improvement (test flake, no established product defect)
- Fixture level: standard. Test-only surfaces, one harness entry point, one Makefile target; the evidence is a native Linux repetition record.
- Upstream suggested level: absent (P2, size M, implementation-ready as a diagnosis task)
- Blast radius: the four native-observer call sites; `make verify-ui-ocu` behaviour unchanged when the new env pair is unset.
- Selected risk packs:
  - Evidence: timestamped, sanitized, correlated captures on native Linux; the experiment answers the release semantics before the oracle changes.
  - Security assertions preserved: every existing popup assertion stays; the trace redacts grants and chat ids; no timeout, retry or skip.
  - Harness contract: the repeat entry point is an explicit opt-in that fails loud on misconfiguration; discovery of all required specs stays in the default path.
- Not selected:
  - Product popup behaviour, proxy, CSP, sandbox: unchanged by decision of the issue.
  - Docker-based reproduction: excluded by the issue.
- Evidence floor:
  - experiment record on native Linux (both outcomes are valid results);
  - at least 20 repetitions of `ocu-workspace.e2e.ts` A-T01 on native Linux with the trace before the oracle change, with the failure (if it reproduces) showing `collector: absent` or `empty` at the first poll with the SVG's `__fixturePosted` earlier than the observer's resume ack, or, if it does not reproduce in 20, the traces still showing the ordering of resume ack versus init-script presence;
  - if the oracle changes: red (a temporary mutant that resumes before installing the collector, or the pre-change observer, under the same repetitions showing at least one `absent`/`empty` first poll) and green (the same repetitions with `collector: n events` on every first poll, all A-T01 assertions unchanged), plus `make verify-ui-ocu` green on macOS (unchanged default path);
  - `make lint-scoped`, `make typecheck` ratchet, the harness unit test for the env-pair validation, `make doc-gate` for the Makefile/AGENTS.md row.
