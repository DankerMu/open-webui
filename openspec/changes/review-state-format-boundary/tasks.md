# Tasks

## 1. Fixture and baseline

- [x] 1.1 Obtain independent fixture pass and strict validation; freeze base/config identities.
- [x] 1.2 Record actual Prettier selection RED for an owned nonformatted generated-state witness.

## 2. Implementation and evidence

- [x] 2.1 Add the exact ignore rule and prove generated-state selection GREEN without changing other policy.
- [x] 2.2 Run full `make fmt-check` positive, tracked-JSON negative and restored-positive cases in the owned full source copy; assert byte-preserved state and remove the owned copy.
- [x] 2.3 Document ownership and retain formatting/doc-gate/decisions-verify results and evidence identities.

## 3. Integration

- [ ] 3.1 Complete three-seat review, authorized exact-head local CI, merge, closure and archive.

## Risk packs

- Selected: Public API / CLI / script entry — 2.2 exercises actual Make target and unchanged glob.
- Selected: Config / project setup — 2.1/2.2 test exact exclusion and retained checks.
- Selected: File IO / path safety / overwrite — 2.2 isolates fault injection and compares state bytes.
- Not selected: Schema / columns / units / field names — generated format unchanged.
- Not selected: Auth / permissions / secrets — no auth or secret access.
- Not selected: Concurrency / shared state / ordering — live gate never mutated for testing.
- Not selected: Resource limits / large input / discovery — no new resource behavior; filename scope covered by config pack.
- Selected: Legacy compatibility / examples — 2.2 proves tracked JSON still fails.
- Not selected: Error handling / rollback / partial outputs — no writer implementation changes.
- Not selected: Release / packaging / dependency compatibility — no dependency/version change.
- Selected: Documentation / migration notes — 2.3 records generated-state ownership.
