# Tasks

## 1. Authoritative response contract

- [x] 1.1 Extend existing route tests before source changes: PUT→independent describe, latest-write/null selection, answered/unreachable/no-row, conflicting upstream prefs and denied/error responses. Parent runs the owning route module and records semantic RED from missing prefs, not setup failure.
- [x] 1.2 Add prefs through the existing answered cursor-row return and unreachable lookup; parent reruns route tests GREEN and verifies no extra query, no prefs mutation or implicit launch, and unchanged401/403/404/502 matrix.

## 2. Integrated assurance

- [x] 2.1 Parent runs make test-backend (or its selected existing module), lint-scoped, coverage-gate and smoke; qualifies local-authority assertion against a disposable wrong-prefs mutant and restores GREEN. No Docker or dependency changes.
- [x] 2.2 Update scoped contract and owning decision documentation, run strict OpenSpec/doc/decision checks, obtain correctness/test-evidence+spec/invariant-state review and exact-source CI, then prepare archive and nested-prefs handoff for the gated PR merge.

Risk mapping: API/schema→1.1/1.2; authorization/isolation→1.1/1.2; persistence/error semantics→1.1/1.2/2.1; delivery/consumer contract→2.2. Leaves skip every test/build/lint/format/runtime command; parent owns execution.
