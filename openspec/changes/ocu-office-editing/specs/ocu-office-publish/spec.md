# Spec Delta

## Purpose

Publishing a stored version to the workspace file in OCU: the two-state fence under the per-chat lock, the baseline hash comparison, the atomic symlink-safe replace, registration with the outputs broker, journal and stale-fence recovery, conflict resolution and version restore. Source: Plan 2 § 关键设计 4 手工编辑与 Agent 写入的协调, § 1 版本存储; design D6 (restore), D11, D12, D13 (resolution).

## ADDED Requirements

### Requirement: Publish runs inside the fence under the shared per-chat lock

Every publish — after a save with intent `publish`, after the final callback, on resolve and on restore — SHALL run entirely under the per-chat lock shared with sandbox lifecycle (the lock `launch` takes). When the sandbox is running, the broker SHALL write the fence marker `.ocu/office/fence.json` with the time the pause begins, pause the sandbox, observe that it is paused, and only then compare and replace; afterwards it SHALL unpause the sandbox and remove the marker. A pause that fails or cannot be observed SHALL fail the publish with reason `pause_failed`: nothing is written to the workspace, the marker is removed and the sandbox is not left paused by the publish. When the sandbox is not running (stopped, absent or already paused by something else), the same steps SHALL run without pause and unpause, and the publish SHALL NOT change the sandbox's state; a `launch` arriving meanwhile SHALL wait for the lock and run after the publish. The paused window has a target below 1 second and the broker SHALL record the paused duration of every publish in its log; when the window reaches 5 seconds the publish SHALL fail with reason `publish_timeout` and the sandbox SHALL be unpaused. A failed publish SHALL leave the version stored with `published` false, SHALL leave the workspace file holding either its previous bytes or the complete version and never a mixture, and SHALL be reported: through the session state for callback-driven publishes (as specified by `ocu-office-callback`) and as HTTP 503 with the reason on resolve and restore.

#### Scenario: Running sandbox is paused around the replace (B-T06)

- **WHEN** a version is published while the sandbox runs a background process that appends to the same file every 10 ms
- **THEN** the sandbox is observed paused before the file is hashed and replaced and is running again afterwards
- **AND** the outcome is either a conflict that keeps both contents or a workspace file whose bytes equal the version exactly

#### Scenario: Pause failure fails the publish (B-T06)

- **WHEN** the engine refuses the pause, or the sandbox is not observed paused
- **THEN** the publish fails with reason `pause_failed`, the workspace file keeps its bytes, the version stays stored with `published` false, `fence.json` is absent and the sandbox is not paused

#### Scenario: Stopped sandbox is published without pause (B-T06)

- **WHEN** a version is published while the sandbox is stopped or absent
- **THEN** the file is replaced under the lock, no pause or unpause is issued and the sandbox is still not running

#### Scenario: Concurrent launch waits (B-T06)

- **WHEN** the sandbox is stopped, a publish holds the per-chat lock and a `launch` for the same chat arrives
- **THEN** the launch starts the sandbox only after the publish has finished, and the started sandbox sees the complete published file

#### Scenario: Sandbox already paused is left paused

- **WHEN** a version is published while the sandbox is paused and no `fence.json` exists
- **THEN** the file is replaced without pause or unpause and the sandbox is still paused afterwards

#### Scenario: Five-second limit

- **WHEN** the sandbox has been paused by a publish for 5 seconds and the publish has not completed
- **THEN** the publish fails with reason `publish_timeout`, the sandbox is unpaused, the version stays stored and the workspace file is not a partial write

#### Scenario: Paused window is recorded (B-T06)

- **WHEN** a version is published to a running sandbox
- **THEN** the log holds the paused duration of that publish, so the acceptance run can compare it with the 1-second target

### Requirement: Baseline comparison and conflict

Under the lock and before pausing, the broker SHALL run the outputs broker's reconcile, so that a rename made since the last listing is in the index and directory scanning does not count against the paused window. Inside the fence the broker SHALL resolve the document's current path from its `file_id` through the outputs broker and SHALL hash the workspace file on every publish, whatever size and mtime say. It SHALL replace the file only when that hash equals the session baseline. A different hash SHALL be a conflict with reason `baseline_mismatch`; a path that no longer exists SHALL be a conflict with reason `path_missing`, and the path SHALL NOT be recreated. On a conflict nothing SHALL be written to the workspace, the user's content SHALL already be stored as a version, and the session SHALL become `conflict` with that reason. The broker SHALL never apply last-writer-wins. After a completed publish the session baseline SHALL be the published version's hash.

