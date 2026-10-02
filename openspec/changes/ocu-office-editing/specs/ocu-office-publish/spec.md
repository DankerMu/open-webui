# Spec Delta

## Purpose

Publishing a stored version to the workspace file in OCU: the two-state fence under the per-chat lock, path resolution from the persisted index, the baseline hash comparison, the atomic symlink-safe replace, registration with the outputs broker, the three outcomes, the journal obligation and its recovery, stale-fence recovery, conflict resolution including the automatic copy at an unattended close, and version listing and restore. Source: Plan 2 § 关键设计 4 手工编辑与 Agent 写入的协调, § 1 版本存储; design D6 (safe reads, restore), D11, D12, D13.

## ADDED Requirements

### Requirement: Publish runs inside the fence under the shared per-chat lock

Every publish — after a save with intent `publish`, after the final callback, on resolve and on restore — SHALL run entirely under the per-chat lock shared with sandbox lifecycle (the lock `launch` takes). When the sandbox is running, the broker SHALL write the fence marker `.ocu/office/fence.json` with the time the pause begins, pause the sandbox, observe that it is paused, and only then compare and replace; afterwards it SHALL unpause the sandbox. The marker SHALL be removed only after the sandbox is observed not paused, or not running at all; when the sandbox is still paused after the unpause attempt the marker SHALL stay, the stale-fence recovery (requirement "Stale-fence recovery never leaves a sandbox paused") retries the unpause, and the outcome of the publish SHALL NOT change because of it. A pause that fails or cannot be observed SHALL fail the publish with reason `pause_failed`: nothing is written to the workspace, and the same unpause and marker rule applies, so the sandbox is not left paused by the publish. When the sandbox is not running (stopped, absent or already paused by something else), the same steps SHALL run without pause and unpause, and the publish SHALL NOT change the sandbox's state; a `launch` arriving meanwhile SHALL wait for the lock and run after the publish. The paused window has a target below 1 second and the broker SHALL record the paused duration of every publish in its log; when the window reaches 5 seconds the publish SHALL fail with reason `publish_timeout` and the sandbox SHALL be unpaused. A failed publish SHALL leave the version stored with `published` false, SHALL leave the workspace file holding either its previous bytes or the complete version and never a mixture, and SHALL be reported as the requirement "Publish outcomes" specifies.

#### Scenario: Running sandbox is paused around the replace (B-T06)

- **WHEN** a version is published while the sandbox runs a background process that appends to the same file every 10 ms
- **THEN** the sandbox is observed paused before the file is hashed and replaced and is running again afterwards
- **AND** the outcome is either a conflict that keeps both contents or a workspace file whose bytes equal the version exactly

#### Scenario: Pause failure fails the publish (B-T06)

- **WHEN** the engine refuses the pause and the sandbox is observed still running
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

Under the lock and before pausing, the broker SHALL resolve the document's current path from its `file_id` in the outputs broker's persisted index (`ocu-outputs-broker`, requirement "Resolve a file_id to its current path"). A publish SHALL NOT run a reconcile: a reconcile fails with an unstable read whenever a sandbox process is writing any file. A rename that a reconcile has already recorded is therefore followed; a rename that no listing has recorded yet is not, the file is missing at the indexed path, and the publish is a conflict. An id that does not resolve SHALL be a conflict with reason `path_missing`. An index that cannot be read SHALL fail the publish with reason `index_unavailable`, before any pause.

Inside the fence the broker SHALL hash the workspace file at the resolved path on every publish, whatever size and mtime say, reading it as the safe-read rule of `ocu-office-store` prescribes. It SHALL replace the file only when that hash equals the session baseline. A different hash, or a file that fails the safe-read check and is therefore not read, SHALL be a conflict with reason `baseline_mismatch`; a resolved path at which no file exists SHALL be a conflict with reason `path_missing`, and the path SHALL NOT be recreated. On a conflict nothing SHALL be written to the workspace and the user's content SHALL already be stored as a version. The broker SHALL never apply last-writer-wins. After a completed publish the session baseline SHALL be the published version's hash.

#### Scenario: Agent wrote the file during the edit (B-T06)

- **WHEN** the user saves after a sandbox tool, background process or terminal changed the edited file
- **THEN** the session is `conflict` with reason `baseline_mismatch`, the workspace file keeps the Agent's bytes and the user's content is listed as a version with `published` false

#### Scenario: Same-size change is caught at publish (B-T07)

