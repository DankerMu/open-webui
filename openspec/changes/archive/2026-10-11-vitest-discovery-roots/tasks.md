# Tasks

## 1. Fixture and baseline

- [x] 1.1 Obtain independent fixture pass and strict validation; freeze the tracked suite inventory and snapshot metadata.
- [x] 1.2 Capture semantic discovery RED on owned copied-suite witnesses before configuration edits.

## 2. Implementation and evidence

- [x] 2.1 Restrict shared discovery, then prove GREEN with exact official-suite equality and default filename/exclusion preservation.
- [x] 2.2 Run real Make/npm frontend entrypoints and coverage-discovery parity; require all official suites passing, no witnesses selected, and unchanged pre-existing snapshots.
- [x] 2.3 Document root ownership and run scoped formatting/lint, doc-gate and decisions-verify; retain commands, exits and evidence identities.

## 3. Integration

- [x] 3.1 Complete three-seat review and required exact-head local CI under the existing owner authorization, then merge, close and archive.

## Risk pack mapping

- Selected: Public API / CLI / script entry — 2.2 checks Make/npm/coverage consumers.
- Selected: Config / project setup — 2.1 preserves Svelte and default exclusions.
- Selected: File IO / path safety / overwrite — 1.1 and 2.2 preserve user snapshots; only owned witnesses are removed.
- Not selected: Schema / columns / units / field names — no data format change.
- Not selected: Auth / permissions / secrets — no auth change; evidence excludes secret files.
- Not selected: Concurrency / shared state / ordering — no new concurrent production state.
- Selected: Resource limits / large input / discovery — 1.2 and 2.1 prove bounded discovery.
- Selected: Legacy compatibility / examples — 2.1/2.2 retain all official suites and filename families.
- Not selected: Error handling / rollback / partial outputs — no writer; witness failures remain visible if selected.
- Not selected: Release / packaging / dependency compatibility — no dependency or packaging change.
- Selected: Documentation / migration notes — 2.3 documents future root additions.
