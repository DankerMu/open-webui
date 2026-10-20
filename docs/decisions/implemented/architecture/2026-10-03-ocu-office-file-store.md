---
id: 2026-10-03-ocu-office-file-store
title: Per-chat Office broker state lives in files, not a database
kind: architecture
status: implemented
date: 2026-10-03
supersedes: none
references: 'Plan 2 D5; ocu-office-store; 2026-09-22-ocu-lifecycle-lock-and-launch-semantics; issue 122; 2026-10-12-ocu-command-deadline (command-loop ownership); 2026-10-15-ocu-callback-progressing-lookups (lookup lock boundaries)'
---

# Per-chat Office broker state lives in files, not a database

## Problem

Office sessions, documents, save receipts and the commit journal must survive worker restarts and stay serialised across the two uvicorn workers. OCU has no SQL client. Backup is a cold copy of the chat-data tree plus WebUI's database. A second store would split crash consistency and extend backup.

## Decision

Keep Office broker state as per-chat files under `{BASE_DATA_DIR}/{chat_id}/.ocu/office/`, starting with schema-versioned `state.json`. The Office store reads and replaces that file under the canonical per-chat `threading.RLock` plus `.lifecycle.lock` flock documented by `2026-09-22-ocu-lifecycle-lock-and-launch-semantics`. Each successful update is one complete successor: a temp file, `fsync`, then `fsync` of the owned parent directories that publish the chat entry in the configured `BASE_DATA_DIR`, `.ocu` in that chat, and `office` in `.ocu`, then `os.replace`, then `fsync` of the leaf `office` directory. Those ancestor syncs run on the held descriptors even when the directories already exist. Durability is bounded by the filesystem honoring `fsync`; this decision does not claim durability of deployment provisioning above the configured `BASE_DATA_DIR`. There is no process-local cache and no cross-chat query.

Missing state is an empty schema without creating `state.json`. Unreadable, malformed or unknown-version state, including inspection and read `OSError` at the chat root, control directories, or `state.json`, fails as `StateCorruptError`, preserves the original cause, and keeps its bytes. A missing path stays absent rather than corrupt. Mutator failures and pre-replace write failures, including ancestor-directory sync failure before replace, remain explicit write-side errors and leave the predecessor. A post-replace leaf-directory sync failure is `StateDurabilityError` and does not claim rollback. Control directories and the state file are opened without following symlinks.

The Office writer shares strict final-owned-directory cleanup with the outputs index and import receipt writers beside the descriptor primitives. Each remaining owned directory receives one close attempt even when earlier closes fail; uncertain failed closes are not retried. Version-blob publication, blob removal and the receipt-replay barrier follow the same one-attempt rule; a close-only barrier failure returns HTTP500 `reason: "state_close_failed"`, distinct from a barrier fsync failure, which stays `state_durability`. A close-only version-blob failure on the callback content path raises `BlobCloseError` and returns the same `state_close_failed`: no version is recorded, and a retry reuses the content-addressed blob. Earlier write, replacement or synchronization errors retain their original class and cause, with actual secondary errors on `close_errors` and a traceback-visible note. Only successful replacement and leaf synchronization permit a close-only `CommittedCloseError`: `committed` is true and `resource` is `office_state`. Office HTTP responses retain their top-level envelope and return HTTP500 with `reason: "committed_close_failed"`, `committed: true` and that resource, without host paths or underlying IO text.

This outcome retains the complete successor and its referenced immutable blobs, not successful completion of the surrounding publication. Staging retirement rereads visible committed state before propagating the error; journal responsibility and registration reuse remain authoritative for recovery. The [unified-files decision](2026-10-02-ocu-unified-workspace-files.md) owns upload receipt replay. Final-close handling does not change acquisition/read cleanup, temporary-file cleanup or the filesystem-dependent durability boundary.

The top-level schema is `schema_version` 1 with mapping collections `documents`, `sessions`, `receipts` and `journal`. Session creation uses the version store's optional state mutator to publish its captured version, document metadata and opening session in the same successor. Blob publication retains its existing owned-blob cleanup on precommit failure; postreplace durability failure retains the complete visible successor and referenced blob. Workspace reads share one descriptor-safe implementation with an optional byte limit, so admission never requires materializing an oversized file.

