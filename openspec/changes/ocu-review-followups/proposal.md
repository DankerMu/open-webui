## Why

(#676.) These are three non-blocking findings from the reviews of DankerMu/open-computer-use#189 (#665) and #191 (#640). They were recorded in each PR's summary comment.

At OCU `origin/main` `78a1a0d`:

1. **A failed terminal start can leave a ttyd that the next start reuses.**
   - In `computer-use-server/app.py` `_start_gateway_terminal` (`:1194-1196`), a failed readiness check runs `TERMINAL_STOP_COMMAND` again and ignores the result.
   - That command (`:1140-1143`) only sends SIGTERM.
   - Suppose the new ttyd neither listens nor exits on SIGTERM. Its environment still carries this request's fingerprint, and the reuse probe (`:1188-1190`) checks only the fingerprint. So the next start answers `already_running: true` for a terminal that serves nothing, every time, until the container restarts.
   - `stop-ttyd` (`:1247`) has the same SIGTERM-only limit.
2. **The wait bounds are shorter than stated.** Bash `$SECONDS` counts whole wall-clock seconds, so `[ $SECONDS -ge 3 ]` (`:1142`) and `-ge 5` (`:1172`) can fire after about 2 s and 4 s. The comments and `deploy/production-like-test/NETWORK-HARDENING.md` say 3 s and 5 s.
3. **Two restore refusals don't name the chat.** In `deploy/recovery_resources.py` `_broker_revision`, the messages at `:1492` and `:1499` carry no chat id. Since #191, `_require_cursors_behind` collects one problem per chat, so a probe that fails for every chat (a broken helper image, say) repeats the same unattributed line N times.

## What Changes

- **Reuse requires a listener.** The reuse probe answers `MATCH` only when the oldest ttyd carries this request's fingerprint **and** `127.0.0.1:7681` accepts a connection (`TERMINAL_LISTENER_TEST`, inside the same exec). A fingerprinted ttyd that does not listen reads as `OTHER`: the start stops it and starts fresh, or answers the existing "previous ttyd did not exit" 503 if it cannot be stopped.
- **The stop escalates.** `TERMINAL_STOP_COMMAND` sends SIGTERM to ttyd and kills the tmux server, then waits at least 3 s for no ttyd to remain. If one remains, it sends SIGKILL to every `ttyd` and waits at least 1 s more, exiting 1 only if a ttyd still remains. `stop-ttyd` uses the same command, so the browser's Kill also escalates.
- **True minimum bounds.** Every wait uses `-gt N` on `$SECONDS`, so each lasts between N and N+1 s:
  - stop: SIGTERM wait ≥ 3 s, SIGKILL wait ≥ 1 s;
  - readiness: ≥ 5 s.

  The exec timeouts are raised to cover the worst case: stop 8 s (was 5), readiness 8 s (unchanged; the worst case is now about 6 s).
  - `deploy/smoke_deployment.py` `TERMINAL_START_TIMEOUT` goes from 20 s to 30 s. A failing start can now hold the request for about 18 s (stop 6 + readiness 6 + cleanup stop 6), which is too close to 20.
  - `NETWORK-HARDENING.md` states the new numbers.

- **Restore refusals name the chat.** Both `_broker_revision` messages start with `chat <id> `.

## Capabilities

### Modified Capabilities

- `ocu-terminal-claude-gateway`: reuse requires a listening ttyd, and stopping escalates to SIGKILL.
- `ocu-backup-rollback`: broker-probe refusals at restore name the chat.

## Impact

- OCU:
  - `computer-use-server/app.py`, `deploy/smoke_deployment.py`, `deploy/recovery_resources.py`, `deploy/production-like-test/NETWORK-HARDENING.md`;
  - `tests/orchestrator/test_terminal_gateway.py`, `tests/deploy/test_deployment_smoke.py` (if it pins the 20 s timeout), `tests/deploy/test_recovery.py`.
- Non-goals:
  - the SPA;
  - the non-gateway terminal path;
  - the real-image `/dev/tcp` check, which stays with #36;
  - any change to which states restore refuses.

## Fixture

```text
Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded: process lifecycle under the chat lock (concurrency), the start-ttyd answer contract, restore messages
Blast radius: every gateway terminal start answers 503 or restarts a healthy terminal; a stop that kills more than ttyd; a smoke that times out on a healthy deployment
Selected risk packs: Public API / CLI / script entry (start-ttyd answers, stop-ttyd, smoke timeout); Concurrency / shared state / ordering (stop and reuse under the chat lock, wait bounds vs exec timeouts); Error handling (escalation, cleanup); Legacy compatibility (healthy reuse stays one probe exec; restore refuses the same states); Documentation (NETWORK-HARDENING.md)
Not selected: Auth / secrets (token handling unchanged); Schema (none); File IO (none); Resource limits (bounded waits only); Release packaging (none)
Evidence floor: OCU unit command for test_terminal_gateway.py and test_recovery.py; test_deployment_smoke.py in a Linux container; new tests in design.md red on origin/main; real-bash run of the stop and probe scripts in a container shaped like the sandbox PID 1; scripts/docs-lint gates
design.md: present
```
