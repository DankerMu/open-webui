## Design

Change surface:

- `computer-use-server/app.py`:
  - new `_terminal_reuse_probe`, the fingerprint probe and the listener test in one exec, used only by the reuse check in `_start_gateway_terminal`;
  - `TERMINAL_STOP_COMMAND`;
  - the `-gt` bounds in it and in `_terminal_ready_probe`;
  - `TERMINAL_STOP_TIMEOUT`.

  `_terminal_fingerprint_probe` itself is unchanged, because `_terminal_ready_probe` also calls it (`:1171`).

- `deploy/smoke_deployment.py`: `TERMINAL_HTTP_TIMEOUT` for start and stop.
- `deploy/recovery_resources.py`: the two `_broker_revision` messages.
- `NETWORK-HARDENING.md:218`.

Governing invariant: start-ttyd answers `already_running` only for a ttyd that carries this request's fingerprint and accepts connections on 7681. No stop that reports success leaves a ttyd running.

Must preserve:

- **Healthy reuse is one probe exec**, with events `["probe"]`: no stop, no start.
- **Fresh start and restart** keep the event order `probe, stop, start, ready`, the 503 details and the `restarted` flag.
- **The token** never reaches the probe, stop or readiness execs, as asserted over all calls.
- **`stop-ttyd`** still answers `{"stopped": true}`.
- **The stop** never signals PID 1 or any process other than `ttyd` (`pkill -x`) and the tmux server. `tmux kill-server` still ends the pane shells, as it does today.
- **The chat lock:** a failing start now holds it for about 18 s instead of about 11 s, which is accepted on the same grounds as #665. Its other users wait without a timeout, and WebUI's `ocu_client` 30 s total timeout still covers it.
- **Smoke:** a first start that reports `already_running` still exits 2 without stopping anything. The reuse check still requires `already_running: true` on the second start.
- **SPA:** start and stop calls have no request deadline (`ocu-request.js:75-82`), so longer waits only delay the UI. Phase 1 still chooses its wait from `already_running` (`preview.js:2077`).
- **Restore:** which states `_require_cursor_lag` refuses, and the existing message text after the new `chat <id> ` prefix.

Sibling surfaces:

- the non-gateway start (`app.py:1225-1230`), a non-goal;
- `stop-ttyd` (`:1247`), changed in both modes;
- `terminal_status` (`:1103`), which checks HTTP 200 and is unchanged;
- the smoke's `start_product_terminal`, `check_terminal_reuse` and `stop_product_terminal` (`smoke_deployment.py:845-876`);
- the SPA Phase 1 and Kill paths (`preview.js:2077`, `:2213`);
- the backup-side caller of `_require_cursors_behind` (`recovery_resources.py:559`), whose messages already carry `chat <id>`.

Required test-double changes (`tests/orchestrator/test_terminal_gateway.py`):

- `FakeSandbox.exec_run` labels the readiness script by its `SECONDS=0; until` prefix, not by `LISTENER` (`:197`). The reuse probe, which now contains the listener test, is then still labelled `probe`. `probe_delay` (`:202`) and the timeout keying (`:709`) keep working.
- The `pkill` stub (`:124`) distinguishes `-KILL` from a plain `pkill`:
  - a plain `pkill` starts the SIGTERM countdown (`linger`, as today);
  - `-KILL` removes the ttyd at once, unless the new `survives_kill` mode is set.
- `test_old_ttyd_that_never_exits_answers_503_without_starting` (`:661`) and `test_stop_ttyd_answers_stopped_even_when_ttyd_outlives_the_wait` (`:714`) set `survives_kill`, so they still cover the old-ttyd 503 with events `["probe", "stop"]` and the stop exiting 1.

Required evidence:

- a. **Non-listening fingerprinted ttyd is not reused.**
  - Setup: a stale ttyd with the request's fingerprint is spawned with `listens=False`, then `listens=True` is set before the POST.
  - Expected: 200 `{"started": true, "already_running": false, "restarted": true}`, events `["probe", "stop", "start", "ready"]`.
- b. **The repeat case from #676.**
  - Setup: with `listens=False` throughout, the new ttyd ignores SIGTERM (`linger` never ends) but not SIGKILL.
  - First start: the not-listening 503, events `["probe", "stop", "start", "ready", "stop"]`. The cleanup stop's `-KILL` removes the ttyd.
  - A second start with the same inputs: events start `["probe", "stop", …]` (`NONE`), never `already_running`. With `listens=False` still set, it answers the not-listening 503 again.
- c. **SIGKILL escalation alone.** A ttyd that ignores SIGTERM: `TERMINAL_STOP_COMMAND` exits 0, and the stub records `-KILL` after the plain `pkill`.
- d. **Bounds.**
  - `test_terminal_gateway.py` asserts that the stop script contains `-gt 3` and `-gt 1`, that the readiness script contains `-gt 5`, and that `TERMINAL_STOP_TIMEOUT` and `TERMINAL_READY_TIMEOUT` are each greater than their worst case (6 s).
  - `test_deployment_smoke.py` asserts `timeout=30.0` on both start-ttyd posts and on stop-ttyd (replacing `:1088`).
- e. **Real bash** in a disposable container whose PID 1 is exactly the sandbox chain: entrypoint `exec "$@"` (`Dockerfile:583`) into `bash -c "trap 'exit 0' SIGTERM SIGINT; tail -f /dev/null & wait $!"` (`Dockerfile:677`), with no `--init`.
  - a ttyd that ignores SIGTERM is killed, and the stop exits 0 after 3–5 s;
  - after SIGKILL, `pgrep -x ttyd` finds nothing, including zombies;
  - a normal ttyd makes the stop exit 0 quickly;
  - the reuse probe prints `MATCH` only while 7681 accepts a connection;
  - measured `-gt` waits are ≥ N s.

  This evidence is recorded in the PR.

- f. **Restore messages.** A failing or malformed broker probe gives `chat <id> selected-release broker revision probe failed: …` and `chat <id> … returned malformed output`; `test_recovery.py:3825` is updated.
- g. **Docs and gates.** `NETWORK-HARDENING.md:218` states the 30 s start/stop HTTP timeout and the SIGTERM-then-SIGKILL stop. The docs-lint gates pass.
- h. **Proxy-independent tests** (#676 item 4). `httpx.get` at `test_office_save_as.py:1654` and `httpx.Client` at `test_office_resolution.py:1784` get `trust_env=False`. With `ALL_PROXY=socks5://127.0.0.1:9` set, both files pass; on `origin/main` the same run fails with the SOCKS `ImportError`.

Review focus:

- No path answers `already_running` for a non-listening ttyd.
- SIGKILL targets only `ttyd`, and the sandbox PID 1 reaps it.
- The bounds are minimums, and every timeout covers its worst case.
- Healthy reuse cost is unchanged.
