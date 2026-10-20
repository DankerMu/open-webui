## Context

Paths are in the sibling `open-computer-use` checkout at `origin/main` `837af23`.

- **Embedded runtime page** (`static/preview.js`): `useEffect` at `:2420-2449` with `checkStatus`; `setBrowserStatus` values `'loading' | 'active' | 'inactive' | 'unavailable'`; render at `:2451-2460` (`role="status"` loading line, `role="alert"` "Browser unavailable", then `BrowserView` with `browserActive=${browserStatus === 'active'}`).
- **Shell**: `const [browserActive, setBrowserActive] = useState(false)` at `:2467`; `checkBrowserStatus` at `:2524-2540` (sticky: keeps `browserActive` true while the viewer is connected, `:2529-2531`); `BrowserView` rendered at `:2647-2653` with `onBrowserViewerRef`. The shell polling effect runs `poll()` once on mount and then on an interval that `__freezePollingClock` stops in the harness.
- **`BrowserView({ chatId, browserActive, onBrowserViewerRef })`** at `:1610-1672`: the viewer effect keys on `browserActive`; `if (!browserActive)` returns the empty state (`.browser-panel > .empty-state` with `browser_title`, `browser_desc`, `browser_example`).
- **`TerminalView`**: `startError` state at `:1876`; Phase 1 effect at `:1990-2021` (POST `start-ttyd`, on `!resp.ok` reads the status route and maps `container_stopped` / `meta_exists` / `terminal_fail`); `ws.onclose` at `:1970-1987`; `startError` rendering at `:2169-2210` (`isStopped`, `isMetaExists`, `canRecover`, `handleRestart` at `:2174-2189` calls `recoverStoppedContainer` and on `recovered.ok` does `setStartError(null)`, `setReady(false)`, a pause, `setReady(true)`). `recoverStoppedContainer` (`static/ocu-request.js:111-129`) POSTs `restart-container` then `start-ttyd`; the lookup only raises for a running container (`docker_manager.py:1041-1042`), so a stopped sandbox on the #442 profile reports `container_stopped` first and the fault only after recovery.
- **Strings** (`static/locale.js`): `TRANSLATIONS.ru` terminal block `:62-72`, `browser_title` `:97`; `TRANSLATIONS.en` terminal block `:164-173`, `browser_title` `:198`; `createT` interpolation `:225-235`. `tests/test-no-cyrillic.sh` skips `locale.js`.
- **Harness** (`tests/orchestrator/preview_embedding_browser.cjs`): `browserFixture` `:149`; status stubs `:351-370` (browser `held` / `failure` / `malformed` / `active` / else inactive; `start-ttyd` always 200 `{"already_running":true}` at `:366`; terminal status always `{active: false}` at `:369`; no `restart-container` stub, unknown paths fall through); `respond()`; `requests` rows `{method, path, header, status}`; `activeSockets`, `upgradeAttempts` (`:146-148`); console-error classification at `:868-879` (`expectedRuntimeFailures` for the browser `failure` 503); `frame()` / `retireFrame()`; unavailable loop `:2076-2083`; terminal socket scenarios `:2128-2180`; `openStandalone('/ocu')` (calls `__freezePollingClock` itself, `:2289`) and `closeStandalone`; the panel session `:3015-3068` and `compatibilityResults` at `:3070`; `main().catch` aborts the run at the first failed assertion (`:4997`). The harness writes screenshots to a temp directory and prints JSON result lines.

## Decisions

- **Fault detection helper.** One function near the status consumers:

  ```js
  const runtimeFault = (status) =>
  	status && typeof status.reason === 'string' && status.reason
  		? { reason: status.reason, detail: typeof status.detail === 'string' ? status.detail : '' }
  		: null;
  ```

- **Embedded browser.** In `checkStatus`, after the existing validation (`active` boolean, `pages` array): `const fault = runtimeFault(status); if (!retired) { setBrowserFault(fault); setBrowserStatus(fault ? 'fault' : status.active ? 'active' : 'inactive'); }`; the catch path keeps `'unavailable'` and clears the fault. Render: the "Browser unavailable" alert stays for `'unavailable'` only; `BrowserView` receives `browserActive=${browserStatus === 'active'}` and `fault=${browserStatus === 'fault' ? browserFault : null}`.
- **Shell browser tab.** `const [browserFault, setBrowserFault] = useState(null)`; `checkBrowserStatus` sets it from `runtimeFault(data)` on every poll (null when absent) and keeps its sticky `setBrowserActive` logic; the shell passes `fault=${browserActive ? null : browserFault}` so a connected viewer is never unmounted by a fault payload (the sticky rule wins; the fault shows once the viewer is gone). The tab dot is driven by `browserActive` as today.
- **`BrowserView` fault panel.** New prop `fault`; before the `if (!browserActive)` empty state:

  ```js
  if (fault) {
  	return html`
  		<div class="browser-panel">
  			<div class="empty-state runtime-fault" role="alert">
  				<div class="empty-icon" dangerouslySetInnerHTML=${{ __html: icon('globe', 48) }}></div>
  				<div class="empty-title">${t('browser_fault_title')}</div>
  				<div class="empty-desc">${t('runtime_fault_desc', { reason: fault.reason })}</div>
  				<div class="runtime-fault-detail">${fault.detail}</div>
  			</div>
  		</div>
  	`;
  }
  ```

  `fault.reason` and `fault.detail` are inserted as text (no `dangerouslySetInnerHTML`); `.runtime-fault-detail` is a new class (styled like `.empty-example`), so the harness can tell the detail from the empty state's example line. The viewer effect is unchanged (it keys on `browserActive`, false under the fault, so no connection and no `/json` request).

