# Tasks

## 1. Prefix contract

- [x] 1.1 Add tests/orchestrator/test_preview_prefix.py for actual shell responses/static mounts/auth and startup rejection, including user-selected guarded-namespace collision rejection and accepted near-misses. Initial shell/browser suite10 semantic RED; namespace correction10 semantic RED then31 focusedGREEN.
- [x] 1.2 Implement canonical OCU_PUBLIC_PREFIX, shell assets/apiUrl/filesBase/heartbeat, unprefixed describeUrl and relocated static mount in app.py; default baseline tests remain green.
- [x] 1.3 Adapt browser-viewer discovery/poll/connect/reconnect addresses using its module URL. Execute actual class in Node built-in VM from pytest with mocked dependencies, not the class; prefix/protocol matrix RED then GREEN, no new dependencies.
- [x] 1.4 Update existing server README/env example with prefix, rejected namespaces and explicit #17 deployment prerequisite; no full-SPA or real-Docker acceptance claim.

## 2. Verification and closure

- [x] 2.1 Fixture and user-approved namespace amendment reviewed; strict validation passed. Three-seat expanded implementation review, one fix pass, independent rereview PASS at3fa16f3f85aef11302c9028b1b053c52c952f6f8.
- [x] 2.2 Parent pinned Python3.12/Node22.23.2 non-Docker suite604 passed/5 skipped; structure24 passed. Tests CI-discovered. Durable evidence: https://github.com/DankerMu/open-computer-use/pull/8#issuecomment-5790133074 . Issue17 owns remaining JS/inline-heartbeat header; issue36 owns whole-SPA/browser/Node-runtime evidence.

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