#### Scenario: Agent wrote the file during the edit (B-T06)

- **WHEN** the user saves after a sandbox tool, background process or terminal changed the edited file
- **THEN** the session is `conflict` with reason `baseline_mismatch`, the workspace file keeps the Agent's bytes and the user's content is listed as a version with `published` false

#### Scenario: Same-size change is caught at publish (B-T07)

- **WHEN** the Agent changed the file without changing its size and the user then saves
- **THEN** the publish hashes the file, reports a conflict and does not overwrite it

#### Scenario: Renamed file is followed

- **WHEN** the Agent renamed the edited file without changing its content since the last listing, and a publish runs
- **THEN** the version is published to the file's new path under the same `file_id`, and no file is created at the old path

#### Scenario: Path is gone (B-T13)

- **WHEN** the edited file was deleted during the session and the user saves
- **THEN** the session is `conflict` with reason `path_missing`, the user's content is stored as a version and no file exists at the old path

#### Scenario: Baseline follows the publish

- **WHEN** a save is published and the user saves again without any other writer touching the file
- **THEN** the second publish finds the baseline equal to the workspace file and replaces it without conflict

### Requirement: Atomic and symlink-safe replace

The broker SHALL write the version to a temporary file in the target file's directory, created exclusively and without following a symlink, with a dot-prefixed name so that the workspace file listing never shows it, flush it to disk, and replace the target with it in one atomic step followed by a flush of the directory. Before the replace it SHALL inspect every parent component of the target without following links; when any component is a symlink, or the resolved target lies outside the chat's workspace files directory, the publish SHALL abort with reason `unsafe_path`, remove its temporary file and write nothing outside that directory. A reader SHALL observe either the previous content or the complete version, never a partial file.

#### Scenario: Reader during a publish

- **WHEN** the file is downloaded repeatedly through the gateway while a publish replaces it
- **THEN** every response body equals either the previous content or the version in full

#### Scenario: Symlinked parent directory (B-T13)

- **WHEN** the Agent replaced a parent directory of the edited file with a symlink that points outside the chat's workspace files directory, and a publish runs
- **THEN** the publish fails with reason `unsafe_path`, no file outside the chat's workspace files directory is created or changed, and the version stays stored

#### Scenario: Symlink at the temporary name

- **WHEN** a symlink already exists at the temporary file's name in the target directory
- **THEN** the temporary file is not created through it, the link's target is unchanged and the publish does not write through the link

#### Scenario: Temporary file is hidden

- **WHEN** the workspace file listing is requested while a publish's temporary file exists
- **THEN** the listing contains no entry for the temporary file and its `revision` does not change because of it

### Requirement: Publishes are registered with the outputs broker

Within the same locked transaction as the replace, the broker SHALL register the write with the outputs broker so that the document's entry keeps its `file_id`, carries the published version's SHA-256 and size, and receives a new `revision`; the per-chat counter SHALL increase exactly once per publish. This SHALL hold when the published content has the same size as the content it replaced. A later reconcile SHALL NOT report the publish a second time.

#### Scenario: Listing reflects the publish

- **WHEN** a version is published and the workspace file listing is requested
- **THEN** the entry has the same `file_id`, the version's SHA-256 and a `revision` one higher than the listing revision before the publish

#### Scenario: Same-size publish (B-T07)

- **WHEN** the published version has exactly the size of the content it replaced
- **THEN** the entry's SHA-256 and `revision` still change, so the sidebar preview refreshes

#### Scenario: Agent reads the saved content (B-T07)

- **WHEN** the user's save is published and the Agent then reads the file at `/mnt/user-data/files`
- **THEN** the Agent reads the bytes of the published version

#### Scenario: Reconcile after a publish adds no event

- **WHEN** the listing is requested twice after a publish with no other change
- **THEN** both responses carry the same `revision`

### Requirement: Publish journal and recovery

Before touching the workspace the broker SHALL record a journal intent (document, version, target path, expected baseline hash, temporary file name) and after the replace and registration a completion. Resolving an intent, either way, SHALL remove the temporary file it names if that file still exists. A publish SHALL count as complete only when the file is replaced, the write is registered, the version is `published` true and the completion is recorded. At OCU startup and before any publish for the chat, the broker SHALL resolve every intent without completion under the per-chat lock: when the workspace file's hash equals the version, it SHALL complete the publish (registration, `published` true, session baseline, completion); otherwise it SHALL discard the intent, leave the workspace file untouched and leave the version stored with `published` false. Recovery SHALL never report a publish that did not replace the file as published.

