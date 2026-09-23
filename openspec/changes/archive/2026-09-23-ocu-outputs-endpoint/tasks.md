# Tasks

## 1. Endpoint integration

- [x] 1.1 Approve expanded fixture and strict validation; record HTTP validator/compatibility decision with linked parent D11 describe completion.
- [x] 1.2 Replace endpoint scanner with off-thread broker reconciliation, classified metadata and encoded prefixed URLs; real HTTP tests prove fields, encoded roundtrip, existing files/modified compatibility and no Docker calls.
- [x] 1.3 Add bounded pagination and representation-safe conditional GET; tests prove two pages, stale/malformed cursor, limits, changed data, page/limit distinction, header syntax and authorization-before304.
- [x] 1.4 Map broker failures without path leaks/false success; tests prove corrupt index preservation and dependency-injected error classes.
- [x] 1.5 Wire describe to persisted current_revision with no scan/index creation; tests prove nonzero revision in running/stopped states, noindex0 and corrupt failure. Preserve lifecycle tests.
- [x] 1.6 Update existing server README/changelog for HTTP contract and one-release modified field; preserve preview.js for#17.

## 2. Acceptance

- [x] 2.1 Preserve targeted semantic RED/GREEN evidence; parent pinned Python3.12 non-Docker full tests excluding integration, structure check and real HTTP smoke of listing/conditional change.
- [x] 2.2 Expanded correctness/integration and security/test-evidence cross-review, bounded repair gate, CI and merge; archive fixture after implementation merge.

## Risk packs

Public API/schema/compatibility:1.2–1.3 files envelope, fields, validators and pagination. FileIO/partial failure/concurrency:1.2/1.4 shared broker authority and off-thread calls, no alternate scan. Auth/secrets:1.3–1.4 existing guard before validators and generic failures. Resource/discovery:1.3 configured broker limits, scan policy unchanged#68. State-machine integration:1.5 persisted describe authority with no lifecycle mutation. Documentation:1.1/1.6. No migration, dependency, deploy or runtime Docker pack; final Docker remains#36.

## Evidence

OCU PR10 merged at6757ec6; reviewed head10813d7bc96df8bd44353373be67ddaa3c30f275. Parent pinned suite638 passed/5 skipped; structure24; actual HTTP listing200, encoded download200, unchanged304, external sizechange200/revision2, oversized cursor400. Expanded round1 found an unasserted cursor boundary and oversized-integer500; one repair pass and fresh round2 closed both. Reports and raw command references: https://github.com/DankerMu/open-computer-use/pull/10#issuecomment-5794318226. No Docker acceptance.
