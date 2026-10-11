# Tasks

## 1. Diagnosis and fixture

- [x] 1.1 Retain exact canonical ordered/alone/reversed collection and execution results with immediate pre-GET module/root/class identities; ordered escapes the mismatched class, alone/reversed return500 from the stale root. Diagnosis is recorded on issue341; do not claim the latter controls passed.
- [x] 1.2 Independently review this expanded fixture and pass strict OpenSpec validation before implementation; verify the existing isolation helper is the sole module/environment lifetime owner.

## 2. Fixture repair

- [x] 2.1 Reuse the canonical isolated-app context in the existing security fixture; bind client and seeded files to its single root and real auth/client. Prove the same ordered/alone/reversed probes now return200 with coherent recovery/app roots and exception classes; preserve every test body/assertion.
- [x] 2.2 Prove client closure and restoration of prior module objects plus complete environment after normal completion and an intentional post-request assertion using a disposable probe. Retain the intentional nonzero result and safe identity/equality observations; no environment values or credentials in evidence.

## 3. Compatibility and closure

- [x] 3.1 Collect from canonical `tests/` using an exact file-selection expression for the security app and outputs endpoint modules, then execute that selection with Python3.12, unchanged server requirements, pytest/pytest-asyncio and importlib mode. Record nodes, counts, skips and exit; no production changes, skips or weakened assertions.
- [x] 3.2 Update source changelog and owning test-isolation rationale after runtime proof; retain baseline and repaired evidence, run source structure/English gates and central doc-gate/decisions/strict fixture checks. Independent expanded review, paired merge and archive complete this prerequisite; #199 still requires its integrated full non-image run.

## 4. Risk-pack map

- Selected — Public API: 2.1/3.1 exercise the real outputs, upload/download/archive and retired-route requests.
- Not selected — Config/project setup: no production configuration, dependencies or collection routing changes; fixture environment lifetime is covered by2.2.
- Selected — File IO/path safety/overwrite: 2.1/3.1 retain real temporary output bytes, traversal and unknown-directory assertions.
- Not selected — Schema/columns/units/field names: no persisted or wire changes.
- Selected — Auth/permissions/secrets: 2.1/3.1 retain real middleware and missing-token assertions;2.2 keeps captured evidence free of values/credentials.
- Selected — Concurrency/shared state/ordering: 2.1/2.2 cover module-graph coherence and serial process-global teardown.
- Not selected — Resource limits/large input/discovery: no new worker, scan or resource policy; client lifetime belongs to2.2.
- Selected — Legacy compatibility/examples: 3.1 exercises existing security and outputs assertions without contract changes.
- Selected — Error handling/rollback/partial outputs: 2.2 qualifies assertion-failure teardown; test-only revert is the rollback.
- Not selected — Release/packaging/dependency compatibility: no image or deployment work.
- Selected — Documentation/migration notes: 3.2 records the single isolation owner and exact evidence limits.
