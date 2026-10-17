# Tasks

## 1. Release regression and fix

- [x] 1.1 Add one deterministic unlock-only regression to the existing lifecycle-lock test module; parent records source/test hashes and base identity with semantic RED at the real owner boundary, before production edits.
- [x] 1.2 Put owned handle retirement on unconditional outer release while preserving explicit unlock order, depth and RLock cleanup; the regression passes and same-chat plus another-thread acquisition succeeds without sleep.
- [x] 1.3 Cover close-only and unlock-plus-close failures using real retirement followed by injected close error; assert visible errors/chaining, cleared owner/depth and no explicit close retry. Existing nested/non-creating/process tests remain intact.

## 2. Independent verification and delivery

- [x] 2.1 Parent real-descriptor probe demonstrates child-process exclusion during outer/nested ownership, persistence after inner exit, release after failed unlock plus successful close, and immediate same-chat reuse; retain machine-readable output and exact temporary-resource cleanup.
- [x] 2.2 Run the owning lifecycle-lock module and adjacent lifecycle/Office lookup admission modules with documented uv/pytest command; record exit codes/counts, source non-growth and no production changes outside the release method.
- [x] 2.3 After runtime proof, update the existing lifecycle decision record's release contract and formerly deferred #382 paragraph; WebUI doc-gate, decisions-verify and strict fixture validation pass; OCU commit hooks pass.
- [ ] 2.4 Complete three-seat expanded review, exact-head authorized scoped CI and paired OCU/WebUI merge; archive the fixture and manually close the source issue after both deliveries, with automatic closing sets empty.

## 3. Risk-pack mapping

- Public API / CLI / script entry: not selected; private owner release only, no entrypoint or signature changes.
- Config / project setup: not selected; no configuration changes.
- File IO / path safety / overwrite: selected; real FD retirement and canonical lock inode, tasks1.1–1.3 and2.1; path acquisition unchanged.
- Schema / columns / units / field names: not selected; no persisted schema changes.
- Auth / permissions / secrets: not selected; lock resource ownership, not authorization policy; no deployment secrets used.
- Concurrency / shared state / ordering: selected; nested depth, thread admission and child-process exclusion, tasks1.2 and2.1–2.2.
- Resource limits / large input / discovery: not selected; no limits/discovery changes; descriptor lifetime covered by File IO.
- Legacy compatibility / examples: selected; existing nested/non-creating/process semantics, tasks1.2 and2.2.
- Error handling / rollback / partial outputs: selected; unlock/close visibility and chaining, tasks1.1–1.3; rollback is focused revert.
- Release / packaging / dependency compatibility: not selected; no dependency/image/package changes.
- Documentation / migration notes: selected; existing decision update and no-migration boundary, task2.3.
