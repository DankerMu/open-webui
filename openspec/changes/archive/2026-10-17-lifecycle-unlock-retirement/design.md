# Design

## Context

OCU `_CombinedLock.__exit__` removes outer depth, calls explicit `LOCK_UN`, closes the handle, then clears `_file`; its surrounding finally releases the thread RLock. Unlock failure skips close/clear. Acquisition hardening is already covered by #247 and remains unchanged. Existing `tests/orchestrator/test_lifecycle_lock.py` provides descriptor observation and another-thread acquisition helpers; `test_lifecycle.py` covers nested modes and process serialization.

## Goals / Non-Goals

Invariant: outer release attempts descriptor retirement and forgets the owned handle regardless of explicit unlock success, while cleanup errors remain observable and nested holders retain the original outer ownership.

Must preserve: RLock-before-flock ordering, canonical chat/inode identity, explicit unlock before close, per-chat depth, create=False behavior, cross-process contention, existing exception propagation and no Docker mutation.

Non-goals: acquisition changes, broad lock refactoring, retrying close, new error classes, Docker lifecycle error normalization (#306), committed-writer cleanup (#365), deployment filesystem or remote-exploitation claims.

## Decisions

Keep explicit unlock inside the owned file handle's context manager, detaching `_file` before the unlock call so a close error cannot retain stale owner state. The file context supplies unconditional close without increasing the oversized source module or introducing a second release helper. Retain the surrounding RLock finally and current depth logic. This corrects only missing retirement and preserves unlock-before-close order; unlike the close-only alternative it retains explicit unlock. Do not retry close because the descriptor may already have been retired and reused.

Use Python's normal exception chaining: unlock-only failure remains the original exception; close-only failure propagates; if both fail, the close error remains visible with unlock failure in its context. This does not promise kernel retirement when close itself fails before retiring the descriptor. Tests that inject close failure after actual retirement must say so.

Reuse existing lock test/world fixtures. First add one unlock-only regression, capturing the real owner handle and FD; assert original error visibility, handle.closed, owner handle cleared, EBADF and depth absence before attempting reacquisition. This keeps a failing baseline from blocking on its leaked flock. Cleanup in the test finally closes only its retained real handle. Then use the same chat immediately, without sleep, and prove another thread can acquire using the existing bounded event/join helper.

Sibling surfaces: nested same-chat acquisitions, non-creating locks, process-local RLock release, kernel flock ownership, existing Office lookup admission owner (separate and unchanged), sandbox creation/non-creating contention tests. No caller signature changes or parallel owner implementation.

## Verification / Rollback

Parent records source/test hashes and Git base state at RED capture time. Parent runtime probe uses actual temporary directories, file descriptors and child-process nonblocking flock attempts: excluded during outer/nested ownership and after inner exit; admitted after failed explicit unlock followed by close; immediate same-chat reacquisition works. Child communication is synchronous/bounded, not sleep-timed; all children and temporary directories are retired.

Run the owning lock module plus adjacent lifecycle/Office lookup release tests using the repository's documented uv/pytest invocation. Broader existing lifecycle process tests remain unchanged. Local macOS POSIX evidence does not certify other kernels or actual OS unlock failure frequency. Update the existing lifecycle decision's deferred-#382 paragraph after proof; no new architecture record. Revert the focused release/test/doc change to roll back; no data migration.
