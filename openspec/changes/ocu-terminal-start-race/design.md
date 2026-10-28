## Design

Change surface:

- `computer-use-server/app.py`:
  - `TERMINAL_STOP_COMMAND`;
  - `_start_gateway_terminal`;
  - a named readiness-probe builder next to the existing fingerprint probe.
- `deploy/smoke_deployment.py`: the explicit start timeout, and the reuse check after the owned start.
- `deploy/production-like-test/NETWORK-HARDENING.md:218`: the smoke coverage list.
- Test renames.

Must preserve:

- **Reuse:** a `MATCH` probe answers `{"started": false, "already_running": true}`, and nothing else runs (events `["probe"]`).
- **Fresh and restart answers:** `{"started": true, "already_running": false, "restarted": <state == OTHER>}`.
- **422 refusals:** exact strings, before the container lookup.
- **404:** for a stopped container.
- **Gateway off:** today's commands without an environment. The non-gateway path keeps its 0.5 s sleep.
- **Chat lock:** the whole sequence runs in one worker thread under `_combined_lock`, and concurrent starts serialize so that the second reuses.
- **Token:** never in a command string, response, log or exception.
- **`stop-ttyd`:** answers `{"stopped": true}`, even when its bounded wait exits non-zero (deliberate).
- **Smoke HTTP timing:** a slow but healthy start, or a named 503, is never turned into a timeout. The start POSTs pass 20 s; the server's worst case is about 11 s.
- **Smoke:**
  - the first start refuses `already_running` without stopping anything;
  - cleanup stops the owned terminal once and waits for ttyd and tmux to go;
  - all other smoke checks are unchanged.

Must add/change: see proposal "What Changes".

Governing invariant: terminal start answers `started: true` only when a ttyd started by this request is listening on 7681. Reuse answers `already_running: true` only when the running ttyd carries this request's fingerprint.

Sibling surfaces:

- **`stop-ttyd`:** shares `TERMINAL_STOP_COMMAND`.
- **Clients of the start response:**
  - the SPA (`static/preview.js:2056-2074`, `static/ocu-request.js:127-148` `recoverStoppedContainer`): non-2xx, non-422 is treated as a failure, and `preview_embedding_browser.cjs:2244` covers a 503;
  - the smoke;
  - WebUI-side stub-backed checks, unaffected (`scripts/ocu-stub.py`, `scripts/smoke-proxy.py`, `smoke/proxy/mutate.hurl`).
- **Chat lock users** (`_combined_lock`: Office sessions, publish, sweep, the shutdown timer): the worst-case hold is about 11 s, and only on a failing start.
- **Proxy route** `terminal/{chat}/start-ttyd` (`deploy/proxy/routes.json:17`): status codes pass through.
- **Non-gateway path:** unchanged, a stated non-goal.

Seams under test:

- **`tests/orchestrator/test_terminal_gateway.py` `FakeSandbox`:**
  - It records `events` and runs probe scripts in real bash against a fake `/proc`.
  - The new stop and readiness scripts also run in real bash, with these test doubles:
    - the fake `bin` gains `pkill` and `tmux` stubs, so nothing on the host is signalled. The Python fake still applies their effects after the bash run: it starts the pgrep countdown and clears `tmux_env`. Otherwise the reattach branch (`:136-139`) would restore the old environment on every restart. A surviving tmux is switched on only per test (evidence d);
    - the `pgrep` stub can keep answering the ttyd pid for a configured number of polls after the stop (evidence a, b);
    - the named `/dev/tcp` listener constant is replaced by a test of a fake "listening" file before the script runs, so no host socket is opened.
  - The fingerprint half of the readiness check runs unmodified against the fake `/proc`, so evidence d tests the product's comparison, not the fake's.
  - `exec_run` recognises the stop and readiness scripts by exact value or named builder, ahead of the general `assert "pgrep" in script` branch (`:143`). Each records its own event (`stop`, `ready`).
  - The `timeout 5` assertion accepts the new exec timeouts.
- **`tests/deploy/test_deployment_smoke.py` fake HTTP server (`:203-221`):**
  - The default `start_mode="ok"` answers `already_running: true` when `terminal["ttyd"]` is already true, as the real server does. Healthy, Messages-ingress and ws-mode tests keep their own assertions.
  - A new mode answers the second start with `started: true` (not reused).
  - `"already"` stays the mode for an unowned first start.

Required evidence:

- a. **Old ttyd exits late.** The fake keeps ttyd's pid for a few polls after the stop, then removes it.
  - The start runs only after the pid is gone, and the answer is `started: true`.
  - Events show stop, then start, then ready.
- b. **Old ttyd never exits.** The pid stays past the 3 s wait.
  - The answer is 503 with exactly "terminal did not start: the previous ttyd did not exit".
  - No start exec runs, and the lock is released.
- c. **Nothing listens after start.** The fake starts ttyd but its listening file is absent.
  - The answer is 503 with exactly "terminal did not start: no ttyd with this request's settings is listening on 7681".
  - Events end with `start, ready, stop`, and the fake holds no ttyd pid afterwards.
  - A following start with the same inputs is not answered `already_running`.
- d. **Fingerprint mismatch after start.** The listening file is present, but the oldest ttyd has another fingerprint, as when a surviving tmux reattaches an old environment (the fake already models this).
  - The answer is 503 with the same detail as c.
  - The same cleanup stop runs.
- e. **Healthy fresh start and restart.** The existing first-open and restart tests stay green with the new event sequence, and `restarted` is unchanged.
- f. **Smoke reuse.**
  - **Second start reused:** under the default mode, the first start answers `started: true` and the second `already_running: true`. The smoke passes, the recorded POSTs show two start-ttyd calls before the terminal websocket, and cleanup stops the terminal once.
  - **Second start not reused:** the new mode answers the second start with `started: true`. The smoke exits 1 naming the reuse check, and cleanup still stops the owned terminal.
  - **Second start fails:** the second start answers HTTP 500, or its request errors or times out. The smoke exits 1 naming the reuse check, because the second start's own `http_request` failure is wrapped. Cleanup stops the owned terminal.
  - **Timeout:** the start POSTs pass `timeout=20`. Record the argument by patching `http_request` in a subprocess, as `tests/deploy/test_deployment_smoke.py:660-671` does. Do not sleep 20 s in a test.
  - Evidence b and c spend real seconds in the bounded waits unless the bounds are module constants the tests shorten; either is acceptable.
  - `test_already_running_race_never_stops_unowned_terminal` stays green (exit 2, no stop).
- g. **Names.** Both renamed tests keep their assertions. `grep` finds no old name.

Non-goals: see proposal Impact.

Review focus:

- The bounded waits fit inside their exec timeouts. A failure answers 503 and never `started: true`.
- The readiness check proves both the fingerprint and the listener, and the tests never touch host sockets.
- Reuse, 422, gateway-off and lock behaviour are unchanged.
- The smoke still never stops a terminal it does not own.
