# Native popup observation — native Linux trace record

## Boundary

This record belongs to [#95](https://github.com/DankerMu/open-webui/issues/95): A-T01's native link popup intermittently failed in Linux CI with a complete, correct popup document and an empty fixture event list. The change is [PR #585](https://github.com/DankerMu/open-webui/pull/585) (reviewed head `250ca17`): the popup observer installs the shared, self-guarding fixture collector on its own paused session before it resumes the target, the document projection distinguishes an absent collector from an empty one, and every observation writes a sanitized trace. Decision record: [the native popup oracle owns its collector](../../decisions/implemented/testing/2026-10-21-popup-oracle-owns-collector.md).

The Linux runs use a user-owned Ubuntu VPS without Docker; the owned stack is the same one `make verify-ui-ocu` starts on macOS (stub OCU, native backend, Vite, nginx gateway). No model provider is involved.

## Versions

| Item          | Value                                                                                   |
| ------------- | --------------------------------------------------------------------------------------- |
| Host          | Ubuntu 24.04, kernel 6.8.0-117, x86_64, 4 vCPU (AMD EPYC 7K83), 7.6 GiB                 |
| Node / Python | v22.22.3 / 3.12.3                                                                       |
| Playwright    | 1.63.0, `chromium_headless_shell-1243` (Chrome Headless Shell 153.0.8010.12)            |
| WebUI         | `250ca17` (pre-change variant: same tree with the observer's collector install removed) |
| OCU pin       | `32b96c08` (`constraints.yaml ocu_checkout.sha`)                                        |
| macOS control | Darwin 25.6.0, arm64, same Playwright and Chromium revision                             |

Raw: [Linux versions](2026-10-21-linux-versions.txt).

## Release-semantics experiment

`make verify-ui-ocu-repeat SPEC=ocu-popup-release.e2e.ts REPEAT=5` opens the A-T01 SVG popup with the same modified click while the probe's own paused session never resumes the target.

| Host         | Runs | Outcome     | Fields at the end of every run                                                                                                                           |
| ------------ | ---- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| native Linux | 5    | B in 5 of 5 | `pageExposed: true`, `requestSent: false`, `path: blank`, `collector: absent`; the document request appears only after cleanup resumes the probe session |
| macOS        | 1    | B           | the same fields                                                                                                                                          |

Outcome B means Chromium releases a `waitForDebuggerOnStart` target per session: Playwright resumes its own session and exposes the page, but the document does not start until every paused session has resumed. The early-resume hypothesis (the observer releasing the target before Playwright installed its init script) is therefore not the mechanism on either host. Raw: [Linux log](2026-10-21-linux-experiment.txt), [Linux traces](2026-10-21-linux-experiment-traces.jsonl), [macOS log](2026-10-21-mac-release-probe.txt).

## A-T01 repetitions on native Linux

`make verify-ui-ocu-repeat SPEC=ocu-workspace.e2e.ts REPEAT=n GREP=A-T01`, each run on a fresh owned stack. Every repetition observes two native popups (HTML and SVG).

| Variant     | Run         | Result                                    | Popup observations | First poll       |
| ----------- | ----------- | ----------------------------------------- | ------------------ | ---------------- |
| pre-change  | `REPEAT=20` | 18 passed, 2 failed at sign-in (HTTP 429) | 36                 | `1 events` in 36 |
| pre-change  | `REPEAT=10` | 10 passed                                 | 20                 | `1 events` in 20 |
| pre-change  | `REPEAT=10` | 10 passed                                 | 20                 | `1 events` in 20 |
| post-change | `REPEAT=20` | 18 passed, 2 failed at sign-in (HTTP 429) | 36                 | `1 events` in 36 |
| post-change | `REPEAT=10` | 10 passed                                 | 20                 | `1 events` in 20 |
| post-change | `REPEAT=10` | 10 passed                                 | 20                 | `1 events` in 20 |

The two failures in each `REPEAT=20` run are repetitions 15 and 18 failing in the worker sign-in (`e2e/ocu-auth.ts:67`, navigation after submit never happened); the backend log of both runs shows 18 sign-ins answered 200 and 2 answered 429. Every A-T01 repetition signs in, and the upstream limiter allows 15 sign-ins per 180 s per email (`backend/open_webui/routers/auths.py:91`), so the `REPEAT=20` form cannot pass on one stack; each variant was therefore also run as two `REPEAT=10` runs. The popup oracle did not run in the four failed repetitions.

Timing over the 76 observations per variant (milliseconds; per-observation rows in the [repetition tables](2026-10-21-linux-repetition-tables.md)):

| Measure                                                  | pre-change            | post-change           |
| -------------------------------------------------------- | --------------------- | --------------------- |
| selected target attached paused                          | 76 of 76              | 76 of 76              |
| collector install ack before resume                      | n/a (removed)         | 76 of 76              |
| observer resume ack after target attach                  | 21 to 48, median 29   | 24 to 58, median 31.5 |
| canonical response after resume ack                      | 13 to 26, median 18   | 13 to 30, median 19   |
| document `posted` after resume ack                       | 19 to 76, median 46.5 | 21 to 70, median 51   |
| document `posted` after the popup execution context      | 25 to 80, median 52   | 29 to 87, median 57   |
| Playwright `page` event before the observer's resume ack | 76 of 76              | 76 of 76              |
| polls needed                                             | 1 in 76               | 1 in 76               |

Playwright exposes the page before the observer resumes, and the document request follows the observer's resume: the same per-session release the experiment shows. With the pre-change observer the collector reached every native popup through Playwright's context init script; with the post-change observer it is installed and acknowledged on the observer's session before the resume. Raw logs and traces: pre-change [20](2026-10-21-linux-prechange-20.txt) ([traces](2026-10-21-linux-prechange-20-traces.jsonl)), [10a](2026-10-21-linux-prechange-10a.txt) ([traces](2026-10-21-linux-prechange-10a-traces.jsonl)), [10b](2026-10-21-linux-prechange-10b.txt) ([traces](2026-10-21-linux-prechange-10b-traces.jsonl)); post-change [20](2026-10-21-linux-postchange-20.txt) ([traces](2026-10-21-linux-postchange-20-traces.jsonl)), [10a](2026-10-21-linux-postchange-10a.txt) ([traces](2026-10-21-linux-postchange-10a-traces.jsonl)), [10b](2026-10-21-linux-postchange-10b.txt) ([traces](2026-10-21-linux-postchange-10b-traces.jsonl)).

## macOS mutation gate and default path

- Playwright 1.63.0 `FrameSession._initialize` queues the `allInitScripts()` installs before `Runtime.runIfWaitingForDebugger` on its own session ([quote](2026-10-21-playwright-init-order.txt)).
- Red: with the collector installed only at page level (Playwright does not propagate it to a native popup), the pre-change observer timed out at the HTML popup with `collector: absent` while the sidebar poll passed ([log](2026-10-21-mac-red-page-level-collector.txt)).
- Green: the same mutation with the post-change observer passed, `1 events` for both popups ([log](2026-10-21-mac-green-page-level-collector.txt)); the mutated spec files were restored and compared with `HEAD`.
- `REPEAT=3 GREP=A-T01` passed on one stack ([log](2026-10-21-mac-repeat3-a-t01.txt)); a grep matching no test failed at discovery ([log](2026-10-21-mac-grep-no-match.txt)). The whole-spec repetition is not idempotent because A-T10 rewrites fixture rows, filed as [#586](https://github.com/DankerMu/open-webui/issues/586).
- `make verify-ui-ocu` at `250ca17`: 40 passed ([log](2026-10-21-mac-verify-ui-ocu-250ca17.txt)).

## What remains unattributed

The recorded CI failures (a complete, correct popup document whose event list was empty, and the Playwright `page` event arriving about 14 ms after the document's HTTP 200) did not recur in 38 native Linux repetitions with the pre-change observer, and the release-semantics experiment rules out the early-resume mechanism on this host and on macOS. The pre-change projection reported a missing collector as `[]`, so the CI captures cannot say whether the collector was absent or reset. The differences between the GitHub-hosted runner and this host (CPU count, load, runner image) are not measured here, and this record makes no browser or product attribution. A recurrence in CI now fails with the collector state in its timeout and leaves its trace in the `workspace-browser-failure` artifact.

## Sanitization

Traces carry no grant tokens or chat ids (`[grant]` and `[chat]` placeholders, checked by grepping every trace for raw `/ocu/files/` and `/ocu/f/` segments and for UUIDs); local and VPS paths in the logs are replaced by `<scratch>`, `<mac>` and `<vps>`. The VPS inotify watch limit was raised for the runs (Vite watches the repository's `.venv`) and restored afterwards.
