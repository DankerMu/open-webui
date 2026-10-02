# Spec Delta

## Purpose

Per-chat Office broker state in OCU: where documents, sessions, immutable versions, save receipts and the commit journal live, how updates stay serialised and durable across worker processes, how the edited workspace file is read safely, how storage is bounded by a free-space floor instead of deletion, and the restore epoch marker. Source: Plan 2 § 关键设计 1 版本存储; design D5, D6, D9 (receipts), D11 (journal entry), D18 (restore epoch).

## ADDED Requirements

### Requirement: Per-chat state location hidden from the sandbox

The Office broker SHALL keep all Office state of a chat as files under `{BASE_DATA_DIR}/{chat_id}/.ocu/office/`: `state.json` (schema-versioned; documents, sessions, save receipts and the commit journal), `versions/{sha256}` (version content), `staging/` (downloads in progress) and `fence.json` (the stale-fence marker of a publish; its lifecycle is specified by `ocu-office-publish`). No Office state SHALL exist only in process memory, in a database or outside that directory, so any worker process SHALL be able to serve any request for the chat; the one value read from outside it is the deployment-wide restore epoch (requirement "Restore epoch marker"). The directory SHALL NOT be inside a path mounted into the sandbox and SHALL NOT appear in the workspace file listing, file download or archive.

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

- **WHEN** one worker process commits the status 6 callback of a session's outstanding save while another worker process accepts a close request for the same session, in either order
- **THEN** the persisted state holds the callback's version and receipt and the `save_seq` allocated by the close, and the session is `closing`
- **AND** neither update is lost whichever worker took the lock first

#### Scenario: Status bookkeeping does not lose a commit

- **WHEN** one worker process commits a callback's version while another worker process records the size and mtime checked by a status request for the same session
- **THEN** the persisted state holds the version, its receipt and the recorded size and mtime

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

A document SHALL be identified by the outputs broker `file_id` of its workspace file, never by path, name or mtime. The document record SHALL hold the `file_id`, the type (`docx`, `xlsx` or `pptx`), the last known relative path (informational only), the number of the currently published version and that version's SHA-256. A document record SHALL be created the first time a session is created for the `file_id`, and for the new file that a `save_as` writes, whether requested through resolve or performed automatically (`ocu-office-publish`). A rename that the outputs broker carries under the same `file_id` SHALL keep the document and all its versions; a path that is reused by a new `file_id` SHALL be a separate document that inherits no version.

#### Scenario: Rename keeps the history

- **WHEN** a document with three versions is renamed in the workspace and the outputs broker keeps its `file_id`
- **THEN** the versions listing for that `file_id` returns the same three versions with unchanged numbers and hashes

#### Scenario: Path reuse does not inherit history

- **WHEN** a document's file is deleted, its `file_id` is tombstoned and a new file later appears at the same path with a new `file_id`
- **THEN** the new `file_id` has no versions until a session is created for it, and the versions stored for the old `file_id` are unchanged

### Requirement: Immutable content-addressed versions