- **Terminal fault read.** One helper inside `TerminalView`:

  ```js
  const readTerminalFault = useCallback(
  	async (signal) => {
  		try {
  			const resp = await ocuFetch(`/terminal/${chatId}/status?_t=${Date.now()}`, {
  				cache: 'no-store',
  				signal
  			});
  			return resp.ok ? runtimeFault(await resp.json()) : null;
  		} catch {
  			return null;
  		} // a failed or non-JSON status read never blocks a start
  	},
  	[chatId]
  );
  ```

  `faultRef = useRef(null)`. Two call sites:
  - Phase 1 effect, before the `start-ttyd` POST: `const fault = await readTerminalFault(controller.signal); if (cancelled || !mountedRef.current) return; if (fault) { faultRef.current = fault; setStartError('__fault__'); return; }`. An abort makes the read return `null`, the POST then rejects on the aborted signal as today, and `cancelled` blocks any state update.
  - `handleRestart`, after `recovered.ok` and before `setStartError(null)`: `const fault = await readTerminalFault(); if (!mountedRef.current) return; if (fault) { faultRef.current = fault; setStartError('__fault__'); setRestarting(false); return; }`. This closes the recovery path: a stopped sandbox on the #442 profile shows "Container stopped", recovers, and then shows the fault instead of opening a socket that the relay would close.
    Why a read and not the first `onclose`: the relay closes with `1011` and a generic reason, so `onclose` cannot tell this fault from a backend hiccup without a status read anyway; reading first avoids a socket known to fail.

- **Terminal fault panel.** In the `startError` block: `const isFault = startError === '__fault__'`; the `.empty-state` element gets `role="alert"` when `isFault`; title `isFault ? t('terminal_fault_title') : ...`; description `isFault ? t('runtime_fault_desc', { reason: faultRef.current.reason }) : ...`; `isFault && html`<div class="runtime-fault-detail">${faultRef.current.detail}</div>``; `canRecover`stays`isStopped || isMetaExists`(no button for the fault).`:2198`is the only place that renders`startError`as a string and is covered by`isFault`.
- **Strings** (both locales):
  - `browser_fault_title`: en "Browser port not published by the host engine" / ru "Порт браузера не опубликован движком хоста"
  - `terminal_fault_title`: en "Terminal port not published by the host engine" / ru "Порт терминала не опубликован движком хоста"
  - `runtime_fault_desc`: en "The sandbox is running, but the host engine did not assign its published port ({reason}). Ask the operator to check the sandbox network host support note." / ru "Песочница работает, но движок хоста не назначил опубликованный порт ({reason}). Попросите оператора проверить раздел о поддержке сети песочницы."
