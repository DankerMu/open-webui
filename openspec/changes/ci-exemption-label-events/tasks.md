# Tasks

## 1. Contract and baseline

- [x] 1.1 Obtain independent expanded fixture PASS and `openspec validate ci-exemption-label-events --strict --no-interactive` before candidate edits.
- [x] 1.2 Freeze the workflow/constraints, required-job set and parent-owned replay oracle; record default-activity known-good behavior and semantic RED for a label change requiring fresh same-head evaluation, not a setup or parse failure.

## 2. Event cutover and preserved decisions

- [x] 2.1 Add the two label activities alongside all three defaults in the existing workflow; prove opened, synchronize and reopened behavior and existing push selection remain intact with the same replay.
- [x] 2.2 Prove adding `diff-limit-exempt` on an oversized same-head PR requests evaluation, skips only its enforcement step and permits aggregate success only with successful dependencies; prove removal requests evaluation and restores guard/aggregate failure.
- [x] 2.3 Prove `lockfile-refresh` addition/removal reevaluates each existing lockfile/manifest pair, with removal using the resulting label list rather than the removed-label field; valid pairs retain success.
- [x] 2.4 Execute the actual aggregate for required-job failure, cancellation and PR-job skip inputs, including exemptions; qualify missing-event and weakened-dependency controls and restore GREEN without changing the oracle.
- [x] 2.5 Bind real Git diff boundary/exclusion observations and verify all workflow configuration except the intended subscription remains semantically identical, including guard programs, permissions, required dependencies and concurrency; constraints remain byte-identical.

## 3. Delivery

- [x] 3.1 After replay proof, document the CI change, extra label-triggered run cost and hosted-admission limits; retain scanned evidence with exact candidate/oracle/environment identities and pass scoped YAML/format/docs/decision/spec checks.
- [ ] 3.2 Complete correctness, test-evidence/spec-compliance and invariant review; explicitly flag the CI-file change, satisfy exact-head CI and intended closing-set gates, merge and archive the fulfilled contract.

## Risk packs

| Pack                                           | Selection and evidence                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API / CLI / script entry                | Selected:1.2 and2.1–2.4 cover the shared workflow event entry and existing guard/aggregate programs.                                         |
| Config / project setup                         | Selected:2.1 and2.5 cover activity selection and preservation of all other configuration; no dependency or setup change.                     |
| File IO / path safety / overwrite              | Not selected: production diff/lockfile reading is unchanged. Verification uses owned standalone Git fixtures, never a new worktree.          |
| Schema / columns / units / field names         | Not selected: existing platform fields and payload shape are reused, without a custom schema.                                                |
| Auth / permissions / secrets                   | Not selected for policy changes:2.5 preserves permissions and no API/token scope is added;3.1 scans retained evidence.                       |
| Concurrency / shared state / ordering          | Selected:2.2–2.3 prove same-head resulting-label transitions;2.5 preserves same-ref cancellation without inventing host ordering guarantees. |
| Resource limits / large input / discovery      | Selected:2.2 and2.5 preserve400-line behavior and existing exclusions;3.1 records the additional all-label-event run cost.                   |
| Legacy compatibility / examples                | Selected:2.1–2.5 preserve defaults, push behavior, both exemption gates and all required jobs.                                               |
| Error handling / rollback / partial outputs    | Selected:2.4 proves aggregate refusal and negative controls; revert is rollback.                                                             |
| Release / packaging / dependency compatibility | Selected for required-CI enforcement:2.4–2.5 and3.2 preserve the aggregate and exact-head gate; no package/image change.                     |
| Documentation / migration notes                | Selected:3.1–3.2 retain the decision/evidence and canonical archive.                                                                         |

## Evidence boundaries

Local replay applies documented event/used-expression semantics and executes the actual workflow shell programs; it is not GitHub-hosted event delivery or a full run of unrelated CI jobs. Dependency results are explicit controlled inputs. Existing hosted Actions-admission limitations and owner-approved scoped local CI remain visible. The implementer cannot change the parent oracle, expected outcomes, baseline, constraint values or evidence. No permanent source-wiring test or second production guard is introduced.
