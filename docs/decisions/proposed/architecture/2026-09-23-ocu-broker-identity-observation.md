---
id: 2026-09-23-ocu-broker-identity-observation
title: Cache fingerprints before deletion and bound identity to observed changes
kind: architecture
status: proposed
date: 2026-09-23
supersedes: none
references: 'Plan 1 D8/D11; issue15 comment5790293452; 2026-09-22-ocu-lifecycle-lock-and-launch-semantics'
---

# Cache fingerprints before deletion and bound identity to observed changes

## Problem

A disappeared file cannot be hashed after a suspected rename. Without a saved old fingerprint, same-size rename and replacement histories can have indistinguishable current observations. Polling also cannot identify a delete/recreate wholly between observations using only path and size.

## Decision

Hash and persist fingerprints at first observation and on detected size changes. Compare removed/new paths against the cached old fingerprint; match equal-size/equal-hash candidates one-to-one. Unchanged reconciles hash nothing. This amends parent D8's hash-only-on-suspected-rename rule.

Observed deletion creates a tombstone; later path reuse always gets a new UUID. Historical tombstones are not rename candidates. Unobserved delete/recreate follows active-path matching, and same-size in-place edits remain a declared blind spot. The user selected these boundaries instead of adding filesystem event tracking.

The persisted broker index is authoritative under the existing per-chat RLock+flock. It is not a filesystem-write fence: sandbox writers remain external to the lock. Failed reads or precommit writes must not publish partial identity changes.

## Alternatives considered

- **Lazy old hashing only during rename** — old bytes are unavailable; it cannot support the guaranteed first rename without prior evidence.
- **Use size alone as rename evidence** — assigns an unrelated file the old identity when content differs.
- **Filesystem event tracking** — expands runtime and lost-event/restart semantics; not selected by the user.
- **Resurrect matching tombstones** — violates observed path reuse and may restore stale file history.

## Consequences

Initial/detected-change scans perform content I/O; unchanged5000-file scans do not. Content-equality rename matching is a deterministic heuristic, not an event log. Counter/tombstone persistence and bounded index errors must preserve history rather than silently reset it. Endpoint/describe wiring follows in issue16; this decision does not claim runtime integration or complete detection of every write.
