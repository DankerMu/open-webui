---
id: 2026-10-15-ocu-callback-progressing-lookups
title: Callback-progressing Office command transactions
kind: architecture
status: implemented
date: 2026-10-15
supersedes: '2026-10-12-ocu-command-deadline (partial: lock-across-lookup and save-only execution ownership); 2026-10-03-ocu-office-file-store (partial: lookup lock boundaries)'
references: 'Plan 2; issue 425; ocu-office-lookup-locking; ocu-command-deadline'
---

# Callback-progressing Office command transactions

## Problem

DocumentServer `info` can invoke a status callback before returning its command response. Holding the canonical chat lock during that lookup blocks authenticated callback admission. A deadline bounds the stall but does not repair event ordering: the caller can allocate a close after timeout and then admit an earlier-arriving status 1 as though it followed that allocation. A waiter can also prevent callback admission by occupying the callback worker domain.

## Decision

Join/reopen, close, history restore and session sweep prepare under the canonical lock, release it for callback-bearing lookup, and reacquire it to reread and revalidate authoritative session, key, epoch, allocation and file/version responsibility. A captured lookup result cannot authorize mutation of a successor. Admission, sequence allocation, file/version selection, accepted journal recovery and publication remain serialized.

`office.lookup_admission` serializes each chat's callback-bearing observation through admission using a stable `.office-lookup.lock` flock. It is acquired before the canonical lock and retained while that lock is released for I/O; callbacks never acquire it. This prevents a duplicate close's already-outstanding info callback from voiding another close's reservation. Same-chat lookup transactions may queue; other chats, callbacks and save reconciliation remain independent. The existing command budget starts at command submission, not observation-gate queue entry.

Gate acquisition uses directory-anchored no-follow descriptors and verifies data-root, chat-root and lock identities after waiting. Noncreating callers do not create missing roots; a safe existing root may receive the stable lock file, which normal release never unlinks. Unknown/unsupported create admission is checked before this metadata side effect and repeated authoritatively after acquisition. Unsafe or replaced identities fail rather than selecting another coordination domain. Kernel ownership releases on process death; admitted waiters remain owned by transaction-lifetime drain.

Callback-bearing synchronous transactions share `office.transaction_workers`, the lifespan-owned execution mechanism independent of DNS and callback admission. Save, join/reopen, close, history restore and sweep use this one owner. The service-loop command bridge, existing ten-second budget, request-context propagation, queued/running cancellation distinction and cancellation-safe shutdown drain remain authoritative.

The legitimate remaining-participant status-1 transition is not suppressed. An induced pre-close callback must progress before close allocation; a genuinely later participant report can still return a closing session to editing and void its close allocation. Caller-specific known/unknown/unreachable outcomes are preserved after revalidation.

This partially supersedes the lookup ownership clauses in the [command decision](2026-10-12-ocu-command-deadline.md) and [file-store decision](2026-10-03-ocu-office-file-store.md). Their deadline, storage durability, publication, recovery and transaction-lifetime rationale remains applicable.

## Alternatives considered

- **Keep lookup under the lock and rely on its deadline** — releases the cycle only through failure and can apply an already-arrived callback after a new allocation.
- **Release only the lock** — a callback-bearing waiter can still occupy callback worker admission; both resource dependencies need proof.
- **Independent unlocked observations without admission coordination** — one info callback can cross another close's reservation; checking its eventual command result cannot undo that callback's state mutation.
- **A process-local observation mutex** — does not coordinate the two service processes sharing broker state.
- **Ignore status 1 while closing** — breaks the valid remaining-tab protocol and conceals an ordering defect.
- **Treat iframe destruction as successful close** — loses the broker's publication and terminal-state authority.
- **Add another pool, larger timeout or network retries** — duplicates ownership or masks the cycle without establishing callback progress and state validity.

## Consequences

Unlocked I/O admits concurrent state changes. Every caller must revalidate rather than replay a frozen record; controlled races and real callback-before-response execution are required evidence. In-flight transactions remain owned through reconciliation and drain on shutdown. A resolved lock cycle alone does not certify all editor formats, final callbacks, deployment capacity or the full real-editor verifier.
