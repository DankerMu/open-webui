# Tasks

## 1. Qualification

- [x] 1.1 Complete independent fixture review and strict validation before documentation edits.
- [x] 1.2 On the unchanged historical source, compare exact explicit-path and canonical-root selected node-ID sets: 864 unique items, pytest 9.1.1, no unavailable `world` fixture in canonical collection. Keep collection distinct from execution and disclose the fresh environment separately from the original Python 3.12 report.
- [x] 1.3 Record full canonical selected execution independently, including exit, outcomes and scope. Qualify the current corpus using the same module selection and preserve all additional nodes; do not force a historical count or patch fixtures/dependencies.

## 2. Documentation and delivery

- [x] 2.1 Add the canonical root/filter guidance to the existing OCU test README, retaining import mode and integration exclusion. Explain exact node-ID comparison and collection-versus-execution claims; no permanent runner or test/source changes.
- [ ] 2.2 Retain bounded credential-safe evidence and relevant doc checks; independently review the invocation and evidence, publish exact-head CI/merge statements, merge source/control changes, close the issue and archive the canonical requirement.

## Risk packs

- Not selected: Public API / CLI / script entry — no program or CLI implementation changes; commands use pytest's existing options.
- Not selected: Config / project setup — no pytest configuration, manifest, version or dependency policy changes.
- Not selected: File IO / path safety / overwrite — no production IO change; parent qualification uses an owned immutable git-archive snapshot, not a new worktree or the user's data.
- Not selected: Schema / columns / units / field names — no persisted application format change.
- Not selected: Auth / permissions / secrets — no application authority changes; ordinary evidence publication must exclude credentials.
- Not selected: Concurrency / shared state / ordering — no collector or fixture patch; the invocation avoids the existing mixed-root collector identity path.
- Not selected: Resource limits / large input / discovery — documentation does not implement discovery policy; selected scope and collector availability are explicit evidence requirements in 1.2/1.3.
- Selected: Legacy compatibility / examples — 1.2/1.3 require exact historical/current node-set equality and preserve all chosen tests; 2.1 documents the equivalent command rather than narrowing scope.
- Not selected: Error handling / rollback / partial outputs — no runtime policy change; incomplete or failed execution must be reported as such, not as a passing collection result.
- Not selected: Release / packaging / dependency compatibility — no image, deployment or pytest dependency change.
- Selected: Documentation / migration notes — 2.1/2.2 establish the owning invocation guidance and separate collection, execution and environment evidence.