#### Scenario: Crash after the replace (B-T11)

- **WHEN** OCU is killed after the workspace file was replaced and before the completion was recorded, and then restarts
- **THEN** the version is `published` true, the listing entry carries the version's SHA-256 with a new `revision`, and the journal has no open intent

#### Scenario: Crash before the replace (B-T11)

- **WHEN** OCU is killed after the intent was recorded and before the workspace file was replaced, and then restarts
- **THEN** the workspace file has its previous bytes, the version is listed with `published` false and the journal has no open intent

#### Scenario: Open intent is resolved before the next publish

- **WHEN** a chat has an intent without completion and a new publish is requested before any restart
- **THEN** the old intent is resolved first and the new publish compares against the resulting baseline

### Requirement: Stale-fence recovery never leaves a sandbox paused

OCU's startup sweep and its idle-reclamation poll SHALL, under the per-chat lock, look for `fence.json`; when the marker's pause began more than 5 seconds ago they SHALL unpause the sandbox and remove the marker. A sandbox that a crashed publish left paused SHALL therefore be running again within one poll interval. A paused sandbox without a marker SHALL be left paused. The retention guard, the cleanup job and recovery SHALL NOT be required to check for a publish: when the retention guard stops a sandbox while a publish holds it paused, the publish SHALL still complete the replace, an unpause that then fails SHALL NOT fail the publish, the marker SHALL be removed and the sandbox SHALL NOT be left paused.

#### Scenario: Broker crashes while the sandbox is paused (B-T06)

- **WHEN** OCU is killed after pausing the sandbox for a publish, and OCU starts again
- **THEN** the startup sweep unpauses the sandbox and removes `fence.json`
- **AND** the interrupted publish is resolved by journal recovery

#### Scenario: One worker dies and the other recovers (B-T06)

- **WHEN** the worker that paused the sandbox dies and the other worker keeps running
- **THEN** the idle-reclamation poll unpauses the sandbox and removes the marker within one poll interval after the marker is 5 seconds old

#### Scenario: Paused sandbox without a marker

- **WHEN** the poll finds a sandbox paused and no `fence.json`
- **THEN** the sandbox is left paused

#### Scenario: Retention stop during a publish

- **WHEN** the retention guard stops the sandbox while a publish holds it paused
- **THEN** the workspace file equals the published version in full, the publish is recorded as complete, `fence.json` is absent and the sandbox is stopped or running, never paused

### Requirement: Conflict resolution

`POST /api/office/{chat}/sessions/{session}/resolve` SHALL be a mutating gateway row guarded like the other Office POST rows, SHALL accept a body `{"action": "save_as" | "overwrite"}` with `save_as` as the default when no action is given, and SHALL be accepted only for a session in `conflict` (409 `not_in_conflict` otherwise; 422 `invalid_request` for another action). Both actions publish the user's stored version through the fence:

- `save_as` SHALL publish the version to a new file in the directory of the original, under a deduplicated name of the form `name (2).ext` that differs from the original name and from every existing name; when that directory no longer exists the new file SHALL be placed in the workspace root, and when the workspace files directory itself no longer exists `save_as` SHALL be refused with 409 `path_missing` and nothing SHALL be created. The new file SHALL get its own `file_id` and document, whose first version has `source` `conflict` and `published` true; the session SHALL continue on the new document with the same `document_key`. The original file SHALL NOT be changed.
- `overwrite` SHALL, inside the same fence, store the current workspace content as a version with `source` `workspace` unless that content is already a version, and then replace the file with the user's version.

When the original path no longer exists, `overwrite` SHALL be refused with 409 `path_missing`; a deleted path SHALL never be recreated under its old name. A successful resolve SHALL return 200 with `session_id`, `state`, `file_id` and `path` of the file written; the session SHALL return to `editing` when its editor is still open and SHALL become `closed` when the conflict was met by the final callback. A conflict met by the final callback SHALL stay on the session across restarts and SHALL be offered the next time the file is opened: the session create request returns that session in `conflict` with `editor_config` null until it is resolved. A resolve whose publish fails SHALL return 503 with the publish reason and leave the session in `conflict`.

#### Scenario: Save as a new file (B-T06)

