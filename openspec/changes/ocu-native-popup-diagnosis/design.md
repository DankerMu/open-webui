## Context

The native popup oracle (`e2e/ocu-fixtures.ts:546-741`) observes a tab that Chromium creates for a modified click. It discovers the new target through its own flat `Target.setAutoAttach` with `waitForDebuggerOnStart: true`, enables `Runtime`, `Log` and `Network` on the attached session, resumes the target in a `finally` (`:629-635`), waits for the granted destination, verifies the grant chain and polls the document projection (`readPopupDocument`, `:465-490`) until `readyState === 'complete'` and the expected fixture event is present. The fixture event is pushed by a listener that lives in the popup only because Playwright injects the context's init script (`ocu-workspace.e2e.ts:303-309`, `ocu-resources.e2e.ts:30-38`) when it attaches to the target; the fixture SVG posts the event from an inline script that runs during parsing. Recorded Linux failures (#95 comments) all show the document complete and correct while the event list is empty, with a Playwright `page` event recorded shortly after the HTTP 200; macOS and reruns pass.

Governing invariant: a popup observation proves the document that the grant chain delivered, with its security probes, through evidence the observer controls; nothing the observer asserts may depend on another client's attach order. Sibling surfaces: the four native-observer call sites (`ocu-workspace.e2e.ts:426,470`; `ocu-resources.e2e.ts:153,179`), the two context init scripts that define `window.fixtureEvents` (`ocu-workspace.e2e.ts:303`, `ocu-resources.e2e.ts:30`), the sidebar and direct-tab polls of `window.fixtureEvents` (`ocu-workspace.e2e.ts:322-330,346-354,518-526`; those documents are Playwright pages and keep working through the same init script, which is why the red/green mutation moves the install to page level instead of removing it), `watchContextLifecycle`'s `browser.on('page')` listener (`:261`), `retireBrowserTargets` (`scripts/ocu-target-bridge.mjs:328-372`), the harness's Playwright invocation (`scripts/verify-ui-ocu.py:480-535`) and its discovery check (`:307-333`), `playwright.ocu.config.ts` and the CI artifact list (`.github/workflows/ci.yml:146-149`).

## Decision 1: each releasing client installs the collector before its own resume

Two clients can release a target paused by `waitForDebuggerOnStart`: Playwright (after it installs the context init scripts; the implementer verifies the order in `playwright-core/lib/server/chromium/crPage.js` and quotes it) and the observer (today: without installing anything). The observer gains, for the selected target only, inside the `onAttached` job after `Runtime.enable`/`Log.enable`/`Network.enable` and before the `finally`:

```ts
await attached.send('Page.enable');
await attached.send('Page.addScriptToEvaluateOnNewDocument', { source: FIXTURE_COLLECTOR_SOURCE });
trace.mark('collector.install.ack');
```

The `finally` then sends `Runtime.runIfWaitingForDebugger` (marked `resume.send`/`resume.ack`). Whichever client releases first has installed the collector first, so the document's inline script always finds the listener, under either Chromium release semantics. `Page.enable` on the observer session is harmless: `ResourceObserver.onNetwork` filters on `requestId`, and `collectPopupError`/`collectPopupNavigation` ignore `Page.*` methods other than the ones they already handle.

`FIXTURE_COLLECTOR_SOURCE` (exported from `e2e/ocu-fixtures.ts`, used by both `addInitScript` sites and the observer):

```js
if (!window.__fixtureCollector) {
	window.__fixtureCollector = true;
	window.fixtureEvents = [];
	window.addEventListener('message', (event) => {
		if (event.data?.type === 'fixture-opaque' || event.data?.type === 'fixture-svg')
			window.fixtureEvents.push({ origin: event.origin, ...event.data });
	});
}
```

The guard makes the second install (whichever client is second) a no-op: no array reset, no duplicate listener. The sidebar/direct-tab polls keep reading `window.fixtureEvents` as before.

Why not drop the observer's own `waitForDebuggerOnStart`: the pause is what guarantees the observer's `Network.enable` sees the canonical request and redirect; removing it would trade one race for another.

Why not let the SVG document create the collector itself: the document is the thing under test (opaque-origin generated content); the proof it already computes stays as the document-side evidence, and the event listener stays test-owned.

## Decision 2: red/green through the init-script dependency, not through reproduction

