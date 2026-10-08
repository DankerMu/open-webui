# Spec Delta

## Purpose

Publishing a stored version to the workspace file in OCU: the two-state fence under the per-chat lock, path resolution from the persisted index, the baseline hash comparison, the atomic symlink-safe replace, registration with the outputs broker, the three outcomes, the journal obligation and its recovery, stale-fence recovery, conflict resolution including the automatic copy at an unattended close, and version listing and restore. Source: Plan 2 § 关键设计 4 手工编辑与 Agent 写入的协调, § 1 版本存储; design D6 (safe reads, restore), D11, D12, D13.

## ADDED Requirements

### Requirement: Publish runs inside the fence under the shared per-chat lock

Every publish — after a save with intent `publish`, after the final callback, on resolve and on restore — SHALL run entirely under the per-chat lock shared with sandbox lifecycle (the lock `launch` takes). When the sandbox is running, the broker SHALL write the fence marker `.ocu/office/fence.json` with the time the pause begins, pause the sandbox, observe that it is paused, and only then compare and replace; afterwards it SHALL unpause the sandbox. The marker SHALL be removed only after the owned sandbox is observed not paused, or not running at all; when it is still paused or its state cannot be established after the unpause attempt, the marker SHALL stay for stale-fence recovery. The established publish outcome SHALL NOT change because unpause fails. A pause that fails or cannot be observed SHALL fail the publish with reason `pause_failed`: nothing is written to the workspace, and the same ownership-aware unpause and marker rule applies. When the sandbox is not running (stopped, absent or already paused by something else without a marker), the same steps SHALL run without pause and unpause and SHALL preserve its state; a `launch` arriving meanwhile SHALL wait for the lock.

