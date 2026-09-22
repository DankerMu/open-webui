# Tasks

## 0. Fixture prerequisites

- [x] 0.1 Record user-approved multi-worker, host idle reclamation and non-deletion semantics before implementation in `docs/decisions/proposed/architecture/2026-09-22-ocu-lifecycle-lock-and-launch-semantics.md`.
- [ ] 0.2 Obtain revised fixture approval and pin the existing-sleeper transition; issue64 owns WebUI consumer error mapping and gates final acceptance36.

## 1. Lifecycle cutover

- [ ] 1.1 Add tests/orchestrator/test_lifecycle.py (required location: the CI pytest job runs `tests/orchestrator/` and `tests/test_auth_guard.py` only) with semantic red for implicit restart, destructive conflict recovery, launch matrix, describe, credential isolation and timer ordering.
- [ ] 1.2 Implement canonical per-chat thread lock plus shared flock, non-destructive conflict handling, SandboxStopped and explicit launch/describe. Internal routes use existing auth guard; aliases share launch.
- [ ] 1.3 Replace the sleep-kill timer with host-owned pause-aware idle reclamation; cover external pause/unpause, uncertain tracking, heartbeat/expiry ordering and OCU downtime. Resolve safe upgrade of existing sleeper-equipped containers before implementation.
- [ ] 1.4 Compose sandbox credentials under the combined lock, exclude internal secrets, and set NO_AUTOSTART exactly from OCU_SANDBOX_NO_AUTOSTART. Make metadata atomic and fail closed on corruption.
- [ ] 1.5 Update directly relevant docs/changelog and record the user-approved topology, timer and non-deletion decisions.

## 2. Evidence and review

- [ ] 2.1 Run focused lifecycle tests and pinned non-Docker suite through direct subprocess: `/Users/danker/.local/bin/uv run --no-project --python 3.12 --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/ -q --import-mode=importlib --ignore=tests/integration`; record versions and run structure check. Docker proof remains epic task19.0.
- [ ] 2.2 Validate fixture strictly and obtain fixture review before implementation; three-seat expanded review before merge (correctness, test-evidence/spec-compliance, invariant-state/security integration). Evidence must include two-process flock and in-process lock identity.

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
