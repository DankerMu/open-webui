# Spec Delta

## Purpose

Per-chat Office broker state in OCU: where documents, sessions, immutable versions, save receipts and the commit journal live, how updates stay serialised and durable across worker processes, and how storage is bounded by a free-space floor instead of deletion. Source: Plan 2 § 关键设计 1 版本存储; design D5, D6.

## ADDED Requirements

### Requirement: Per-chat state location hidden from the sandbox

The Office broker SHALL keep all Office state of a chat as files under `{BASE_DATA_DIR}/{chat_id}/.ocu/office/`: `state.json` (schema-versioned; documents, sessions, save receipts and the commit journal), `versions/{sha256}` (version content), `staging/` (downloads in progress) and `fence.json` (present only while a publish holds a running sandbox paused). No Office state SHALL exist only in process memory, in a database or outside that directory, so any worker process SHALL be able to serve any request for the chat. The directory SHALL NOT be inside a path mounted into the sandbox and SHALL NOT appear in the workspace file listing, file download or archive.

#### Scenario: State is written to the chat's own directory

- **WHEN** the first session is created for a document of chat C
- **THEN** `{BASE_DATA_DIR}/C/.ocu/office/state.json` exists, carries a schema version and lists the document and the session
- **AND** no file under another chat's directory is created or changed

#### Scenario: A second worker serves the session

- **WHEN** one worker process creates a session and a different worker process receives the status request for it
- **THEN** the second worker returns the same session with the same `document_key`, `save_seq` and `state`

#### Scenario: The sandbox cannot read or alter history

- **WHEN** a process inside the sandbox of chat C lists `/mnt/user-data` recursively or writes anywhere it is allowed to write
- **THEN** no path under `.ocu` is visible to it and `state.json` and every file under `versions/` keep their bytes

#### Scenario: State is not a workspace file

- **WHEN** the workspace file listing or archive of chat C is requested after Office state exists
- **THEN** no entry from `.ocu/office/` is listed or archived

### Requirement: Serialised, atomic and durable state updates