The paused window has a target below one second. Under the [user-approved timing ruling](https://github.com/DankerMu/open-webui/issues/136#issuecomment-5997477072), five seconds is a monotonic safe-boundary publication budget, not a hard wall-clock release guarantee. At a safe boundary with elapsed time at least five seconds and publication unfinished, the broker SHALL start no further publication mutation, report `publish_timeout`, and attempt cleanup/unpause after an in-flight indivisible operation settles. It SHALL NOT unpause while a detached worker can still mutate the workspace. Before replacement, timeout SHALL preserve the previous file and leave the saved version unpublished. After a visible replacement, an incomplete transaction SHALL retain its journal obligation and complete workspace successor instead of claiming rollback. An already-visible completed success SHALL NOT be rewritten as timeout failure. Slow engine/filesystem calls can extend actual pause duration; release and final outcome bookkeeping SHALL preserve the established pipeline result. The workspace SHALL contain only prior or complete replacement bytes, never a partial mixture.

The broker SHALL record the elapsed paused-window duration of each attempted owned pause, including refusal and timeout, and whether release was positively observed. A record with a retained marker SHALL NOT claim the sandbox resumed. An externally paused sandbox without a marker SHALL remain paused and SHALL NOT be claimed by this attempt.

A failed publish SHALL leave the version stored with `published` false, SHALL leave the workspace file holding either its previous bytes or the complete version and never a mixture, and SHALL be reported as the requirement "Publish outcomes" specifies. An interrupted postreplace timeout retains its obligation as specified below; it is not a completed failed outcome that removes the journal.

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

- **WHEN** a safe publication boundary observes elapsed monotonic time of at least five seconds and workspace replacement has not started
- **THEN** the publish reports `publish_timeout`, starts no replacement, keeps the saved version unpublished and preserves the previous workspace bytes
- **AND** it attempts owned cleanup/unpause; uncertain or failed release retains the marker

#### Scenario: Blocking operation crosses the budget

- **WHEN** an already-started engine or filesystem operation returns after the five-second budget
- **THEN** the publisher does not begin a further publication mutation after observing expiry, and cleanup occurs only after that operation settles
- **AND** the duration record reports the actual overrun rather than claiming a hard five-second release

#### Scenario: Timeout after a visible replacement

- **WHEN** expiry is observed after atomic workspace replacement but before a consistent publication completion
- **THEN** the publish reports `publish_timeout`, retains the journal obligation for recovery and does not claim the workspace replacement rolled back
- **AND** the workspace contains the complete version, the saved version remains stored, and a visible completed Office successor is never overwritten as failure

#### Scenario: Slow release preserves the established outcome

- **WHEN** the fenced comparison, replacement and registration phase establishes an outcome before expiry, and release handling is slow or fails
- **THEN** cleanup does not retroactively change that outcome; final Office bookkeeping retains its ordinary durability semantics
- **AND** the marker stays unless the owned sandbox is positively observed unpaused, stopped or absent

#### Scenario: Paused window is recorded (B-T06)

- **WHEN** a version is published to a running sandbox
- **THEN** the log holds the paused duration of that publish, so the acceptance run can compare it with the 1-second target

### Requirement: Baseline comparison and conflict

Under the lock and before pausing, the broker SHALL resolve the document's current path from its `file_id` in the outputs broker's persisted index (`ocu-outputs-broker`, requirement "Resolve a file_id to its current path"). A publish SHALL NOT run a reconcile: a reconcile fails with an unstable read whenever a sandbox process is writing any file. A rename that a reconcile has already recorded is therefore followed; a rename that no listing has recorded yet is not, the file is missing at the indexed path, and the publish is a conflict. An id that does not resolve SHALL be a conflict with reason `path_missing`. An index that cannot be read SHALL fail the publish with reason `index_unavailable`, before any pause.

Inside the fence the broker SHALL hash the workspace file at the resolved path on every publish, whatever size and mtime say, reading it as the safe-read rule of `ocu-office-store` prescribes. It SHALL replace the file only when that hash equals the session baseline. A different hash, or a file that fails the safe-read check and is therefore not read — the file itself or any parent directory of it is a symlink, or it is not a regular file inside the chat's workspace files directory — SHALL be a conflict with reason `baseline_mismatch`; a resolved path at which no file exists SHALL be a conflict with reason `path_missing`, and the path SHALL NOT be recreated. Whatever this step observes decides the outcome: `unsafe_path` is never the outcome for a state of the path that the hash step saw. On a conflict nothing SHALL be written to the workspace and the user's content SHALL already be stored as a version. The broker SHALL never apply last-writer-wins. After a completed publish the session baseline SHALL be the published version's hash.

For a final callback only, a symlinked original parent below the workspace root SHALL instead invoke the automatic root copy specified by "Conflict resolution". This exception needs no prior listing or tombstone and never follows the link. A symlinked leaf, an unsafe workspace root and ordinary saves do not receive this exception.

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

#### Scenario: Symlinked parent directory (B-T13)

- **WHEN** a sandbox process replaced a parent directory of the edited file with a symlink that points outside the chat's workspace files directory, and the user saves
- **THEN** the session is `conflict` with reason `baseline_mismatch`, no file outside the chat's workspace files directory is read, created or changed, and the user's content is listed as a version with `published` false
- **AND** a resolve with `save_as` places the new file in the workspace root, not in the linked directory

#### Scenario: Index cannot be read

- **WHEN** the outputs broker's persisted index of the chat cannot be read and a publish runs after a save
- **THEN** the publish fails with reason `index_unavailable`, the sandbox was not paused, the workspace file keeps its bytes and the version stays stored with `published` false

#### Scenario: Baseline follows the publish

- **WHEN** a save is published and the user saves again without any other writer touching the file
- **THEN** the second publish finds the baseline equal to the workspace file and replaces it without conflict

### Requirement: Atomic and symlink-safe replace

The broker SHALL write the version to a temporary file in the target file's directory, created exclusively and without following a symlink, with a dot-prefixed name so that the workspace file listing never shows it, flush it to disk, and replace the target with it in one atomic step followed by a flush of the directory. Immediately before the replace it SHALL inspect every parent component of the target again without following links; when any component is a symlink, or the resolved target lies outside the chat's workspace files directory, the publish SHALL abort with reason `unsafe_path`, remove its temporary file and write nothing outside that directory. This is the guard of the write itself. For a publish over an existing file it can only trip on a change made after the hash step accepted the path, which a paused or stopped sandbox cannot make; a path that was already unsafe at the hash step is a conflict, as the requirement "Baseline comparison and conflict" specifies. For a publish to a new file (`save_as`), which has no hash step, it is the only check. A reader SHALL observe either the previous content or the complete version, never a partial file.

#### Scenario: Reader during a publish

- **WHEN** the file is downloaded repeatedly through the gateway while a publish replaces it
- **THEN** every response body equals either the previous content or the version in full

#### Scenario: Parent becomes a symlink after the hash step

- **WHEN** a test replaces a parent directory of the target with a symlink that points outside the chat's workspace files directory after the hash step accepted the path and before the replace
- **THEN** the publish fails with reason `unsafe_path`, the temporary file is removed, no file outside the chat's workspace files directory is created or changed, and the version stays stored

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

"After a save" covers the publish that follows a status 6 callback with intent `publish` and the publish of a save that found nothing new; "after the final callback" covers status 2 and status 4. The result of a status 6 callback never changes the state of a session that is `closing` or `conflict` (`ocu-office-callback`): the outcome is recorded and the state stays. The `editing` of the "after a save" column SHALL apply only when the publish belongs to the session's outstanding save. A published or failed outcome of an earlier `save_seq` — a callback that arrived after the save timeout had returned the session to `editing` and a newer save was accepted — SHALL be recorded, with the reason for a failure, and SHALL leave the session state as it is, so a session that is `saving` for the newer save stays `saving`. A conflict SHALL set `conflict` whichever save met it, except in a session that is `closing`, whose state the result of a status 6 callback never changes: there the version SHALL stay stored with `published` false and the session SHALL stay `closing`, and the publish that follows the final callback, which publishes the session's latest stored version, meets the conflict again and sets `conflict`. For the published outcome the same state update SHALL mark the version `published` true, set the session baseline to the published hash and advance `last_published_seq` (`ocu-office-sessions`). After a conflict or a failure the version SHALL stay stored with `published` false.

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

#### Scenario: Late result of an earlier save does not end a newer one

- **WHEN** the save with `save_seq` 3 timed out, the session returned to `editing`, a save with `save_seq` 4 was accepted and is outstanding, and the status 6 callback of `save_seq` 3 with intent `publish` now arrives and its publish completes
- **THEN** the version of `save_seq` 3 is `published` true and the journal holds no entry for it, and the session is still `saving`
- **AND** the session returns to `editing` only when the callback of `save_seq` 4 is processed or its own timeout passes

#### Scenario: Conflict of a save result while the session is closing

- **WHEN** a close was requested while a save with intent `publish` was outstanding, the session is `closing`, and the publish of that save's status 6 callback meets a conflict with reason `baseline_mismatch`
- **THEN** the version is stored with `published` false, the journal holds no entry for it and the session is still `closing`
- **AND** when the final callback then arrives, its publish meets the conflict and the session is `conflict` with reason `baseline_mismatch`

### Requirement: Publish journal and recovery

A publish SHALL start as a journal entry, the obligation to publish (`ocu-office-store`). For a publish that follows a callback the entry is written with the version and the receipt, as specified by `ocu-office-callback`; for a save that found nothing new, in the state update that completes that save; for resolve and restore, when the request is accepted. Before pausing, the broker SHALL record the target path and the temporary file name in the entry. The entry SHALL be removed only by the state update that records the publish's outcome. A publish SHALL count as published only when the file is replaced, the write is registered and that state update is durable.

A safe-boundary timeout after a visible replacement is an interrupted obligation, not a terminal failed outcome that discards the entry. It SHALL retain the journal until recovery establishes a consistent outcome. An already-visible completed successor SHALL NOT be replaced with a fabricated failure or a recreated obligation. This follows the timing ruling in "Publish runs inside the fence under the shared per-chat lock".

A journal entry that survives a crash SHALL be driven again under the per-chat lock: at OCU startup, by the idle-reclamation poll, when a duplicate of its callback arrives (before that callback is answered from its receipt), before any other publish for the chat, and before its session is marked `orphaned` by a request or by the session sweep (`ocu-office-sessions`). An orphaned session SHALL therefore never hold a journal entry, and no entry is removed without an outcome. The orphaning SHALL then apply to the state the outcome left, by the rule of `ocu-office-sessions` (requirement "Orphaned sessions"): a session in `editing`, `saving` or `closing`, or in `conflict` without the receipt of a final callback, becomes `orphaned`; a session the outcome put in `closed` or `error`, or in `conflict` with the receipt of a final callback, stays in that state. Driving an entry SHALL remove the temporary file it names if that file still exists. When the workspace file already equals the version, the broker SHALL complete the publish — registration and the published state update — without writing the file again; otherwise it SHALL run the publish again from the path resolution. A driven publish SHALL end in one of the three outcomes and SHALL set the session as the requirement "Publish outcomes" gives for it; a driven resolve or restore that publishes SHALL leave the state the successful request would have left. A stored version with an obligation SHALL therefore always end published, reported as a conflict, or reported as failed. Recovery SHALL never report a publish that did not replace the file as published.

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

#### Scenario: Recovery visits an Office-only chat

- **WHEN** a canonical chat has a surviving publication obligation but neither sandbox metadata nor idle state
- **THEN** startup and the existing idle poll discover its Office state and drive the obligation without creating a sandbox
- **AND** a missing or linked chat/control directory is not recreated or followed

#### Scenario: Registration already happened before the crash

- **WHEN** the workspace equals the verified version and registration committed before the worker died, but the journal outcome did not
- **THEN** recovery completes registration and Office publication metadata without another workspace write
- **AND** the active file identity and version hash agree, the revision does not regress and the obligation is removed only with the outcome
- **WHEN** recovery runs again after that durable completion
- **THEN** it changes no workspace bytes, revision or publication state

#### Scenario: Unresolved recovery cannot precede session orphaning

- **WHEN** a poll encounters a malformed obligation, unsafe recorded temporary path, uncertain fence release or another interrupted publication for a chat
- **THEN** that obligation remains recorded and the poll does not read or key-check that chat's sessions
- **AND** later chats and sandbox reclamation still run

#### Scenario: Prepared replay retains responsibility across another crash

- **WHEN** recovery drives a prepared obligation and is interrupted again before recording an outcome
- **THEN** the obligation remains present, the workspace contains only complete old or successor bytes and later recovery can inspect the observed durable state
- **AND** recovery never removes the obligation merely to re-enter the fresh-publication path

#### Scenario: Genuine abandoned temporary has durable deletion authority

- **WHEN** a worker dies after exposing its workspace temporary and a fresh process recovers the obligation
- **THEN** durable private-anchor ownership and journal binding identify the temporary before it is removed
- **AND** recovery completes the obligation without losing the stored version or modifying unrelated content

#### Scenario: Journaled name collides with foreign content

- **WHEN** exclusive workspace exposure failed because the recorded temporary name already held a foreign regular file or symlink, or the owned entry was later substituted
- **THEN** fresh-process recovery preserves the foreign entry and any symlink target
- **AND** unproven ownership retains the journal and refuses dependent publication/session transitions; a valid name, equal content or stale inode number does not authorize deletion
- **WHEN** the recorded workspace temporary is already absent
- **THEN** recovery continues without requiring deletion of an entry that does not exist

#### Scenario: Private staging preparation has no ordinary manual-recovery window

- **WHEN** the worker is killed before or after private-anchor creation, anchor durability, journal binding, workspace exposure, or final anchor cleanup
- **THEN** a fresh process can automatically drive the original obligation to an outcome without adopting a foreign private entry or losing responsibility
- **AND** harmless private leftovers do not block publication forever or authorize deletion of unrelated content
- **WHEN** recovery is killed again during owned cleanup
- **THEN** the next recovery retains the same ownership guarantees and converges after the interruption stops

#### Scenario: Workspace exposure cannot hard-link the private anchor

- **WHEN** the validated private anchor and workspace parent cannot support the required no-clobber hard link, including a cross-device boundary
- **THEN** publication refuses before shared exposure, preserves the original workspace and foreign entries, and retains recoverable responsibility
- **AND** it does not silently substitute a copying or overwrite operation

#### Scenario: Entry is driven before its session is orphaned (B-T11)

- **WHEN** a session has a journal entry left by a crash, DocumentServer has since forgotten the session's key, and a create request for the document makes the key check before any restart or poll has driven the entry
- **THEN** the entry is driven to its outcome first and the journal holds no entry
- **AND** when the entry followed a save, the session is then `orphaned` whatever the outcome was; after a conflict or a failure the version is stored with `published` false and the create request is refused with `unpublished_version`
- **AND** when the entry followed a final callback, the session is `closed`, `conflict` or `error` as the outcome gives and is not orphaned

### Requirement: Stale-fence recovery never leaves a sandbox paused

OCU's startup sweep and its idle-reclamation poll SHALL, under the per-chat lock, look for `fence.json`; when the marker's pause began more than five seconds ago they SHALL attempt to unpause the owned sandbox and remove the marker only after positive nonpaused/not-running observation. Recovery SHALL NOT steal the fence while a live publisher owns the lock. While the sandbox is still paused or its state is uncertain, the marker SHALL stay for the next poll. Once the lock is available and the engine accepts unpause, stale-fence recovery runs on the next poll; slow blocking operations are not a hard wall-clock release guarantee. A paused sandbox without a marker SHALL be left paused. The retention guard, cleanup job and recovery SHALL NOT require a publish lease: a retention stop during an established pause fence removes writers, SHALL NOT fail publication or trigger a restart, and permits marker removal when the sandbox is observed not running.

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

#### Scenario: Stale marker age is a strict wall-clock boundary

- **WHEN** startup or the poll observes a valid marker aged exactly five seconds or younger
- **THEN** it leaves that marker and its owned pause for a later attempt
- **WHEN** the marker is older than five seconds and the chat lock is available
- **THEN** it attempts release of the recorded original container and removes the marker only after positive release observation

#### Scenario: Recovery cannot resume a replacement or external pause

- **WHEN** a stale marker names an original container but another container now occupies the chat name
- **THEN** recovery never unpauses the replacement merely because it has that name
- **AND** it removes the owned marker only after observing the original unpaused, stopped or absent
- **WHEN** the marker is malformed or original-container state is uncertain
- **THEN** recovery retains the marker rather than inferring ownership or successful release

#### Scenario: Live publisher retains its fence beyond the nominal budget

- **WHEN** a live publisher holds the canonical chat lock while an indivisible operation exceeds five seconds and another worker starts recovery
- **THEN** recovery cannot unpause the sandbox or alter the journal until the publisher releases the lock
- **AND** recovery then acts on the persisted successor it observes, not the stale state from before lock acquisition

### Requirement: Conflict resolution

`POST /api/office/{chat}/sessions/{session}/resolve` SHALL be a mutating gateway row guarded like the other Office POST rows, SHALL accept a body `{"action": "save_as" | "overwrite"}` with `save_as` as the default when no action is given, and SHALL be accepted only for a session in `conflict` (409 `not_in_conflict` otherwise; 422 `invalid_request` for another action). Both actions SHALL publish, through the fence, the session's latest stored version, which may be newer than the version that first met the conflict:

- `save_as` SHALL publish the version to a new file in the directory of the original, under a deduplicated name of the form `name (2).ext` that differs from the original name and from every existing name and is claimed without replacing an existing entry (the no-replace claim of `ocu-unified-files`); when that directory no longer exists, or it or one of its parents is a symlink, the new file SHALL be placed in the workspace root, so nothing is written through a link. The new file SHALL get its own `file_id` and document, whose first version has `source` `conflict` and `published` true; the session SHALL continue on the new document with the same `document_key`. The original file SHALL NOT be changed.
- `overwrite` SHALL, inside the same fence, store the current workspace content as a version with `source` `workspace` unless that content is already a version, and then replace the file with the user's version. The capture follows the safe-read rule of `ocu-office-store`: when the file fails that check, `overwrite` SHALL be refused with 503 `unsafe_path`, nothing SHALL be stored or written and the session SHALL stay `conflict`.

Under the [approved lineage rule](https://github.com/DankerMu/open-webui/issues/107#issuecomment-6036933329), overwrite SHALL freeze the selected user version before workspace capture and then append its content as a `restore` version, reusing the content-addressed blob and existing latest-hash deduplication. The restore record's parent SHALL name the selected user version. On success the document's `published_version` SHALL name that latest user-content record, and the selected original user version SHALL also be marked published. Resolve SHALL NOT allocate another `save_seq` or rewrite callback receipts. A capture-only intermediate state SHALL NOT be usable as the session's latest user content by join, save, final callback or another resolve. The journal and version metadata SHALL preserve the frozen selection across failure and restart; recovery SHALL NOT duplicate captures or restore records for the same settled workspace content.

When the original path no longer exists, `overwrite` SHALL be refused with 409 `path_missing`; a deleted path SHALL never be recreated under its old name. When the chat's workspace files directory itself no longer exists, neither action can place a file: the resolve SHALL be refused with 409 `workspace_missing`, nothing SHALL be created, the version SHALL be kept and the session SHALL become `error` with reason `workspace_missing`, the same end an unattended close reaches, so that a `conflict` session is never left without an exit. A successful resolve SHALL return 200 with `session_id`, `state`, `file_id` and `path` of the file written; the session SHALL become `closed` when it holds the receipt of a final callback, which means its editor has ended, and SHALL return to `editing` otherwise. A resolve whose publish fails SHALL return 503 with the publish reason and leave the session in `conflict`.

Nobody is present when the publish that follows the final callback meets a conflict, so the content SHALL come back to the user without a request at that moment:

- With reason `baseline_mismatch` — the file still exists but changed — the conflict SHALL stay on the session across restarts and SHALL be offered the next time the file is opened: the session create request returns that session in `conflict` with `editor_config` null until it is resolved.
- With reason `path_missing` — the file is gone, so there is no entry to open and `save_as` is the only action allowed — the broker SHALL perform the `save_as` above at once, without a request: the version is published as a new file under a deduplicated name, as the first version, with `source` `conflict` and `published` true, of a new document; the session's `file_id` becomes that of the new document and the session SHALL be `closed`. When the workspace files directory itself no longer exists, nothing SHALL be created, the version SHALL be kept and the session SHALL be `error` with reason `workspace_missing`.
- When an original parent below the workspace root is a symlink, the final callback SHALL perform that automatic copy in the safe workspace root without requiring a prior Files reconcile, as fixed by the [user ruling](https://github.com/DankerMu/open-webui/issues/107#issuecomment-6017088624). It SHALL NOT follow the link to determine whether the old leaf exists. A symlinked leaf itself SHALL remain a conflict, and an unsafe workspace root SHALL never be used for publication.

An automatic copy SHALL retain its source document/version/receipt binding until one atomic Office successor creates the new document and its published conflict version, moves and closes the session, fills `saved_as` with the actual new file_id and path, invalidates its notice cache and clears the obligation. The source history and document_key SHALL remain unchanged. The workspace copy SHALL NOT share the immutable blob's inode.

The journal and private ownership evidence SHALL support recovery across a successful claim before returned-name persistence, broker registration before Office completion, and completion durability errors. Recovery SHALL reuse a proven owned copy without another file, new document or registration increment; equal content alone SHALL NOT prove ownership. Foreign entries SHALL never be deleted or adopted as the copy. A pre-existing active index entry at an otherwise free candidate path SHALL NOT supply the new file's identity.

#### Scenario: Save as a new file (B-T06)

- **WHEN** a session for `report.docx` is in `conflict` and resolve is requested with no action or with `save_as`
- **THEN** `report (2).docx` holds the user's version, `report.docx` keeps the Agent's bytes, the listing shows a new `file_id` for the new file
- **AND** the session is `editing` on the new `file_id` with the same `document_key`

#### Scenario: Overwrite keeps the replaced content (B-T06)

- **WHEN** resolve is requested with `overwrite`
- **THEN** the content the Agent had written is listed as a `workspace` version, the workspace file equals the user's version and that version is `published` true

#### Scenario: Overwrite preserves the user-content latest version

- **GIVEN** user version 2 is in conflict and the workspace holds different Agent bytes not yet in history
- **WHEN** overwrite succeeds
- **THEN** version 3 retains the Agent bytes with source `workspace`, version 4 has the user's bytes with source `restore` and parent 2, both are published, and `published_version` is 4
- **AND** joining the same session returns a source ticket for user content, a no-change save and status 4 do not select the Agent capture, and the original version and receipt identities remain intact

#### Scenario: Overwrite reuses captured history

- **GIVEN** the workspace content already exists in an older version and the latest version holds the user's conflict content
- **WHEN** overwrite succeeds
- **THEN** no duplicate workspace capture is appended, the latest record still holds the user's content under the canonical latest-hash rule, and the workspace equals it

#### Scenario: Resolve survives acceptance and publication crashes

- **WHEN** a worker dies after accepting resolve, committing overwrite capture and user-content lineage, replacing the file, registering the write, or claiming a save-as name, before the final Office successor
- **THEN** a fresh worker drives the same bound action and user version through the canonical publication engine, retaining intervening workspace content before any overwrite
- **AND** one completed resolve leaves the same lifecycle, sequence and file identity as uninterrupted success, without a second copy, repeated capture/restore records or changed callback receipts

#### Scenario: Concurrent resolve cannot duplicate the action

- **WHEN** two workers resolve the same conflict and the first completes successfully
- **THEN** the second observes the completed non-conflict state and returns 409 `not_in_conflict`, with no second copy or version mutation

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

#### Scenario: Automatic copy skips occupied names

- **WHEN** the final callback publishes deleted `report.docx` and `report (2).docx` already exists
- **THEN** `report (3).docx` holds the retained content with a new file_id and the occupied entry is unchanged
- **AND** the old basename is never created, even temporarily

#### Scenario: Final callback uses the root after parent removal or symlink substitution

- **WHEN** `nested/report.docx` was edited, its parent was removed or replaced by a symlink, and the final callback arrives before any Files refresh
- **THEN** a new deduplicated copy appears directly in the safe workspace root and the session is closed with matching saved_as
- **AND** no directory is recreated and no link target is read or written
- **AND** a symlinked leaf alone still yields baseline_mismatch rather than an automatic copy

#### Scenario: Status 4 copies retained autosave content

- **WHEN** the original file is gone, the session has unpublished autosave content and the final callback is status 4
- **THEN** that retained content becomes the new document's published conflict version without a download or another source version
- **AND** repeating the final callback adds no file, document, receipt or broker revision

#### Scenario: Interrupted automatic copy resumes without duplication

- **WHEN** a worker dies after the no-replace claim, including before the helper returns its chosen name, or after registration but before Office completion
- **THEN** a fresh worker proves ownership and completes the same copy, new identity and closed session without a second claim or registration increment
- **AND** a foreign file substituted at the target is preserved, never accepted merely because its bytes equal the saved version

#### Scenario: Files drives the copy before fingerprint reconciliation

- **WHEN** a claimed automatic copy equals the source or another removed document's content and Files arrives before startup, poll or callback recovery
- **THEN** the Files entrypoint drives the existing obligation under the same lock before any scan can infer a rename
- **AND** the copy's new document receives a distinct file_id, source histories remain unchanged and no duplicate copy is written
- **AND** undecided recovery refuses the listing instead of allowing identity reassignment

#### Scenario: Resolve after the workspace files directory was removed (B-T10)

- **WHEN** a session is in `conflict`, the chat's workspace files directory has since been removed, and resolve is requested with `save_as` or with `overwrite`
- **THEN** the response is 409 with reason `workspace_missing`, no file or directory is created, the version is still listed
- **AND** the session is `error` with reason `workspace_missing`, and a later create request for another file of the chat is not blocked by it

#### Scenario: Resolve on a session without a conflict

- **WHEN** resolve is requested for a session in `editing`
- **THEN** the response is 409 with reason `not_in_conflict` and nothing is published

#### Scenario: Resolve fails at the pause

- **WHEN** resolve is requested and the sandbox cannot be paused
- **THEN** the response is 503 with reason `pause_failed`, the session stays `conflict` and the workspace is unchanged

### Requirement: Version listing and restore

`GET /api/office/{chat}/documents/{file}/versions` SHALL return 200 with `file_id`, `published_version` (the number of the version that is the document's currently published content, or null), `open_session` (an object with `session_id`, `state`, `reason` and `editor_ended` for the document's open session, or null when the document has none; `editor_ended` SHALL be true exactly when the session holds the receipt of a final callback) and `versions`, ordered by `number` ascending, each with `number`, `parent`, `source`, `sha256`, `size`, `created_at` and `published`; a workspace file without Office history SHALL return an empty list, and an unknown, malformed or tombstoned `file_id` 404 `unknown_file`. `published_version` together with the `published` flag of each version SHALL let a client see, from this one response, that the document's newest version is unpublished: that is the case when the version with the highest `number` has `published` false. This is how content left by a failed publish at close, or by a session that was orphaned with auto-saved versions, is offered back; it reaches the workspace file through restore.

The listing SHALL apply the restore-epoch check of `ocu-office-store` to the document's open session before it answers, so a session invalidated by a backup restore is reported as no open session. The listing SHALL NOT contact DocumentServer: a session whose key DocumentServer has forgotten is still reported as open until a create request, a restore request, a save, a close or the session sweep checks the key. The offer of unpublished content does not depend on the listing alone for that case; the create request refuses with `unpublished_version` (`ocu-office-sessions`, requirement "Orphaned sessions").

The listing SHALL create no publication intent and SHALL otherwise leave versions and workspace content unchanged. Under the [approved recovery priority](https://github.com/DankerMu/open-webui/issues/142#issuecomment-6048481919), epoch invalidation SHALL first complete any already accepted publication through the existing journal recovery contract before applying its orphan rule. That recovery MAY change workspace content or version history. The listing SHALL then reread the requested document and its open session; a session moved to another document by save-as SHALL NOT appear on the original document. Unresolved recovery SHALL retain its obligation and refuse the listing with 503 `publish_pending`, not report a fabricated orphan or partial successful list. The existing protection for final publication outcomes remains unchanged.

`POST /api/office/{chat}/documents/{file}/restore` SHALL be a mutating gateway row guarded like the other Office POST rows and SHALL take a body `{"number": n}`. Before it decides whether the document has an open session it SHALL make the checks a create request makes on reopening — the restore-epoch check and, for a session whose editor is still expected (`editing`, `saving`, `closing`, or `conflict` without the receipt of a final callback), the DocumentServer key check — so a session that DocumentServer has forgotten is `orphaned` and does not block the restore; when DocumentServer cannot be reached for that check the restore SHALL be refused with 502 `documentserver_unavailable` and change nothing. It SHALL be refused with 409 `session_open` while the document has an open session, 404 `unknown_version` for a number the document does not have, 404 `unknown_file` for a tombstoned `file_id` and 409 `path_missing` when the workspace file is gone but its `file_id` is still active. Otherwise it SHALL, inside one fence: store the current workspace content as a `workspace` version unless it is already a version; add a new version with `source` `restore` and the content of version n; and publish that new version. The capture of the current content follows the safe-read rule of `ocu-office-store`: when the file fails that check, restore SHALL be refused with 503 `unsafe_path` and SHALL add no version and write nothing. A successful restore SHALL return 200 with `file_id`, `number` of the new version and `published` true. Restore SHALL NOT remove, renumber or rewrite any existing version. A restore whose publish fails SHALL return 503 with the publish reason and leave the new version stored with `published` false.

History restore SHALL append a new version record even when the requested content equals the document's latest version; it SHALL share the immutable blob and keep every existing record unchanged. The accepted restore obligation SHALL bind the requested source version so canonical recovery can perform any unfinished capture and restore preparation. Replaying unchanged preparation SHALL NOT append another restore record or repeat a completed registration. An intervening workspace change after a crash SHALL be preserved before replacement, with the requested restored content remaining the latest version.

As the explicit pause-failure exception in design D11 specifies, a failed attempt to pause SHALL retain a new unpublished `restore` record for the already stored requested content without reading/capturing or modifying workspace content. This exception SHALL NOT permit unsafe-path reads or create a missing path. Successful capture, restore-record creation and publication SHALL remain inside the same canonical fence.

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

#### Scenario: Restore of the latest equal-content version

- **WHEN** the requested version is the document's newest version, whether published or unpublished, and no session remains open after the reopen check
- **THEN** restore appends a new record with source `restore`, parent equal to the requested number and the same immutable content hash
- **AND** it publishes that new record without changing any existing version or duplicating the blob

#### Scenario: Restore cannot pause the sandbox

- **WHEN** a valid restore is accepted but the running sandbox cannot be paused
- **THEN** the response is 503 `pause_failed` and a new `restore` version for the requested content is stored with `published` false
- **AND** no workspace content is read, captured or changed and no old version or session record is rewritten

#### Scenario: Restore resumes after accepted preparation is interrupted

- **WHEN** OCU stops after accepting a restore or after capture, replacement or registration but before durable completion
- **THEN** a fresh worker drives the original obligation through the canonical recovery owner and publishes the bound requested content
- **AND** unchanged replay duplicates no version, file or completed registration and retains no obligation after durable completion
- **AND** if the Agent changed workspace content after the interruption, that content is preserved before it is replaced

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
- **THEN** `open_session` carries that session's id, `state` `conflict`, its reason and `editor_ended` true
- **AND** for a document without an open session `open_session` is null

#### Scenario: Listing reports a joinable session

- **WHEN** the versions of a document are requested while its session is `editing` in another tab
- **THEN** `open_session` carries that session's id, `state` `editing` and `editor_ended` false

#### Scenario: Listing after a backup restore (B-T14)

- **WHEN** a session was created before a backup restore wrote a new restore epoch, and the versions listing is requested afterwards
- **THEN** the session is `orphaned` with reason `restore_epoch_changed` and `open_session` is null

#### Scenario: Listing invalidates an epoch with an accepted publication

- **WHEN** the requested document has an old-epoch open session with an accepted publication interrupted before completion
- **THEN** the listing completes that existing obligation before applying the journal contract's orphan rule and returns the resulting history and open session for the requested file identity
- **AND** it creates no new publication intent and makes no DocumentServer request
- **AND** after save-as transfers the session, the original document's listing has no open session
- **AND** if recovery remains unresolved the listing returns 503 `publish_pending`, retains the obligation and does not falsely report orphaning

#### Scenario: Restore after DocumentServer forgot the session (B-T11)

- **WHEN** DocumentServer was restarted during a session that stored an unpublished `autosave` version, the session is still stored as `editing`, and a restore of that version is requested from history without opening the editor
- **THEN** the key check makes the session `orphaned`, the restore returns 200 and the workspace file equals the restored content
- **AND** when DocumentServer cannot be reached for the check, the response is 502 with reason `documentserver_unavailable`, the session is unchanged and nothing is restored
