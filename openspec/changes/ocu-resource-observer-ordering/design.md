## Design

Change surface:

- `e2e/ocu-wire-rows.ts` (new). A side-effect-free module holding the row, buffer and merge logic and the diagnostic formatter, so it can be imported without `OCU_E2E_CONTEXT`, unlike `e2e/ocu-fixtures.ts:28-29`. Its paired unit test is `e2e/ocu-wire-rows.test.ts`.
- `vite.config.ts`. The vitest `include` gains `e2e/**/*.test.ts`. This is a one-line diff to a fork-touched file.
- `e2e/ocu-resource-fixtures.ts`. `ResourceObserver` delegates to the module, and `refused()` produces the timeout diagnostics and writes `wire-rows.json`.
- `e2e/ocu-fixtures.ts`. The popup path uses the same `onNetwork` and needs no logic change; this is to be verified.
- `scripts/verify-ui-ocu.py`. The `run()` failure branch, tested in `backend/open_webui/test/test_verify_ui_ocu_evidence.py` so that it runs under `make test-backend`, following the precedent `backend/open_webui/test/test_smoke_proxy_cleanup.py`. `scripts/test_*.py` is outside `make test`.
- `.github/workflows/ci.yml`. The upload paths change. This is a CI change, flagged in the PR.
- `docs/decisions/implemented/testing/` record.

Merge rules (`onNetwork`):

- **Request-side authority.** `requestWillBeSentExtraInfo` keeps going to `wireAuthority` as today.
- **Early response-side events.** A `responseReceived`, `responseReceivedExtraInfo`, `loadingFinished` or `loadingFailed` event for a key with no row is buffered per key as partial fields:
  - `status` from `responseReceived.response.status`, or from `responseReceivedExtraInfo.statusCode`;
  - `finished: true`;
  - `cors` and `failure`.

  A buffered `responseReceived` also keeps the payload needed for `nativeResponses`.

- **Row creation.** When `observeRequest` creates the row, it applies the buffered fields and the buffered `nativeResponses` entry, then clears the buffer.
- **Row already present.** If a row already exists, `observeRequest` updates `url`, `method` and the authority flags. It keeps the response-side fields already recorded.
- **Repeated status.** A later `responseReceivedExtraInfo` or `responseReceived` sets `status` as today, so the last write wins, with the same semantics as now.
- **Redirects.** A `requestWillBeSent` that carries `redirectResponse` reuses the `requestId` for the next hop. It resets the row's response-side fields (`status`, `finished`, `cors`, `failure`) before applying the new hop's URL. The previous hop's status (for example 302) therefore never sits on the next hop's URL. The popup's canonical-to-grant navigation is such a redirect.
- **Native responses.** A buffered `nativeResponses` entry gets its `origin` from the row when the row is created.
- **Cleanup.** Buffers are cleared on dispose, together with `wires` and `wireAuthority`.
- **Buffer-hit count.** Each buffer hit increments a per-test counter keyed by event type and probe URL. At the end of every test, pass or fail, the counter is printed as one redacted stdout line, `wire-buffer-hits <json>`, via `console.log`. The `list` reporter (`playwright.ocu.config.ts:14`) prints test stdout, and `verify-ui-ocu.py:588` copies it, redacted, into the CI log. The counter is also added as a `wire-buffer-hits` annotation, but the `list` reporter does not print annotations, so the stdout line is the evidence.
- **`redactOcu` location.** `redactOcu` moves into `e2e/ocu-wire-rows.ts`, and `e2e/ocu-fixtures.ts` re-imports it from there. Importing `ocu-fixtures.ts` throws without `OCU_E2E_CONTEXT` (`:28-29`), so the new module must not depend on it.

Governing invariant: for a request without redirects, the final row for a request key holds the same fields whatever the arrival order of that key's CDP events; only the time each field is written varies. For a redirected request, the row holds the last hop's fields.

Diagnostics:

- **What fails.** When `refused(index …)` times out, the thrown error names:
  - the probe index;
  - the redacted URL (`redactOcu`);
  - the expected status, CORS mode and finish mode;
  - for every row with the same URL and method, each unmet field as `field=observed≠expected`;
  - or `no row` when no row matches the URL and method.
- **No secret values.** Authority stays presence-only, as `observeAuthority` already enforces.
- **Wire-row dump.** Right before `refused()` throws on a timeout, it writes `wire-rows.json` (rows through `redactOcu`) to the test's output directory (`testInfo.outputPath`). Playwright sets `testInfo.status` only after the test body returns, so a test body cannot detect "on failure" itself.

