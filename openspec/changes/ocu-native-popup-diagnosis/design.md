## Context

The native popup oracle (`e2e/ocu-fixtures.ts:546-741`) observes a tab that Chromium creates for a modified click. It discovers the new target through its own flat `Target.setAutoAttach` with `waitForDebuggerOnStart: true`, enables `Runtime`, `Log` and `Network` on the attached session, resumes the target in a `finally` (`:629-635`), waits for the granted destination, verifies the grant chain and polls the document projection (`readPopupDocument`, `:465-490`) until `readyState === 'complete'` and the expected fixture event is present. The fixture event is pushed by a listener that lives in the popup only because Playwright injects the context's init script (`ocu-workspace.e2e.ts:303-309`) when it attaches to the target; the fixture SVG posts the event from an inline script that runs during parsing. Recorded Linux failures (#95 comments) all show the document complete and correct while the event list is empty; macOS and reruns pass.

Governing invariant: a popup observation proves the document that the grant chain delivered, with its security probes, through evidence the observer controls. Sibling surfaces: the four native-observer call sites (`ocu-workspace.e2e.ts:426,470`; `ocu-resources.e2e.ts:153,179`), the context init scripts that define `window.fixtureEvents` (`ocu-workspace.e2e.ts:303`, `ocu-resources.e2e.ts:30`), the sidebar and direct-tab polls of `window.fixtureEvents` (`ocu-workspace.e2e.ts:322-330,346-354,518-526`, unchanged: those documents are Playwright pages), `retireBrowserTargets` (`scripts/ocu-target-bridge.mjs:328-372`), and the harness's Playwright invocation (`scripts/verify-ui-ocu.py:480-535`).

## Decision 1: settle the release semantics with an experiment before touching the oracle

The hypothesis needs one fact Chromium's protocol documentation does not state: whether a target created under `waitForDebuggerOnStart` resumes on the first `Runtime.runIfWaitingForDebugger` from any attached client, or only after every client that asked to wait has resumed. `e2e/ocu-popup-release.e2e.ts` (diagnostic only) answers it on the native Linux host:

- Same launch flags (`playwright.ocu.config.ts`), same bridge (`openBrowserCdp`), same `link` chat and the same SVG link and modified click as A-T01.
- `Target.setAutoAttach { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: page }`; on `Target.attachedToTarget` with `waitingForDebugger: true` the probe enables `Runtime` and `Page` on the session, records the timestamp, and does **not** send `Runtime.runIfWaitingForDebugger`.
- It then polls `Runtime.evaluate('document.readyState')` on that session for up to 20 s and listens for the context's Playwright `page` event, recording timestamps.
- Cleanup: `retireBrowserTargets` (which resumes paused sessions and closes the owned target).
- Outcome A (document reaches `complete` without the probe's resume): first-resume release; the ordinary observer's early resume can precede Playwright's init-script injection. Outcome B (document stays paused until cleanup): per-session release; the hypothesis is dead and the fixture is revised before any oracle change.

Alternative considered: reading Chromium source for `DevToolsAgentHost` resume semantics. Rejected as the primary evidence; it may be cited alongside the experiment.

## Decision 2: the observer owns the collector (conditional on outcome A)

In the `onAttached` job, for the selected target, after `Runtime.enable`/`Log.enable`/`Network.enable` and before the `finally` resume: `await attached.send('Page.enable')` (if not already enabled) and `await attached.send('Page.addScriptToEvaluateOnNewDocument', { source: COLLECTOR_SOURCE })` where `COLLECTOR_SOURCE` is the same listener text the context init scripts install (`window.fixtureEvents = []; window.addEventListener('message', …)`), guarded so it does not reset an existing array if Playwright's copy ran first (`window.fixtureEvents ??= []` and a once-flag on the listener). The script runs in the popup's opaque origin with the document's CSP (`sandbox allow-scripts allow-forms` permits it, as it already permits Playwright's init script). The trace records the install ack timestamp before the resume send timestamp. Nothing else in the observer's control flow changes; the destination wait, grant chain, `visitPopupDocument`, `expectedPopupEvent` and retirement are as they are.

Why not simply drop the observer's own `waitForDebuggerOnStart`: the pause is what guarantees the observer's `Network.enable` sees the canonical request and redirect; removing it would trade one race for another.

Why not let the SVG document create the collector itself: the document is the thing under test (opaque-origin generated content); the proof it already computes stays as the document-side evidence, and the event listener stays test-owned.

