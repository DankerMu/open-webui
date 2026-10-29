## Design

Change surface:

- `computer-use-server/app.py`: `_terminal_fingerprint_probe` (used only for reuse, so the listener test goes there), `TERMINAL_STOP_COMMAND`, `_terminal_ready_probe`, `TERMINAL_STOP_TIMEOUT`.
- `deploy/smoke_deployment.py`: `TERMINAL_START_TIMEOUT`.
- `deploy/recovery_resources.py`: the two `_broker_revision` messages.
- `NETWORK-HARDENING.md:218`.

Must preserve:

- **Healthy reuse is still a single probe exec**: the events stay `["probe"]`, with no stop and no start.
- A fresh start and a restart keep the event order `probe, stop, start, ready`, and keep the 503 details and the `restarted` flag.
- The probe, stop and readiness execs never receive the token, as asserted over all calls.
- `stop-ttyd` still answers `{"stopped": true}`.
- **The stop signals only processes named `ttyd` (`pkill -x`) and the tmux server.** It never signals PID 1 or the agent's own shell.
- **Restore:** which states `_require_cursor_lag` refuses, and the existing message suffixes after the new `chat <id> ` prefix.

Required evidence:

- a. **Non-listening fingerprinted ttyd is not reused.** In the FakeSandbox, a ttyd carries the request's fingerprint with `listens=False`. The start does not answer `already_running`: its events include `stop`, and it either starts fresh or answers the old-ttyd 503.
- b. **The repeat case from #676.** The new ttyd never listens and ignores SIGTERM (`linger` never ends under TERM).
  - The first start answers the not-listening 503.
  - The SIGKILL escalation removes the ttyd: the FakeSandbox `pkill` stub honours `-KILL`.
  - A second start with the same inputs does not answer `already_running`.
- c. **SIGKILL escalation alone.** A ttyd that ignores SIGTERM is gone after `TERMINAL_STOP_COMMAND`, which exits 0. The stub records `-KILL` after the TERM wait.
- d. **Bounds.**
  - Stop: SIGTERM wait ≥ 3 s, SIGKILL wait ≥ 1 s. Readiness: ≥ 5 s.
  - Each exec timeout is larger than its worst case (stop ≤ 6 s against 8; readiness ≤ 6 s against 8).
  - The smoke start timeout of 30 s is larger than the failing-start worst case of about 18 s.
  - These are asserted against constants exported next to the scripts, not literals in the test.
- e. **Real bash** in a disposable container shaped like the sandbox PID 1:
  - a ttyd that ignores SIGTERM is killed, and the stop exits 0 after 3–5 s;
  - a ttyd that exits normally makes the stop exit 0 quickly;
  - the reuse probe answers `MATCH` only while 7681 accepts a connection;
  - measured `-gt` waits are ≥ N s.

  This is recorded in the PR (orchestrator or implementer); it is not a unit test.

- f. **Restore messages.** A failing or malformed broker probe produces `chat <id> selected-release broker revision probe failed: …` and `chat <id> … returned malformed output`. Existing assertions on these messages are updated to the prefixed form.
- g. `NETWORK-HARDENING.md` states the new bounds and the 30 s smoke timeout. The docs-lint gates pass.

Review focus:

- No path answers `already_running` for a ttyd that does not accept connections.
- SIGKILL targets only `ttyd`.
- The bounds really are minimums, and every exec timeout still covers its worst case.
- Healthy reuse cost is unchanged.
