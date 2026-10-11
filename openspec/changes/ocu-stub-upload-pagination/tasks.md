# Tasks

## 1. Contract and oracle

- [x] 1.1 Independent expanded-fixture review and strict OpenSpec validation pass before smoke edits.
- [x] 1.2 Add owned, main-process-only scenario configuration and both HTTP scenarios; `make smoke-stub` passes on the unchanged reference stub, preserving all prior checks and caller asset settings.
- [x] 1.3 Parent qualifies disposable missing-large-upload and suppressed-partial-503 mutants with semantic failures, then restored full GREEN; record exact source/smoke identities and owned cleanup.

## 2. Acceptance

- [x] 2.1 Verify stub/sibling modules remain byte-identical, scoped static/harness checks pass, and smoke fixture maps/processes are cleaned on success and failure.
- [ ] 2.2 After smoke proof, update owning documentation; strict fixture/doc-gate/decisions-verify pass. Seal command/output evidence, complete three-seat review and approved local CI, merge and archive.

## 3. Risk-pack map

- Selected — Public API/CLI/script entry:1.2/1.3 real HTTP through `make smoke-stub`.
- Selected — Config/project setup:1.2/2.1 scenario and default-asset settings are scoped to the main stub; preserve explicit asset input and Office environment.
- Selected — File IO/path safety/overwrite:1.2/1.3/2.1 owned temporary fixture-map cleanup; production file IO unchanged.
- Not selected — Schema/columns/units/field names:existing response schemas unchanged.
- Not selected — Auth/permissions/secrets:no authorization change; synthetic local uploads only.
- Selected — Concurrency/shared state/ordering:1.2/2.1 retain fixture ordering and existing isolated/concurrent smoke cases; no stub mutation.
- Selected — Resource limits/large input/discovery:1.2/1.3 explicitly cross the 100-row boundary with 101 fixture rows.
- Selected — Legacy compatibility/examples:1.2/2.1 ordinary and Office scenarios remain intact.
- Selected — Error handling/rollback/partial outputs:1.2/1.3 intentional 503 remains visible while accepted bytes remain readable.
- Not selected — Release/packaging/dependency compatibility:no dependency/image change or deployment certification.
- Selected — Documentation/migration notes:2.2 distinguishes retrieval from complete listing evidence at the existing owner.
