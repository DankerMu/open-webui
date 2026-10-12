# Tasks

## 1. Diagnosis and contract

- [x] 1.1 Retain command-specific lookup/forcesave semantic RED, the observed executor-shutdown stack and same-client owned-loop diagnostic controls; distinguish the shortened diagnostic budget from production acceptance.
- [x] 1.2 Obtain independent expanded fixture PASS and strict validation before implementation.

## 2. Bounded command ownership

- [x] 2.1 Add actual-caller held-resolver regressions before the fix; parent records semantic RED for join/reopen, close, sweep and save, with real resolver entry, preserved expected outcomes and bounded test cleanup.
- [x] 2.2 Implement one bounded service-loop command bridge and migrate all four production command sites plus their request/reaper/direct-test callers, explicitly including `restore_version` → `_restore_version` → `_reopen_session` and restore's Starlette worker dispatch; verify corresponding unreachable outcomes, submission cancellation, unavailable-loop coroutine disposal and unchanged async protocol validation.
- [x] 2.3 Prove unchanged10s-budget GREEN for both command kinds and all four application callers, starting the clock before submission/enclosing operation with the existing150ms scheduling allowance; responses and lookup-lock release must precede held resolver release/return. Save's lock must be available while forcesave is pending, and every distinct state/content invariant must hold.
- [x] 2.4 Preserve healthy commands with a one-worker default resolver executor using real caller paths, including history restore reaching real DNS and known-key409 `session_open` with unchanged persisted bytes; qualify against a disposable waiter-on-resolver-executor regression. Retain existing restore admission/state, async command cancellation and callback DNS/executor assertions.
- [x] 2.5 Retain semantic RED for the induced-callback admission cycle with one available AnyIO worker: authenticated callback completes HTTP200/error0 while the accepted forcesave response is withheld and save has not reported acceptance; the responder then sends its accepted response; save subsequently returns its existing HTTP202 with preserved sequence/state. Preserve the existing lock and command/state oracles.
- [x] 2.6 Add the paired-tested lifespan-owned save executor and pre-started shutdown supervisor; prove normal startup/close, controlled startup/body failure, admission withdrawal before teardown awaits, and no pool fallback or surviving owned thread.
- [x] 2.7 Prove original save cancellation/context behavior: a cancelled running request leaves its admitted command and outcome-specific reconciliation owned; a cancelled queued request issues no allocation/command when cancellation wins before start; request contexts remain isolated through worker and loop submission.
- [x] 2.8 Prove teardown drains actual workers after request cancellation while the service loop progresses and both shared worker domains are occupied; repeated asyncio and AnyIO cancellation cannot abandon cleanup, and cancellation propagates only after the supervisor is joined.

## 3. Verification and delivery

- [x] 3.1 Execute canonical selected Office (including affected restore and save-worker consumers), app/HTTP-origin/lifecycle-lock and server-package consumers with exact discovered/executed scope, scoped lint, at least80% line coverage of the new save-worker module, and real HTTP runtime fault probes. Run targeted lifetime/cancellation cases on available Python3.12 and Python3.13; bind final source/probe/environment identities and retain every failure/cleanup result without full-suite or cross-platform overclaims.
- [x] 3.2 After runtime proof, update source documentation/changelog and the central owning decision, retain durable reviewed/scanned evidence, and pass central documentation, decision, strict-spec and formatter gates.
- [x] 3.3 Complete correctness, test-evidence/spec-compliance and invariant-state review; exact-head CI and intended closing-set checks; source/control merge and fixture archive.

## Risk packs

| Pack                                           | Selection and evidence                                                                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API / CLI / script entry                | Selected: 2.2–2.8 and3.1 cover async route dispatch, worker/lifespan boundaries and the existing Office poll; external HTTP contracts remain unchanged.                                                                                      |
| Config / project setup                         | Not selected: no dependency, setting, resolver backend or timeout-policy change.                                                                                                                                                             |
| File IO / path safety / overwrite              | Not selected: file/path/publication policy is unchanged; 2.3 retains unrelated state, byte, version and receipt assertions.                                                                                                                  |
| Schema / columns / units / field names         | Not selected: no persisted schema or field changes.                                                                                                                                                                                          |
| Auth / permissions / secrets                   | Selected for execution-context preservation, not policy changes: 2.7 proves per-request context isolation; 3.1 retains command envelope assertions and3.2 scans retained evidence. Existing request ContextVars include credential carriers. |
| Concurrency / shared state / ordering          | Selected: 2.2–2.8 cover service-loop and save-worker ownership, existing lock placement, induced callbacks, context/cancellation parity and cleanup ordering.                                                                                |
| Resource limits / large input / discovery      | Selected: 2.2–2.8 cover the existing command budget, standard save-executor ownership, cancelled submitted futures and independent supervisor cleanup; no global capacity or process-exit deadline guarantee.                                |
| Legacy compatibility / examples                | Selected: 2.2,2.4,2.7 and3.1 retain async command APIs, migrate every direct caller and preserve existing protocol/state/context/cancellation behavior without shims.                                                                        |
| Error handling / rollback / partial outputs    | Selected: 2.1–2.3 and2.5–2.8 cover distinct command failures, persisted-state conservation, startup/body failure and cancellation-safe worker drain; revert is the rollback.                                                                 |
| Release / packaging / dependency compatibility | Selected for the added production module only: 3.1 checks existing recursive Dockerfile office-copy inclusion and server-package consumers. No dependency, image-policy or deployment change.                                                |
| Documentation / migration notes                | Selected: 3.2–3.3 record ownership, complete internal caller cutover, evidence limits and canonical archive.                                                                                                                                 |

## Evidence boundaries

The parent owns probes, frozen expected outcomes and execution; the implementer cannot rewrite them to make a candidate pass. Existing callback evidence remains authoritative for that separate surface. No LAN operations, production DNS-backend change, native asynchronous-DNS certification, force-killed resolver, new scheduler, retry policy or generic process-shutdown guarantee. A normal source suite pass cannot replace the actual held-resolver and lock-order observations.
