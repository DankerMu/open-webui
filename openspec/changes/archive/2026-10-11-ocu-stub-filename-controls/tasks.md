# Tasks

## 1. Reviewed regression

- [x] 1.1 Expanded-fixture review and strict OpenSpec validation pass before implementation.
- [x] 1.2 Add real HTTP smoke assertions for decoded controls, unchanged state, raw-header integrity and supported disposition modes. Add leading/repeated/trailing-slash and dot/dot-dot traversal controls, including encoded forms, before control-character assertions; parent captures their baseline GREEN and the new semantic RED against unchanged upload code. A disposable missing-empty-component guard mutation must fail the traversal controls, with restored GREEN.

## 2. Boundary repair

- [x] 2.1 Extend only the existing filename guard; the frozen smoke passes for all controls, both GET modes, ordinary upload bytes/dispositions and existing traversal 400 behavior.
- [x] 2.2 Run scoped lint/format and applicable harness/backend checks, preserve reserved-name/Office/concurrency/isolation scenarios and existing 800-line source ceiling. Retain exact commands, exits and input hashes.
- [x] 2.3 After smoke, update owning docs; strict fixture/doc-gate/decisions-verify pass, three-seat review and approved local CI complete, then merge and archive.

## 3. Risk-pack map

- Selected — Public API/CLI/script entry:1.2/2.1 actual local HTTP and raw header bytes.
- Not selected — Config/project setup:no config/dependency change.
- Selected — File IO/path safety/overwrite:1.2/2.1 decoded controls rejected before publication, traversal preserved.
- Not selected — Schema/columns/units/field names:existing response shapes retained.
- Not selected — Auth/permissions/secrets:no production authorization change; synthetic local data only.
- Selected — Concurrency/shared state/ordering:1.2/2.1 unchanged full listing on rejection, existing lock and allocator unchanged.
- Not selected — Resource limits/large input/discovery:no new limit policy or unbounded work.
- Selected — Legacy compatibility/examples:2.1/2.2 inline/attachment, traversal 400 and prior harness scenarios.
- Selected — Error handling/rollback/partial outputs:1.2/2.1 rejects before any stored/listed result, subsequent GET 404.
- Not selected — Release/packaging/dependency compatibility:no image/dependency changes or deployment claim.
- Selected — Documentation/migration notes:2.3 documents the validation boundary without promising production parity.
