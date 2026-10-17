# Tasks

## 1. Writer outcomes and precedence

- [x] 1.1 Add one public broker close-after-sync regression; parent captures a semantic RED with source/test hashes, frozen oracle, complete successor and actual descriptor retirement observations before implementation.
- [x] 1.2 Implement shared strict final-directory cleanup and broker outcome classification; parent proves unchanged-oracle GREEN, primary write/replace/fsync preservation, all close attempts and retained secondary errors without changing temporary-file-close policy.
- [x] 1.3 Add the receipt close/replay tracer, capture RED, implement its writer and upload mapping, then prove GREEN: exact committed receipt/file, HTTP500 committed resource, same-id retry metadata and no second file; preserve existing pre-receipt-failure retry behavior.
- [x] 1.4 Add the Office close/blob tracer, capture RED, implement writer and postcommit-sensitive consumers, then prove GREEN: all four final directories attempted, complete successor and exact referenced blob retained, no `state_corrupt`/`storage_low` for close-only failures, unchanged `state_durability` for directory-fsync failures.

## 2. Consumer preservation and runtime proof

- [x] 2.1 Exercise single/multiple final-close failures with earlier write, replace, ancestor-sync and leaf-sync failures, including original cause preservation; assert predecessor/successor bytes and primary/secondary identities before emergency test cleanup. Explicitly distinguish receipt stages with no final directory acquired.
- [x] 2.2 Audit every affected broker/upload/Office consumer, including versions, callback persist/replay, sessions, history, restore, resolution, publication retirement and save-as recovery; exercise representative genuine transactions through HTTP and recovery, preserving blob ownership, journal responsibility and no extra publication/revision on replay.
- [x] 2.3 Parent runs private actual loopback HTTP/real-filesystem smoke for upload/retry, output listing and authenticated Office callback/browser outcomes, plus direct fault precedence/FD observations; retain probe/source/fixture hashes, response/state evidence and owned server/data cleanup. No live Docker, LAN or power-loss claim.
- [x] 2.4 Run the focused writer/descriptor/upload and affected Office/broker regression modules using canonical `tests/ --import-mode=importlib --ignore=tests/integration` discovery; record selected/deselected counts and genuine skips, without rerunning known unrelated root failures or weakening existing oracles.

## 3. Contracts and delivery

- [x] 3.1 After smoke proof, update existing unified-files and Office-file-store decisions and OCU error-contract docs/changelog; run strict fixture, doc-gate, decisions-verify, changed Markdown formatting and both repositories' commit hooks with content-bound receipts.
- [ ] 3.2 Complete expanded three-seat review and exact-head authorized scoped CI; retain evidence and limits, merge paired source/control-plane PRs, archive the fixture and manually close issue365 with empty automatic closing sets.

## 4. Risk-pack mapping

- Public API / CLI / script entry: selected; accurate HTTP500 reason/committed/resource within existing envelopes, tasks1.3/1.4/2.2/2.3.
- Config / project setup: not selected; no production configuration change, private test environments covered by2.3.
- File IO / path safety / overwrite: selected; complete successor/predecessor, all owned final-directory attempts and borrowed-fd protection, tasks1.1–1.4/2.1.
- Schema / columns / units / field names: selected; additive error detail only, resource-scoped commit meaning and unchanged persisted schema, tasks1.3/1.4/2.2.
- Auth / permissions / secrets: selected; preserve refusal before mutation, no host paths/error text in public responses and synthetic private probe credentials, tasks2.2/2.3.
- Concurrency / shared state / ordering: selected; primary precedence, committed state and shared-lock/fence/recovery obligations, tasks1.2/1.4/2.1/2.2.
- Resource limits / large input / discovery: not selected; no traversal, capacity or discovery change; one close attempt per already-owned final directory only.
- Legacy compatibility / examples: selected; same-id receipts, fsync classification, precommit blob cleanup and recovery replay, tasks1.3/1.4/2.2/2.4.
- Error handling / rollback / partial outputs: selected; scoped commit outcome, original error/cause retention and no partial or deleted committed authority, tasks1.1–2.3.
- Release / packaging / dependency compatibility: not selected; no runtime dependency/image/pin/deployment change.
- Documentation / migration notes: selected; error contract and explicit close/power-loss limits, task3.1.