Every read-modify-write of `state.json` SHALL run under the per-chat lock shared with sandbox lifecycle and the outputs broker (one process-local lock plus the chat's `.lifecycle.lock` file lock), so that concurrent requests in different worker processes never lose an update. Each update SHALL replace `state.json` atomically with a complete successor that is flushed to disk, together with its directory entry, before the operation reports success. A `state.json` that cannot be read, fails schema validation or carries an unknown schema version SHALL make the operation fail explicitly — HTTP 500 with reason `state_corrupt` on browser routes and on the callback route — and SHALL leave the file's bytes unchanged; the broker SHALL NOT reset, regenerate or partially rewrite state.

#### Scenario: Concurrent updates in two workers

- **WHEN** one worker process accepts a save request and another accepts a close request for the same session at the same time
- **THEN** two distinct consecutive `save_seq` values are issued and both are present in the persisted state

#### Scenario: An update waits for the shared lock

- **WHEN** another process holds the per-chat lock of chat C, for example for a sandbox launch
- **THEN** an Office state update for chat C does not start until the lock is released, and then completes

#### Scenario: Crash before the replacement

- **WHEN** the process is killed after the successor was written but before it replaced `state.json`
- **THEN** the next read returns the complete prior state and no partial state is visible

#### Scenario: Corrupt state fails explicitly

- **WHEN** `state.json` of chat C holds invalid JSON or an unknown schema version and any Office request or callback for chat C arrives
- **THEN** the response is HTTP 500 with reason `state_corrupt`
- **AND** `state.json` keeps its bytes, no version content is written and no workspace file is changed

### Requirement: Documents are keyed by file_id

A document SHALL be identified by the outputs broker `file_id` of its workspace file, never by path, name or mtime. The document record SHALL hold the `file_id`, the type (`docx`, `xlsx` or `pptx`), the last known relative path (informational only), the number of the currently published version and that version's SHA-256. A document record SHALL be created the first time a session is created for the `file_id`, and for the new file that a `save_as` conflict resolution writes. A rename that the outputs broker carries under the same `file_id` SHALL keep the document and all its versions; a path that is reused by a new `file_id` SHALL be a separate document that inherits no version.

#### Scenario: Rename keeps the history

- **WHEN** a document with three versions is renamed in the workspace and the outputs broker keeps its `file_id`
- **THEN** the versions listing for that `file_id` returns the same three versions with unchanged numbers and hashes

#### Scenario: Path reuse does not inherit history

- **WHEN** a document's file is deleted, its `file_id` is tombstoned and a new file later appears at the same path with a new `file_id`
- **THEN** the new `file_id` has no versions until a session is created for it, and the versions stored for the old `file_id` are unchanged

### Requirement: Immutable content-addressed versions

Version content SHALL be stored once per SHA-256 at `versions/{sha256}` and SHALL never be modified or replaced after it is written; the bytes of that file SHALL hash to its name. A version record SHALL belong to one document and SHALL carry `number` (per document, starting at 1, strictly increasing, never reused), `parent` (the number of the version the content derives from, or null for the document's first version), `sha256`, `size`, `source`, `created_at` and `published`. `source` SHALL be exactly one of: `workspace` (content captured from the workspace file), `save` (a save with intent `publish`), `autosave` (a save with intent `persist`), `close` (the final callback of a session), `restore` (a restore from history) and `conflict` (the first version of the new document created by a `save_as` resolution). `published` SHALL be true only once the version's content has been the content of the workspace file — through a completed publish, or because it was captured from the workspace file — and SHALL never return to false. Existing version records SHALL NOT be renumbered or removed and SHALL NOT be pointed at different content.

#### Scenario: Equal content is stored once

- **WHEN** two versions of one document, or of two documents of the same chat, have the same SHA-256
- **THEN** exactly one file `versions/{sha256}` exists and each version has its own record and number

#### Scenario: Numbers increase across all sources

- **WHEN** a document receives a `workspace` version, then an `autosave` version, then a `save` version
- **THEN** their numbers are 1, 2 and 3 and no later operation changes them

#### Scenario: Auto-saved version is stored unpublished

- **WHEN** a save with intent `persist` is committed
- **THEN** the new version has `source` `autosave` and `published` false, and the workspace file keeps its previous bytes

#### Scenario: Stored content never changes

- **WHEN** any later save, publish, conflict resolution or restore runs for the same document
- **THEN** every existing file under `versions/` keeps its bytes and still hashes to its name

### Requirement: Workspace content is captured when a session is created

When a session is created the broker SHALL hash the document's workspace file under the per-chat lock. If no version of the document has that SHA-256, the content SHALL be stored as a new version with `source` `workspace` and `published` true before the session is returned; if a version with that hash exists, no version SHALL be added. The hash SHALL be recorded as the session's baseline. History therefore always holds the content that existed before the edit.

#### Scenario: First edit of a file the Agent or an upload produced

- **WHEN** a session is created for a file that has no Office history
- **THEN** version 1 has `source` `workspace`, `published` true and the SHA-256 of the workspace file

#### Scenario: Reopening unchanged content adds nothing

- **WHEN** a session is created and the workspace file's hash equals an existing version of the document
- **THEN** the number of versions is unchanged and the session baseline is that hash

#### Scenario: Agent changed the file between sessions

- **WHEN** the Agent rewrote the file after the last session ended and a new session is created
- **THEN** a new `workspace` version with the file's current hash is stored before the editor receives the content

### Requirement: No automatic deletion and a free-space floor

The broker SHALL NOT delete version content or version records automatically: not when a session closes, when the workspace file is deleted, when a conflict is resolved, on restore or on restart. Before storing version content the broker SHALL compare the free space of the filesystem that holds the chat's Office state with a configured floor and SHALL refuse the store when free space is below it; session creation SHALL be refused while free space is below the floor whether or not it needs to store content. A refusal, and any write that fails for lack of space, SHALL leave no file under `versions/` for that content, SHALL leave `state.json` unchanged and SHALL be answered with HTTP 503 and reason `storage_low` — on session creation, resolve and restore, and on the callback route so that DocumentServer retries. A refused or failed store SHALL never be reported as a completed save.

#### Scenario: Below the floor at session creation

- **WHEN** free space is below the floor and a session is requested
- **THEN** the response is 503 with reason `storage_low`, no session exists and nothing is written under `versions/`

#### Scenario: Below the floor when a save arrives (B-T11)

- **WHEN** free space is below the floor and a callback delivers content for an open session
- **THEN** the callback is answered 503 with reason `storage_low`, no version and no save receipt are recorded, the workspace file keeps its bytes
- **AND** the session's `last_committed_seq` and `last_published_seq` do not advance

#### Scenario: Disk fills during the write (B-T11)

- **WHEN** the filesystem runs out of space while version content is being written
- **THEN** no file with partial content exists at `versions/{sha256}`, `state.json` is unchanged and the operation returns an error

#### Scenario: Versions survive the deletion of their file

- **WHEN** a document's workspace file is deleted and its `file_id` is tombstoned
- **THEN** the version records and every `versions/{sha256}` file of that document still exist

### Requirement: Save receipts

For every callback that stores a version the broker SHALL record a save receipt in the same state update as the version record: session, `save_seq`, content SHA-256, version number and the result first reported. The receipt SHALL be durable before the callback is acknowledged. Receipts SHALL be the basis for answering a repeated callback and SHALL NOT be removed while the chat's Office state exists.

#### Scenario: Receipt is written with the version

- **WHEN** a callback with `save_seq` 3 is committed as version 5
- **THEN** `state.json` holds a receipt naming the session, `save_seq` 3, the version's SHA-256 and version 5

#### Scenario: Receipt answers a repeat after a restart

- **WHEN** OCU restarts after the commit and the same callback is delivered again
- **THEN** the first result is returned, no second version is recorded and the workspace file is not written again

### Requirement: The commit journal and all state survive restarts

The commit journal in `state.json` SHALL hold, for each publish, an intent (document, version, target path, expected baseline hash) recorded before the workspace file is touched and a completion recorded after it; how an intent without completion is resolved is specified by `ocu-office-publish`. After a restart of a worker, of the OCU service or of the host, every document, session, version, receipt and journal entry SHALL be exactly as last durably written, and no session SHALL change state merely because OCU restarted.

#### Scenario: OCU restarts during an edit session (B-T11)

- **WHEN** OCU is restarted while a session is `editing` with two stored versions
- **THEN** the status request returns the same `session_id`, `document_key`, `state`, `save_seq` and `last_committed_seq` as before the restart, and the versions listing is unchanged

#### Scenario: A callback after the restart is processed

- **WHEN** DocumentServer delivers a save callback for that session after the restart
- **THEN** it is validated against the persisted session and committed as the next version

#### Scenario: Journal intent survives a crash

- **WHEN** OCU is killed after a publish intent was recorded and before its completion
- **THEN** the intent is present in `state.json` after the restart