- **WHEN** the Agent changed the file without changing its size and the user then saves
- **THEN** the publish hashes the file, reports a conflict and does not overwrite it

#### Scenario: Recorded rename is followed

- **WHEN** the Agent renamed the edited file without changing its content, a workspace file listing has since recorded the rename under the same `file_id`, and a publish runs
- **THEN** the version is published to the file's new path under the same `file_id`, and no file is created at the old path

#### Scenario: Unrecorded rename is not followed

- **WHEN** the Agent renamed the edited file, no listing has recorded the rename yet, and a publish runs
- **THEN** the publish is a conflict with reason `path_missing`: the renamed file keeps its bytes, no file is created at the old path and nothing is written to the workspace
- **AND** the user's content is listed as a version with `published` false

#### Scenario: Path is gone (B-T13)

- **WHEN** the edited file was deleted during the session and the user saves
- **THEN** the session is `conflict` with reason `path_missing`, the user's content is stored as a version and no file exists at the old path

#### Scenario: Edited file replaced by a symlink (B-T13)

- **WHEN** a sandbox process replaced the edited file with a symlink to a file outside the chat's workspace files directory and the user saves
- **THEN** the session is `conflict` with reason `baseline_mismatch`, the link is still in place, the bytes of the link's target are unchanged and were not read
- **AND** the user's content is listed as a version with `published` false

#### Scenario: Index cannot be read

- **WHEN** the outputs broker's persisted index of the chat cannot be read and a publish runs after a save
- **THEN** the publish fails with reason `index_unavailable`, the sandbox was not paused, the workspace file keeps its bytes and the version stays stored with `published` false

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

### Requirement: Publish outcomes

Every publish SHALL end in exactly one of three outcomes. Each outcome SHALL be recorded in one state update that removes the publish's journal entry and sets the session as this table gives:

| Outcome                                                                        | After a save               | After the final callback                                                                                                   | Resolve or restore request                  |
| ------------------------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| published                                                                      | `editing`                  | `closed`                                                                                                                   | success response                            |
| conflict (`baseline_mismatch`, `path_missing`)                                 | `conflict` with the reason | `conflict` with reason `baseline_mismatch`; for `path_missing` the automatic copy of the requirement "Conflict resolution" | not applicable                              |
| failed (`pause_failed`, `publish_timeout`, `unsafe_path`, `index_unavailable`) | `editing` with the reason  | `error` with the reason                                                                                                    | HTTP 503 with the reason, session unchanged |

"After a save" covers the publish that follows a status 6 callback with intent `publish` and the publish of a save that found nothing new; "after the final callback" covers status 2 and status 4. The result of a status 6 callback never changes the state of a session that is `closing` or `conflict` (`ocu-office-callback`): the outcome is recorded and the state stays. For the published outcome the same state update SHALL mark the version `published` true, set the session baseline to the published hash and advance `last_published_seq` (`ocu-office-sessions`). After a conflict or a failure the version SHALL stay stored with `published` false.

There SHALL be no retry route. After a failed publish that followed a save, the next save with intent `publish` publishes the session's latest stored version. After a failed publish that followed the final callback, the document's newest version stays unpublished and is offered back through the versions listing (requirement "Version listing and restore").

#### Scenario: Failed publish after a save

- **WHEN** the publish that follows a status 6 callback with intent `publish` fails with reason `pause_failed`
- **THEN** the session is `editing` with reason `pause_failed`, the version is stored with `published` false, the workspace file keeps its bytes and the journal holds no entry
- **AND** when the next save with intent `publish` finds nothing new and the pause then succeeds, that version is published

#### Scenario: Failed publish after the final callback

- **WHEN** the publish that follows a status 2 callback fails with reason `publish_timeout`
- **THEN** the session is `error` with reason `publish_timeout`, the journal holds no entry, and the versions listing shows the document's newest version with `published` false

#### Scenario: Published outcome is one state update

- **WHEN** a publish that followed a save completes and the state is read afterwards
- **THEN** the version is `published` true, the session baseline is its hash, `last_published_seq` is that save's `save_seq`, the session is `editing` and the journal holds no entry

### Requirement: Publish journal and recovery

A publish SHALL start as a journal entry, the obligation to publish (`ocu-office-store`). For a publish that follows a callback the entry is written with the version and the receipt, as specified by `ocu-office-callback`; for a save that found nothing new, in the state update that completes that save; for resolve and restore, when the request is accepted. Before pausing, the broker SHALL record the target path and the temporary file name in the entry. The entry SHALL be removed only by the state update that records the publish's outcome. A publish SHALL count as published only when the file is replaced, the write is registered and that state update is durable.

