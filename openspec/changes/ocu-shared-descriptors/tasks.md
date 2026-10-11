# Tasks

## 1. Reviewed equivalence baseline

- [x] 1.1 Independent expanded-fixture review and `openspec validate ocu-shared-descriptors --strict --no-interactive` pass before production edits.
- [x] 1.2 Parent captures frozen caller behavior and owning consumer GREEN before extraction; real temporary directory/file/symlink/special/missing cases plus injected open/fstat failure distinguish stage/context, messages/classes/status/errno, borrowed-root survival and owned cleanup. Qualify each caller's containment oracle with a disposable unsafe mutation, semantic rejection and restored GREEN.
- [x] 1.3 Author paired shared-module behavioral tests before its production implementation; verify meaningful containment/type/cleanup boundaries, not symbol wiring or copied constants. Missing-symbol setup is not semantic RED evidence.

## 2. Atomic primitive reuse

- [x] 2.1 Both uploads and broker use the single common flags/classifiers/read-directory/regular-file acquisition implementation; remove duplicates and retain caller error wrappers. Exact observation comparison against1.2 shows no caller-contract difference, including open versus fstat failures and scan versus registration resource errors.
- [x] 2.2 Preserve local staging/write behavior and existing higher-level consumers; owning upload/MCP/broker/outputs tests, file/archive response and descriptor lifecycle tests, and every modified test-fixture owner pass under Python3.12/current requirements. New module meets per-file coverage floor; new-file Ruff passes. The modified broker test retains one pre-existing F841, independently confirmed against the base without suppression.

## 3. Acceptance and closure

- [x] 3.1 Independent actual HTTP smoke with only temporary benign fixtures verifies upload no-replace/receipts, single-file/archive containment and broker listing/error behavior; isolated declared-COPY app import passes. Record input/source/toolchain identities and remove owned services/trees. No image/LAN certification.
- [ ] 3.2 After smoke, update source changelog/docs and the owning decision; central strict fixture/doc-gate/decisions-verify pass. Complete three-seat review, approved local CI on frozen paired heads, merge, close issue and archive fixture.

## 4. Risk-pack map

- Selected — Public API:1.2/2.1/2.2/3.1 preserve existing error/body/header contracts.
- Not selected — Config/project setup:no new config or dependency policy.
- Selected — File IO/path safety/overwrite:1.2/1.3/2.1 prove no-follow/type checks and ownership; publication unchanged.
- Not selected — Schema/columns/units/field names:no schema change; existing identity/receipt fields verified by consumers.
- Selected — Auth/permissions/secrets:1.2/3.1 use only benign canaries and preserve authorization/containment.
- Selected — Concurrency/shared state/ordering:2.2 retains swap and cancellation regressions; no new synchronization policy.
- Selected — Resource limits/large input/discovery:1.2/2.1/2.2 retain descriptor cleanup and scan ceilings/error mapping, without widening bounds.
- Selected — Legacy compatibility/examples:all equivalence gates preserve accepted caller semantics; archive/file routes remain unchanged consumers, not new implementation work.
- Selected — Error handling/rollback/partial outputs:1.2/2.1/2.2 preserve stage-specific errors and predecessor authority.
- Selected — Release/packaging/dependency compatibility:3.1 includes new module COPY closure; dependency versions unchanged, image validation excluded.
- Selected — Documentation/migration notes:3.2 records shared ownership without duplicating caller business policy.
