# Tasks

## 1. Contract

- [x] 1.1 Obtain independent fixture PASS and strict OpenSpec validation before implementation.

## 2. Ownership repairs

- [x] 2.1 Demonstrate semantic RED then GREEN for controlled process creation and first-marker failures, with top-level diagnostic identity, no unstarted join, patch restoration and real acquired-child cleanup.
- [x] 2.2 Demonstrate semantic RED then GREEN for controlled real thread-holder readiness failure, with explicit owner release/future observation, patch restoration and preserved initiating exception.
- [x] 2.3 Execute both existing successful contention tests and focused control-plane regressions through canonical discovery; preserve successful-path assertions and record actual pytest CLI startup-fault diagnostics plus independent cleanup observations.

## 3. Delivery

- [x] 3.1 Update test documentation and owning testing decision after runtime proof; retain scoped lint, source identity, environment, evidence and central docs/spec validation results.
- [ ] 3.2 Complete expanded correctness, test-evidence/spec and invariant-state review, exact-head CI, exact closing-issue-set checks, source/control merge and fixture archive.

## Risk packs

| Pack                                           | Selection and evidence                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Public API / CLI / script entry                | Not selected: no CLI contract changes; actual pytest CLI is an evidence boundary in 2.3.               |
| Config / project setup                         | Not selected: no configuration changes.                                                                |
| File IO / path safety / overwrite              | Not selected: existing marker paths and release helper are retained; no new path or overwrite policy.  |
| Schema / columns / units / field names         | Not selected: no persisted schema changes.                                                             |
| Auth / permissions / secrets                   | Not selected: auth behavior unchanged; published evidence must not include credentials.                |
| Concurrency / shared state / ordering          | Selected: 2.1–2.3 cover actual holders, cleanup ordering, patch restoration and successful contention. |
| Resource limits / large input / discovery      | Not selected: no new resource ceilings/discovery contract; existing canonical discovery is used.       |
| Legacy compatibility / examples                | Not selected: no public compatibility change; successful test assertions remain covered by 2.3.        |
| Error handling / rollback / partial outputs    | Selected: 2.1–2.2 compare initiating exception identity and local cleanup before outer teardown.       |
| Release / packaging / dependency compatibility | Not selected: no dependency or packaging changes.                                                      |
| Documentation / migration notes                | Selected: 3.1 documents ownership and evidence limits; 3.2 archives the contract.                      |

Production cancellation, simultaneous independent cleanup failures and general leak certification are explicit non-goals, not unexecuted acceptance claims.
