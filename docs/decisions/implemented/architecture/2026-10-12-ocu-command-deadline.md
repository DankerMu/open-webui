---
id: 2026-10-12-ocu-command-deadline
title: Service-loop commands with lifespan-owned save workers
kind: architecture
status: implemented
date: 2026-10-12
supersedes: none
references: 'Plan 2; issue 259; ocu-command-deadline; 2026-10-03-ocu-office-file-store (partial: command-loop ownership)'
---

# Service-loop commands with lifespan-owned save workers

## Problem

A per-command `asyncio.run` waits for default-executor shutdown after the HTTP timeout. A blocked resolver can therefore retain the synchronous caller and its chat lock beyond the command's existing ten-second budget. Moving that caller to the service loop's default executor creates a different dependency cycle when the same executor must run DNS. Moving a whole save transaction to the shared AnyIO pool can instead prevent a command-induced callback from entering.

## Decision

`office.commands.run_command` submits the existing asynchronous client to the running service loop and bounds the synchronous wait by one monotonic ten-second deadline. Timeout cancels the submitted future and returns the caller's existing unreachable outcome. Unavailable loops dispose of an unsubmitted coroutine. Application exceptions retain their existing propagation; the asynchronous command APIs and protocol checks remain unchanged.

Join/reopen, close, history restore and the Office poll use Starlette workers. Their read-only lookup remains under the canonical chat lock; only the asynchronous command runs on the service loop. The loop never owns a blocking chat lock. This replaces only the private-command-loop clause in [the file-store decision](2026-10-03-ocu-office-file-store.md), not its persistence, locking or state-transition policies.

Save uses a lifespan-owned standard `ThreadPoolExecutor`, independent of both DNS/default-executor work and callback/AnyIO admission. One worker owns the complete synchronous prepare/command/reconcile transaction. Preparation and reconciliation retain their chat-lock boundaries; forcesave remains outside the lock. Each submission copies request context freshly. An unshielded request await allows cancellation to prevent queued work from starting; cancellation after admission does not abandon the running transaction's reconciliation.

The save owner enters inside the MCP lifetime and before the reaper and request admission. A dedicated shutdown supervisor starts before admission is published. Teardown withdraws admission before awaiting, signals that supervisor, and drains actual executor work with `cancel_futures=False` while the service loop stays live. Cleanup does not borrow either shared worker domain. Repeated task cancellation and enclosing AnyIO cancellation cannot abandon the retained completion future; the supervisor is joined before cancellation propagates. Startup cleanup distinguishes an acquired supervisor from an unstarted one, including failure after acquisition. Missing ownership fails loudly rather than selecting another pool.

## Alternatives considered

- **Per-command event loops** — runner shutdown can outlive the HTTP timeout while waiting for DNS.
- **Service default-executor waiters** — a waiter can occupy the executor needed by its own resolver.
- **Shared AnyIO save waiters** — a forcesave response can depend on a callback that cannot acquire a worker.
- **Split save into independently awaited phases** — cancellation can abandon reconciliation or requires a separate task registry and changed admission semantics.
- **Per-request pools or a new loop** — duplicate lifecycle ownership without removing the shutdown obligation.

## Consequences

Each application lifetime owns one idle supervisor thread and a lazily populated executor using the runtime's standard worker limit. Shutdown drains admitted work rather than imposing a new global shutdown timeout. The command deadline does not terminate a resolver thread or certify a native resolver/process-exit bound. Existing command effects may outlive a timed-out caller; existing sequence and reconciliation rules remain authoritative.

The held-Python-DNS and single-default-worker runtime probes explicitly select asyncio so their resolver-entry oracle observes the intended worker. Uvicorn's auto-selected uvloop delegates resolution differently; its healthy caller matrix is separate evidence, not a native-DNS-stall claim. Real caller timing, lock availability, persisted state, callback ordering and acquired-resource cleanup are acceptance evidence; a passing unit count alone is insufficient.