- **Harness.**
  - State: `let terminalFixture = 'inactive';` next to `browserFixture`; `const FAULT_DETAIL = '9222/tcp publication on 172.31.0.1 was accepted by the engine but never assigned a host port; gateway publication is unsupported on this engine profile (computer-use-server/README.md, Sandbox network host support)'` (the #157 message; the terminal stub reuses the same string on purpose, the port in it is irrelevant to the SPA).
  - Stubs: browser status returns `{active: false, pages: [], reason: 'gateway_publication_unassigned', detail: FAULT_DETAIL}` when `browserFixture === 'fault'`; terminal status returns `{active: false, reason: 'gateway_publication_unassigned', detail: FAULT_DETAIL}` when `terminalFixture === 'fault'`, `{active: false, container_stopped: true}` when `'stopped'`, else `{active: false}`; `start-ttyd` POST returns 503 `{}` when `terminalFixture === 'stopped'`, else 200 as today; new `restart-container` POST stub returns 200 `{}`. Console classification, same shape as the browser `failure` rule at `:873-877` but keyed on the URL because Chromium's "Failed to load resource" text carries no URL: `text.includes('503') && (url.includes(`/terminal/${CHAT}/start-ttyd`) || text.includes(`/terminal/${CHAT}/start-ttyd`))` is pushed to `expectedRuntimeFailures` regardless of the current `terminalFixture` (only the `stopped` stub produces that 503).
  - Embedded browser case, after the `failure`/`malformed` loop (`:2083`): `browserFixture = 'fault'`; mark `requests.length` and `activeSockets.size`; mount `?embed=browser`; `const alert = frame().getByRole('alert'); await alert.getByText('gateway_publication_unassigned').waitFor();` assert `await alert.innerText()` contains `9222/tcp` and "Browser port not published by the host engine"; `frame().locator('.runtime-fault-detail')` count 1; `frame().getByText('Browser unavailable')` count 0; `frame().getByText('Shared AI Browser')` count 0; `frame().locator('.browser-connecting, canvas')` count 0; no `/ocu/browser/${CHAT}/json` row since the mark; `activeSockets.size` unchanged; screenshot `embedded-browser-fault.png`; `retireFrame()`; `browserFixture = 'inactive'`.
  - Terminal cases, before the socket scenarios (`:2128`), each ending with `retireFrame()` and `terminalFixture = 'inactive'`:
    1. Fault: `terminalFixture = 'fault'`; mark `requests.length`, `upgradeAttempts.length`; mount `?embed=terminal`; click `.dash-btn-primary`; `await frame().getByRole('alert').getByText('gateway_publication_unassigned').waitFor()`; alert text contains `9222/tcp` and "Terminal port not published by the host engine"; no `POST .../start-ttyd` row since the mark; `upgradeAttempts.length` unchanged; `activeSockets.size === 0`; `frame().getByRole('alert').locator('.dash-btn-primary')` count 0 (no recover button) and `frame().getByRole('alert').locator('button.btn')` count 1 (the existing Back button inside the panel, unchanged); `frame().getByText('[Session ended]')` count 0; screenshot `embedded-terminal-fault.png`.
    2. Stopped control and recovery: `terminalFixture = 'stopped'`; mount `?embed=terminal`; click `.dash-btn-primary`; `await frame().getByText('Container stopped').waitFor()`; `frame().getByRole('alert')` count 0; `frame().locator('.dash-btn-primary')` count 1 (the Restart button); a `POST .../start-ttyd` row with status 503 since the mark. Then `terminalFixture = 'fault'`; mark `upgradeAttempts.length`; click the Restart button; `await frame().getByRole('alert').getByText('gateway_publication_unassigned').waitFor()`; `upgradeAttempts.length` unchanged; `activeSockets.size === 0`; one `POST .../restart-container` row since the mark.
  - Shell browser case: after the panel session's `finally` (`:3068`) and before `compatibilityResults` (`:3070`): `browserFixture = 'fault'` **before** `const faultSession = await openStandalone('/ocu')` (the first shell poll runs on mount and the clock is frozen afterwards, so the fixture must be set first); `try { click the `.view-tab`with text "Browser"; same alert assertions as the embedded case against`faultSession.page`; `faultSession.page.getByText('Shared AI Browser')`count 0; screenshot`standalone-browser-fault.png`; } finally { await closeStandalone(faultSession); browserFixture = 'inactive'; }`. Then `console.log(JSON.stringify({ runtimeFault: 'ok', embeddedBrowser: true, shellBrowser: true, terminal: true, terminalRecovery: true }))`.
  - Controls: the existing `inactive`/`active`/`failure`/`malformed` browser cases and every terminal scenario run unchanged because each new case restores its fixture.

## Red / green plan

Red, against the pre-change SPA with the new harness (the harness and the SPA are separate files): the run aborts at the first new case, the embedded browser case, whose alert never appears while "Shared AI Browser" is shown; record that assertion. The terminal and shell cases are proven red by the mutants below (the harness cannot continue past the first failure).

Mutants: A, the shell `checkBrowserStatus` ignores `reason` (passes `fault=null`) while the embedded poll is intact → the embedded case passes and the shell case fails; B, both `readTerminalFault` call sites removed → terminal case 1 fails (a `start-ttyd` POST row appears and no alert); B2, only the `handleRestart` call removed → terminal case 1 passes and case 2 fails (an upgrade attempt appears after Restart and the alert never renders), proving the post-recovery read. Restore byte-identical (`cmp`).

Preserved (must stay green): every existing harness assertion, in particular `:2076-2083` (unavailable states), `:2128-2180` (terminal socket lifetimes and reconnect exhaustion), the standalone panel session and its exact-count Files assertion (`:3043-3046`, untouched because the shell fault case opens its own session), and the upload-feedback cases. Request-count assertions over terminal status rows are all `.some(...)`, so the extra status read before a start does not break them.

## Non-goals

- No change to `app.py`, `ws_recheck.py` or `docker_manager.py`; the WS close code and reason stay as they are.
- No WebUI change (it embeds the SPA and does not read these payloads).
- No retry or "fix it" action on the fault panels: the condition is a host-engine profile matter for the operator (#442).
- The harness file header still names Playwright 1.62.1; this change records the exact versions used (1.63.0, chromium-1243) in the evidence without editing the header.