Evidence retention (`verify-ui-ocu.py` `run()` failure branch, in addition to today's logs):

- For each directory under `scratch/test-results/` that contains `test-failed-*.png` or `error-context.md`, copy into `.run/ui-evidence/<scratch>/test-results/<same dir name>/`:
  - the PNGs as they are;
  - `error-context.md` and `wire-rows.json`, each passed through `redact(…, self.secrets)`. `redact` also finds and redacts grant segments in every text.
- Never copy `trace.zip`.
- Destination names are built only from the scratch directory listing; no archive-provided path is used.
- Copying is best effort. Each file is copied in its own `try`, and a copy or redaction error is logged with the file name. The branch then re-raises the original exception, so the real test failure is never replaced (`scripts/verify-ui-ocu.py:331-345`).

CI upload (`ci.yml`):

- **Replace** the two dead `test-results/ocu-workspace.e2e.ts-*` lines with:
  - `test-results/*/test-failed-*.png` and `test-results/*/error-context.md`, which are the baseline specs' root output;
  - `.run/ui-evidence/workspace-ui-*/test-results/**`;
  - `.run/ui-evidence/workspace-ui-*/stub.log` and `.run/ui-evidence/workspace-ui-*/backend.log`.
- **Keep** the existing lines and `if-no-files-found: error`.

Redaction boundary (decision record):

- **Excluded from CI artifacts:** traces, because they hold request headers and bodies.
- **Admitted:** screenshots, plus text evidence passed through `redact(…, self.secrets)`. `self.secrets` is the harness secret list at copy time: the JWT, the sign-in token, the password, the stub token, `WEBUI_SECRET_KEY` (`scripts/verify-ui-ocu.py:475`) and the minted session tokens (`:586`). `redact` also finds and redacts the `/ocu/f/<token>` grant segments in each text.
- **Residual risk:** a screenshot can show a short-lived grant URL in direct mode. That token comes from a throwaway CI harness instance with an ephemeral secret key, and the same exposure exists today for `.run/ui-evidence/workspace-*.png`.

Must preserve:

- what every `matches` predicate means;
- `retries: 0`, the 20 s timeout and the sidebar, direct and popup case structure;
- the `expireDocument` refusal checks;
- that no case is skipped;
- today's failure logs;
- that `if-no-files-found: error` keeps failing an upload with nothing to upload.

Required evidence:

- **(a) Observer ordering**, in `e2e/ocu-wire-rows.test.ts` under vitest. Each sequence must yield the same final row as the in-order control, except (a5), which has its own expected row. (a1)–(a3) are red on `main`, shown by replaying them through the unchanged `ResourceObserver.onNetwork` logic: the row lacks `status`, `cors` or `failure`, or there is no row at all. (a5) is already green on `main`, because `wires.set` rebuilds the row. It guards the new keep-fields rule and goes red only if the redirect reset is missing.
  - (a1) `responseReceivedExtraInfo` (403), then `requestWillBeSent`, then `requestWillBeSentExtraInfo`, then `loadingFailed` (CORS);
  - (a2) `loadingFailed`, then `requestWillBeSent`;
  - (a3) `responseReceived`, then `requestWillBeSent`: the `nativeResponses` entry is kept and gets its `origin`;
  - (a4) the in-order control;
  - (a5) a redirect: `requestWillBeSent` for hop 1, `responseReceivedExtraInfo` 302, then `requestWillBeSent` with `redirectResponse` (status 302) for hop 2, then `responseReceived` 200. CDP sends no `responseReceived` for a redirect hop. The row holds hop 2's URL and status 200, never 302.
- **(b) Diagnostics.** The formatter, given a probe and rows that cannot match, returns a message naming the index, the redacted URL and each unmet field as `field=observed≠expected`, or `no row`. Authority values appear only as presence.
- **(b2) Buffer-hit record.** A unit test of the counter and its formatted line, plus one local `make verify-ui-ocu-repeat SPEC=ocu-resources.e2e.ts REPEAT=1` whose output shows a `wire-buffer-hits` line for each A-T01 case.
- **(c) Retention, end to end.** Force a failure inside a `ResourceObserver.refused()` call: a temporary wrong expected status in an A-T01 case, run with `make verify-ui-ocu-repeat … REPEAT=1` and reverted afterwards. Expected:
  - the browser output shows the diagnostic message;
  - `.run/ui-evidence/<scratch>/test-results/<case>/` holds `test-failed-1.png`, `error-context.md` and `wire-rows.json`, and no `trace.zip`;
  - the retained text files contain no value from the harness `self.secrets` at copy time and no unredacted `/ocu/f/<token>` segment.

  Also force a baseline-spec failure: its root `test-results/*/error-context.md` exists for upload.

- **(c2) Best-effort copy.** A unit test in `backend/open_webui/test/test_verify_ui_ocu_evidence.py`, run with `make test-backend`. With one unreadable or unredactable file, the remaining files are still copied, the error is logged, and the original exception propagates.
- **(d) Stability.**
  - `make verify-ui-ocu-repeat SPEC=ocu-resources.e2e.ts REPEAT=10 GREP="A-T01"` locally, and `make verify-ui-ocu` once;
  - hosted CI Runtime on the PR twice, a run plus a rerun.

  Two green hosted runs are not proof that the fix works; about 3 failures in 7 attempts have been observed. The PR reports the `wire-buffer-hits` values from those runs and states the cause as confirmed only if hits occurred.

Non-goals:

- raising timeouts or adding retries;
- changing CSP, sandbox, CORS or the gateway;
- #429;
- trace retention with body redaction, recorded as rejected in the decision record.
