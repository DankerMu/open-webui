# Tasks

## 1. Contract and header branch

- [x] 1.1 Complete independent expanded fixture review and strict validation against the approved policy and current callback owner.
- [x] 1.2 Add a real-ASGI no-receive header regression; parent observes semantic RED, then implement header-first authentication in the existing owner and prove GREEN without changing the error envelope or fallback rules.

## 2. Streaming budget

- [x] 2.1 Add inclusive-limit and overflow boundary oracles; parent observes overflow semantic RED, then implement the fixed raw-byte streaming bound in the same owner and prove GREEN.
- [x] 2.2 Exercise exact limit, plus-one, multibyte counting, multi-chunk crossing, missing and forged-small Content-Length, no parsing or further receives after rejection, invalid/empty/whitespace/non-Bearer header precedence and unchanged state/files/downloads.
- [x] 2.3 Run actual local HTTP and ASGI runtime proof, existing DocumentServer callback/source/router/auth/processing/concurrency cases and source unit CI; retain fresh identity-bound results and stop all owned resources.

## 3. Delivery

- [ ] 3.1 After runtime proof update owning changelog and central decision, retain credential-safe evidence, run relevant static/docs/strict checks and complete correctness, test-evidence/spec-compliance and security-perf review.
- [ ] 3.2 Publish exact-head CI and pre-merge evidence; merge source/control PRs, close the central issue and archive this independent requirement through a docs PR.

## Risk packs

- Selected: Public API / CLI / script entry — 1.2/2.1/2.2 exact callback response and unchanged route.
- Not selected: Config / project setup — no new config; existing enable flag preserved by 2.3.
- Selected: File IO / path safety / overwrite — 2.2 snapshots prove rejected admission has no file changes; existing store remains owner.
- Not selected: Schema / columns / units / field names — no persisted schema; raw-byte units explicitly covered by Resource limits.
- Selected: Auth / permissions / secrets — 1.2/2.2 authoritative header, no fallback, sandbox-first; 3.1 no credentials in evidence.
- Selected: Concurrency / shared state / ordering — request-local budget, admission before processing; 2.3 existing concurrency suite. No new concurrency policy.
- Selected: Resource limits / large input / discovery — 2.1/2.2 inclusive raw-byte budget and early refusal under untrusted length.
- Selected: Legacy compatibility / examples — 2.3 existing real DocumentServer header/body fixtures and source tickets unchanged.
- Selected: Error handling / rollback / partial outputs — 2.2 exact 413, preserved 401, no downstream effects; revert-only rollback.
- Not selected: Release / packaging / dependency compatibility — no dependency/image/gateway or deployment change; no LAN certification.
- Selected: Documentation / migration notes — 3.1 owner-approved capacity policy recorded without rewriting historical Office contracts.
