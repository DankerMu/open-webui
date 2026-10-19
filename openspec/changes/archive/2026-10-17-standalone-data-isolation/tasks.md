# Tasks

## 1. Qualify ownership and repair

- [x] 1.1 Parent freezes a private-process filesystem oracle and captures the cached-root semantic failure without touching `/data` or caller data; record baseline source, program hashes and exact observed paths.
- [x] 1.2 Implementer repairs the existing test-module ownership seam across all three reload paths; parent proves unchanged-oracle GREEN, metadata confined to the allocated root, and all original test assertions preserved.
- [x] 1.3 Exercise absent and caller-provided environment, preloaded cached `/data` and caller roots, plus assertion-failure teardown; prove saved environment/root restoration, private-root removal and caller canary preservation.

## 2. Compatibility and documentation

- [x] 2.1 Execute actual direct standalone module and canonical pytest selection without caller `BASE_DATA_DIR`; record selected/executed nodes and no new skips. Include adjacent CLI/lifecycle/output consumers using the existing canonical collection contract.
- [x] 2.2 After smoke proof, update existing OCU testing guidance/changelog; run scoped style checks where configured, WebUI doc/decision gates, strict fixture and changed Markdown formatting; record both repositories' commit hooks and verification limits.

## 3. Delivery

- [x] 3.1 Complete expanded three-seat review, adjudicate against the frozen oracle, run authorized exact-head scoped CI, merge paired PRs, archive the fixture and manually close319 with empty automatic closing sets.

## 4. Risk-pack mapping

- Public API / CLI / script entry: selected; direct unittest and pytest entrypoints, tasks1.1/2.1.
- File IO / path safety / overwrite: selected; private root, real metadata and unrelated canaries, tasks1.1-1.3.
- Config / project setup: selected; absent/inherited environment and import caching, tasks1.2-1.3.
- Schema / data format: not selected; production metadata format unchanged.
- Concurrency / shared state: selected; cached module identity/root restoration, tasks1.2-1.3.
- Error handling / recovery: selected; assertion/setup ownership cleanup, task1.3.
- Auth / permissions / security: not selected; no production authentication change; existing credential tests preserved in task2.1.
- Performance / resource use: selected; temporary-directory retirement, task1.3; no benchmark claim.
- Compatibility / downstream callers: selected; all original tests and adjacent consumers, task2.1.
- Build / packaging / dependency compatibility: not selected; no dependency/image changes.
- Documentation / migration notes: selected; existing testing guidance/changelog and explicit limits, task2.2.
