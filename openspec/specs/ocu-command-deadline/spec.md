# ocu-command-deadline Specification

## Purpose

Bound synchronous DocumentServer command completion despite delayed resolution while preserving callback progress, identity-bound transaction reconciliation and caller-specific session outcomes.

## Requirements

### Requirement: Application commands have an end-to-end synchronous budget

Application lookup and forcesave invocations SHALL return within the existing command budget without waiting for per-command resolver or event-loop shutdown. The budget SHALL cover submission and the synchronous wait, not only HTTP transfer. Timeout or cancellation of the submitted command SHALL retain the corresponding unreachable outcome. Production timeout values, asynchronous command protocol APIs and non-timeout validation/error semantics SHALL remain unchanged. An unavailable execution loop SHALL produce unreachable without leaving an unsubmitted coroutine alive.

#### Scenario: Lookup resolution remains blocked

- **WHEN** a real threaded resolver enters resolution for a lookup command and remains held beyond the command budget
- **THEN** the application command returns its existing unreachable outcome before the resolver is released or returns
- **AND** synchronous return does not depend on per-command executor shutdown

#### Scenario: Forcesave resolution remains blocked

- **WHEN** a real threaded resolver enters resolution for a forcesave command and remains held beyond the command budget
- **THEN** the application command returns its existing unreachable outcome before the resolver is released or returns
- **AND** no retry, timeout increase or replacement resolver implementation establishes success

#### Scenario: Submitted work cannot complete before the budget

- **WHEN** a submitted command cannot complete within the remaining synchronous budget
- **THEN** the caller stops waiting, cancels that submission and returns its corresponding unreachable outcome without awaiting resolver shutdown

#### Scenario: Execution owner is unavailable

- **WHEN** a synchronous command is given a closed or non-running execution loop
- **THEN** it returns its corresponding unreachable outcome and disposes of the unsubmitted coroutine without a resource-warning leak

### Requirement: Deadline ownership preserves caller locks and state transitions

Join/reopen, close, session sweep and history restore SHALL perform callback-bearing key lookup without holding the canonical chat lock. Preparation and outcome application SHALL retain canonical locking, with authoritative identity/state reread and revalidation after the remote wait. A result SHALL NOT orphan, replace, close, time out or restore a different session, document key, restore epoch, file/version responsibility or pending save than the operation has revalidated. Save SHALL continue to send forcesave outside the lock. Production command budgets and caller-specific known, unknown and unreachable outcomes SHALL remain unchanged. Unrelated persisted state, workspace bytes, versions, receipts and accepted publication obligations SHALL be preserved.

#### Scenario: Join or reopen cannot confirm the editor key

- **WHEN** an existing session's lookup times out during join/reopen and the captured authority remains current
- **THEN** the request returns the existing HTTP502 documentserver-unavailable response without orphaning or replacing the session
- **AND** a same-chat callback or lock contender can progress while the lookup remains pending, before its timeout or resolver release

#### Scenario: Close cannot reach the command service

- **WHEN** close's lookup times out for an eligible active session whose authority remains current
- **THEN** close retains its existing allocation and HTTP202 behavior rather than inventing a new unavailable refusal
- **AND** the lookup does not hold the chat lock, and its reconciliation preserves unrelated state

#### Scenario: Sweep cannot reach the command service

- **WHEN** an eligible session's sweep lookup times out
- **THEN** the sweep preserves its existing unreachable-state behavior without orphaning the session or clearing a pending save based on an unconfirmed key
- **AND** callbacks and same-chat lock contenders can progress during the lookup

#### Scenario: Save times out after allocating a save sequence

- **WHEN** the save command's resolver is held after save admission
- **THEN** a same-chat lock contender can acquire while forcesave remains pending
- **AND** timeout retains the existing HTTP502 response with the allocated save sequence and existing save reconciliation, without changing document bytes, versions or receipts

#### Scenario: Info induces a callback before close admission

- **WHEN** a healthy key lookup sends an authenticated status-1 callback and waits for its acknowledgement before returning
- **THEN** the callback is admitted and acknowledged before the command deadline without waiting for a close allocation
- **AND** the subsequent close reserves one sequence that its final status-2 or status-4 handling consumes rather than voiding it because the earlier callback was delayed by its own caller

#### Scenario: Another participant is genuinely present after close

- **WHEN** a session is closing and a later status-1 callback reports a remaining participant
- **THEN** the existing transition to editing with the same document key and voided close allocation remains available
- **AND** the repair does not ignore all status-1 callbacks or treat editor iframe disappearance as terminal closure

#### Scenario: Session authority changes during lookup

- **WHEN** another operation replaces the session/key, changes the restore epoch, completes a terminal callback or changes pending allocation responsibility while lookup is pending
- **THEN** the stale result cannot mutate or overwrite the successor state, and the caller re-evaluates authoritative admission before proceeding
- **AND** duplicate closes reuse the same valid pending allocation, while a sweep cannot clear a newer save using an older overdue-save observation

#### Scenario: Restore admission changes during lookup

