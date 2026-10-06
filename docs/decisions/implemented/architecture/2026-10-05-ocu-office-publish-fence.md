---
id: 2026-10-05-ocu-office-publish-fence
title: Office publication uses a two-state sandbox fence
kind: architecture
status: implemented
date: 2026-10-05
supersedes: none
references: 'Plan 2 D11 and D12; ocu-office-publish; issues 135, 136 and 137; 2026-09-22-ocu-lifecycle-lock-and-launch-semantics; 2026-10-03-ocu-office-file-store'
---

# Office publication uses a two-state sandbox fence

## Problem

The canonical chat lock serializes OCU workers and sandbox launch, but sandbox processes do not acquire it. A baseline comparison followed by an atomic replace therefore needs a writer fence as well as host-side serialization. Publication also spans workspace bytes, the outputs index and Office metadata, which cannot be committed in one filesystem rename.

## Decision

Use `office.publish.publish(chat_id, journal_id) -> PublishResult` and `recover_publications(chat_id, now=None) -> None` with one comparison/replacement/registration pipeline under the canonical no-create RLock plus flock. A running sandbox requires a freshly observed `State.Paused` barrier; a stopped or absent sandbox needs no engine mutation. An externally paused sandbox without an owned marker is admitted without claiming or resuming it. Engine uncertainty and transitional/unknown states refuse without consuming a recovery obligation. Neither operation creates a deleted chat.

The publisher owns obligation validation and returned outcome/reason, not an independent queue or outcome history. Bind the document, stored version, optional session, sequence and requester before workspace access. A bound session owns the baseline; a sessionless resolve/restore obligation uses the document's published hash. Resolve the indexed `file_id` without reconciliation, then durably record the target path and dot-prefixed temporary name before reading workspace bytes. Hash every supported-size current file on every attempt, irrespective of size or mtime hints. Reuse the Office safe reader and verified immutable-blob reader.

Fresh indexed-resolution and missing-path refusals precede pause. Prepared recovery acquires and freshly observes one fence before recorded-parent traversal or shared temporary inspection/cleanup, and reuses it through comparison, matching-successor registration, exposure/replacement and final cleanup. Failed or uncertain recovery acquisition leaves the original journal and shared/private staging intact; release handles only the owned attempt. Durably install `.ocu/office/fence.json` with integer `schema_version: 1`, the original nonempty `container_id` and finite nonnegative `pause_started_at` wall time before requesting pause. Complete private mode-0600 marker bytes are written through an exclusive no-follow descriptor and fsynced; a descriptor-relative hard link installs them without clobbering. Directory durability and marker/control-directory identities are checked before pause.

The fence owns only the original container identity and marker inode. A pause API error can still have paused the container, so cleanup inspects that original identity and attempts unpause if needed. After a pause request, only a positive owned unpaused/stopped/absent observation permits inode-bound marker removal. Unknown release retains the marker; a replacement container or marker is never resumed or deleted. Retention stop removes writers and is not reversed by start/unpause. Release and logging failures do not replace a primary exception or an established publication result.

Baseline reads use the existing broker per-file limit, which also bounds workspace content admitted for editing. A target that grew beyond that limit without reconciliation completes as `conflict` / `baseline_mismatch`, preserving workspace/index/publication metadata and consuming the obligation. The exact limit remains valid; this adds neither a quota nor a second hashing implementation.

Use the existing idle reaper, not an independent recovery scheduler. After `startup_idle_sweep`, call `office.sweep.sweep_office_publications(now=None)` before the first poll. Each poll retains sandbox reclamation followed by `sweep_office_sessions(now=None)`, which recovers that chat before reading its sessions. Both Office sweeps share canonical non-symlink discovery, including chats without sandbox metadata or idle state; disabled Office performs no discovery. Unresolved recovery blocks that chat's session read/key check without suppressing other chats.

Before a requested publish, drive unrelated survivors and older same-document obligations; drive newer same-document survivors in dependency order after the requested entry. Validate bindings first and order same-document work by immutable version number and save sequence, not sorted JSON journal keys. Each transaction rereads the resulting baseline; return the requested entry's own outcome. An interrupted prerequisite blocks dependent work. Recovery never recursively calls the public publisher or deletes/recreates a prepared obligation.

