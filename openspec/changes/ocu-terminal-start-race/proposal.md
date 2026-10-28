## Why

(#665.) Follow-up from (#656), confirmed by reading OCU `main` `102dbdd`.

**The gateway start can report a terminal that never bound.** `_start_gateway_terminal` (`computer-use-server/app.py:1147-1168`):

- runs `TERMINAL_STOP_COMMAND` (`:1139`, `pkill -x ttyd; tmux kill-server; true`). `pkill` sends SIGTERM and returns at once;
- starts `nohup ttyd -W -p 7681 …` in the background with output discarded (`_ttyd_start_command`, `:1142-1144`);
- sleeps 0.5 s and answers `started: true`.

If the old ttyd still holds 7681, the new ttyd fails to bind and exits silently, yet the browser is told the terminal started. This is the restart path taken when the model or token changes.

**The deployment smoke never exercises reuse.**

- `start_product_terminal` (`deploy/smoke_deployment.py:822-844`) refuses `already_running` on its own start. That refusal is deliberate: the smoke stops only a terminal it started (`test_already_running_race_never_stops_unowned_terminal`, `tests/deploy/test_deployment_smoke.py:1006`).
- But reuse (`already_running: true` on an unchanged reopen) is asserted only by the unit test `test_matching_fingerprint_reuses_running_terminal` (`tests/orchestrator/test_terminal_gateway.py:259`). The 2026-10-28 VPS acceptance checked it by hand.

**Two test names don't match their assertions.**

- `test_unreadable_ttyd_environment_counts_as_a_running_terminal` (`tests/orchestrator/test_terminal_gateway.py:581`) asserts a restart (events `probe, stop, start`).
- `test_release_verifies_the_messages_ingress_image` (`tests/deploy/test_overlay_structure.py:369`) asserts only the `SERVICE_IMAGE_VARS` mapping.

## What Changes

**Bounded stop.**

- `TERMINAL_STOP_COMMAND` sends the same signals, then waits up to 3 s for no `ttyd` process to remain. It exits non-zero if one does.
- In the gateway path, a non-zero stop answers 503 with a string detail ("terminal did not start: the previous ttyd did not exit"), and the start command never runs.
- `stop-ttyd` keeps answering `{"stopped": true}`, even when the bounded wait exits non-zero. Its only browser caller ignores the result (`static/preview.js:2213`). It now just waits as well.

**Confirmed start.**

- The gateway path replaces the fixed 0.5 s sleep with a bounded readiness probe of up to 5 s, run in the sandbox.
- The probe succeeds only when:
  - the oldest `ttyd` carries this request's `OCU_TERMINAL_FINGERPRINT` (the existing probe's test);
  - and `127.0.0.1:7681` accepts a TCP connection inside the sandbox. The connection is opened through bash `/dev/tcp` (`(exec 3<>/dev/tcp/127.0.0.1/7681)`), kept as one named constant. No new tool enters the image.
- If the probe fails:
  - the start runs `TERMINAL_STOP_COMMAND` once more, so no half-started ttyd survives to be taken as `already_running` by the next start;
  - it answers 503 with the string detail "terminal did not start: no ttyd with this request's settings is listening on 7681", whether or not that stop succeeded;
  - it never answers `started: true`.
- The exec timeouts of the stop and readiness commands cover their waits. Both run under the chat lock, as today. The worst-case hold grows from about 0.5 s to about 11 s (3 s stop, 5 s readiness, 3 s cleanup stop). Other `_combined_lock` users (Office sessions, publish, sweep, the shutdown timer) wait that long only on a failing start.

**Smoke checks reuse.**

- The start POSTs pass an explicit 20 s timeout to `http_request`. The default `HTTP_TIMEOUT` (`deploy/smoke_deployment.py:57`, 5 s) is shorter than the new worst case, and a timeout would turn a named 503 into "timed out".
- The second start is placed after `_OWNED_CLEANUP = _PENDING_START` (`:1115-1116`) and before `open_terminal_session` (`:1117`). It uses the same token and model as the first.
  - It runs after the process baseline (`:1107`). A reuse runs nothing in the sandbox, so `observe_foreground` and its delta check are unaffected.
  - Any failure goes down the owned-stop cleanup path.
- The second start must answer HTTP 200 with `already_running: true`.
  - Any other answer, including an HTTP error, fails the smoke with exit code 1 and a message naming the reuse check.
  - It does not reuse the first start's `already_running → _PENDING_START = None; fail(…, 2)` branch (`:839-841`).
- The first start still refuses `already_running` with exit code 2, and cleanup still stops only the owned terminal.
- `deploy/production-like-test/NETWORK-HARDENING.md:218`, which lists what the smoke verifies, adds the reuse check.

**Names.**

- The first test is renamed to say the terminal is restarted.
- The second is renamed to say it checks the mapping of `messages-ingress` to the proxy image variable.

## Capabilities

### Modified Capabilities

- `ocu-terminal-claude-gateway`: one added requirement, that terminal start reports success only for a listening terminal.

## Impact

- OCU:
  - `computer-use-server/app.py`, `deploy/smoke_deployment.py`;
  - `deploy/production-like-test/NETWORK-HARDENING.md`;
  - tests in `tests/orchestrator/test_terminal_gateway.py`, `tests/deploy/test_deployment_smoke.py` and `tests/deploy/test_overlay_structure.py`.
- The workspace SPA already treats a non-2xx, non-422 start as a failure. It checks `/terminal/{chat}/status` and shows `terminal_fail` (`computer-use-server/static/preview.js:2056-2074`). `tests/orchestrator/preview_embedding_browser.cjs:2244` already covers a 503 from start-ttyd, so 503 needs no UI change.
- These consumers were checked and are unaffected, because they are stub-backed and do not depend on start timing: the WebUI-side `scripts/ocu-stub.py`, `scripts/smoke-proxy.py` and `smoke/proxy/mutate.hurl`. `TERMINAL_STOP_COMMAND` has no caller beyond the two in `app.py`.
- Non-goals:
  - the non-gateway start path, which never stops a running ttyd before starting;
  - escalating to SIGKILL;
  - the fingerprint scheme;
  - the ttyd/tmux layout.

Deviation from the issue's acceptance criteria: the issue asked that "the smoke test passes on both a fresh start and an `already_running` start". The first start keeps refusing `already_running`, because accepting it would make the smoke stop a terminal it does not own. Reuse is checked on the immediate second start instead, which the issue also asks for.

## Fixture

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded: shared HTTP entrypoint (start-ttyd response contract) and the release smoke
Blast radius: a terminal reported started that never bound; a start that now refuses a healthy terminal; a smoke that stops a terminal it does not own
Selected risk packs: Public API / CLI / script entry (start-ttyd response, smoke); Concurrency / shared state / ordering (stop/start race, chat lock hold); Error handling / rollback / partial outputs (503 instead of started; failed start cleaned up); Legacy compatibility (reuse, 422 refusals, gateway off unchanged); Documentation (smoke coverage list)
Not selected: Auth / secrets (token handling unchanged); Schema (none); File IO (none); Resource limits (bounded waits only); Release packaging (no image change; bash /dev/tcp only)
Evidence floor: OCU unit command for tests/orchestrator/test_terminal_gateway.py, tests/deploy/test_deployment_smoke.py (in a Linux container if port 8082 is held locally) and tests/deploy/test_overlay_structure.py; new tests a–g in design.md
design.md: present
```
