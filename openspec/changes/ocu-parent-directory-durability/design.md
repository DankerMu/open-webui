# Design

## Context

`OutputsBroker._control_fd`, upload `open_control_directory`, receipt `_require_control_directory` and `_CombinedLock.__enter__` create the entries named by the issue. Existing writers synchronize their state file and containing directory. Office store already synchronizes ancestor descriptors before state replacement; it is a preservation control, not an implementation target.

## Goals and boundaries

Governing invariant: successful first persisted broker/receipt state and first lock admission must follow fsync of the exact parent entry that makes the new subtree reachable.
Must preserve: atomic complete successors, existing receipt and index formats; no-replace uploads and receipt replay; canonical chat identity, thread/flock ordering and reentrancy; read-only missing-state behavior; symlink rejection, directory modes and borrowed/owned descriptor rules.
Sibling surfaces: broker reconcile/registration, HTTP upload and imports, standalone receipt writer, lifecycle/Office callers sharing the lock, existing postreplace durability errors.
Non-goals: Office state writer changes, metadata/workspace-directory durability audit, data-root ancestor durability, generic directory persistence framework, power-loss certification, new API/error schema, deployment or dependency changes.

## Decisions

Keep policy at the four existing owners. Reuse no-follow directory flags/acquisition patterns rather than introducing a second descriptor abstraction. Open a path-based parent before creation, use that descriptor for the child mkdir and synchronize that same inode. The upload path borrows its existing chat descriptor.
A parent-fsync failure propagates before the operation's success boundary. Close all newly owned descriptors and release acquired locks; never remove an unknown directory as rollback. Existing file and child-directory fsyncs remain in place.
Existence alone cannot prove that a prior creator completed synchronization. Create-capable entry paths may synchronize an existing entry as well, avoiding process-local durable flags or retry protocols. Read-only paths must not create missing entries or gain unnecessary synchronization. Reentrant lock admission uses the already-admitted outer transaction.
Preserve automatic creation of a missing configured data root where the existing lock supports it; only synchronization of that root for its chat child is in scope, not durability of the root's own ancestors.

## Verification

Construction mode, filesystem/shared-state risk. Parent owns all execution; implementer edits tests/source only. Iterate one real-directory tracer boundary RED then GREEN before the next.
Track `(st_dev, st_ino)` and file type at each actual fsync. Distinguish BASE_DATA_DIR, chat root, `.ocu`, and temporary regular file; assertions order mkdir before parent sync and parent/file/child sync before success.
Inject EIO only for the intended parent inode, not every directory. Assert no success/index/receipt publication at that precommit boundary, borrowed descriptor usability, owned descriptor closure, and lock availability to another thread. Preserve existing postreplace failure tests by targeting their intended child inode if new ancestor syncs would intercept a broad fault.
Real TCP HTTP smoke uses an owned temporary data root: first receipt-bearing upload, imports/readback and idempotent replay; controlled parent failure returns an error without a success receipt. Stop owned services and retain exact command/input identities.

## Trade-offs and containment

Additional ancestor synchronization on create-capable paths costs IO but avoids unverifiable in-memory durability state. No throughput claim is made. Kernel/fs semantics and physical power failure remain outside the evidence.
No data migration. Rollback is a source revert retaining all existing files and formats; it restores the missing-sync risk rather than deleting user data.
