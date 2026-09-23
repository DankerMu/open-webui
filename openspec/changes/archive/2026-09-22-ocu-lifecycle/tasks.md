# Tasks

## 0. Fixture prerequisites

- [x] 0.1 Record user-approved multi-worker, host idle reclamation and non-deletion semantics before implementation in `docs/decisions/implemented/architecture/2026-09-22-ocu-lifecycle-lock-and-launch-semantics.md`.
- [x] 0.2 Obtain revised fixture approval and pin the existing-sleeper transition; issue64 owns WebUI consumer error mapping and gates final acceptance36.

## 1. Lifecycle cutover

- [x] 1.1 Add tests/orchestrator/test_lifecycle.py under the CI-discovered directory. Semantic RED demonstrates implicit restart, destructive conflict recovery and repaired SDK/migration/pause/network failures; matrix, describe, credential and idle coverage passes. Missing-symbol/missing-route failures and source-text assertions are not counted as semantic qualification.
- [x] 1.2 Implement canonical per-chat thread lock plus shared flock, non-destructive conflict handling, SandboxStopped and explicit launch/describe. Internal routes use existing auth guard; aliases share launch. RLock reentrancy is accepted for nested existing synchronous helpers.
- [x] 1.3 Replace the sleep-kill timer with host-owned pause-aware idle reclamation; cover external pause/unpause, uncertain tracking, heartbeat/expiry ordering and OCU downtime. Pin state-specific existing-sleeper cutover before implementation.
- [x] 1.4 Compose sandbox credentials under the combined lock, exclude internal secrets, and set NO_AUTOSTART exactly from OCU_SANDBOX_NO_AUTOSTART. Make metadata atomic and fail closed on corruption.
- [x] 1.5 Update directly relevant docs/changelog and record the user-approved topology, timer and non-deletion decisions.

## 2. Evidence and review

- [x] 2.1 Parent direct subprocess: `/Users/danker/.local/bin/uv run --no-project --python 3.12 --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/ -q --import-mode=importlib --ignore=tests/integration`: Python3.12.12/FastAPI0.115.0/Starlette0.38.6,573 passed/5 skipped. Structure24 passed with pinned Python PATH. Docker proof remains epic task19.0.
- [x] 2.2 Strict fixture validation and fixture review passed before implementation. Three-seat expanded review, one fix pass, independent rereview closed blockers; final head c2221e3ee031e12bf35712877bf9c9fff3d3a99b. Two-process lock negative control and thread evidence included. Durable merge evidence: https://github.com/DankerMu/open-computer-use/pull/7#issuecomment-5788629524 . Nonblocking lookup-error coverage/dead catches: WebUI#65; consumer mapping: WebUI#64.

## Risk packs

- Public API / CLI / script entry — selected: 1.2 launch/describe/alias responses.
- Config / project setup — selected: 1.3–1.5 multi-worker, host idle reclamation and NO_AUTOSTART.
- File IO / path safety / overwrite — selected: 1.2–1.4 atomic metadata and shared lock files.
- Auth / permissions / secrets — selected: 1.2–1.4 internal auth and credential scoping.
- Concurrency / shared state / ordering — selected: 1.1–1.3 two-process and thread locking.
- Legacy compatibility / examples — selected: 1.2 aliases and preserved external stop behavior.
- Error handling / rollback / partial outputs — selected: 1.2–1.4 explicit failures without deletion.
- Schema / columns / units / field names — not selected: no broker schema; revision remains0.
- Resource limits / large input / discovery — not selected: no new resource policy.
- Release / packaging / dependency compatibility — not selected for dependency changes: preserve current worker packaging; no new dependency.
- Documentation / migration notes — selected only through 1.5 because user-approved topology/timer semantics must be durable.
