# Tasks

## 1. Contract and regression

- [x] 1.1 Obtain independent compact fixture pass and strict validation; retain producer and current-consumer evidence, including the unavailable TypeScript LSP reference query and targeted fallback.
- [x] 1.2 Add one broker TSV regression in the paired classifier test; parent records `other` versus required `sheet` semantic RED before production edits.
- [x] 1.3 Add the two existing-map entries and prove GREEN; cover MIME-only and type-only fallbacks, normalization, conflicting recognized MIME/image precedence, preserved CSV/XLSX and unknown behavior without filename heuristics.

## 2. Consumer proof and integration

- [x] 2.1 Exercise TSV metadata in the actual mounted list and selected-file surface using the existing browser harness; assert sheet icons, unchanged file/download identity, no newly granted preview/edit capability, screenshot and zero unexpected console/page errors. Test-only response injection may supply metadata; it must not change broker/runtime behavior or suppress existing harness cases.
- [x] 2.2 Run `make test-frontend`, `make typecheck`, `make lint-scoped`, named-file coverage and `make verify-ui`; retain commands, exits, identities and screenshots, and stop owned services. Parent qualifies omission of either mapping with the corresponding semantic regression in a disposable copy or pre-change source replay.
- [x] 2.3 After runtime proof, update the existing workspace-file-tree decision, run docs/decisions/strict/scoped-format checks, complete compact review and authorized exact-head local CI, merge, close and archive.

## Risk packs

- Not selected: Public API / CLI / script entry — no exported signature or endpoint change; pure internal display lookup only.
- Not selected: Config / project setup — no runtime, dependency or test-discovery configuration change.
- Not selected: File IO / path safety / overwrite — no file operation or path policy change; filenames never classify the file.
- Not selected: Schema / columns / units / field names — consume existing producer values; no payload or persistence schema change.
- Not selected: Auth / permissions / secrets — eligibility and authority unchanged;2.1 verifies no capability grant.
- Not selected: Concurrency / shared state / ordering — no state or reconciliation changes; kind-update issue #248 remains separate.
- Not selected: Resource limits / large input / discovery — two constant-size map entries, no new iteration or discovery.
- Selected: Legacy compatibility / examples —1.3 preserves MIME precedence, CSV/XLSX, unknowns and normalization;2.1/2.2 cover unchanged consumers.
- Not selected: Error handling / rollback / partial outputs — no error-path or mutation changes; unknown values retain `other`.
- Not selected: Release / packaging / dependency compatibility — no dependency/build/deployment changes.
- Selected: Documentation / migration notes —2.3 updates the owning decision and archives this delta into the existing capability.
