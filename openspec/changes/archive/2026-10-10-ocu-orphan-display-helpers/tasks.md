## 1. Inventory and removal

- [x] 1.1 Confirm PR34 merged; attempt symbol references and record tool limits/fallback inventory; independent compact fixture review and strict validation pass before deletion.
- [x] 1.2 Remove only format_size and \_FILE_ICONS; compare the remaining module AST with the base to prove classify_file, \_listing_files, imports and every route remain identical. Verify no source consumers remain and no unrelated tracked file changes.

## 2. Runtime equivalence and delivery

- [x] 2.1 Run existing tests/orchestrator/test_outputs_endpoint.py before and after deletion. Exercise actual native HTTP upload/listing/download with independently expected classifications and complete bytes; remove the disposable smoke and stop its owned server.
- [x] 2.2 Keep tests and production contracts unchanged; run central docs/decision/strict-fixture/changed-format gates and compact correctness+test-evidence review at the exact source head. Publish scoped local CI and full evidence.
- [x] 2.3 Merge paired source/fixture, close the issue and archive the maintenance fixture without modifying canonical production specs.

## Risk packs

Selected: legacy compatibility — classifier/listing/route AST preservation and consumer/runtime equivalence (1.2,2.1); canonicality/ownership — remove exactly the two unreferenced definitions with no replacement (1.1–1.2); documentation — bounded maintenance fixture and truthful evidence (2.2).

Not selected: public API, file IO, auth, shared state, schema, config, dependencies, release — no live code or contract changes allowed. A discovered concrete supported consumer blocks deletion rather than receiving a shim. Parent performs the small mechanical removal inline; independent fixture/code reviews remain required.
