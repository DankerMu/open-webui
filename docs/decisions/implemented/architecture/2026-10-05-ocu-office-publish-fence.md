---
id: 2026-10-05-ocu-office-publish-fence
title: Office publication uses a two-state sandbox fence
kind: architecture
status: implemented
date: 2026-10-05
supersedes: none
references: 'Plan 2 D11; ocu-office-publish; issues 135 and 136; 2026-09-22-ocu-lifecycle-lock-and-launch-semantics; 2026-10-03-ocu-office-file-store'
---

# Office publication uses a two-state sandbox fence

## Problem

The canonical chat lock serializes OCU workers and sandbox launch, but sandbox processes do not acquire it. A baseline comparison followed by an atomic replace therefore needs a writer fence as well as host-side serialization. Publication also spans workspace bytes, the outputs index and Office metadata, which cannot be committed in one filesystem rename.

## Decision

Use one `office.publish.publish(chat_id, journal_id)` operation and one comparison/replacement/registration pipeline under the canonical RLock plus flock. A running sandbox requires a freshly observed `State.Paused` barrier; a stopped or absent sandbox needs no engine mutation. An externally paused sandbox without a marker is admitted without claiming or resuming it. Engine uncertainty and transitional/unknown states refuse without changing the obligation. The operation does not create a deleted chat.

The publisher owns obligation validation and returned outcome/reason, not an independent queue or outcome history. Bind the document, stored version, optional session, sequence and requester before workspace access. A bound session owns the baseline; a sessionless resolve/restore obligation uses the document's published hash. Resolve the indexed `file_id` without reconciliation, then durably record the target path and dot-prefixed temporary name before reading workspace bytes. Hash every supported-size current file on every attempt, irrespective of size or mtime hints. Reuse the Office safe reader and verified immutable-blob reader.

Indexed-resolution and missing-path refusals precede pause. Durably install `.ocu/office/fence.json` with `schema_version: 1`, the original `container_id` and `pause_started_at` wall time recorded before the request. Complete private mode-0600 contents are written through an exclusive no-follow temporary descriptor and fsynced; a descriptor-relative hard link installs them atomically without clobbering an existing name. Directory durability and marker/control-directory identities are checked before pause. An existing marker belongs to recovery, not a new attempt.

The fence owns only the original container identity and marker inode. A pause API error can still have paused the container, so cleanup inspects that original identity and attempts unpause if needed. After a pause request, only a positive owned unpaused/stopped/absent observation permits inode-bound marker removal. Unknown release retains the marker; a replacement container or marker is never resumed or deleted. Retention stop removes writers and is not reversed by start/unpause. Release and logging failures do not replace a primary exception or an established publication result.

Baseline reads use the existing broker per-file limit, which also bounds workspace content admitted for editing. A target that grew beyond that limit without reconciliation completes as `conflict` / `baseline_mismatch`, preserving workspace/index/publication metadata and consuming the obligation. The exact limit remains valid; this adds neither a quota nor a second hashing implementation.

Accept D12's recovery ownership without implementing its execution: startup and the existing idle poll will handle stale owned fences and retained obligations under the chat lock before session orphaning. Retention needs no lease because stopping removes writers; cold backup/recovery requires all writers, including OCU, quiescent. Neither an advisory lease nor a new background service replaces those boundaries.

Create staging exclusively without following links. Keep the original parent directory descriptors, write and sync the owned file, and revalidate every ancestor identity and the target before descriptor-relative atomic replacement and directory sync. A late unsafe path consumes the obligation as a failed prewrite outcome; cleanup removes only this attempt's temporary inode, including in a renamed original parent. A pre-existing temporary-name collision is neither followed nor removed.

Staging starts private at mode 0600; after the complete descriptor-bound write it receives the shared workspace mode 0666 before sync and replacement. The replacement inode belongs to the OCU service, so preserving an old sandbox-owned mode 0644 would prevent the different sandbox UID from editing it. This reuses the workspace upload policy; immutable blobs and Office state remain private.

