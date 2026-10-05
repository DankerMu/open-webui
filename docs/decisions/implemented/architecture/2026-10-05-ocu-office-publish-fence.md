---
id: 2026-10-05-ocu-office-publish-fence
title: Office publication uses a two-state sandbox fence
kind: architecture
status: implemented
date: 2026-10-05
supersedes: none
references: 'Plan 2 D11; ocu-office-publish; issue 135; 2026-09-22-ocu-lifecycle-lock-and-launch-semantics; 2026-10-03-ocu-office-file-store'
---

# Office publication uses a two-state sandbox fence

## Problem

The canonical chat lock serializes OCU workers and sandbox launch, but sandbox processes do not acquire it. A baseline comparison followed by an atomic replace therefore needs a writer fence as well as host-side serialization. Publication also spans workspace bytes, the outputs index and Office metadata, which cannot be committed in one filesystem rename.

## Decision

Accept the two-state fence of D11: a running sandbox requires an observed pause around comparison and replacement; a stopped or absent sandbox requires the shared canonical RLock plus flock to exclude launch. The implementation here is only the stopped boundary: `office.publish.publish_stopped(chat_id, journal_id)` consumes an existing persisted obligation after read-only engine lookup confirms absence or `exited`. Engine uncertainty and running, paused, transitional or unknown states refuse without changing the obligation. The operation does not create a deleted chat.

The publisher owns obligation validation and returned outcome/reason, not an independent queue or outcome history. Bind the document, stored version, optional session, sequence and requester before workspace access. A bound session owns the baseline; a sessionless resolve/restore obligation uses the document's published hash. Resolve the indexed `file_id` without reconciliation, then durably record the target path and dot-prefixed temporary name before reading workspace bytes. Hash every supported-size current file on every attempt, irrespective of size or mtime hints. Reuse the Office safe reader and verified immutable-blob reader.

Baseline reads use the existing broker per-file limit, which also bounds workspace content admitted for editing. A target that grew beyond that limit without reconciliation completes as `conflict` / `baseline_mismatch`, preserving workspace/index/publication metadata and consuming the obligation. The exact limit remains valid; this adds neither a quota nor a second hashing implementation.

Accept D12's recovery design without implementing it in this stopped slice: a running-path marker records pause start; startup and the existing idle poll take the chat lock and unpause a marked sandbox after the five-second limit, removing the marker only after observing it not paused. An unmarked paused sandbox stays paused. Retained publication obligations are driven before session orphaning. Retention needs no lease because stopping removes writers; cold backup/recovery requires all writers, including OCU, quiescent. Neither an advisory lease nor a new background service replaces those boundaries.

Create staging exclusively without following links. Keep the original parent directory descriptors, write and sync the owned file, and revalidate every ancestor identity and the target before descriptor-relative atomic replacement and directory sync. A late unsafe path consumes the obligation as a failed prewrite outcome; cleanup removes only this attempt's temporary inode, including in a renamed original parent. A pre-existing temporary-name collision is neither followed nor removed.

Staging starts private at mode 0600; after the complete descriptor-bound write it receives the shared workspace mode 0666 before sync and replacement. The replacement inode belongs to the OCU service, so preserving an old sandbox-owned mode 0644 would prevent the different sandbox UID from editing it. This reuses the workspace upload policy; immutable blobs and Office state remain private.

Register only the replaced path through the existing outputs broker under the same lock. One final Office successor marks the version published, updates the document's publication pointer/hash and optional bound baseline, and removes the obligation. Expected conflicts and prewrite failures consume the obligation without changing publication metadata. Lifecycle, sequences, receipts and sibling records remain unchanged.

Interrupted IO propagates and retains the recovery obligation rather than claiming rollback. A postreplace registration or state failure can leave complete workspace bytes visible; a final state-directory sync failure can already expose the successful Office successor without its obligation. Preserve those visible successors. A prepared obligation is refused as recovery-owned rather than replayed as a fresh publish.

## Alternatives considered

- **Process lock alone** — neither coordinates multiple workers nor stops sandbox writers; the existing flock and state-dependent writer fence are both required.
- **Stop/start fallback** — changes sandbox lifecycle and process state instead of making publication safe within its existing state; refusal is preferable to an invented recovery action.
- **Reconcile on publish** — reads unrelated files and can fail on an active unrelated writer; persisted resolution and targeted registration preserve the transaction boundary.
- **Advisory lease** — external sandbox processes need not honor it, so it cannot protect the baseline comparison or replacement.
- **In-place save** — exposes partial bytes to readers and loses the atomic old-or-new content guarantee.

## Consequences

The standalone operation has no route, callback producer or production caller. Running/paused publication, pause markers and stale-fence handling are not implemented here. Retained-obligation recovery execution belongs to issue 137; callback production, lifecycle outcome mapping and `last_published_seq` integration belong to issue 138. The stopped operation does not certify those paths or real-image writer exclusion.

Host-side filesystem mutation outside the shared lock remains outside the supported writer protocol. No-follow descriptors and identity revalidation reject observed path substitutions; durability still depends on filesystem `fsync` semantics. Recovery must inspect both workspace/index state and the retained obligation rather than assume that an exception means no replacement occurred.

The lifecycle-lock and Office-file-store decisions remain authoritative and are not superseded: this decision adds the publication fence and multi-step obligation ownership, not another locking or persistence mechanism.