Stale-fence recovery requires wall-clock age strictly greater than five seconds, distinct from the live monotonic budget. Query the recorded original container by ID, never a replacement at its reusable name. Remove only the inspected marker inode after positive owned unpaused/stopped/absent observation, then durably sync the removal. Young, corrupt, replaced or uncertain markers remain. An external pause without a marker is not released. A live publisher's canonical lock cannot be displaced by another recovering worker.

The [approved staging-ownership ruling](https://github.com/DankerMu/open-webui/issues/137#issuecomment-6007445205) includes the minimal publisher prerequisite in automatic recovery. A journal retains its `file_id`, `version`, optional `session_id`/`save_seq` and `requester` continuously. Prepared entries add `target_path` and `temporary_name`, whose syntax is `.office-publish.<32 lowercase hex>.tmp`. Names and matching bytes alone confer no deletion authority.

Allocate a separate empty inode exclusively in the existing mode-0700 `.ocu/office/staging` directory, add a private witness hardlink and sync the allocation. Before writing version bytes or exposing shared staging, durably bind the journal's `staging` object:

| Field             | Binding                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `schema_version`  | Integer `1`                                                                              |
| `anchor_name`     | Private entry equal to `temporary_name`                                                  |
| `witness_name`    | `.publish-owner.<32 lowercase hex>`                                                      |
| `device`, `inode` | Nonnegative integer filesystem identity                                                  |
| `retired`         | Boolean; `false` while active, `true` after durable shared absence; absent means `false` |

Write the verified version through the allocated descriptor, apply shared mode 0666, and sync it before no-clobber hardlink exposure into the workspace. Check device identity and refuse unsupported linking without a copy fallback. Never expose an immutable version blob as a writable workspace inode. Revalidate ancestor/target identities before descriptor-relative atomic replacement and directory sync. A late unsafe path is a failed prewrite outcome only when cleanup is ownership-safe; foreign/colliding/substituted private or shared entries remain untouched with unresolved responsibility.

Cleanup requires established writer exclusion. Verify shared ownership against active private pins, positively establish shared removal/absence and sync its parent. Hold an open verified inode pin while durably marking `staging.retired: true`, then remove verified private names and sync each cleanup before Office completion. An uncertain retirement commit rereads the visible journal, propagates the durability error and does not unlink private pins. A fresh process never adopts or deletes retired names; detected substitutions still refuse recovery. This retirement boundary prevents stale inode numbers from authorizing deletion after the final private pin disappears.

A missing prepared parent is not generic `ENOENT`: retain existing ancestor descriptors, reopen/revalidate their identities, and confirm the exact missing component with no-follow inspection through its held parent before sync. Only that explicit absence permits skipping shared deletion and retiring verified private ownership. Symlinks, non-directories, permission failures, contradictory observations and changed ancestors refuse. Existing indexed resolution then completes `path_missing` without recreating the parent.

The replacement inode belongs to the OCU service, so preserving an old sandbox-owned mode 0644 would prevent the different sandbox UID from editing it. Shared mode 0666 reuses the workspace upload policy; immutable blobs and Office state remain private.

Register only the selected path through the existing outputs broker under the same lock. Recovery verifies the immutable version and compares current bytes; matching successor bytes complete registration without another workspace replacement. Registration advances the revision on every call, including replay after a visible registration whose Office outcome was not committed; exactly-once revision advancement is not promised. After owned staging cleanup and fence release handling, one final Office successor marks the version published, updates the document pointer/hash and optional bound baseline, and removes the obligation. Expected conflicts and completed prewrite failures consume the obligation without changing publication metadata. Lifecycle, sequences, receipts and sibling records remain unchanged. Completed recovery performs no workspace/state write, revision advance or engine action.

Workspace mutation, broker registration and final Office IO interruptions retain responsibility rather than claiming rollback. A postreplace registration or state failure can leave complete successor bytes visible; a final state-directory sync failure can expose the completed Office successor without its obligation. Preserve those visible successors. Prepared replay keeps the journal throughout cleanup, rebinding and another recovery crash.

The [user-approved timing ruling](https://github.com/DankerMu/open-webui/issues/136#issuecomment-5997477072) makes five seconds a monotonic safe-boundary publication budget, not a hard wall-clock unpause guarantee. Fence acquisition and comparison/staging/replacement/registration phases have checkpoints; elapsed time `>= 5` stops further publication mutation after an in-flight operation settles, while required owned cleanup/release remains possible. A fresh pre-replacement timeout returns `failed` / `publish_timeout`, preserves the old workspace and consumes the obligation. Recovery timeout or incomplete postreplace timeout returns `interrupted` / `publish_timeout` and retains the journal. Once registration and its deadline/identity checks establish an outcome, slow or failed release does not invalidate it. Final Office bookkeeping retains its ordinary durability exceptions.

Emit one duration record for each attempted owned pause. `paused_duration_seconds` measures from pause request through release handling, explicitly identified by `duration_basis`; `publication_elapsed_seconds` includes fence preparation. `release_observed`, `marker_retained` and `cleanup_failed` distinguish confirmed release from uncertainty and visible marker deletion from cleanup durability. Neither interval is a measurement of the precise engine-paused duration, and a retained marker is not a claim that writers resumed.

## Alternatives considered

- **Process lock alone** — neither coordinates multiple workers nor stops sandbox writers; the existing flock and state-dependent writer fence are both required.
- **Stop/start fallback** — changes sandbox lifecycle and process state instead of making publication safe within its existing state; refusal is preferable to an invented recovery action.
- **Reconcile on publish** — reads unrelated files and can fail on an active unrelated writer; persisted resolution and targeted registration preserve the transaction boundary.
- **Advisory lease** — external sandbox processes need not honor it, so it cannot protect the baseline comparison or replacement.
- **In-place save** — exposes partial bytes to readers and loses the atomic old-or-new content guarantee.
- **Watchdog unpause or timed-out background worker** — cancellation does not stop synchronous mutation; resuming writers while publication continues destroys the fence. Safe-boundary checks preserve ownership without mutating the shared Docker client's timeout.
- **Persist inode only after shared creation** — leaves an ordinary crash window with no provable deletion authority; durable private binding must precede shared exposure.
- **Clean prepared staging before pausing** — permits a supported sandbox writer to replace an inspected owned name before unlink; one freshly observed fence must span cleanup and replay.
- **Treat every parent `ENOENT` as absence** — conflates a missing component with unsafe or contradictory traversal and can retire ownership without proof.
- **Copy fallback or writable version-blob hardlink** — respectively changes the ownership protocol or exposes immutable history to sandbox writes; unsupported exposure must refuse.

## Consequences

Publication recovery runs at startup, each existing poll and before new publication. Callback production/duplicate handling, request-side orphan hooks, session outcome mapping and `last_published_seq` integration remain outside this slice. Recovery changes publication metadata and the bound baseline, not the session lifecycle result. Retention needs no lease because stopping removes writers; cold backup/recovery requires all writers, including OCU, quiescent.

Ordinary process crashes converge without adopting ambiguous private entries. A crash before private binding may leave empty unbound anchor/witness names; interruption after durable retirement may leave harmless retired names. Preserve these leftovers without blocking publication, deleting foreign content or introducing garbage collection. Automatic obligation convergence is not a guarantee of complete private-directory cleanup.

Fake-engine tests and killed-publisher/fresh-recovery process smoke exercise real files, stopped/resumed POSIX writers, owned shared cleanup, complete version bytes, original-container release, no-second-replacement completion and completed-recovery no-op. This does not certify cross-UID access, an actual Docker engine/image, LAN deployment, power-loss durability or deployment filesystem hardlink support.

Host-side filesystem mutation outside the shared lock remains outside the supported writer protocol. No-follow descriptors and identity revalidation reject observed path substitutions; durability still depends on filesystem `fsync` semantics. Recovery must inspect both workspace/index state and the retained obligation rather than assume that an exception means no replacement occurred.

The lifecycle-lock and Office-file-store decisions remain authoritative and are not superseded: this decision adds the publication fence and multi-step obligation ownership, not another locking or persistence mechanism.