A journal entry that survives a crash SHALL be driven again under the per-chat lock: at OCU startup, by the idle-reclamation poll, when a duplicate of its callback arrives (before that callback is answered from its receipt), and before any other publish for the chat. Driving an entry SHALL remove the temporary file it names if that file still exists. When the workspace file already equals the version, the broker SHALL complete the publish — registration and the published state update — without writing the file again; otherwise it SHALL run the publish again from the path resolution. A driven publish SHALL end in one of the three outcomes and SHALL set the session as the requirement "Publish outcomes" gives for it; a driven resolve or restore that publishes SHALL leave the state the successful request would have left. A stored version with an obligation SHALL therefore always end published, reported as a conflict, or reported as failed. Recovery SHALL never report a publish that did not replace the file as published.

#### Scenario: Crash after the replace (B-T11)

- **WHEN** OCU is killed after the workspace file was replaced and before the outcome was recorded, and then restarts
- **THEN** the version is `published` true, the listing entry carries the version's SHA-256 with a new `revision`, the workspace file was not written a second time and the journal holds no entry

#### Scenario: Crash before the replace (B-T11)

- **WHEN** OCU is killed after the target path and temporary file name were recorded and before the workspace file was replaced, and then restarts
- **THEN** the temporary file is gone and the publish has run again: the workspace file equals the version and the version is `published` true, or, when the workspace file no longer matches the baseline, the file keeps its bytes and the session is `conflict`
- **AND** the journal holds no entry

#### Scenario: Entry without a started publish is driven at startup (B-T11)

- **WHEN** OCU is killed after a status 6 callback with intent `publish` was committed with its journal entry and before its publish started, and OCU starts again without DocumentServer delivering the callback again
- **THEN** the startup sweep publishes the version: it is `published` true, the workspace file equals it, the session is `editing` and the journal holds no entry

#### Scenario: Surviving entry is driven before the next publish

- **WHEN** a chat has a journal entry left by a crash and a new publish is requested before any restart or poll has driven it
- **THEN** the old entry is driven to its outcome first and the new publish compares against the resulting baseline

### Requirement: Stale-fence recovery never leaves a sandbox paused

OCU's startup sweep and its idle-reclamation poll SHALL, under the per-chat lock, look for `fence.json`; when the marker's pause began more than 5 seconds ago they SHALL unpause the sandbox and SHALL remove the marker once the sandbox is observed not paused, or not running at all. While the sandbox is still paused the marker SHALL stay and the next poll SHALL try again. A broker crash or a failed unpause SHALL therefore not leave a sandbox paused for longer than one poll interval once the engine accepts the unpause. A paused sandbox without a marker SHALL be left paused. The retention guard, the cleanup job and recovery SHALL NOT be required to check for a publish: when the retention guard stops a sandbox while a publish holds it paused, the publish SHALL still complete the replace, the unpause that then finds no running sandbox SHALL NOT fail the publish, and the marker SHALL be removed because the sandbox is not running.

#### Scenario: Broker crashes while the sandbox is paused (B-T06)

- **WHEN** OCU is killed after pausing the sandbox for a publish, and OCU starts again
- **THEN** the startup sweep unpauses the sandbox and removes `fence.json`
- **AND** the interrupted publish is driven again by journal recovery

#### Scenario: One worker dies and the other recovers (B-T06)

- **WHEN** the worker that paused the sandbox dies and the other worker keeps running
- **THEN** the idle-reclamation poll unpauses the sandbox and removes the marker within one poll interval after the marker is 5 seconds old

#### Scenario: Unpause fails once (B-T06)

- **WHEN** a publish has replaced the file and its unpause fails, so the sandbox is still paused
- **THEN** the publish is recorded as published and `fence.json` is still present
- **AND** the next poll after the marker is 5 seconds old unpauses the sandbox and, observing it not paused, removes the marker

#### Scenario: Paused sandbox without a marker

- **WHEN** the poll finds a sandbox paused and no `fence.json`
- **THEN** the sandbox is left paused

#### Scenario: Retention stop during a publish

- **WHEN** the retention guard stops the sandbox while a publish holds it paused
- **THEN** the workspace file equals the published version in full, the publish is recorded as published, `fence.json` is absent and the sandbox is stopped or running, never paused

### Requirement: Conflict resolution