Join/reopen, close and history restore prepare under this lock, release it for callback-bearing DocumentServer key lookup, and reacquire it to revalidate session/key/epoch and file/version responsibility before applying the outcome. The [callback-progressing lookup decision](2026-10-15-ocu-callback-progressing-lookups.md) owns these boundaries. The async client runs on the service loop through [the bounded command bridge](2026-10-12-ocu-command-deadline.md), never while that loop owns a blocking chat lock. A confirmed orphan transition is durable independently of replacement creation: a later validation/storage failure must not revive a forgotten editor, while replacement capture remains atomic.

For force-save, the request durably allocates its sequence and intent under the lock, releases it for the command, then reconciles the result under the lock against the latest session key and pending allocation. Completed, superseded and final operations remain unchanged. Ordinary failures preserve a concurrent close/conflict; an unknown-key answer orphans a still-owned open session because liveness, not the close allocation, decides whether the editor exists.

The status notice holds the same lock while resolving the edited `file_id`, observing one safely opened descriptor and updating its boolean and size/mtime hints. Successful live-request activity shares that atomic successor; ended conflicts retain notice observations without activity writes. It reuses the reader's canonical opening/hash primitives without changing creation or adding a second reader. A first observation hashes; equal hints reuse the prior result. Unsafe observations invalidate hints so recovery is sampled again. The session's creation baseline remains authoritative: missing baseline is corruption, not permission to adopt workspace bytes. This advisory cache can miss forged metadata; publish-time hashing owns safety.

The idle poll discovers Office-state chats independently of sandbox metadata. Its sweep uses the shared transaction owner and unlocked bounded lookup, then revalidates current eligibility, activity and the same overdue save before mutating lifecycle or reason under the canonical lock. Persisted request activity and save-start clocks serve different deadlines: polling keeps an editor live but cannot extend a pending save indefinitely. Timeout retains the allocation and intent for late callbacks. Successful live requests own activity writes; sweep observations and unreachable lookups do not refresh activity or rewrite unchanged records.

## Alternatives considered

- **PostgreSQL** — new dependency, a migration job, a backup extension, and two-store crash consistency between chat files and rows.
- **SQLite** — still a second store beside the chat-data tree, with extra failure modes under two workers sharing one file.
- **Capture, then commit the session separately** — an ENOSPC failure on the second commit leaves a document/version/blob without the refused session. One state publication keeps creation atomic without a second store or compensation journal.
- **Hold the chat lock across force-save** — a callback induced by the command may need the same lock before the command returns. Durable preparation and ownership-checked reconciliation avoid this callback deadlock without rolling back or reusing an allocated sequence.
- **Stat a path, then reopen it for hashing** — a sandbox writer can replace the path between observations. One validated descriptor and metadata checks around the existing stable-read primitive bind the cached hints to the hashed sample.
- **Reuse sandbox-reclamation candidates for Office sweeping** — Office history survives without a sandbox record; coupling discovery would strand those sessions. The existing poll remains the sole trigger, but Office state determines its own candidates.
- **Treat final close failure as rollback** — can delete an immutable blob referenced by committed state and misreport a saved receipt as unsaved. Commit facts belong to the atomic resource, not the enclosing request.
- **Suppress or retry a failed close** — hides a real error or risks closing a reused descriptor. Attempt remaining owned directories once and preserve the original failures instead.

## Consequences

Operators cannot list or query Office state across chats; each chat's files are the unit of durability and of backup. The shared lifecycle lock serialises Office updates with sandbox launch and the outputs broker; it does not fence sandbox writers. Empty Office directories may appear once an update creates them; a read of missing state still creates no `state.json`. Ancestor publication is part of a successful update; a filesystem that does not honor `fsync` can still lose that publication after success. Pre-replace ancestor-sync failure does not publish. Post-replace leaf sync failure leaves the successor visible.
