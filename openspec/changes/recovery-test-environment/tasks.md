# Tasks

## 1. Contract

- [x] 1.1 Obtain fixture-review pass and strict OpenSpec validation before implementation.

## 2. Lifecycle isolation

- [x] 2.1 Add a lifecycle regression against the existing recovery fixture; parent records semantic RED for leaked environment before repair, then GREEN after cleanup registration.
- [x] 2.2 Prove normal, body-error and post-mutation setup-error outcomes preserve fake Docker inside the test and restore the entire entry environment afterward; run the complete recovery module and deploy regression scope.

## 3. Integration and delivery

- [x] 3.1 Run sequential recovery-to-real-Docker smoke and canonical full-root execution against owned local server/sandbox resources; record five unchanged lifecycle cases, all other outcomes, environment identity and exact cleanup.
- [ ] 3.2 Publish scoped evidence, independent cross-review and paired source/spec PRs with an empty automatic-closing set; distinguish #445 and acceptance-machine limits from this repair.

## Risk packs

- Selected — Config / project setup: complete environment comparison in 2.1–2.2; no dependency changes.
- Selected — Concurrency / shared state / ordering: sequential subprocess and root ordering proof in 3.1; parallel tests are a non-goal.
- Selected — Error handling / rollback / partial outputs: body and setup errors in 2.2 retain errors while restoring state.
- Selected — Legacy compatibility / examples: unchanged deploy assertions and five integration consumers in 2.2–3.1.
- Selected — Documentation / migration notes: durable evidence and current fixture contract in 3.2; no production migration.
- Not selected — Public API / CLI / script entry: no entrypoint change; bare Docker is a verification boundary only.
- Not selected — File IO / path safety / overwrite: no production file algorithm changes; fixture-owned temporary cleanup only.
- Not selected — Schema / columns / units / field names: database contract unchanged.
- Not selected — Auth / permissions / secrets: no credential or access changes; evidence must not expose ambient environment values.
- Not selected — Resource limits / large input / discovery: no collection or timeout changes.
- Not selected — Release / packaging / dependency compatibility: no shipped artifact or dependency changes; local image execution is evidence, not release certification.

## Execution boundary

The [verification packet](../../../docs/evidence/issue-444/verification.json.gz) records three qualified historical-fixture RED cases, seven focused GREEN cases and real Docker sequential smoke. A fresh exact-version Python environment passed package checks before and after canonical execution: 4026 collected nodes completed with 4019 passes, two failures, five skips and 335 passing subtests. All 392 deploy cases and fourteen real integration cases passed, including the five unchanged workspace cases. The two remaining failures are sweep-lock reachability (#445) and an upload-receipt exception-class identity assertion; this is not a full-suite pass. Earlier attempts used a retained interpreter later found to have incomplete package metadata; their immutable packet remains linked, without attributing their failures to repository defects. Session resources were removed; the stopped owned builder and two images remain reserved for the following acceptance repair, not general use.