- **WHEN** file identity, selected version, an active session or accepted recovery changes while restore's key lookup is pending
- **THEN** restore rechecks its original file/version responsibility and existing admission/error precedence under the canonical lock
- **AND** no stale lookup authorizes publication to a successor file or bypasses the current active-session refusal

### Requirement: Shared execution preserves healthy command and callback behavior

Blocking callback-bearing command waiters SHALL NOT occupy the executor capacity required for command DNS resolution or authenticated callback admission. The existing command protocol, response limits, authentication envelope, redirects, proxy/cookie policy and asynchronous cancellation behavior SHALL remain intact. Callback/download execution ownership and behavior SHALL remain unchanged.

#### Scenario: The resolver executor has one worker

- **WHEN** a healthy command is issued from a session handler or the Office poll with a one-worker default resolver executor
- **THEN** real resolution and the command response complete successfully without waiter/resolver starvation
- **AND** the caller's existing successful state and response assertions remain satisfied

#### Scenario: Lookup induces a callback with one callback worker available

- **WHEN** join/reopen, close, sweep or history restore waits for a healthy info response that requires an authenticated callback while one callback worker slot is available
- **THEN** that callback completes before the info response and the caller reaches its correct known-key outcome without occupying the callback slot or the canonical chat lock during the wait

#### Scenario: History restore reaches shared reopen lookup

- **WHEN** a real history-restore request for an editing session confirms a known editor key through a callback-bearing command with a one-worker default resolver executor
- **THEN** it returns the existing HTTP409 `session_open` response with unchanged workspace bytes and no restore allocation, rather than a starvation-induced HTTP502
- **AND** restore retains canonical locking for admission/revalidation, its error precedence and existing unknown/unreachable-key outcomes, but not across the remote lookup

#### Scenario: Existing command and callback consumers execute

- **WHEN** protocol, session, save/close, sweep, history-restore admission/state, HTTP-origin cancellation and callback deadline/executor regressions run
- **THEN** their outcome, authentication, state, cancellation and deadline assertions pass without retries, skipped cases, relaxed timeouts or duplicate production command implementations
- **AND** assertions requiring lock ownership across callback-bearing I/O are replaced by callback-progress and authoritative-revalidation evidence under this explicitly corrected contract

### Requirement: Save worker ownership preserves induced callbacks and transaction lifetime

The service-lifetime transaction owner for synchronous saves SHALL also own callback-bearing lookup transactions independently of the DNS/default executor and callback worker admission. It SHALL preserve per-submission request context and the distinction between cancelled queued work and already-running work. Closing that owner SHALL withdraw admission before awaiting cleanup and drain actual executor work on a responsive service loop before releasing lifecycle dependencies. Shutdown SHALL NOT require either shared worker pool or introduce a new command/shutdown timeout. There SHALL be one canonical ownership implementation with no fallback to a worker domain required by the induced callback.

#### Scenario: Forcesave induces a callback with one available callback worker

- **WHEN** a real command responder invokes an authenticated callback before returning an accepted forcesave response while one callback worker slot is available
- **THEN** the callback completes successfully before the save returns its existing HTTP202 result
- **AND** the save waiter consumes neither that callback slot nor the DNS executor slot

#### Scenario: A running save request is cancelled

- **WHEN** request cancellation occurs after its save worker has started
- **THEN** the request await retains its existing cancellation behavior while the admitted command and canonical outcome-specific reconciliation remain owned and complete
- **AND** executor shutdown waits for that actual worker rather than treating the cancelled request future as completion

#### Scenario: A queued save request is cancelled

- **WHEN** request cancellation reaches the underlying queued future before its worker starts
- **THEN** no save sequence or command is issued for that request after occupied workers are released
- **AND** the repair does not shield queued work into newly mandatory execution

#### Scenario: Lookup transaction cancellation follows the same ownership boundary

- **WHEN** a lookup-bearing transaction is cancelled before execution or after its worker has started
- **THEN** queued cancellation can prevent its admission, while already-running work retains ownership through authoritative reconciliation
- **AND** shutdown drains actual work without borrowing callback or DNS capacity and without treating a cancelled request future as transaction completion

#### Scenario: Concurrent request contexts remain isolated

- **WHEN** distinct request contexts submit save or lookup-bearing work and loop-owned commands
- **THEN** each operation observes its own submission context without sharing another request's values or propagating worker-local changes back to its caller

#### Scenario: Save-owner startup or body fails

- **WHEN** a controlled failure occurs during the shared transaction owner's startup or active lifespan body
- **THEN** every acquired worker/shutdown resource is cleaned before the failure escapes, and unstarted supervisor threads are not joined
- **AND** transaction admission is not published before cleanup ownership exists and unavailable ownership never falls back to a shared pool

#### Scenario: Teardown is cancelled while real save work remains

- **WHEN** owner teardown begins with admitted save or lookup work still needing the live loop, including after request cancellation, while DNS/default and callback worker capacity are occupied
- **THEN** admission closes before the first teardown await and actual transaction work drains without borrowing either occupied pool
- **AND** repeated asyncio task cancellation or enclosing AnyIO cancellation cannot release lifecycle dependencies before executor shutdown and supervisor join finish
- **AND** cancellation is propagated after cleanup rather than swallowed or replaced by a false successful close
