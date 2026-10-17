# Tasks

## 1. Shared cleanup correction

- [x] 1.1 Add one parameterized real Smoke/BrowserHarness interruption regression with owned scratch and sentinel observations; parent freezes the oracle and captures semantic RED before source changes.
- [x] 1.2 Nest the existing finalizer stages so owned-data `KeyboardInterrupt` preserves sentinel/scratch attempts and propagates; parent proves unchanged-oracle GREEN, same exception identity and ordinary error/status compatibility.
- [ ] 1.3 Add meaningful sentinel `Fail`/ordinary-exception and scratch `OSError` controls after interruption; verify scratch is attempted even after sentinel failure, original interruption survives ordinary finalizer errors and no failed removal is claimed successful.

## 2. Independent runtime and regression

- [x] 2.1 Parent executes a private child-process signal matrix for SIGINT/SIGTERM/SIGHUP through both actual harness classes, with readiness at owned-data cleanup, actual sentinel observation, scratch removal, nonzero exit and unrelated-state preservation; archive program/input hashes and resource retirement.
- [ ] 2.2 Run affected cleanup and adjacent support regressions plus diff-sized lint/coverage and document checks; retain existing ordinary HTTP/transport cleanup matrix and0/1/130 results without weakening oracles.

## 3. Contract and delivery

- [ ] 3.1 After runtime proof, update the existing paired-smoke decision with the interruption boundary and limits; verify strict fixture, doc-gate, decisions-verify, changed Markdown formatting and commit hooks.
- [ ] 3.2 Complete expanded three-seat review, authorized exact-head scoped CI, merge, archive and manual issue294 closure with empty automatic closing sets.

## 4. Risk-pack mapping

- Public API / CLI / script entry: selected; both actual harness classes and lifecycle signal results, tasks1.1/2.1.
- Config / project setup: not selected; no production configuration change; private fixture setup belongs to2.1.
- File IO / path safety / overwrite: selected; owned scratch deletion and unchanged unrelated data, tasks1.1/1.3/2.1.
- Schema / columns / units / field names: not selected; no public or persisted schema change.
- Auth / permissions / secrets: selected; private scratch may contain synthetic credentials, existing redaction and sentinel authority preserved, tasks1.1/1.3/2.1.
- Concurrency / shared state / ordering: selected; data→sentinel→scratch order under a single interruption; no repeated-signal shielding, tasks1.2/2.1.
- Resource limits / large input / discovery: not selected; no capacity/discovery change; process cleanup policy remains untouched.
- Legacy compatibility / examples: selected; existing status precedence and ordinary cleanup aggregation, tasks1.2/2.2.
- Error handling / rollback / partial outputs: selected; original interrupt propagation after ordinary finalizer failure, tasks1.1–1.3/2.1.
- Release / packaging / dependency compatibility: not selected; no dependency/image/pin/deployment change.
- Documentation / migration notes: selected; existing decision's guarantee and non-goals, task3.1.