`POST /api/office/{chat}/sessions/{session}/resolve` SHALL be a mutating gateway row guarded like the other Office POST rows, SHALL accept a body `{"action": "save_as" | "overwrite"}` with `save_as` as the default when no action is given, and SHALL be accepted only for a session in `conflict` (409 `not_in_conflict` otherwise; 422 `invalid_request` for another action). Both actions SHALL publish, through the fence, the session's latest stored version, which may be newer than the version that first met the conflict:

- `save_as` SHALL publish the version to a new file in the directory of the original, under a deduplicated name of the form `name (2).ext` that differs from the original name and from every existing name and is claimed without replacing an existing entry; when that directory no longer exists the new file SHALL be placed in the workspace root, and when the workspace files directory itself no longer exists `save_as` SHALL be refused with 409 `path_missing` and nothing SHALL be created. The new file SHALL get its own `file_id` and document, whose first version has `source` `conflict` and `published` true; the session SHALL continue on the new document with the same `document_key`. The original file SHALL NOT be changed.
- `overwrite` SHALL, inside the same fence, store the current workspace content as a version with `source` `workspace` unless that content is already a version, and then replace the file with the user's version. The capture follows the safe-read rule of `ocu-office-store`: when the file fails that check, `overwrite` SHALL be refused with 503 `unsafe_path`, nothing SHALL be stored or written and the session SHALL stay `conflict`.

When the original path no longer exists, `overwrite` SHALL be refused with 409 `path_missing`; a deleted path SHALL never be recreated under its old name. A successful resolve SHALL return 200 with `session_id`, `state`, `file_id` and `path` of the file written; the session SHALL become `closed` when it holds the receipt of a final callback, which means its editor has ended, and SHALL return to `editing` otherwise. A resolve whose publish fails SHALL return 503 with the publish reason and leave the session in `conflict`.

Nobody is present when the publish that follows the final callback meets a conflict, so the content SHALL come back to the user without a request at that moment:

- With reason `baseline_mismatch` — the file still exists but changed — the conflict SHALL stay on the session across restarts and SHALL be offered the next time the file is opened: the session create request returns that session in `conflict` with `editor_config` null until it is resolved.
- With reason `path_missing` — the file is gone, so there is no entry to open and `save_as` is the only action allowed — the broker SHALL perform the `save_as` above at once, without a request: the version is published as a new file under a deduplicated name, as the first version, with `source` `conflict` and `published` true, of a new document; the session's `file_id` becomes that of the new document and the session SHALL be `closed`. When the workspace files directory itself no longer exists, nothing SHALL be created, the version SHALL be kept and the session SHALL be `error` with reason `workspace_missing`.

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

#### Scenario: Resolve publishes the latest stored version

- **WHEN** a save met a conflict and stored version 3, the user kept editing and left the editor without resolving, the final callback stored version 4 and met the conflict again, and resolve is requested with `save_as`
- **THEN** the new file's bytes equal version 4, not version 3, and the session is `closed`

#### Scenario: Overwrite refused when the file is a symlink (B-T13)

- **WHEN** a session is in `conflict` because the edited file was replaced by a symlink to a file outside the chat's workspace files directory, and resolve is requested with `overwrite`
- **THEN** the response is 503 with reason `unsafe_path`, the link and the bytes of its target are unchanged, no version is added and the session stays `conflict`

#### Scenario: Conflict at an unattended close is offered on the next open

- **WHEN** the final callback met a conflict with reason `baseline_mismatch` after the user left, and the file is opened again later
- **THEN** the create response returns the existing session in `conflict` with `editor_config` null
- **AND** after a resolve the session is `closed` and the next create request returns a new session

#### Scenario: File deleted before an unattended close is saved as a new file (B-T13)

- **WHEN** the edited file `report.docx` was deleted during the session, the user left the editor, and the final callback delivers changes
- **THEN** a new file with a deduplicated name holds the callback's content, the listing shows it under a new `file_id`, and no file exists at the path `report.docx`
- **AND** the new document's first version has `source` `conflict` and `published` true, and the session is `closed`

#### Scenario: Resolve on a session without a conflict

- **WHEN** resolve is requested for a session in `editing`
- **THEN** the response is 409 with reason `not_in_conflict` and nothing is published

#### Scenario: Resolve fails at the pause

- **WHEN** resolve is requested and the sandbox cannot be paused
- **THEN** the response is 503 with reason `pause_failed`, the session stays `conflict` and the workspace is unchanged

### Requirement: Version listing and restore

