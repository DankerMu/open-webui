# Tasks

## 1. Inventory and narrow workflow change

- [x] 1.1 Parent freezes the current workflow and complete node inventory for both root modules; demonstrate that current scheduled pytest collection omits them without claiming a runtime failure.
- [x] 1.2 Implementer adds one separate complete-module pytest invocation to the existing non-image job; parent verifies candidate discovery equals the exact required inventory and existing trigger/job/integration/dependency selections remain intact.

## 2. Executable pipeline evidence

- [x] 2.1 Parent executes the actual extracted command with available declared runtime/dependencies; every root-module node executes and passes with no hidden skips, and stdout/exit/environment/source hashes are retained.
- [x] 2.2 Inject one controlled pytest failure in each module using a temporary plugin, without changing tracked tests; the same workflow command must exit nonzero and fail-fast shell must not reach a success marker. Preserve both failing logs and remove probe-owned resources.
- [x] 2.3 After execution proof, update existing testing guidance/changelog; validate workflow structure, strict fixture, companion doc/decision gates, changed Markdown formatting and commit hooks. Explicitly flag CI-file modification and local/hosted evidence boundaries.

## 3. Delivery

- [ ] 3.1 Complete expanded cross-review and exact-head authorized scoped CI; merge paired PRs, archive and manually close339 with empty automatic closing sets and no new issue199 acceptance dependency.

## 4. Risk-pack mapping

- Public API / CLI / script entry: selected; actual extracted pytest command and fail-fast shell, tasks1.1-2.2.
- File IO / path safety / overwrite: not selected for production change; temporary verifier files are parent-owned and retired, task2.2.
- Config / project setup: selected; main events, existing job and separate selections, tasks1.2/2.3.
- Schema / data format: not selected; no persisted schema change.
- Concurrency / shared state: not selected; no runtime/test fixture changes or new concurrency.
- Error handling / recovery: selected; both module failures propagate, task2.2.
- Auth / permissions / security: not selected; no token/permission changes, unchanged workflow credentials checked in task1.2.
- Performance / resource use: not selected; only the two complete modules added, no benchmark claim or image build.
- Compatibility / downstream callers: selected; existing jobs, integration and issue199 independence, task1.2.
- Build / packaging / dependency compatibility: selected; use unchanged installed server/test dependencies and identify runtime, tasks2.1/2.3.
- Documentation / migration notes: selected; existing guide/changelog, task2.3; no runtime migration.
