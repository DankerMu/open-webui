# Tasks

## 1. Pure display model

- [x] 1.1 Add one pure module and paired Vitest under chat components with the issue's folder/file row shapes and kind union. Verify literal expected rows for empty/root/one-folder/two-folders-plus-root/three-level/same-name/case-distinct/leading-or-doubled-slash inputs, immutable inputs and preserved file identity. A second-page test proves earlier files remain and counts increase, without assuming unchanged positions after sorting.
- [x] 1.2 Verify every kind through type and MIME inputs, MIME parameters, case normalization and unknown/empty values. No filename-derived eligibility, alternate size formatter or Svelte/DOM/store import; document exported names and any type/MIME precedence choice in the PR.

## 2. Acceptance

- [x] 2.1 Capture a meaningful pre-implementation failure at a callable grouping/classifier boundary, then green behavior tests and at least80% per-file coverage. Run scoped lint/typecheck/anti-drift and strict OpenSpec/doc gates; no assertion-free coverage or test-discovery changes. Known #219 local user-owned .run copies are untouched; exact-head clean CI supplies full make test-frontend/coverage-gate proof.
- [x] 2.2 Run the actual exported module from a disposable Node/Vite invocation using nested files and appended pages; observe literal output/identity/kind assertions. No UI is added or claimed; browser evidence belongs to #181. Record commands/exits, review and CI; remove owned scratch script after evidence is retained.

## Risk Coverage

- API/schema/field names:1.1/1.2 assert discriminated folder/file rows and seven-kind contract consumed by #181/#182; no callers in this slice is intentional.
- Ordering/partial outputs:1.1 tests stable identities, deterministic folder/file order and loaded-only counts as another page arrives; no server-order mutation or completeness claim.
- Compatibility:1.1 preserves original file records and input array;1.2 cannot alter preview/edit eligibility. Existing workspace modules remain unchanged.
- Errors/boundaries:1.1 empty paths/lists and redundant separators;1.2 unknown/empty values yield other.
- Documentation:fixture records the issue's public contract;2.1 validates it. This isolated helper implements prescribed rules and creates no new architecture policy.
- Config, filesystem/path authorization, auth/secrets, shared-state concurrency, quotas and dependencies: not selected; no relevant side effects. Path normalization here is display-only, never a security validator.