`GET /api/office/{chat}/documents/{file}/versions` SHALL return 200 with `file_id`, `published_version` (the number of the version that is the document's currently published content, or null), `open_session` (the `session_id`, `state` and `reason` of the document's open session and whether its editor has ended, or null when the document has none) and `versions`, ordered by `number` ascending, each with `number`, `parent`, `source`, `sha256`, `size`, `created_at` and `published`; a workspace file without Office history SHALL return an empty list, and an unknown, malformed or tombstoned `file_id` 404 `unknown_file`. `published_version` together with the `published` flag of each version SHALL let a client see, from this one response, that the document's newest version is unpublished: that is the case when the version with the highest `number` has `published` false. This is how content left by a failed publish at close, or by a session that was orphaned with auto-saved versions, is offered back; it reaches the workspace file through restore.

`POST /api/office/{chat}/documents/{file}/restore` SHALL be a mutating gateway row guarded like the other Office POST rows and SHALL take a body `{"number": n}`. It SHALL be refused with 409 `session_open` while the document has an open session, 404 `unknown_version` for a number the document does not have, 404 `unknown_file` for a tombstoned `file_id` and 409 `path_missing` when the workspace file is gone but its `file_id` is still active. Otherwise it SHALL, inside one fence: store the current workspace content as a `workspace` version unless it is already a version; add a new version with `source` `restore` and the content of version n; and publish that new version. The capture of the current content follows the safe-read rule of `ocu-office-store`: when the file fails that check, restore SHALL be refused with 503 `unsafe_path` and SHALL add no version and write nothing. A successful restore SHALL return 200 with `file_id`, `number` of the new version and `published` true. Restore SHALL NOT remove, renumber or rewrite any existing version. A restore whose publish fails SHALL return 503 with the publish reason and leave the new version stored with `published` false.

#### Scenario: Listing shows source and published flag

- **WHEN** a document has a `workspace` version, an unpublished `autosave` version and a published `save` version
- **THEN** the listing returns the three in number order with those sources and flags, and `published_version` is the number of the `save` version

#### Scenario: Orphaned session left auto-saved versions (B-T11)

- **WHEN** a session stored `autosave` versions after its last publish and then became `orphaned`, and the versions listing is requested
- **THEN** the version with the highest `number` has `published` false and `published_version` names an earlier version
- **AND** a restore of that newest version returns 200, the workspace file equals its content and the listing's newest version is a `restore` version with `published` true

#### Scenario: Restore creates and publishes a new version (B-T14)

- **WHEN** version 2 of a document with five versions is restored and no session is open
- **THEN** a version 6 with `source` `restore` and the SHA-256 of version 2 exists with `published` true, the workspace file equals it, the listing `revision` increased, and versions 1 to 5 are unchanged

#### Scenario: Restore keeps content the Agent wrote since

- **WHEN** the workspace file was changed by the Agent after the last session and a version is restored
- **THEN** the Agent's content is listed as a `workspace` version before the restore version

#### Scenario: Restore while a session is open (B-T14)

- **WHEN** restore is requested for a document that has a session in `opening`, `editing`, `saving`, `closing` or `conflict`
- **THEN** the response is 409 with reason `session_open`, no version is added and the workspace file keeps its bytes

#### Scenario: Restore refused when the file is a symlink (B-T13)

- **WHEN** the document's workspace file was replaced by a symlink to a file outside the chat's workspace files directory and restore is requested
- **THEN** the response is 503 with reason `unsafe_path`, no version is added, and the link and the bytes of its target are unchanged

#### Scenario: Unknown version

- **WHEN** restore is requested with a number the document does not have
- **THEN** the response is 404 with reason `unknown_version` and nothing changes

#### Scenario: Restore of a deleted file

- **WHEN** restore is requested for a document whose workspace file no longer exists
- **THEN** the response is 409 with reason `path_missing`, or 404 with reason `unknown_file` once the `file_id` is tombstoned, and no file is created

#### Scenario: Another user's history (B-T09)

- **WHEN** a user requests the versions or restore route of a chat they do not own, or uses a `file_id` of another chat under their own chat
- **THEN** the gateway denies the foreign chat and OCU answers 404 for the foreign `file_id`, and no version is listed, restored or published

#### Scenario: Listing reports a pending conflict

- **WHEN** the versions of a document are requested while its session is in `conflict` after an unattended close
- **THEN** `open_session` carries that session's id, `state` `conflict`, its reason and that its editor has ended
- **AND** for a document without an open session `open_session` is null
