## Why

The A-T01 resources browser cases fail intermittently on hosted runners (#601). Every variant has failed at least once:

| Run | Attempt | Variant | Spec location |
| --- | --- | --- | --- |
| `39725722716` | 2 | direct | `e2e/ocu-resources.e2e.ts:38` |
| `39733674904` | 1 | sidebar | `:38` |
| `39733674904` | 2 | native popup | `:123`, reached through `:164` |

The same SHAs passed on other attempts.

- **What times out.** Each failure is a CDP wire-row poll that waits out the global `expect.timeout` of 20 s with no row satisfying `matches`. All three fail in `ResourceObserver.refused` (`e2e/ocu-resource-fixtures.ts:304`), called from `denials` (`:341-345`), after `#denials` already reads `blocked|blocked|blocked`. Direct and sidebar reach it from `ocu-resources.e2e.ts:38` → `:85`, and the popup from `:164`.
- **Two attach paths.** Rows reach `onNetwork` in two ways. `ResourceObserver.attach()` covers sidebar and direct. The flattened `root.session` attach in `observeNativeOcuPopup` (`e2e/ocu-fixtures.ts:631-682`) covers the popup. Failures on both paths point at the shared `onNetwork` merge.
- **Effect.** With `retries: 0` (`playwright.ocu.config.ts:13`), each failure fails `make verify-ui`, then the required check `All checks passed`, which blocks `make pr-merge`. So far there are 3 failures in 7 hosted Runtime attempts.

Code facts (`e2e/ocu-resource-fixtures.ts`):
- `onNetwork` (`:177-205`) only buffers out-of-order request-side authority (`requestWillBeSentExtraInfo` into `wireAuthority`, `:138-155`). For every other event it returns early when no row exists yet for the key (`:184-185`). A `responseReceived`, `responseReceivedExtraInfo`, `loadingFinished` or `loadingFailed` that arrives before `requestWillBeSent` is silently dropped.
- CDP does not order `*ExtraInfo` events, or events relayed from the network service, against the renderer's `requestWillBeSent`. A dropped `responseReceivedExtraInfo` leaves `status` undefined for a CORS-blocked probe, whose status only comes from that event (`:199`). A dropped `loadingFailed` leaves `cors` and `failure` unset. Either way `matches` can never become true.
- `observeRequest` replaces the row wholesale (`wires.set`, `:164`). An event merged into an earlier row would therefore be lost too.

Diagnosis gaps:
- The timeout message does not say which probe or which field is missing.
- The CI upload step (`.github/workflows/ci.yml:135-150`) looks for `test-results/ocu-workspace.e2e.ts-*`. The OCU browser run, however, writes Playwright output to `.run/workspace-ui-*/test-results` (`scripts/verify-ui-ocu.py:561-562`, since `732e1a413`). That pattern also excludes baseline specs, which hid the #599 failure context. No failing case's screenshot or error context has been uploaded since.
- Playwright traces stay private until credential redaction (`scripts/verify-ui-ocu.py:552`).

## What Changes

- **`e2e/ocu-resource-fixtures.ts`.** Response-side events for a key with no row yet are buffered and merged when `observeRequest` creates the row, as `wireAuthority` already does for request-side authority. `observeRequest` merges into an existing row and no longer replaces it. The merge keeps any `status`, `finished`, `cors` and `failure` already recorded. A later `requestWillBeSent` without `redirectResponse` cannot erase them. A redirect hop, which is a `requestWillBeSent` with `redirectResponse`, resets them, so the row describes the last hop.
- **Every-run buffer-hit record (cause evidence).** Each OCU resources test records how many response-side events reached the new buffer before their `requestWillBeSent`, by event type and probe index. The record is a redacted stdout line (`wire-buffer-hits …`) plus a reporter annotation of the same name. It is written whether the test passes or fails. The `list` reporter (`playwright.ocu.config.ts:14`) prints test stdout, and `verify-ui-ocu.py:588` copies it, redacted, into the CI log. The PR may call the ordering cause confirmed only if such hits are observed. Otherwise it says the cause is inferred. The merge does not fix a missing `requestWillBeSentExtraInfo`, which would leave `authorityObserved` false. The new diagnostics only report that case.
- **`refused()` diagnostics.** On timeout, the error names the probe's index and its redacted URL, plus each `matches` field that is unmet (`status`, `authorityObserved`, `cors`, `failure`, `finished`) with the observed value. The observer's wire rows are also written as redacted JSON to the test's output directory.
- **Failure evidence that is retained and uploaded.**
  - `scripts/verify-ui-ocu.py` `run()` failure branch: for each failed case under the scratch `test-results/`, it copies `test-failed-*.png` and `error-context.md`, the latter passed through `redact(…, self.secrets)`. It also copies the new redacted wire-row JSON into `.run/ui-evidence/<scratch>/test-results/<case>/`, along with the already redacted `stub.log` and `backend.log`.
  - Traces (`trace.zip`) are not retained: they hold request headers and bodies that the secret list cannot redact reliably.
  - `ci.yml` uploads these, plus the baseline spec's root `test-results/*/test-failed-*.png` and `error-context.md`.
  - Decision record: traces stay out of CI artifacts, and screenshots and redacted text evidence go in.
- **Not changed.** `retries: 0`, the 20 s timeout, CSP, sandbox, CORS and gateway behaviour all stay as they are. No case is skipped.

`design.md` records the merge rules, the diagnostic format, the evidence paths and the redaction boundary.

## Capabilities

### New Capabilities

- `ocu-browser-failure-evidence`: requirements "Wire observation is independent of CDP event order" and "Browser failures leave redacted evidence in CI".

## Impact

- The A-T01 sidebar, direct and popup cases, and `expireDocument`, stop depending on CDP event order.
- When an OCU or baseline browser case fails in CI, the artifact shows the failing screenshot, the error context and the redacted wire rows, so a failure can be investigated without blind reruns.
- CI file change: `.github/workflows/ci.yml`. It is flagged in the PR as AGENTS.md requires.

## Triage

```text
Issue type: test bugfix + CI evidence
Fixture level: expanded
Upstream suggested level: absent (issue says M, needs-triage)
Blast radius: every OCU browser case that uses ResourceObserver (A-T01 sidebar/direct/popup, expireDocument); CI failure artifact contents
Selected risk packs: Concurrency / ordering; Auth / secrets; Error handling / partial outputs; File IO / path safety; Config / project setup; Public API / CLI / script entry; Documentation (see tasks.md)
Evidence floor: design.md (a1)-(a5) vitest observer sequences, (b) diagnostics, (b2) buffer-hit stdout record, (c) forced refused() and baseline failures proving retention and redaction, (c2) best-effort copy unit test, (d) A-T01 repeat x10 locally plus two hosted Runtime runs
```