## Decision 3: projection and trace

- `POPUP_DOCUMENT_EXPRESSION` adds `collector: window.fixtureEvents === undefined ? 'absent' : (window.fixtureEvents.length ? window.fixtureEvents.length + ' events' : 'empty')` and `posted: window.__fixturePosted ?? null`; `fixtureEvents` mapping unchanged. `readPopupDocument` keeps its 20 s deadline and 100 ms poll; the timeout error text includes `collector` and `posted` from the last projection.
- Trace writer: a small module-level helper in `ocu-fixtures.ts` (`popupTrace(name)` returning `{ mark(kind, fields), close() }`) that appends JSON lines to `.run/ui-evidence/popup-trace/<spec>-<test>-<n>.jsonl` with `t` (ISO wall clock from `Date.now()`), `kind`, and sanitized fields (`sanitizedLocation` for URLs, `redactOcu` for free text, no session ids, no grant tokens). Marks: `click.start`, `click.end`, `target.created`, `target.attached` (`waitingForDebugger`), `collector.install.ack` (if Decision 2 applies), `resume.send`, `resume.ack`, `context.created` (`Runtime.executionContextCreated`, with `auxData.isDefault`), `frame.navigated`, `request` (canonical), `redirect`, `response` (status), `page.event` (from `browser.on('page')`, registered before the click and removed after), `poll` (`readyState`, `collector`, `posted`), `destination`, `retired`. The `onNetwork` callback the call sites pass stays as it is; the trace listens on the same attached session.
- Fixture documents: `window.__fixturePosted = Date.now();` on the line before each `postMessage` in `page.html` and `diagram.svg` (`scripts/ocu_stub_nested.py`). The sidebar/iframe users of these documents ignore the new global.

## Decision 4: repeat entry point

`scripts/verify-ui-ocu.py`:

- Module-level `DIAGNOSTIC_SPECS = ('ocu-popup-release.e2e.ts',)`; `repeat_selection()` reads `OCU_UI_SPEC` and `OCU_UI_REPEAT`: both unset → `None`; one set → `fail('OCU_UI_SPEC and OCU_UI_REPEAT must be set together')`; spec not in `REQUIRED_SPECS + DIAGNOSTIC_SPECS` → `fail`; repeat not matching `^[1-9][0-9]*$` → `fail`. Called in `main()` before `run_stack()` so misconfiguration fails before any owned service starts.
- With a selection, `verify_test_discovery` lists only that spec (`--list e2e/<spec>`), and the Playwright command appends `e2e/<spec>` and `--repeat-each <n>`; the 600 s browser wait and 1500 s alarm scale by `n` for the repeat path only (`600 * n`, `max(1500, 900 + 600 * n)`), documented inline as the only timing change and only on the opt-in path.
- `Makefile`: `verify-ui-ocu-repeat:` runs `OCU_UI_SPEC="$(SPEC)" OCU_UI_REPEAT="$(REPEAT)" python3 scripts/verify-ui-ocu.py`; listed in `.PHONY` and in the AGENTS.md daily-commands table ("Repeat one UI spec against one owned stack (diagnosis)").
- Unit test `scripts/test_verify_ui_ocu_repeat.py`: imports the module by path and asserts `repeat_selection()` for the env combinations (none, pair, each alone, unknown spec, diagnostic spec, `0`, `abc`, `-1`), monkeypatching `fail` to raise.

## Decision 5: evidence and bounds

- Host: the user-owned Ubuntu 24.04 VPS (`nginx` with `auth_request`, `hurl`, `uv`, Node 22, Playwright chromium installed with `--with-deps`); the OCU checkout at the pinned SHA from `constraints.yaml`; `make setup` completed; no Docker.
- Repetitions: `REPEAT=20` for `ocu-workspace.e2e.ts` before the oracle change (the whole spec, so A-T01 runs 20 times with its full context), `REPEAT=5` for the experiment spec; the same 20 after the change if Decision 2 applies. One tabulated row per repetition in the evidence document.
- What the evidence can and cannot say: it can establish the ordering of the observer's resume, the init-script presence and the SVG's post time on this host, and whether the oracle change removes the empty-collector outcome; it cannot attribute a product defect, and the pre-PR-100 `page`-event variant is only bounded by the note that no such wait remains.

## Fix-pass scope

A fix pass may touch only the files named in Impact. The experiment outcome, not the reviewer, decides whether Decision 2 lands.