- **WHEN** a session for `report.docx` is in `conflict` and resolve is requested with no action or with `save_as`
- **THEN** `report (2).docx` holds the user's version, `report.docx` keeps the Agent's bytes, the listing shows a new `file_id` for the new file
- **AND** the session is `editing` on the new `file_id` with the same `document_key`

#### Scenario: Overwrite keeps the replaced content (B-T06)

- **WHEN** resolve is requested with `overwrite`
- **THEN** the content the Agent had written is listed as a `workspace` version, the workspace file equals the user's version and that version is `published` true

#### Scenario: Only save_as when the path is gone (B-T13)

- **WHEN** the conflict reason is `path_missing` and resolve is requested with `overwrite`
- **THEN** the response is 409 with reason `path_missing` and no file is created
- **AND** resolve with `save_as` writes the version under a new deduplicated name and does not create a file with the old name

#### Scenario: Conflict at an unattended close is offered on the next open

- **WHEN** the final callback met a conflict after the user left, and the file is opened again later
- **THEN** the create response returns the existing session in `conflict` with `editor_config` null
- **AND** after a resolve the session is `closed` and the next create request returns a new session

#### Scenario: Resolve on a session without a conflict

- **WHEN** resolve is requested for a session in `editing`
- **THEN** the response is 409 with reason `not_in_conflict` and nothing is published

#### Scenario: Resolve fails at the pause

- **WHEN** resolve is requested and the sandbox cannot be paused
- **THEN** the response is 503 with reason `pause_failed`, the session stays `conflict` and the workspace is unchanged

### Requirement: Version listing and restore

`GET /api/office/{chat}/documents/{file}/versions` SHALL return 200 with `file_id`, `published_version` (the number of the version that is the document's currently published content, or null) and `versions`, ordered by `number` ascending, each with `number`, `parent`, `source`, `sha256`, `size`, `created_at` and `published`; a workspace file without Office history SHALL return an empty list, and an unknown, malformed or tombstoned `file_id` 404 `unknown_file`. `POST /api/office/{chat}/documents/{file}/restore` SHALL be a mutating gateway row guarded like the other Office POST rows and SHALL take a body `{"number": n}`. It SHALL be refused with 409 `session_open` while the document has an open session, 404 `unknown_version` for a number the document does not have, 404 `unknown_file` for a tombstoned `file_id` and 409 `path_missing` when the workspace file is gone but its `file_id` is still active. Otherwise it SHALL, inside one fence: store the current workspace content as a `workspace` version unless it is already a version; add a new version with `source` `restore` and the content of version n; and publish that new version. It SHALL return 200 with `file_id`, `number` of the new version and `published` true. Restore SHALL NOT remove, renumber or rewrite any existing version. A restore whose publish fails SHALL return 503 with the publish reason and leave the new version stored with `published` false.

#### Scenario: Listing shows source and published flag

- **WHEN** a document has a `workspace` version, an unpublished `autosave` version and a published `save` version
- **THEN** the listing returns the three in number order with those sources and flags, and `published_version` is the number of the `save` version

#### Scenario: Restore creates and publishes a new version (B-T14)

- **WHEN** version 2 of a document with five versions is restored and no session is open
- **THEN** a version 6 with `source` `restore` and the SHA-256 of version 2 exists with `published` true, the workspace file equals it, the listing `revision` increased, and versions 1 to 5 are unchanged

#### Scenario: Restore keeps content the Agent wrote since

- **WHEN** the workspace file was changed by the Agent after the last session and a version is restored
- **THEN** the Agent's content is listed as a `workspace` version before the restore version

#### Scenario: Restore while a session is open (B-T14)

- **WHEN** restore is requested for a document that has a session in `opening`, `editing`, `saving`, `closing` or `conflict`
- **THEN** the response is 409 with reason `session_open`, no version is added and the workspace file keeps its bytes

#### Scenario: Unknown version

- **WHEN** restore is requested with a number the document does not have
- **THEN** the response is 404 with reason `unknown_version` and nothing changes

#### Scenario: Restore of a deleted file

- **WHEN** restore is requested for a document whose workspace file no longer exists
- **THEN** the response is 409 with reason `path_missing`, or 404 with reason `unknown_file` once the `file_id` is tombstoned, and no file is created

#### Scenario: Another user's history (B-T09)

- **WHEN** a user requests the versions or restore route of a chat they do not own, or uses a `file_id` of another chat under their own chat
- **THEN** the gateway denies the foreign chat and OCU answers 404 for the foreign `file_id`, and no version is listed, restored or published
