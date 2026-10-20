## Why

#579: since DankerMu/open-computer-use#157 the server answers a running sandbox whose gateway-bound publication was never assigned with `reason: gateway_publication_unassigned` on `/browser/{chat}/status` and `/terminal/{chat}/status`, but the preview SPA never reads `reason`. The browser view shows the ordinary "ask the model to open a browser" empty state, and the terminal view opens the WebSocket, which the relay closes with `1011`, retries three times with backoff, prints "session ended" and returns to the dashboard. AC3 of #442 is met at the API layer only. Paths are in the sibling `open-computer-use` checkout at `origin/main` `837af23`.

- Embedded browser (`static/preview.js:2420-2460`): `checkStatus` polls the status route every 3 s, validates `active` and `pages`, maps to `'active'`/`'inactive'`, and anything else to `'unavailable'` (alert "Browser unavailable" at `:2456`); `BrowserView` (`:1610-1672`) renders the empty state when `browserActive` is false.
- Shell browser tab (`:2524-2540`): `checkBrowserStatus` reads only `active` and `pages`; the shell renders `BrowserView` at `:2647-2653`.
- Terminal (`:1990-2021`): Phase 1 posts `start-ttyd`, which does not touch the publication lookup, so it succeeds; the status route is read only when the POST fails, and only `container_stopped` / `meta_exists` are recognized (`startError` rendering at `:2169-2210`); `ws.onclose` (`:1970-1987`) retries three times then writes `session_ended` and calls `onBack()`. A stopped sandbox on the same profile first reports `container_stopped` (the lookup only raises for a running container), and the recovery path (`handleRestart`, `:2174-2189`) goes straight to the socket after a successful restart.
- Strings live in `static/locale.js` (`en` terminal block `:164-173`, `ru` `:62-72`; `createT` interpolates `{name}` placeholders, `:225-235`).
- Harness: `tests/orchestrator/preview_embedding_browser.cjs` stubs the status routes (`:351-370`), asserts the "Browser unavailable" alert for `failure`/`malformed` (`:2076-2083`), drives terminal reconnect exhaustion (`:2128-2180`) and opens a standalone shell panel session (`:3015-3068`). It has no `container_stopped`, `meta_exists`, `terminal_fail` or `restart-container` coverage today. It runs with `node tests/orchestrator/preview_embedding_browser.cjs` from the repository root, `OCU_PREVIEW_PYTHON` naming a Python 3.12 with the server requirements and pytest, and Playwright with Chromium resolvable by Node; on this machine `NODE_PATH=<webui checkout>/node_modules` resolves Playwright 1.63.0 with chromium-1243, and the unchanged harness passed on `837af23` with that setup (baseline, `result: ok`).

## What Changes

SPA only, in `open-computer-use`: `static/preview.js`, `static/locale.js`, the harness.

- **Browser fault state.** A status payload whose `reason` is a non-empty string is a distinct `'fault'` state in the embedded poll and in the shell poll. `BrowserView` takes a `fault` prop and, when set, renders a capability-error panel (`role="alert"`, title `t('browser_fault_title')`, description `t('runtime_fault_desc', {reason})`, and `detail` as text in `.runtime-fault-detail`) instead of the empty state or the viewer. `'active'`, `'inactive'` and `'unavailable'` are unchanged; a payload without `reason` renders exactly as today; a connected viewer in the shell is never unmounted by a fault payload.
- **Terminal fault read.** Before `start-ttyd`, and again after a successful container recovery before the socket opens, the terminal view reads `/terminal/{chat}/status`; a string `reason` sets the `'__fault__'` start error with the payload kept in a ref, so no `start-ttyd` POST, no WebSocket and no reconnect loop happen. The `startError` block renders the capability error (`role="alert"`, title `t('terminal_fault_title')`, the same description and `detail`, no recover button). Payloads without `reason`, and failed status reads, fall through to the existing flow unchanged (`container_stopped`, `meta_exists`, `terminal_fail`, reconnect behaviour).
- **Strings.** `locale.js` gains `browser_fault_title`, `terminal_fault_title` and `runtime_fault_desc` in `en` and `ru`.
- **Harness cases.** `browserFixture = 'fault'`, a new `terminalFixture` (`'fault'`, `'stopped'`) and a `restart-container` stub. Cases: the embedded browser alert (reason, detail, no viewer, no `/json` request, no socket); the terminal alert with no `start-ttyd` POST, no upgrade attempt and no "session ended"; the stopped-container control (the existing "Container stopped" panel with its Restart button, no alert) followed by a recovery that ends in the fault alert without a socket; the standalone shell browser tab alert in its own session. Existing cases stay as they are; each new case restores its fixture.

## Capabilities

### Modified Capabilities

- `ocu-preview-spa`: new requirement "Runtime capability fault display".

## Impact

- `computer-use-server/static/preview.js` (embedded poll, shell poll, `BrowserView`, `TerminalView` Phase 1, `handleRestart` and `startError` rendering)
- `computer-use-server/static/locale.js`
- `tests/orchestrator/preview_embedding_browser.cjs`
- This repository: the archive only.

No server change: the status, CDP and WS responses and the lookup stay as #157 left them. No fallback binding. Request-level change: one extra status GET before each terminal start and after each recovery.

## Triage

- Issue type: enhancement (user-visible clarity for an already-reported fault), follow-up of #442
- Fixture level: standard. One SPA file plus strings and harness cases; a new UI state with explicit preserved states.
- Upstream suggested level: absent (P2, size S–M, implementation-ready)
- Blast radius: the browser and terminal views in the embedded and standalone surfaces; one extra status GET per terminal start and per recovery.
- Selected risk packs:
  - Compatibility: every existing status outcome (`active`, `inactive`, `unavailable`, reconnect exhaustion) renders and behaves as before, with the existing harness cases as the control; the stopped-container branch, which had no harness coverage, gains a control case; `meta_exists` and `terminal_fail` stay review-only (unchanged code paths after the pre-check falls through).
  - UI contract: the fault panels are `role="alert"`, carry `reason` and `detail` as text (not HTML), are distinct from the empty state and from "Browser unavailable", and offer no recover button.
  - Documentation / i18n: strings in both locales.
- Not selected:
  - Production server, auth, lookup contract, schema, dependencies, secrets: unchanged.
  - Resource limits: one additional small GET per terminal start or recovery.
- Evidence floor:
  - the new harness against the unchanged SPA aborts at the embedded browser case (alert never appears, empty state shown); the full harness green after;
  - mutant A: the shell poll ignores `reason` (embedded case green, shell case red); mutant B: both terminal status reads removed (terminal fault case red: `start-ttyd` POST observed, no alert); mutant B2: only the post-recovery read removed (fault case green, recovery case red); restore byte-identical;
  - the complete harness green with its existing controls, run from the repository root with the documented prerequisites; exact Playwright and Chromium versions, the JSON result lines and the screenshots retained;
  - `./tests/test-project-structure.sh` and the commit hooks pass; the Python suites are unaffected (no server change) and run only in the clean-clone evidence after review.
