# Tasks

## 1. Evidence and cleanup

- [x] 1.1 Add one genuine lookup-failure case in the existing lifecycle seam and rename the unpause-only case. Preserve the already-absent tautological test and the app fixture teardown.
- [x] 1.2 Prove the lookup case rejects a disposable missing-translation mutant; preserve the red output and canonical green result without mutating committed source.
- [x] 1.3 Add direct launch retirement-APIError refusal controls for both running and restarting-after-ready branches, asserting status409/reason migration_required and no deletion. Remove only the two unreachable retirement APIError catches after confirming the callee translation; preserve existing retirement controls.
- [x] 1.4 Run the focused lifecycle module and a throwaway real-route lookup-refusal smoke with mutation counters. Remove the probe after preserving evidence; update existing lifecycle documentation.
- [x] 1.5 Complete scoped source/fixture checks and the prescribed expanded cross-review; use the owner-approved local-CI path with exact-head evidence and explicit provenance.

## 2. Risk packs

- Public API / CLI / script entry: selected; launch exception and real-route HTTP smoke, no payload changes.
- Config / project setup: not selected; no config or dependency changes.
- File IO / path safety / overwrite: selected; absence of engine mutations and existing metadata/lifecycle preservation tests.
- Schema / columns / units / field names: not selected; no schema or field changes.
- Auth / permissions / secrets: not selected; existing authenticated fixture is reused, no credential policy or emitted identifier changes.
- Concurrency / shared state / ordering: not selected; no lock or shared-state changes; app fixture substitutions/restoration remain unchanged.
- Resource limits / large input / discovery: not selected; no capacity policy changes.
- Legacy compatibility / examples: selected; existing retirement409 and unpause/restart failure controls.
- Error handling / rollback / partial outputs: selected; lookup500, no engine mutation and retirement409 cases.
- Release / packaging / dependency compatibility: not selected; no packaging or runtime upgrade.
- Documentation / migration notes: selected; fixture and existing lifecycle decision documentation, doc-gate and decisions-verify.
