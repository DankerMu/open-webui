---
id: 2026-09-30-ocu-cold-backup-recovery
title: Full cold backup and isolated release recovery
kind: architecture
status: implemented
date: 2026-09-30
supersedes: none
references: issue-34, issue-36, 2026-09-20-ocu-chat-state-table, 2026-09-25-ocu-proxy-only-compose-topology, 2026-09-30-ocu-offline-image-delivery, 2026-10-09-ocu-office-backup-restore
---

# Full cold backup and isolated release recovery

## Problem

Database cursors and broker revision identity span separate persistent stores. Live copies do not establish one recovery point, and Compose project names do not isolate fixed stack containers or chat workspace volumes. Switching image tags alone does not bind a compatible source, schema and runtime.

## Decision

Take a full cold backup after attributed application and sandbox writers are stopped and verified quiescent. Include the logical database, WebUI data and initializer marker, chat/skills trees, detached or stopped workspace volumes, protected configuration and release/version identity. Publish only a complete checked set. Keep sandboxes stopped after success or failure.

The [Office backup and restore decision](2026-10-09-ocu-office-backup-restore.md)
partially supersedes the backup-readiness sequence and adds restore-session
invalidation. The isolated-target, complete-set and compatibility guarantees here
remain in force.

Restore only to a distinct empty local daemon and new deployment root. Require the standard socket topology used by runtime consumers, pin helpers and startup to that identity, and refuse collisions rather than remove resources. Partial restore leaves explicitly identified owned resources without readiness; retry requires an operator-selected fresh target or deliberate disposal outside the procedure.

The entire recovery set is secret-bearing. Exclude the separately provisioned provider file, not provider values persisted in the full database. Preserve persistent configuration precedence, numeric ownership, modes and supported link/ACL/xattr metadata. Do not execute captured configuration as shell code or silently sanitize the database. Prune only orphan workspace-state rows in the restored database; preserve live owners, preferences, broker IDs and revisions.

Activate the retained release through its own source and the canonical image inventory. Check database migration/tool compatibility, retain additive schema, prohibit build/pull and preserve proxy-only authorization and network policy. The operator verifies effective provider settings, live readiness and permissions before switching traffic. Restored sandboxes require explicit authorized launch.

Prove running-data provenance using the broker's required mounts and environment, stack volume identities, and actual image configuration digests before stopping writers. Preflight the retained source before reserving activation identity. Resumable selection requires a private target-bound receipt and matching imported ownership marker covering the complete inventory; matching paths, tags or commits alone do not authorize adoption.

## Alternatives considered

- **Live database and filesystem copies** — cannot guarantee cursor/broker consistency without a new coordinated snapshot mechanism.
- **Outputs-only backup** — omits persistent sandbox home directories and violates the selected full-workspace recovery scope.
- **In-place destructive restore** — introduces overwrite, container deletion and partial rollback hazards the selected isolated-target procedure avoids.
- **Same-daemon parallel restore under another project name** — fixed container and workspace names still collide.
- **Image-tag-only rollback or schema downgrade** — separates executable source from inventory or destroys additive state; neither establishes compatibility.

## Consequences

Maintenance downtime, complete workspace-volume storage and a separate recovery daemon are required. Checksums establish integrity under trusted administrator control, not authenticity against a hostile host. Existing protected bootstrap files are never overwritten. Real archive metadata fidelity, PostgreSQL recovery, previous-release compatibility and A-T14/A-T15 remain final engine acceptance; fake-boundary source checks do not certify them.
