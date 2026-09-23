# Tasks

## 1. Prefix contract

- [ ] 1.1 Add tests/orchestrator/test_preview_prefix.py for actual shell responses/static mounts/auth and startup rejection, including user-selected guarded-namespace collision rejection and accepted near-misses; capture semantic RED for nonempty prefix before source change, then GREEN.
- [ ] 1.2 Implement canonical OCU_PUBLIC_PREFIX, shell assets/apiUrl/filesBase/heartbeat, unprefixed describeUrl and relocated static mount in app.py; default baseline tests remain green.
- [ ] 1.3 Adapt browser-viewer discovery/poll/connect/reconnect addresses using its module URL. Execute actual class in Node built-in VM from a pytest-discovered test (mock dependencies, not the class); prove prefix/protocol matrix RED then GREEN without new dependencies.
- [ ] 1.4 Update existing server README/env example with prefix and the explicit #17 deployment prerequisite; record no full-SPA or real-Docker acceptance claim.

## 2. Verification and closure

- [ ] 2.1 Obtain fixture review and strict OpenSpec validation before implementation; three-seat expanded implementation review: correctness, evidence/spec, integration.
- [ ] 2.2 Parent runs pinned Python3.12 non-Docker pytest tests/ with importlib mode and tests/integration excluded; structure check uses pinned Python PATH. New tests live under CI-discovered tests/orchestrator/. Record environment, commands and outputs; no Docker commands.

## Risk packs

- Public API / CLI / script entry — selected:1.1–1.3 shell/static/viewer addresses.
- Config / project setup — selected:1.1–1.2 canonical env startup failure.
- File IO / path safety / overwrite — not selected for mutation: static existing read-only directory; no new filesystem write.
- Schema / columns / units / field names — selected:1.1–1.2 additive describeUrl config field.
- Auth / permissions / secrets — selected:1.1 unchanged token guard and no secret in HTML.
- Concurrency / shared state / ordering — not selected: no lifecycle/state behavior changes.
- Resource limits / large input / discovery — not selected: no new resource policy.
- Legacy compatibility / examples — selected:1.1–1.3 exact empty-prefix URL compatibility.
- Error handling / rollback / partial outputs — selected:1.1 invalid configuration fails before serving; rollback uses empty prefix with baseline routes.
- Release / packaging / dependency compatibility — not selected: no dependencies/build packaging changes; keep script asset location.
- Documentation / migration notes — selected:1.4 #17 must complete before prefixed deployment.