A standalone native Linux probe passed 100/100 in PR 100 while CI kept failing, so reproduction cannot be the gate. The gate is the dependency itself, with a mutation that keeps every Playwright page working and starves only the native popups: `browser.addInitScript(...)` at `ocu-workspace.e2e.ts:303` becomes `page.addInitScript(FIXTURE_COLLECTOR_SOURCE)`; `direct.addInitScript(FIXTURE_COLLECTOR_SOURCE)` is inserted after `direct = await browser.newPage()` (`:498`) and before the first `direct.goto`; the `beforeEach` in `ocu-resources.e2e.ts:30-38` installs on `page` instead of the context. Page-level init scripts reach that page and its iframes (the sidebar polls at `:322-330`, `:346-354` and the direct-tab poll at `:518-526` stay green) but Playwright does not propagate them to a natively created popup target. Red: the pre-change observer reads `collector: absent` for both popups. Green: the post-change observer reads `<n> events` for both popups and every A-T01 assertion passes. The mutation is restored byte-identical (`cmp`) and the unmodified `make verify-ui-ocu` passes. The native Linux repetitions (Decision 5) are attribution evidence.

## Decision 3: projection and trace

- `POPUP_DOCUMENT_EXPRESSION` adds `collector: window.fixtureEvents === undefined ? 'absent' : (window.fixtureEvents.length ? window.fixtureEvents.length + ' events' : 'empty')` and `posted: window.__fixturePosted ?? null`; the `fixtureEvents` mapping is unchanged. `readPopupDocument` keeps its 20 s deadline and 100 ms poll; the timeout error text includes `collector` and `posted` from the last projection.
- Trace writer: a module-level helper in `ocu-fixtures.ts`, `popupTrace()` returning `{ mark(kind, fields), close() }`, that calls `test.info()` itself (so `observeNativeOcuPopup`'s signature and its four call sites are unchanged) and appends JSON lines to `.run/ui-evidence/popup-trace/<titlePath joined with '-', sanitized to [A-Za-z0-9_-]>-<repeatEachIndex>-<n>.jsonl` with `t` (ISO wall clock from `Date.now()`), `kind` and sanitized fields (`sanitizedLocation` for URLs, `redactOcu` for free text, no session ids, no grant tokens); a module-level counter keyed by `test.info().testId` keeps the HTML and SVG observations of one test apart. Marks: `click.start`, `click.end`, `target.created`, `target.attached` (`waitingForDebugger`), `collector.install.ack`, `resume.send`, `resume.ack`, `context.created` (`Runtime.executionContextCreated`, with `auxData.isDefault`), `frame.navigated`, `request` (canonical), `redirect`, `response` (status), `page.event` (from `browser.on('page')`, registered before the click and removed after), `poll` (`readyState`, `collector`, `posted`), `destination`, `retired`. The `onNetwork` callback the call sites pass stays as it is; the trace listens on the same attached session.
- Fixture documents: `window.__fixturePosted = Date.now();` on the line before each `postMessage` in `page.html` and `diagram.svg` (`scripts/ocu_stub_nested.py`). The sidebar/iframe users of these documents ignore the new global.
- CI: `.run/ui-evidence/popup-trace/**` joins the `workspace-browser-failure` artifact paths in `.github/workflows/ci.yml` so a future CI recurrence retains the trace (flagged as a CI change in the PR).

## Decision 4: release-semantics experiment (attribution)

`e2e/ocu-popup-release.e2e.ts` (diagnostic only; collected only through the repeat entry point):

- Same launch flags (`playwright.ocu.config.ts`), same bridge (`openBrowserCdp`), same `link` chat, SVG link and modified click as A-T01; `ocu-fixtures.ts` exports `POPUP_DOCUMENT_EXPRESSION` and `sourceTargetContext` (today module-private) so the spec reuses them instead of copying.
- `Target.setAutoAttach { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: page }`; on `Target.attachedToTarget` with `waitingForDebugger: true` the probe enables `Runtime`, `Page` and `Network` on the session, records the timestamp, and does **not** send `Runtime.runIfWaitingForDebugger`.
- It polls the full `POPUP_DOCUMENT_EXPRESSION` on that session for up to 20 s (a paused target's initial empty document already reports `readyState === 'complete'`, so completion means the granted `path` and `#proof` are present), records whether the canonical document request was sent (`Network.requestWillBeSent`) and whether the context's `page` event fired, with timestamps.
- Cleanup: `retireBrowserTargets` (resumes paused sessions, closes the owned target).
- Outcome A (projection completes without the probe's resume): first-resume release; the pre-change observer's early resume could precede Playwright's install, which accounts for the recorded failures. Outcome B (paused until cleanup): per-session release; the early resume cannot be the mechanism, the recorded failures remain unattributed by this change, and the evidence document says so. Decision 1 lands in either case.

## Decision 5: repeat entry point and evidence

`scripts/verify-ui-ocu.py`:

- Module-level `DIAGNOSTIC_SPECS = ('ocu-popup-release.e2e.ts',)`; `repeat_selection()` reads `OCU_UI_SPEC` and `OCU_UI_REPEAT` with `os.environ.get(name)`: both `None` → `None`; either one `None` while the other is present (an empty string counts as present) → `fail('OCU_UI_SPEC and OCU_UI_REPEAT must be set together')`; spec not in `REQUIRED_SPECS + DIAGNOSTIC_SPECS` (empty string included) → `fail`; repeat not matching `^[1-9][0-9]*$` → `fail`. Called in `main()` before `run_owned_lifecycle(BrowserHarness(), log)` so misconfiguration fails before any owned service starts.
- `OCU_UI_GREP` (optional): accepted only with a valid pair (`fail` otherwise, and on an empty value); forwarded as `['--grep', value]` to both the `--list` discovery and the run; discovery fails when the selected spec contributes no test under the grep.
- With a selection, `OCU_UI_SPEC` is added to the allow-listed `browser_env` (`:494-501`; it is the only new key), `verify_test_discovery` lists only that spec (`--list e2e/<spec>`), and the Playwright command appends `e2e/<spec>` and `--repeat-each <n>`; the 600 s browser wait and the 1500 s alarm scale by `n` only on this path (`600 * n`, `max(1500, 900 + 600 * n)`), documented inline as the only timing change.
- `playwright.ocu.config.ts`: `testMatch: process.env.OCU_UI_SPEC ? [`**/${process.env.OCU_UI_SPEC}`] : '**/ocu-{workspace,resources,controls,reconciliation,drawio,tree,office}.e2e.ts'`; the default list is unchanged and the diagnostic spec is collected only when selected.
- `Makefile`: `verify-ui-ocu-repeat:` runs `OCU_UI_SPEC="$(SPEC)" OCU_UI_REPEAT="$(REPEAT)" $(if $(GREP),OCU_UI_GREP="$(GREP)",) python3 scripts/verify-ui-ocu.py` (an empty `SPEC`/`REPEAT` reaches the script as an empty string and fails there; an unset `GREP` is not exported); `test-verify-ui-ocu-repeat:` runs `uv run --no-sync pytest -q -p no:cacheprovider scripts/test_verify_ui_ocu_repeat.py`; both in `.PHONY` and in the AGENTS.md daily-commands table.
- Unit test `scripts/test_verify_ui_ocu_repeat.py`: imports the module by path and asserts `repeat_selection()` for the env combinations (none; valid pair; each alone; `''` for either; unknown spec; diagnostic spec; `0`; `abc`; `-1`; grep with the pair; grep alone; grep with one of the pair; grep `''`), monkeypatching `fail` to raise.
- Host: the user-owned Ubuntu 24.04 VPS (`nginx` with `auth_request`, `hurl`, `uv`, Node 22, Playwright chromium installed with `--with-deps`); the OCU checkout at the pinned SHA from `constraints.yaml`; `make setup` completed; no Docker.
- Playwright order check: `node_modules/playwright-core/lib/server/coreBundle.js` (1.63.0 bundles the server; there is no `crPage.js`), `FrameSession._initialize`, located by `allInitScripts()` and `Runtime.runIfWaitingForDebugger`: the init-script installs are pushed before the resume on the same session; the implementer quotes the block in the PR.
- Repetitions: macOS `REPEAT=3 GREP=A-T01` idempotence first (A-T01 reuses `context.chats.normal`/`link`; the whole spec is not idempotent because of A-T10, out of scope); on the VPS `REPEAT=5` for the experiment, `REPEAT=20 GREP=A-T01` for `ocu-workspace.e2e.ts` before and after Decision 1. One tabulated row per repetition in the evidence document.
- What the evidence can and cannot say: it can establish the ordering of the observer's resume, the collector's presence and the SVG's post time on this host, which release semantics Chromium applies there, and that the oracle no longer depends on Playwright's injection; it cannot attribute a product defect, and the pre-PR-100 `page`-event variant is only bounded by the note that no such wait remains and that the trace would record it.

## Fix-pass scope

A fix pass may touch only the files named in Impact.
