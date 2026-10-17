# Tasks

## 1. Status propagation

- [x] 1.1 Add one executable-boundary failing-pytest/passing-coverage regression and a focused Make target; parent observes a semantic RED before production edits.
- [x] 1.2 Preserve backend pytest status locally without changing unrelated pipeline semantics; parent observes GREEN then verifies exit0/1/2/5, coverage failure, frontend failure, advisory modified-only and no-scope cases, including continued reporting after failure.

## 2. Acceptance and delivery

- [x] 2.1 Parent runs actual pytest/coverage in an owned disposable repository: failed assertion with100% measured coverage makes real Make target fail; restored assertion succeeds. Preserve receipts and remove owned temporary data.
- [ ] 2.2 Add the testing decision, audit Make/CI sibling consumers unchanged, pass scoped lint/doc/decision checks and strict fixture validation, complete expanded review and exact-head scoped CI, then merge and archive.

## Risk coverage

- Script entry/config — selected: actual Make/script invocation and localized pipeline status handling; thresholds/discovery unchanged.
- Legacy compatibility — selected: pytest0/5, upstream advisory, frontend failure and no-scope matrix; independent Make/CI test step unchanged.
- Error handling/partial outputs — selected: pytest failures cannot be hidden by tail/report success, reporting continues, coverage errors remain fatal.
- Documentation — selected: one testing decision for gate exit semantics and no-tests tolerance.
- File IO/concurrency/resource limits — no new production allocation or parallelism; temporary test repositories and reports are test-owned and removed.
- Schema/auth/secrets/dependencies/release — no changed surface or version; out of scope.

Pre-change evidence: `/tmp/issue385-real-baseline.json` records real pytest failing an assertion with100% selected-module coverage while standalone Make exits0; restoring the assertion also exits0. The disposable repository was removed. `/tmp/issue385-permanent-red.json` records the permanent regression failing specifically at the final nonzero-exit assertion after its report-continuation check passed.

Post-change evidence: `/tmp/issue385-focused-green.json` records12 passing isolated cases; `/tmp/issue385-real-fixed.json` records the same real failing assertion and100% coverage returning Make2, followed by restored assertion/100% coverage returning0. Both report generation and owned temporary-repository removal were observed.

Durable receipt bundle: `docs/evidence/issue-385/verification.json.gz`. Scoped lint132files, documentation/54decision records, Ruff format and shell syntax checks passed. Exact-head independent review and CI are pending.
