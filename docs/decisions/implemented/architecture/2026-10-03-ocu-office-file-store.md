---
id: 2026-10-03-ocu-office-file-store
title: Per-chat Office broker state lives in files, not a database
kind: architecture
status: implemented
date: 2026-10-03
supersedes: none
references: 'Plan 2 D5; ocu-office-store; 2026-09-22-ocu-lifecycle-lock-and-launch-semantics; issue 122'
---

# Per-chat Office broker state lives in files, not a database

## Problem

Office sessions, documents, save receipts and the commit journal must survive worker restarts and stay serialised across the two uvicorn workers. OCU has no SQL client. Backup is a cold copy of the chat-data tree plus WebUI's database. A second store would split crash consistency and extend backup.

## Decision

Keep Office broker state as per-chat files under `{BASE_DATA_DIR}/{chat_id}/.ocu/office/`, starting with schema-versioned `state.json`. The Office store reads and replaces that file under the canonical per-chat `threading.RLock` plus `.lifecycle.lock` flock documented by `2026-09-22-ocu-lifecycle-lock-and-launch-semantics`. Each successful update is one complete successor: a temp file, `fsync`, then `fsync` of the owned parent directories that publish the chat entry in the configured `BASE_DATA_DIR`, `.ocu` in that chat, and `office` in `.ocu`, then `os.replace`, then `fsync` of the leaf `office` directory. Those ancestor syncs run on the held descriptors even when the directories already exist. Durability is bounded by the filesystem honoring `fsync`; this decision does not claim durability of deployment provisioning above the configured `BASE_DATA_DIR`. There is no process-local cache and no cross-chat query.

Missing state is an empty schema without creating `state.json`. Unreadable, malformed or unknown-version state, including inspection and read `OSError` at the chat root, control directories, or `state.json`, fails as `StateCorruptError`, preserves the original cause, and keeps its bytes. A missing path stays absent rather than corrupt. Mutator failures and pre-replace write failures, including ancestor-directory sync failure before replace, remain explicit write-side errors and leave the predecessor. A post-replace leaf-directory sync failure is `StateDurabilityError` and does not claim rollback. Control directories and the state file are opened without following symlinks.

The top-level schema is `schema_version` 1 with mapping collections `documents`, `sessions`, `receipts` and `journal`. Session creation uses the version store's optional state mutator to publish its captured version, document metadata and opening session in the same successor. Blob publication retains its existing owned-blob cleanup on precommit failure; postreplace durability failure retains the complete visible successor and referenced blob. Workspace reads share one descriptor-safe implementation with an optional byte limit, so admission never requires materializing an oversized file.

Join/reopen decisions keep this lock across the bounded DocumentServer key lookup in a synchronous request worker; the async client runs on that worker's private event loop, never while the application event loop owns a blocking chat lock. This serializes same-chat admission without an optimistic revalidation protocol, at the cost of delaying that chat by the existing lookup timeout. A confirmed orphan transition is durable independently of replacement creation: a later validation/storage failure must not revive a forgotten editor, while replacement capture remains atomic.

## Alternatives considered

- **PostgreSQL** — new dependency, a migration job, a backup extension, and two-store crash consistency between chat files and rows.
- **SQLite** — still a second store beside the chat-data tree, with extra failure modes under two workers sharing one file.
- **Capture, then commit the session separately** — an ENOSPC failure on the second commit leaves a document/version/blob without the refused session. One state publication keeps creation atomic without a second store or compensation journal.

## Consequences

Operators cannot list or query Office state across chats; each chat's files are the unit of durability and of backup. The shared lifecycle lock serialises Office updates with sandbox launch and the outputs broker; it does not fence sandbox writers. Empty Office directories may appear once an update creates them; a read of missing state still creates no `state.json`. Ancestor publication is part of a successful update; a filesystem that does not honor `fsync` can still lose that publication after success. Pre-replace ancestor-sync failure does not publish. Post-replace leaf sync failure leaves the successor visible.
