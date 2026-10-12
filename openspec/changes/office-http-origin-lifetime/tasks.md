# Tasks

## 1. Fixture and semantic RED

- [x] 1.1 Obtain independent expanded fixture pass and strict validation; retain the real-HTTP stop-before-handler-completion counterexample and source identity.
- [x] 1.2 Add one responder-error attribution regression using the existing command origin; parent records original-source semantic RED without implementation changes.

## 2. Owned handler cutover

- [x] 2.1 Implement one bounded test-local socket/worker/error owner and migrate all four Office origin families, including the encoding subclass; parent proves the first regression GREEN.
- [x] 2.2 Migrate held-response release/error ownership and remove obsolete collectors; test success, timeout, admitted cancellation, body failure, keep-alive/partial input, expected disconnect classification, combined failures and partial startup cleanup.
- [x] 2.3 Qualify missing-drain and lost-error faults in disposable copies, restore GREEN, and independently exercise actual HTTP worker/socket/error outcomes with input hashes and bounded emergency cleanup.
- [x] 2.4 Run the complete Office origin and consumer suites under canonical collection, preserving existing command/router/save-close/state/concurrency/secrecy assertions; retain exact collection, results and unchanged production identities.
- [x] 2.5 Update source changelog and central testing decision after runtime proof; retain scoped lint/docs/strict checks, hashes, raw commands and secret scans.

## 3. Integration

- [ ] 3.1 Complete expanded cross-review and any bounded fix pass, authorized local CI, source/control-plane PR merges, issue closure and fixture archive.

## Risk packs

- Selected: Public API / CLI / script entry — 1.2/2.4 exercise existing fixture factories through canonical pytest collection; no production API changes.
- Not selected: Config / project setup — no dependency, runtime configuration or collection-policy changes.
- Selected: File IO / path safety / overwrite — 2.1/2.2/2.3 cover owned socket closure and partial startup; no workspace-file mutation.
- Not selected: Schema / columns / units / field names — no application schema or recorded-request shape changes.
- Not selected: Auth / permissions / secrets — no policy change; existing synthetic-secret assertions remain required by2.4.
- Selected: Concurrency / shared state / ordering — 2.1/2.2/2.3 cover admission vs teardown, held responders and error completion before context exit.
- Selected: Resource limits / large input / discovery — 2.2/2.3 bound teardown and cover keep-alive/partial request I/O; no discovery expansion.
- Selected: Legacy compatibility / examples — 2.4 preserves all four origin response contracts and existing consumers.
- Selected: Error handling / rollback / partial outputs — 1.2/2.2/2.3 retain handler/body failures and reject incomplete cleanup without masking or retries.
- Not selected: Release / packaging / dependency compatibility — test-only cutover; no image, deployment or dependency change.
- Selected: Documentation / migration notes — 2.5 central decision and source changelog;3.1 canonical spec archive.
