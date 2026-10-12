# ocu-command-deadline Specification

## Purpose

Bound synchronous DocumentServer command completion despite delayed resolution while preserving the Office caller's existing lock ownership and session outcomes.

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

Join/reopen, close and session sweep SHALL keep lookup inside the canonical chat lock and release that lock after their existing bounded command outcome handling. Save SHALL send forcesave outside that lock. Resolver delay SHALL NOT extend lock ownership until resolver return. Command failure SHALL preserve each caller's existing distinct outcome and unrelated persisted state, workspace bytes, versions and receipts.

#### Scenario: Join or reopen cannot confirm the editor key

- **WHEN** an existing session's locked lookup times out during join/reopen
- **THEN** the request returns the existing HTTP502 documentserver-unavailable response without orphaning or replacing the session
- **AND** a same-chat lock contender can acquire before the held resolver is released

#### Scenario: Close cannot reach the command service

- **WHEN** close's locked lookup times out for an eligible active session
- **THEN** close retains its existing allocation and HTTP202 behavior rather than inventing a new unavailable refusal
- **AND** the chat lock becomes available before resolver release with all unrelated state preserved

#### Scenario: Sweep cannot reach the command service

- **WHEN** an eligible session's locked sweep lookup times out
- **THEN** the sweep preserves its existing unreachable-state behavior without orphaning the session or clearing a pending save based on an unconfirmed key
- **AND** the chat lock becomes available before resolver release

#### Scenario: Save times out after allocating a save sequence

- **WHEN** the save command's resolver is held after save admission
- **THEN** a same-chat lock contender can acquire while forcesave remains pending
- **AND** timeout retains the existing HTTP502 response with the allocated save sequence and existing save reconciliation, without changing document bytes, versions or receipts

### Requirement: Shared execution preserves healthy command and callback behavior

Blocking command waiters SHALL NOT occupy the same executor capacity required for command DNS resolution. The existing command protocol, response limits, authentication envelope, redirects, proxy/cookie policy and asynchronous cancellation behavior SHALL remain intact. Callback/download execution ownership and behavior SHALL remain unchanged.

#### Scenario: The resolver executor has one worker

- **WHEN** a healthy command is issued from a session handler or the Office poll with a one-worker default resolver executor
- **THEN** real resolution and the command response complete successfully without waiter/resolver starvation
- **AND** the caller's existing successful state and response assertions remain satisfied

#### Scenario: History restore reaches shared reopen lookup

- **WHEN** a real history-restore request for an editing session reaches DNS and confirms a known editor key with a one-worker default resolver executor
- **THEN** it returns the existing HTTP409 `session_open` response with unchanged persisted state and workspace bytes, rather than a starvation-induced HTTP502
- **AND** restore keeps its canonical lock, admission/error precedence and existing unknown/unreachable-key state behavior

#### Scenario: Existing command and callback consumers execute

- **WHEN** existing protocol, session, save/close, sweep, history-restore admission/state, HTTP-origin cancellation and callback deadline/executor regressions run
- **THEN** their existing assertions pass without retries, skipped cases, relaxed timeout policy or duplicate production command implementations

### Requirement: Save worker ownership preserves induced callbacks and transaction lifetime

An admitted synchronous save transaction SHALL wait outside both the DNS/default executor and callback worker admission. Its service-lifetime owner SHALL preserve per-submission request context and the existing distinction between cancelled queued work and already-running work. Closing that owner SHALL withdraw admission before awaiting cleanup and drain actual executor work on a responsive service loop before releasing lifecycle dependencies. Shutdown SHALL NOT require either shared worker pool or introduce a new command/shutdown timeout.

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

#### Scenario: Concurrent request contexts remain isolated

- **WHEN** distinct request contexts submit save work and loop-owned commands
- **THEN** each operation observes its own submission context without sharing another request's values or propagating worker-local changes back to its caller

#### Scenario: Save-owner startup or body fails

- **WHEN** a controlled failure occurs during owner startup or its active lifespan body
- **THEN** every acquired save/shutdown resource is cleaned before the failure escapes, and unstarted supervisor threads are not joined
- **AND** save admission is not published before cleanup ownership exists and unavailable ownership never falls back to a shared pool

#### Scenario: Teardown is cancelled while real save work remains

- **WHEN** owner teardown begins with an admitted save still needing the live loop, including after request cancellation, while DNS/default and callback worker capacity are occupied
- **THEN** admission closes before the first teardown await and actual save work drains without borrowing either occupied pool
- **AND** repeated asyncio task cancellation or enclosing AnyIO cancellation cannot release lifecycle dependencies before executor shutdown and supervisor join finish
- **AND** cancellation is propagated after cleanup rather than swallowed or replaced by a false successful close
