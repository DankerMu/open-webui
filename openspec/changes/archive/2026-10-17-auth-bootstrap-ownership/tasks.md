# Tasks

## 1. Regression and implementation

- [x] 1.1 Add an actual-root browser regression using a real harness login and injected auth-fetch transport failure; parent records semantic RED showing token deletion, not an import or timing failure.
- [x] 1.2 Implement root-owned bootstrap and authenticated-fetch confirmation lifetime guards; focused deferred-promise tests cover transport, AbortError, non-401 HTTP/parse failure, successful adoption, confirmed401, failed confirmation, replacement token, same-token replacement user, document retirement/restoration and wrapper cleanup ownership.
- [x] 1.3 Integrate root unverified-session rendering and guarded post-success effects; browser proves preserved token, no login/authenticated slot, manual recovery, real backend401 clearing, delayed stale results and document replacement. Assert subsequent requests still use the replacement identity.
- [x] 1.4 Audit all eight helper invocations across root, Account, UserMenu, auth route and both MessageInput components; unchanged error contract and existing expiry/filtering behavior are covered by focused tests and read-only review.

## 2. Parent verification and delivery

- [x] 2.1 Run focused tests, make test-frontend, make typecheck, make lint-scoped and per-file frontend coverage for the added module; preserve fresh output and root non-growth evidence.
- [x] 2.2 Run make verify-ui and make smoke against owned local harness resources; retain screenshots, narrowly classified intentional auth-failure diagnostics, zero unexpected page/console errors, and exact runtime cleanup evidence. No LAN deployment or real-user secrets.
- [x] 2.3 After runtime proof, add a decision record explaining root-only classification and ownership; make doc-gate, make decisions-verify, formatter checks and strict OpenSpec validation pass.
- [x] 2.4 Cross-review with correctness, test-evidence+spec-compliance and invariant-state seats; retain adjudication, exact-head authorized scoped-CI evidence, merge then archive without automatic issue-closing references.

## 3. Risk-pack mapping

- Public API / CLI / script entry: selected; shared root and fetch wrapper, tasks1.2–1.4 and2.2.
- Config / project setup: not selected; no configuration contract change.
- File IO / path safety / overwrite: not selected; no production filesystem operations.
- Schema / columns / units / field names: not selected; no payload/schema changes.
- Auth / permissions / secrets: selected; real401, no fabricated user, private synthetic credentials, tasks1.1–1.3 and2.2.
- Concurrency / shared state / ordering: selected; delayed success/failure/401 and document/token/user replacement, tasks1.2–1.3.
- Resource limits / large input / discovery: not selected; no discovery or input budget changes; new lifecycle ownership covered under concurrency.
- Legacy compatibility / examples: selected; preserve shared helper consumers and expiry/filtering, task1.4.
- Error handling / rollback / partial outputs: selected; unverified UI/manual recovery and failed recheck, tasks1.1–1.3; rollback is focused revert.
- Release / packaging / dependency compatibility: not selected; no dependency, packaging or release-policy changes.
- Documentation / migration notes: selected; decision record and explicit no-migration boundary, task2.3.
