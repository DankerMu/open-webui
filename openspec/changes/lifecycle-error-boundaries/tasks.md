# Tasks

## 1. Lookup error slice

- [x] 1.1 Add a focused test module reusing existing engine/app fixtures; parent captures semantic lookup RED with source/test hashes and base identity, without mocking lifecycle services or response serializers.
- [x] 1.2 Normalize only get/create and describe lookup/reload through the existing request-lifecycle lookup mapping; focused GREEN covers typed status500/reason/cause, real MCP tool message and actual nested describe response. Preserve get-NotFound absence and do not turn reload failure into absence or creation.

## 2. Launch preparation and readiness slice

- [x] 2.1 Add targeted generic-DockerException cases at network preparation and restarting polling/final reload; parent records semantic RED at the correct operation ordinal, distinct from initial lookup failure.
- [x] 2.2 Add narrow preparation/readiness normalization and prove GREEN for supported existing launch states, paused migration precondition, late preparation partial effects without later start/delete, and no retirement after readiness failure.
- [x] 2.3 Preserve initial lookup500, network NotFound/APIError categories, existing409 incompatibility, restart timeout504, PR78 retirement409/order and unrelated lookup consumers; run existing lifecycle/network controls and audit unchanged consumer/raw-lookup boundaries.

## 3. Independent acceptance and delivery

- [x] 3.1 Parent runs actual service and MCP/HTTP consumer probes with isolated owned data and private synthetic credentials; record authorized normalized responses, unchanged authorization denial, source identity and full cleanup. Label injected failures and any missing-socket SDK probe separately from live-engine reproduction; archive complete probe source and output.
- [x] 3.2 Run the focused new module plus relevant existing lifecycle/network/MCP/route regression modules using documented uv/pytest commands; retain exact scope/counts and fixture restoration evidence. Do not claim full-root green or rerun known unrelated #444/#445 failures merely to confirm them.
- [x] 3.3 After smoke proof, update the existing lifecycle decision; WebUI doc-gate, decisions-verify, strict fixture validation, changed Markdown formatting and both repositories' commit hooks pass.
- [ ] 3.4 Complete expanded three-seat cross-review and exact-head authorized scoped CI; merge paired source/control-plane delivery, archive, and manually close #306 with automatic closing sets empty.

## 4. Risk-pack mapping

- Public API / CLI / script entry: selected; typed services, MCP text and actual HTTP envelope, tasks1.2/2.2/3.1.
- Config / project setup: not selected; no configuration contract changes; owned probe environment uses existing knobs.
- File IO / path safety / overwrite: not selected; no production file/path changes; owned probe cleanup is evidenced in3.1.
- Schema / columns / units / field names: not selected; existing lifecycle error schema and field names are reused, not replaced.
- Auth / permissions / secrets: selected; existing request guards remain ahead of lifecycle calls and private probe credentials stay out of evidence, task3.1 plus secret scans/hooks.
- Concurrency / shared state / ordering: selected; launch preparation, partial repair, migration and retirement order, tasks2.1–2.3; fixture/module ownership restoration in3.2.
- Resource limits / large input / discovery: not selected; no budget/discovery change; fresh-process probe lifetime bounded in3.1.
- Legacy compatibility / examples: selected; specific mappings, initial handler and unrelated raw callers preserved, task2.3.
- Error handling / rollback / partial outputs: selected; operation-specific normalization/cause and no new rollback/retry, tasks1.1–2.3.
- Release / packaging / dependency compatibility: not selected; no image, pin, dependency or deployment changes.
- Documentation / migration notes: selected; existing decision update and explicit no-migration rollback, task3.3.
