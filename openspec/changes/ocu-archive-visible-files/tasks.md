## 1. Contract and regression

- [x] 1.1 Independent expanded fixture review and strict validation pass; record current private staging and the archive's separate hidden-entry leak.
- [x] 1.2 Add owning ZIP-membership tests before the filter; parent captures semantic RED with hidden open/stale files and a hidden ancestor, while visible-file/header compatibility remains evidenced.

## 2. Reader-only implementation and proof

- [x] 2.1 Filter dot-prefixed output-relative components at archive membership selection; verify exact ZIP names/full bytes, unchanged hidden source entries and hidden-only404. Keep upload/claim, broker and response-header code unchanged.
- [x] 2.2 Prove actual first/colliding uploads remain archivable with distinct complete payloads, actual stored names and cleanup/receipts intact; run owning file-header/archive/upload suites and HTTP auth coverage.
- [x] 2.3 Run disposable real TCP HTTP upload/archive smoke: visible payloads present, hidden residue/ancestors absent and retained on disk, hidden-only404; stop owned server and remove disposable files.

## 3. Documentation and delivery

- [x] 3.1 After runtime proof, update source changelog and existing workspace-files decision; central docs/decision/strict-spec/changed-format checks pass.
- [ ] 3.2 Expanded correctness, test-evidence/spec-compliance and integration review close at the exact source head; publish scoped local CI and complete reports.
- [ ] 3.3 Merge paired source/fixture, close the issue and archive the capability after every acceptance criterion is evidenced.

## Risk packs

Selected: public API — ZIP membership,404 and unchanged headers/auth (2.1–2.3); file IO — hidden leaves/ancestors and untouched source entries (1.2,2.1); legacy compatibility — visible nested files and actual completed/colliding uploads (2.1–2.2); error handling — existing missing/empty behavior including hidden-only output (2.1,2.3); documentation — owning ADR/changelog (3.1).

Not selected: auth/secrets — no policy change, existing authorization suite remains regression evidence; concurrency/shared state — no writer/claim mutation or snapshot-isolation promise; resource limits — existing traversal/in-memory ZIP bounds unchanged, no performance claim; schema/config/dependencies/release — no such changes. Symlink/race containment redesign, stale-temp cleanup and cache headers remain explicit non-goals.
