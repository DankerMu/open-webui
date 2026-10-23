## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-proxy-restart-after-up --strict --no-interactive`.

## 2. Implement (in open-computer-use)

- [x] 2.1 Teach the fake docker `compose restart` (recorded in `ops.log` and `restarts.log`, never in `executed.json` / `starts.log`; injectable failure and hold). Tests first in `tests/deploy/test_deploy_entry.py`: design evidence (a), (b), (c), (e). Record (a) and (b) red on `bff4f29`.
- [x] 2.2 `deploy/up.sh`: restart the proxy after its `up` succeeds, through `run_owned`, with the log line and the failure message.
- [x] 2.3 `NETWORK-HARDENING.md`: `:206` names the restart and why; the #590 upgrade section says `up.sh` restarts the proxy; one sentence that a backend recreated outside `up.sh`, including activation of a retained release older than this change, needs `docker compose … restart proxy`.
- [x] 2.4 Green: `tests/deploy/test_deploy_entry.py`, `test_bootstrap_runtime.py`, `test_recovery.py`, `test_offline_release.py`, then the deploy test package in the CI-shaped container (`python:3.13`, non-root), then `./tests/test-project-structure.sh`.

## 3. Verify

- [x] 3.1 Acceptance host: pending the next release upgrade through `up.sh`; record the proxy start time against the backend start times and probe `:8082` `/ocu/api/outputs/<chat>` and `:8083`. Not part of this PR's evidence.

## Risk packs

Selected:

- **Public API / CLI / script entry:** `up.sh` behaviour, evidence (a), (d).
- **Error handling / partial outputs:** restart failure, evidence (b).
- **Concurrency / ordering:** restart strictly after the proxy `up`, never after a failed earlier start, signals during the restart, evidence (a), (c), (e).
- **Documentation:** task 2.3.

Not selected:

- **Config / project setup:** no new variable; the snapshot and env file are the existing ones.
- **File IO / path safety:** no file written beyond the existing temp configs, covered by the cleanup assertion in (b).
- **Auth / secrets:** no credential handling changes.
- **Release / packaging:** no image or inventory change; the consumer contract is an integer in `release.py`, not a hash of `up.sh`.
- **Legacy compatibility / rollback:** activating an older retained release runs its own `up.sh` without the restart; documented in task 2.3, not changed.
- **Resource limits:** no new input size or count.
- **Schema / file format:** no persisted format or config schema change.