Register only the replaced path through the existing outputs broker under the same lock. After fence release handling, one final Office successor marks the version published, updates the document's publication pointer/hash and optional bound baseline, and removes the obligation. Expected conflicts and completed prewrite failures consume the obligation without changing publication metadata. Lifecycle, sequences, receipts and sibling records remain unchanged.

Workspace mutation, broker registration and final Office IO interruptions propagate and retain the recovery obligation rather than claiming rollback. A postreplace registration or state failure can leave complete workspace bytes visible; a final state-directory sync failure can already expose the successful Office successor without its obligation. Preserve those visible successors. A prepared obligation is refused as recovery-owned rather than replayed as a fresh publish.

The [user-approved timing ruling](https://github.com/DankerMu/open-webui/issues/136#issuecomment-5997477072) makes five seconds a monotonic safe-boundary publication budget, not a hard wall-clock unpause guarantee. Fence acquisition and potentially blocking comparison/staging/replacement/registration phases have deadline checkpoints; elapsed time `>= 5` stops further publication mutation after an in-flight operation settles. Before replacement, `failed` / `publish_timeout` preserves the old workspace and consumes the obligation. After replacement but before a consistent pipeline outcome, `interrupted` / `publish_timeout` preserves complete successor bytes and retains the prepared journal; it bypasses terminal Office completion. Once registration and its deadline/identity checks establish an outcome, slow or failed release does not invalidate it. Final Office bookkeeping retains its ordinary durability exceptions.

Emit one duration record for each attempted owned pause. `paused_duration_seconds` measures from pause request through release handling, explicitly identified by `duration_basis`; `publication_elapsed_seconds` includes fence preparation. `release_observed`, `marker_retained` and `cleanup_failed` distinguish confirmed release from uncertainty and visible marker deletion from cleanup durability. Neither interval is a measurement of the precise engine-paused duration, and a retained marker is not a claim that writers resumed.

## Alternatives considered

- **Process lock alone** — neither coordinates multiple workers nor stops sandbox writers; the existing flock and state-dependent writer fence are both required.
- **Stop/start fallback** — changes sandbox lifecycle and process state instead of making publication safe within its existing state; refusal is preferable to an invented recovery action.
- **Reconcile on publish** — reads unrelated files and can fail on an active unrelated writer; persisted resolution and targeted registration preserve the transaction boundary.
- **Advisory lease** — external sandbox processes need not honor it, so it cannot protect the baseline comparison or replacement.
- **In-place save** — exposes partial bytes to readers and loses the atomic old-or-new content guarantee.
- **Watchdog unpause or timed-out background worker** — cancellation does not stop synchronous mutation; resuming writers while publication continues destroys the fence. Safe-boundary checks preserve ownership without mutating the shared Docker client's timeout.

## Consequences

The standalone operation has no route, callback producer or production caller. Retained-obligation and stale-fence recovery execution belongs to issue 137; callback production, lifecycle outcome mapping and `last_published_seq` integration belong to issue 138. Focused fake-engine tests cover publication, deadlines, identity ownership and durability faults. Process smoke exercises a real POSIX filesystem writer quiesced/resumed through the fake Docker boundary, complete version bytes and fresh-process workspace/index/Office persistence. The writer uses the service UID; this evidence does not certify cross-UID access, an actual Docker engine/image, LAN deployment or recovery execution.

Host-side filesystem mutation outside the shared lock remains outside the supported writer protocol. No-follow descriptors and identity revalidation reject observed path substitutions; durability still depends on filesystem `fsync` semantics. Recovery must inspect both workspace/index state and the retained obligation rather than assume that an exception means no replacement occurred.

The lifecycle-lock and Office-file-store decisions remain authoritative and are not superseded: this decision adds the publication fence and multi-step obligation ownership, not another locking or persistence mechanism.
