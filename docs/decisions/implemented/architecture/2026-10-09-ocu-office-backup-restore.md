---
id: 2026-10-09-ocu-office-backup-restore
title: Quiesce Office before capture and invalidate sessions with a restore epoch
kind: architecture
status: implemented
date: 2026-10-09
supersedes: 2026-09-30-ocu-cold-backup-recovery (Office readiness and restore-session invalidation only)
references: ocu-office-editing D18, issue 170, issue 171, 2026-10-03-ocu-office-editor-selection, 2026-10-03-ocu-office-file-store
---

# Quiesce Office before capture and invalidate sessions with a restore epoch

## Problem

Stopping OCU before DocumentServer has delivered final callbacks can omit saved
edits from a cold recovery point. Reusing a captured session after restoring its
files would allow an old editor key to address a different deployment history.
DocumentServer's cache is not the broker's version or publication record.

## Decision

Close proxy admission first. Run the B1-recorded DocumentServer shutdown-preparation
command while OCU remains available for final callbacks. Read Office state files
until opening/editing/saving/closing sessions and journal entries are absent; then
stop and verify every remaining writer, including DocumentServer and attributed
sandboxes. Recheck Office state before capture. Failure never publishes a complete
set, attempts all safe writer stops and reports any stop failure. No backup step
restarts a service or clears shutdown mode; normal deployment startup clears it.

Keep the existing nine recovery components. Chat-data already contains workspace,
broker/lifecycle and Office state, receipts and version blobs. Do not capture
DocumentServer's data/cache/log volumes or require a separate uploads tree.

Restore writes a fresh random opaque token plus one newline to
`{BASE_DATA_DIR}/.office-restore-epoch` after the chat-data tree is published and
before readiness or application execution. It replaces the captured marker
atomically without reading it or following its links. The temporary file belongs
to the private recovery root, not the archive-owned chat directory. File and
directory synchronization failures remain explicit; a visible replacement is not
rolled back or reported ready after a later synchronization failure.

Recovery leaves Office state and version bytes unchanged. The broker owns epoch
reading and equality checks: a pre-restore open session becomes orphaned on the
next relevant request, reopening creates a new session/key, and an old callback
cannot overwrite restored workspace content. Final session records remain final.
The marker follows the root-owned private-file convention; the deployed broker
retains its root execution contract.

This partially supersedes [cold-backup recovery](2026-09-30-ocu-cold-backup-recovery.md)
for Office readiness and restore-session invalidation. Its isolated target,
complete-set publication, inventory/schema compatibility and non-destructive
resource ownership rules remain in force. Recovery requires a version-2 retained
inventory with seven image roles and fonts; it has no version-1 rollback path.
Sandbox removal/recreation for a manual workspace-layout rollback belongs to the
operator, never recovery automation.

## Alternatives considered

- **Copy live state or stop OCU first** — loses the final-callback window and cannot
  establish one file/version/publication recovery point.
- **Restore DocumentServer volumes as authoritative state** — couples recovery to
  transient editor keys and cache instead of broker-owned versions and receipts.
- **Rewrite every captured session during restore** — makes recovery an Office
  state-schema writer and breaks byte-identical restoration.
- **Reuse the captured epoch or derive it from time** — reauthorizes stale sessions
  or makes identity depend on clocks. A fresh random token needs no history scan.
- **Write through the captured marker** — can mutate a hardlink alias or symlink
  target; atomic replacement changes only the marker entry.

## Consequences

Backup requires maintenance downtime with OCU alive during the save window.
Operators must allow the configured command/drain bounds and explicitly restart
a stopped deployment. A failed restore can leave an owned unready target; it
cannot be activated without `.restored`. The operator runbook is OCU's
`deploy/BACKUP-RESTORE.md`.

Controlled-engine restore tests, real filesystem/process probes and the broker's
actual epoch reader establish source-level behavior. They do not certify image
execution, metadata fidelity on the acceptance host, real-editor stale callbacks
or B-T14 deployment acceptance; those remain the acceptance-machine run.
