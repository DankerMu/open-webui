# Tasks

## 1. Per-file enforcement

- [x] 1.1 Extend the existing executable-boundary fixture with one aggregate-passes/low-file-fails regression accepting both report shapes; parent observes semantic RED against the unchanged gate and a real Coverage.py baseline.
- [x] 1.2 Evaluate each selected added Python file with the configured threshold in the owning shell; parent verifies mixed60/100failure in both orders, exact80/100success, continued reporting/error handling and the existing12status cases through `make test-coverage-gate`.

## 2. Acceptance and delivery

- [x] 2.1 Parent executes real Make/pytest/Coverage.py7.16.1 against disposable equal-sized modules: measure60/100with80aggregate and require gatefailure; measure80/100and require success; record and remove owned resources.
- [ ] 2.2 Document the per-file reporting decision, audit thresholds/discovery/Make/CI/advisory/frontend/status contracts unchanged, pass scoped lint/doc/decision and strict fixture checks, complete expanded review/exact-head scoped CI, merge and archive.

## Risk coverage

- Script entry/config — selected: real public Make target; existing configured threshold/source selection preserved.
- Legacy compatibility — selected: existing status matrix, exact threshold, no-scope, advisory and frontend semantics.
- Error handling/partial outputs — selected: low/report-error remains fatal, all remaining reports run and failure state survives iteration.
- Documentation — selected: separate per-file policy decision references status owner; no policy supersession.
- File IO/resource limits — no new production temporary outputs; existing Coverage.py database reader reused. Additional report processes bounded by selected file count; no pytest repetition.
- Concurrency/schema/auth/secrets/dependencies/release — unchanged and not selected. No #295 coverage allegation or implementation change.

Baseline: `/tmp/issue410-real-baseline.json` records real equal-sized files at60/100, aggregate80, Make0 in both orders; exact80/100 also succeeds. `/tmp/issue410-permanent-red.json` records1failed/12passed: the added regression reaches valid aggregate80 coverage and fails only its expected nonzero gate assertion.

Post-change: `/tmp/issue410-focused-green.json` records17passing cases. `/tmp/issue410-real-fixed.json` records measured60/100with80aggregate returning Make2 in both orders, and exact80/100 returning Make0; all owned temporary repositories were removed.

Durable bundle: `docs/evidence/issue-410/verification.json.gz`. Actual current-repository `make coverage-gate` also passed:546backend tests,499frontend tests, all5selected added Python files individually above the80% floor; upstream main.py remains advisory. The run used an owned static directory with checked-in assets, removed afterward, and no discovery/tool adapter. Scoped lint132files, docs/55decision records, shell syntax and repaired formatting checks passed. Independent review and exact-head CI remain pending.