Version content SHALL be stored once per SHA-256 at `versions/{sha256}` and SHALL never be modified or replaced after it is written; the bytes of that file SHALL hash to its name. A version record SHALL belong to one document and SHALL carry `number` (per document, starting at 1, strictly increasing, never reused), `parent` (the number of the version the content derives from, or null for the document's first version), `sha256`, `size`, `source`, `created_at` and `published`. `source` SHALL be exactly one of: `workspace` (content captured from the workspace file), `save` (a save with intent `publish`), `autosave` (a save with intent `persist`), `close` (the final callback of a session), `restore` (a restore from history) and `conflict` (the first version of the new document that a `save_as` creates). `published` SHALL be true only once the version's content has been the content of the workspace file — because a publish replaced the workspace file with it, or, for a `workspace` version, because it was captured from the workspace file — and SHALL never return to false. Content persisted from a callback whose SHA-256 equals that of the document's latest version SHALL add no version record; the callback's receipt SHALL name the existing version. Existing version records SHALL NOT be renumbered or removed and SHALL NOT be pointed at different content.

#### Scenario: Equal content is stored once

- **WHEN** two versions of one document, or of two documents of the same chat, have the same SHA-256
- **THEN** exactly one file `versions/{sha256}` exists and each version has its own record and number

#### Scenario: Numbers increase across all sources

- **WHEN** a document receives a `workspace` version, then an `autosave` version, then a `save` version
- **THEN** their numbers are 1, 2 and 3 and no later operation changes them

#### Scenario: Auto-saved version is stored unpublished

- **WHEN** a save with intent `persist` is committed and its content differs from the document's latest version
- **THEN** the new version has `source` `autosave` and `published` false, and the workspace file keeps its previous bytes

#### Scenario: Content equal to the latest version adds no version record

- **WHEN** a callback delivers content whose SHA-256 equals that of the document's latest version, which is version 3
- **THEN** the document still has three versions, the callback's receipt names version 3 and the callback is acknowledged as committed

#### Scenario: Stored content never changes

- **WHEN** any later save, publish, conflict resolution or restore runs for the same document
- **THEN** every existing file under `versions/` keeps its bytes and still hashes to its name

### Requirement: Workspace content is captured when a session is created

When a session is created the broker SHALL hash the document's workspace file under the per-chat lock, reading it as the requirement "Safe reads of the edited workspace file" prescribes. If that SHA-256 differs from the SHA-256 of the document's newest version, or the document has no version, a version with `source` `workspace` and `published` true SHALL be recorded before the session is returned, sharing the stored content when the same bytes were stored before; if the newest version has that hash, no version SHALL be added. The newest version of a document that has a session is therefore never older content than the workspace file the session started from. The hash SHALL be recorded as the session's baseline. History therefore always holds the content that existed before the edit.

#### Scenario: First edit of a file the Agent or an upload produced

- **WHEN** a session is created for a file that has no Office history
- **THEN** version 1 has `source` `workspace`, `published` true and the SHA-256 of the workspace file

#### Scenario: Reopening unchanged content adds nothing

- **WHEN** a session is created and the workspace file's hash equals an existing version of the document
- **THEN** the number of versions is unchanged and the session baseline is that hash

#### Scenario: Agent changed the file between sessions

- **WHEN** the Agent rewrote the file after the last session ended and a new session is created
- **THEN** a new `workspace` version with the file's current hash is stored before the editor receives the content

#### Scenario: Workspace content equals an older version

- **WHEN** a document's newest version is an unpublished auto-saved version, the workspace file still holds the content of an earlier published version, and a session is created
- **THEN** a new `workspace` version with the next number is recorded for the workspace content, no second copy of the bytes is stored, and it is the document's newest version

### Requirement: Safe reads of the edited workspace file

Every host-side read of the edited workspace file — the capture at session creation, the hash taken by the status request, the hash inside the publish fence, and the captures before an `overwrite` and before a restore — SHALL open the file without following a symlink and SHALL read it only when it is a regular file inside the chat's workspace files directory and no parent component of its path is a symlink. A file that fails this check SHALL never be read, and no byte of a link's target SHALL reach `versions/`, `staging/` or a response. The consequence is fixed per caller: session creation SHALL be refused with HTTP 422 and reason `unsafe_path`, creating no session, document record or version; the status request reports `workspace_changed` true (`ocu-office-sessions`); a publish treats the file as a baseline mismatch, and `overwrite` and restore are refused with `unsafe_path` (`ocu-office-publish`).

#### Scenario: Edited file replaced by a symlink before a session is created (B-T13)

- **WHEN** the workspace file of an indexed document was replaced, since the last listing, by a symlink to a file outside the chat's workspace files directory, and a session is requested for its `file_id`
- **THEN** the response is 422 with reason `unsafe_path`, and no session, document record or version exists for that `file_id`
- **AND** no file under `versions/` or `staging/` holds the bytes of the link's target

#### Scenario: Parent directory replaced by a symlink before a session is created (B-T13)

- **WHEN** a parent directory of an indexed document's path was replaced by a symlink to a directory outside the chat's workspace files directory, and a session is requested for its `file_id`
- **THEN** the response is 422 with reason `unsafe_path` and nothing is stored

### Requirement: No automatic deletion and a free-space floor

The broker SHALL NOT delete version content or version records automatically: not when a session closes, when the workspace file is deleted, when a conflict is resolved, on restore or on restart. Before storing version content the broker SHALL compare the free space of the filesystem that holds the chat's Office state with a configured floor and SHALL refuse the store when free space is below it; session creation SHALL be refused while free space is below the floor whether or not it needs to store content. A refusal, and any write that fails for lack of space, SHALL leave no file under `versions/` for that content, SHALL add no version record, receipt or journal entry, and SHALL be answered with HTTP 503 and reason `storage_low` — on session creation, resolve and restore, and on the callback route so that DocumentServer retries. A refused or failed store SHALL never be reported as a completed save; the session state after a refused callback is specified by `ocu-office-callback`.

#### Scenario: Below the floor at session creation

- **WHEN** free space is below the floor and a session is requested
- **THEN** the response is 503 with reason `storage_low`, no session exists and nothing is written under `versions/`

#### Scenario: Below the floor when a save arrives (B-T11)

- **WHEN** free space is below the floor and a callback delivers content for an open session
- **THEN** the callback is answered 503 with reason `storage_low`, no version and no receipt are recorded, the workspace file keeps its bytes
- **AND** the session's `last_committed_seq` and `last_published_seq` do not advance

#### Scenario: Disk fills during the write (B-T11)

- **WHEN** the filesystem runs out of space while version content is being written
- **THEN** no file with partial content exists at `versions/{sha256}`, no version record or receipt is added and the operation returns an error

#### Scenario: Versions survive the deletion of their file

- **WHEN** a document's workspace file is deleted and its `file_id` is tombstoned
- **THEN** the version records and every `versions/{sha256}` file of that document still exist

### Requirement: Save receipts

For every status 2, 3, 4, 6 or 7 callback that is processed to an outcome the broker SHALL record a save receipt keyed by session and `save_seq`: the callback status, the content SHA-256 when the callback delivered content, the number of the version that holds that content when there is one, and the answer given. This includes status 3, 4 and 7, which store no version, and a callback whose content equals the document's latest version, whose receipt names the existing version. A callback that is answered with an error so that DocumentServer retries it (`ocu-office-callback`) SHALL leave no receipt. The receipt of a final callback (status 2, 3 or 4) SHALL hold the `save_seq` that callback took. A receipt SHALL be written in the same state update as the version record when one is added, and SHALL be durable before the callback is acknowledged. Receipts SHALL be the basis for answering a repeated callback, in the order specified by `ocu-office-callback`, and SHALL NOT be removed while the chat's Office state exists.

#### Scenario: Receipt is written with the version

- **WHEN** a status 6 callback with `save_seq` 3 is committed as version 5
- **THEN** `state.json` holds a receipt naming the session, `save_seq` 3, status 6, the version's SHA-256 and version 5

#### Scenario: Callbacks that store no version leave a receipt

- **WHEN** a status 7 callback with `save_seq` 2 is processed, and later a status 4 or status 3 callback ends the session
- **THEN** `state.json` holds a receipt for `save_seq` 2 with status 7 and a receipt for the final callback with its status and the `save_seq` it took, neither naming a new version

#### Scenario: A refused callback leaves no receipt

- **WHEN** a callback is answered with an error because its download, its content check or the storage floor failed
- **THEN** no receipt exists for its `save_seq`

#### Scenario: Receipt answers a repeat after a restart

- **WHEN** OCU restarts after the commit and the same callback is delivered again
- **THEN** the recorded answer is returned, no second version is recorded and the workspace file is not written again

### Requirement: The commit journal and all state survive restarts

The commit journal in `state.json` SHALL hold one entry for each publish that has not reached an outcome. An entry is the obligation to publish: it SHALL name the document, the version, the session when there is one, the `save_seq` and what requested the publish (save, final callback, resolve or restore), and the publish adds the target path and the temporary file name to it before it touches the workspace. For a callback with publish intent the entry SHALL be written in the same state update as the version record and the receipt, so no durable state holds a committed callback with publish intent without its entry. An entry SHALL be removed only by the state update that records the outcome of its publish; when an entry is driven and which outcomes exist is specified by `ocu-office-publish`. An entry is driven before its session is marked `orphaned`, so no session in a final state holds one. After a restart of a worker, of the OCU service or of the host, every document, session, version, receipt and journal entry SHALL be exactly as last durably written. A restart by itself SHALL NOT change the state of a session; after a restart a session changes only through the driving of a journal entry (`ocu-office-publish`), the session sweep (`ocu-office-sessions`) or a new request or callback.

#### Scenario: OCU restarts during an edit session (B-T11)

- **WHEN** OCU is restarted while a session is `editing` with two stored versions and no journal entry
- **THEN** the status request returns the same `session_id`, `document_key`, `state`, `save_seq` and `last_committed_seq` as before the restart, and the versions listing is unchanged

#### Scenario: A callback after the restart is processed

- **WHEN** DocumentServer delivers a save callback for that session after the restart
- **THEN** it is validated against the persisted session and committed as the next version

#### Scenario: Publish obligation is committed with the version

- **WHEN** a status 6 callback whose recorded intent is `publish` is committed as version 5 and the state is read before its publish starts
- **THEN** the state holds version 5, the receipt and a journal entry naming the document, version 5, the session and the callback's `save_seq`

#### Scenario: Auto-save leaves no journal entry

- **WHEN** a status 6 callback whose recorded intent is `persist` is committed
- **THEN** the state holds the version and the receipt and no journal entry

#### Scenario: Journal entry survives a crash

- **WHEN** OCU is killed after a journal entry was written and before its publish reached an outcome
- **THEN** the entry is present in `state.json` when the state is next read

### Requirement: Restore epoch marker

The restore epoch SHALL be read from the file `{BASE_DATA_DIR}/.office-restore-epoch`, which holds one line: an opaque token. An absent file SHALL be the initial epoch, a valid epoch that equals only itself. The token SHALL be the file's content with surrounding whitespace removed; a file that cannot be read SHALL fail the request explicitly instead of being treated as absent. The broker SHALL only read the file and SHALL compare epochs for equality only; the file is written by restore, as specified by `ocu-backup-rollback`. A session SHALL store the epoch read at its creation. On every session request (create or join, status, save, close, resolve), on the versions listing and restore requests of a document that has an open session, and on every callback the broker SHALL read the current epoch before handling the request and compare it with the stored one: an open session whose stored epoch differs SHALL become `orphaned` with reason `restore_epoch_changed`, and a session whose stored epoch is equal SHALL never be orphaned for this reason. A session already in a final state SHALL NOT be changed by the comparison.

#### Scenario: No marker file

- **WHEN** `{BASE_DATA_DIR}/.office-restore-epoch` does not exist and a session is created, saved and its status requested
- **THEN** the session is created with the initial epoch stored, its requests and callbacks are handled, and it is not `orphaned`
- **AND** the broker has not created the file

#### Scenario: Marker appears with a new token

- **WHEN** a session was created while the file was absent, or while it held token A, and the file now holds a different token B
- **THEN** the next status request for that session reports `orphaned` with reason `restore_epoch_changed`
- **AND** a callback for that session stores no version and publishes nothing

#### Scenario: Unchanged token

- **WHEN** a session was created while the file held token A and the file still holds token A at every later request and callback
- **THEN** the session is not `orphaned` because of the epoch, and its callbacks are processed
