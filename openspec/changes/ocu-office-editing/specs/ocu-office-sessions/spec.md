# Spec Delta

## Purpose

Edit session lifecycle of the Office broker and its browser-facing session API in OCU: create or join, status with the change notice, save, close, the one-level save model, the sequence values, key stability, orphaning and the session sweep. Source: Plan 2 § 关键设计 2 接口, § 3 保存模型与状态机; design D7, D8, D9, D12 (session sweep), D13 (change notice), D14.

## ADDED Requirements

### Requirement: Office routes exist only when enabled and are guarded as chat routes

OCU SHALL serve the browser-facing Office routes only when Office editing is enabled for the OCU service; when it is not enabled, every request under `/api/office/` that passes the service guard SHALL return 404 without reading or creating Office state and without contacting DocumentServer. A request for a chat whose data directory does not exist SHALL be answered 404 and SHALL NOT create that directory; its existence is checked before the per-chat lock is taken, because taking the lock would create it. This capability defines four of them (paths after the gateway's `/ocu` prefix):

| Route                                          | Method | Mutating |
| ---------------------------------------------- | ------ | -------- |
| `/api/office/{chat}/documents/{file}/sessions` | POST   | yes      |
| `/api/office/{chat}/sessions/{session}`        | GET    | no       |
| `/api/office/{chat}/sessions/{session}/save`   | POST   | yes      |
| `/api/office/{chat}/sessions/{session}/close`  | POST   | yes      |

When enabled, these routes SHALL require the internal token and a canonical chat id like every other chat-bound route (401 without the token, before any Office work) and SHALL be reachable from browsers only through gateway rows that authorize chat ownership. The POST rows SHALL be mutating rows: a request without the gateway's mutation provenance SHALL be denied 403 before it reaches OCU, as for other mutating chat rows. A `{file}` or `{session}` that does not belong to the chat in the path SHALL return 404. Every error response SHALL carry a `reason` string. Losing access SHALL block new requests only: a session that is already open SHALL NOT be ended or altered by the loss of access, and its final callback SHALL still be stored and published to the same chat.

#### Scenario: Office editing not enabled

- **WHEN** Office editing is not enabled and any `/api/office/` route is requested with a valid internal token
- **THEN** the response is 404, no `.ocu/office/` directory is created and DocumentServer is not contacted

#### Scenario: Chat without a data directory

- **WHEN** an Office route is requested with a valid internal token for a well-formed chat id whose data directory does not exist
- **THEN** the response is 404 and no directory is created for that chat

#### Scenario: Missing internal token

- **WHEN** an Office route is requested without the internal token
- **THEN** the response is 401 and no Office state is read or written

#### Scenario: Mutation provenance is required for POST rows

- **WHEN** a session create, save or close request reaches the gateway without the mutation header or with `Origin: null`
- **THEN** the gateway answers 403 and OCU is not contacted
- **AND** the status GET is forwarded without that header

#### Scenario: Another chat's session or file (B-T09)

- **WHEN** a user requests an Office route of a chat they do not own, or uses their own chat in the path with a `session_id` or `file_id` that belongs to another chat
- **THEN** the gateway denies the foreign chat before OCU, and OCU answers 404 for the foreign `session_id` or `file_id`
- **AND** no session, version or workspace file of the other chat is read, changed or disclosed

#### Scenario: Access lost while a session is open (B-T10)

- **WHEN** the user's account is deactivated or their session ends while an edit session is open, and they send a new save, close or status request
- **THEN** the gateway denies the request and OCU is not contacted
- **AND** the open session keeps its state, and the final callback DocumentServer sends for it is stored and published to the same chat

### Requirement: Session creation validates the document and capacity

`POST /api/office/{chat}/documents/{file}/sessions` SHALL resolve `{file}` through the outputs broker, check the document under the per-chat lock (consulting DocumentServer is not required to happen while the lock is held) and refuse with an explicit error when: the `file_id` is unknown, malformed or tombstoned (404 `unknown_file`); the file name does not end in `.docx`, `.xlsx` or `.pptx`, compared case-insensitively (415 `unsupported_type`); the file is larger than the outputs broker's per-file limit (413 `file_too_large`); the workspace file fails the safe-read check of `ocu-office-store` (422 `unsafe_path`); the content is not a readable OOXML container of the type its extension names (422 `corrupt_document`); or free space is below the storage floor (503 `storage_low`). One further refusal, 409 `unpublished_version`, is specified by the requirement "Orphaned sessions".

For the pinned 9.4.0 release the broker SHALL NOT impose a 20-connection limit, query a nonexistent global live-connection counter or treat the `license` command's quota arrays as a live count. Creation and joining SHALL continue to apply document validation, persisted-state rules and actual DocumentServer availability checks.

A refused creation SHALL create no session and no document record, SHALL leave every existing session, version and workspace file unchanged, and SHALL leave the file available for read-only preview and download; a refused join SHALL leave the existing session unchanged. A successful creation SHALL return 201 with `session_id`, `file_id`, `document_key`, `state` (`opening`), `joined` (false) and `editor_config`.

#### Scenario: Supported document opens

- **WHEN** a session is requested for an intact `.docx`, `.xlsx` or `.pptx` workspace file
- **THEN** the response is 201 with a new `session_id`, a `document_key`, `state` `opening` and `joined` false

#### Scenario: Unsupported type (B-T13)

- **WHEN** a session is requested for a `.doc`, `.xls`, `.ppt`, `.docm`, `.pdf` or `.txt` file
- **THEN** the response is 415 with reason `unsupported_type` and no session exists

#### Scenario: Oversized document (B-T13)

- **WHEN** a session is requested for a `.xlsx` file larger than the per-file limit
- **THEN** the response is 413 with reason `file_too_large` and no session exists

#### Scenario: Corrupt document (B-T13)

- **WHEN** a session is requested for a file named `report.docx` whose bytes are not a readable OOXML container, including an empty file
- **THEN** the response is 422 with reason `corrupt_document`, no session exists and the file stays downloadable

#### Scenario: Unknown or deleted file (B-T13)

- **WHEN** a session is requested for a `file_id` the outputs broker does not know, or one it holds only as a tombstone
- **THEN** the response is 404 with reason `unknown_file`, no session exists and no file is created at the old path

#### Scenario: No artificial connection limit at creation (B-T15)

- **WHEN** twenty documents have open sessions and a valid different document is requested while DocumentServer is available
- **THEN** creation succeeds without a connection-count query or synthetic capacity refusal
- **AND** every existing session keeps its state, versions and unsaved editor content

#### Scenario: No artificial connection limit at a join (B-T15)

- **WHEN** twenty documents have open sessions and a second tab requests an existing document
- **THEN** the request joins the same session with a freshly signed `editor_config`, without a connection-count query
- **AND** the existing session keeps its `session_id`, `document_key`, `state`, versions and unsaved editor content

### Requirement: One open session per document with a stable key

A document SHALL have at most one open session, where open means `opening`, `editing`, `saving`, `closing` or `conflict`. A create request for a document that has an open session SHALL join it: 200 with the same `session_id` and `document_key`, `joined` true, and no new session, baseline or version. OCU does not identify users; every request the gateway authorized for the chat is the owner's, so a second tab of the same user joins by this rule. `document_key` SHALL be assigned when the session is created, SHALL NOT change for the life of the session — not after a save, a publish, a conflict resolution or a join — and SHALL differ from the key of every earlier session of the chat. Concurrent create requests for one document in different worker processes SHALL yield exactly one session.

#### Scenario: Second tab joins the session (B-T05)

- **WHEN** a session is open for a document and a second tab of the same user requests a session for the same `file_id`
- **THEN** the response is 200 with the same `session_id` and `document_key` and `joined` true, and the document still has one session

#### Scenario: Concurrent creation in two workers

- **WHEN** two worker processes receive create requests for the same document at the same time
- **THEN** both responses carry the same `session_id` and `document_key`

#### Scenario: Key is stable across saves (B-T05)

- **WHEN** a session saves and publishes three times
- **THEN** its `document_key` is the same before and after every save

#### Scenario: One of two tabs closes (B-T05)

- **WHEN** two tabs share a session and one of them leaves while the other stays connected
- **THEN** the session keeps its `session_id` and `document_key`, is `editing` for the remaining tab, and the workspace file is not replaced by content older than its current content

#### Scenario: New session gets a new key

- **WHEN** a session has reached `closed` and a session is requested again for the same document
- **THEN** the response is 201 with a different `session_id` and a `document_key` never used before

### Requirement: Signed editor configuration without secrets

The create and join responses SHALL include `editor_config`, the DocumentServer editor configuration signed with the DocumentServer JWT secret. Its document key SHALL equal `document_key`. Its document source address SHALL be the source route `/office/source/{ticket}` and its callback address SHALL be `/office/callback/{chat}/{session}`, both on OCU's configured server-to-server address and never on a browser-facing gateway address. A join SHALL return a freshly signed `editor_config` with a new source ticket, never a copy of the configuration issued earlier, so that a session whose first tab ended before the editor loaded can still be opened. The response SHALL NOT contain the internal token, the MCP key, any model API key or the JWT signing secret. A session in `conflict` that holds the receipt of a final callback, which means its editor has ended, SHALL be returned with `editor_config` null.

#### Scenario: No secret in the response

- **WHEN** a session is created or joined
- **THEN** the response body and headers contain none of: the internal token, the MCP key, a model API key, the DocumentServer JWT secret

#### Scenario: Server-to-server addresses

- **WHEN** the `editor_config` of a new session is inspected
- **THEN** its source and callback addresses use OCU's configured server-to-server address, the callback path names this chat and session, and neither address uses the gateway's host or port

#### Scenario: Configuration is signed

- **WHEN** the `editor_config` token is verified with the configured DocumentServer JWT secret
- **THEN** verification succeeds and the signed payload contains the same document key, source address and callback address as the response

#### Scenario: Join after the first tab died before the editor loaded

- **WHEN** a session is still `opening` because its first tab ended before the editor loaded, the source ticket issued at creation has expired, and a create request joins the session
- **THEN** the response is 200 with `joined` true and an `editor_config` that verifies with the DocumentServer JWT secret and carries a source ticket different from the first one
- **AND** fetching the source route with the new ticket returns 200

### Requirement: Session states and the status endpoint

A session SHALL be in exactly one of `opening`, `editing`, `saving`, `closing`, `closed`, `conflict`, `error` or `orphaned`. Normal flow SHALL be `opening → editing`, `editing → saving → editing` for each save, and `closing → closed`; a `closing` session returns to `editing` when a participant is still connected (`ocu-office-callback`); `closed`, `error` and `orphaned` SHALL be final. `GET /api/office/{chat}/sessions/{session}` SHALL return 200 with the persisted `session_id`, `file_id`, `document_key`, `state`, `reason` (null when there is nothing to report), `save_seq`, `last_committed_seq`, `last_published_seq`, `workspace_changed` and `saved_as` (the `file_id` and `path` of the new document that a `save_as`, requested or automatic, created for this session, otherwise null), from any worker process, and 404 `unknown_session` for a session the chat does not have. The status request SHALL NOT contact DocumentServer and SHALL NOT change a version or a workspace file.

`save_seq` SHALL be per session, start at 1 and be strictly increasing. A number SHALL be allocated only by a save request, by a close request, and by the first arrival of a final callback when no close allocation is pending (`ocu-office-callback`). `last_committed_seq` SHALL be the highest `save_seq` whose content is stored as a version, or that DocumentServer confirmed adds nothing to the latest stored version. `last_published_seq` SHALL be the highest `save_seq` after whose processing the workspace file equals the session's latest stored version. It SHALL advance in these four cases: when a publish completes; when a save of either intent finds nothing new and the session's latest stored version is already published; when a resolve succeeds, after which it equals `last_committed_seq`; and when persisted content equals the already published version.

While the session is open the status request SHALL check only the workspace file being edited: read its size and mtime without following a symlink, hash it only when either differs from the previous check, and report `workspace_changed` true when the hash differs from the session baseline, when the file is missing, or when the file fails the safe-read check of `ocu-office-store`, in which case it is not read; false otherwise. The notice SHALL NOT change the session state and SHALL NOT block a save; the publish-time comparison specified by `ocu-office-publish` is the safety mechanism.

#### Scenario: Status reflects persisted state

- **WHEN** a save callback with `save_seq` 2 has been stored and published and the status is requested from another worker
- **THEN** it returns `state` `editing`, `last_committed_seq` 2 and `last_published_seq` 2

#### Scenario: Resolve advances last_published_seq

- **WHEN** a session in `conflict` whose `last_published_seq` is lower than its `last_committed_seq` is resolved successfully
- **THEN** the status reports `last_published_seq` equal to `last_committed_seq`

#### Scenario: Auto-save with content equal to the published version

- **WHEN** a save with intent `persist` is committed and its content's SHA-256 equals that of the document's latest version, which is published
- **THEN** no version is added, and `last_committed_seq` and `last_published_seq` both equal that save's `save_seq`

#### Scenario: Auto-save that finds nothing new after a publish

- **WHEN** the session's latest stored version is published, a save with intent `persist` is accepted and DocumentServer reports nothing new to save
- **THEN** no version is added, and `last_committed_seq` and `last_published_seq` both equal that save's `save_seq`

#### Scenario: Auto-save that finds nothing new while a version is unpublished

- **WHEN** the session's latest stored version is an unpublished `autosave` version, a save with intent `persist` is accepted and DocumentServer reports nothing new to save
- **THEN** `last_committed_seq` equals that save's `save_seq`, `last_published_seq` is unchanged and nothing is published

#### Scenario: Agent changes the edited file

- **WHEN** a sandbox process rewrites the edited file with different content and a different size during the session
- **THEN** the next status response reports `workspace_changed` true and the session `state` is unchanged

#### Scenario: Same-size change with a new mtime (B-T07)

- **WHEN** a sandbox process changes the edited file's content without changing its size, and its mtime changes
- **THEN** the next status response reports `workspace_changed` true

#### Scenario: Unchanged file is not hashed

- **WHEN** the edited file's size and mtime equal those of the previous check
- **THEN** the status response reports the previous `workspace_changed` value without reading the file's content

#### Scenario: Same size and forged mtime is not noticed here

- **WHEN** a sandbox process changes the content and restores the original size and mtime
- **THEN** the status response reports `workspace_changed` false
- **AND** a later publish for the session still ends in `conflict`

#### Scenario: Edited file disappears

- **WHEN** the edited file is deleted or moved away during the session
- **THEN** the next status response reports `workspace_changed` true

#### Scenario: Edited file replaced by a symlink (B-T13)

- **WHEN** a sandbox process replaces the edited file with a symlink to a file outside the chat's workspace files directory
- **THEN** the next status response reports `workspace_changed` true, the session `state` is unchanged and the link's target is not opened

#### Scenario: Unknown session

- **WHEN** the status is requested for a `session_id` the chat does not have
- **THEN** the response is 404 with reason `unknown_session`

### Requirement: One-level save model

The user SHALL see one save. The broker SHALL implement it with two internal stages — persist (store the content as a version) and publish (replace the workspace file) — chosen by the intent of each request:

| Trigger                                                                                                             | Request                    | Effect                                                         |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------- |
| Save (WebUI status bar button)                                                                                      | save with intent `publish` | persist, then publish                                          |
| Every 5 minutes while the editor holds a modification that no committed save covers, driven by the editor host page | save with intent `persist` | persist only; the version is `autosave`, unpublished           |
| Leaving the editor (chat switch, sidebar close, editor close)                                                       | close                      | when the final callback reports changes: persist, then publish |

The editor configuration SHALL leave DocumentServer's user-initiated force save off, so the editor's own save command produces no callback and is not a save in this model; the WebUI status bar button is the only user save. OCU SHALL NOT run an auto-save timer of its own. `POST /api/office/{chat}/sessions/{session}/save` SHALL take a body `{"intent": "publish" | "persist"}`; a missing or other value SHALL return 422 `invalid_request`. It SHALL be accepted only for a session in `editing` (409 `session_not_editing` otherwise), so at most one save of a session is outstanding at a time. On acceptance it SHALL allocate the next `save_seq`, record the intent with it, set the session to `saving`, ask DocumentServer to deliver the current content with that `save_seq` and intent as the command's user data, and return 202 with `session_id`, `save_seq` and `intent`. The 202 SHALL mean accepted only: no version exists because of it, and `last_committed_seq` and `last_published_seq` advance only when the callback for that `save_seq` is committed.

When DocumentServer answers that there is nothing new to save, the request SHALL complete without a callback: the session returns to `editing`, `last_committed_seq` becomes that `save_seq`, and for intent `publish` the session's latest stored version SHALL be published if it is not already, as a publish requested by a save (`ocu-office-publish`). For either intent, when the session's latest stored version is already published, `last_published_seq` SHALL become that `save_seq` as well. When DocumentServer cannot be reached or rejects the command, the response SHALL be 502 `documentserver_unavailable`, nothing SHALL be stored and the session SHALL be `editing`. When DocumentServer answers that it no longer knows the key, the session becomes `orphaned` (requirement "Orphaned sessions").

A session SHALL leave `saving` in one of these ways: the callback of the outstanding save is committed, or reports a forcesave failure, or is answered with an error (all three specified by `ocu-office-callback`); or the save timeout of the session sweep passes (requirement "Session sweep").

#### Scenario: User save persists and publishes (B-T04)

- **WHEN** a save with intent `publish` is accepted and its callback is committed without conflict
- **THEN** a version with `source` `save` and `published` true exists, the workspace file's bytes equal that version
- **AND** the status reports `state` `editing` and `last_published_seq` equal to the returned `save_seq`

#### Scenario: Auto-save persists without publishing (B-T04)

- **WHEN** a save with intent `persist` is accepted and its callback is committed with content that differs from the latest version
- **THEN** a version with `source` `autosave` and `published` false exists, the workspace file keeps its previous bytes
- **AND** `last_committed_seq` equals the returned `save_seq` while `last_published_seq` is unchanged

#### Scenario: Accepted is not saved (B-T04)

- **WHEN** the save response 202 has been returned and its callback has not arrived
- **THEN** the status reports `state` `saving` and a `last_published_seq` lower than the returned `save_seq`, and the versions listing is unchanged

#### Scenario: No server-side timer

- **WHEN** a session stays dirty for longer than 5 minutes and no save request is sent
- **THEN** OCU stores no version and sends no command to DocumentServer for it

#### Scenario: Save after an auto-save with no further edits

- **WHEN** the latest version of the session is an unpublished `autosave` version, a save with intent `publish` is accepted and DocumentServer reports nothing new to save
- **THEN** that version is published, becomes `published` true, and `last_published_seq` equals the returned `save_seq`

#### Scenario: Save again with no change

- **WHEN** a save with intent `publish` has been committed and published, and a second save with intent `publish` is accepted for which DocumentServer reports nothing new to save
- **THEN** no version is added, the workspace file keeps its bytes, the session is `editing`
- **AND** `last_committed_seq` and `last_published_seq` both equal the second `save_seq`

#### Scenario: Save on a session that is not editing

- **WHEN** a save is requested for a session in `opening`, `saving`, `closing`, `conflict`, `closed`, `error` or `orphaned`
- **THEN** the response is 409 with reason `session_not_editing` and no `save_seq` is allocated

#### Scenario: Invalid intent

- **WHEN** a save is requested with no body or an intent other than `publish` or `persist`
- **THEN** the response is 422 with reason `invalid_request` and the session is unchanged

#### Scenario: DocumentServer unavailable

- **WHEN** a save is requested and DocumentServer cannot be reached
- **THEN** the response is 502 with reason `documentserver_unavailable`, the session is `editing` and no version is stored

### Requirement: Close records intent only

`POST /api/office/{chat}/sessions/{session}/close` on an open session SHALL allocate the next `save_seq`, set the session to `closing` and return 202 with `session_id`, `save_seq` and `state`. A session in `conflict` is the exception: a close SHALL leave it in `conflict`, recording the allocation only while its editor is still connected, and SHALL change nothing when its editor has already ended, so a pending conflict is never lost to a close. It SHALL NOT store a version, SHALL NOT publish and SHALL NOT end the session: the session ends only when DocumentServer reports the final callback (status 2 or 4), as specified by `ocu-office-callback`.

The number a close allocates SHALL stay pending until a final callback takes it. It SHALL be void once a status 1 callback has returned the session from `closing` to `editing`. A close request for a session that is `closing` SHALL return 202 with the pending allocation and SHALL allocate nothing; a close request made after the allocation became void is a new close and SHALL allocate a new, higher number.

Two cases end the session at the close request itself. A close on a session that never left `opening` SHALL set it to `closed` at once and return 202 with `state` `closed`: no editor connected, so no final callback will come. When a close is requested for a session in `editing` or `saving` and DocumentServer answers that it no longer knows the session's key, the session SHALL become `orphaned` (requirement "Orphaned sessions") and the response SHALL be 409 `session_not_open`; when DocumentServer cannot be reached for that check, the close SHALL be recorded as above. A close request for a session in `closed`, `error` or `orphaned` SHALL return 409 `session_not_open`.

#### Scenario: Close is accepted before the session ends

- **WHEN** a close is requested for a session in `editing`
- **THEN** the response is 202, the status reports `closing`, and no version has been added by the request itself

#### Scenario: Close with changes ends published (B-T04)

- **WHEN** DocumentServer then reports the final callback with changes and the publish meets no conflict
- **THEN** a version with `source` `close` and `published` true exists, the workspace file equals it and the session is `closed`

#### Scenario: Close without changes (B-T04)

- **WHEN** DocumentServer then reports that the document was closed without changes and every stored version of the session is already published
- **THEN** the session is `closed`, no version is added and the workspace file keeps its bytes

#### Scenario: Repeated close

- **WHEN** a second close is requested while the session is `closing`
- **THEN** the response is 202 with the same `save_seq` and no additional `save_seq` is allocated

#### Scenario: Close again after the session returned to editing

- **WHEN** a close allocated `save_seq` 3, a status 1 callback with a remaining participant returned the session to `editing`, and a close is requested again
- **THEN** the response is 202 with a `save_seq` higher than 3 and the session is `closing`

#### Scenario: Close of a session that never opened

- **WHEN** a close is requested for a session that is still `opening`, for example because the user leaves before the editor loads
- **THEN** the response is 202 with `state` `closed`, the status reports `closed`, no version is added and the workspace file keeps its bytes
- **AND** the next create request for the document returns 201 with a new session

#### Scenario: Close on a session DocumentServer forgot

- **WHEN** a close is requested for a session in `editing` and DocumentServer answers that the key is unknown
- **THEN** the session becomes `orphaned` with reason `editor_state_lost`, the response is 409 with reason `session_not_open` and nothing is stored or published

#### Scenario: Close on a finished session

- **WHEN** a close is requested for a session in `closed`, `error` or `orphaned`
- **THEN** the response is 409 with reason `session_not_open`

### Requirement: Orphaned sessions

A session SHALL become `orphaned` with reason `editor_state_lost` when DocumentServer answers a broker request for its `document_key` — on reopening the document, on a save, on a close, or in the session sweep — that it no longer knows the key. A session SHALL become `orphaned` with reason `restore_epoch_changed` when the restore epoch check of `ocu-office-store` (requirement "Restore epoch marker") finds a different epoch. On reopening, the key check SHALL be made for every session whose editor is still expected: a session in `editing`, `saving` or `closing`, and a session in `conflict` that holds no receipt of a final callback. An `opening` session, whose key DocumentServer has not seen yet, and a session in `conflict` that holds the receipt of a final callback, whose editor has ended and which is a pending conflict, SHALL be joined without it. A `conflict` session that the key check orphans keeps its content as a stored, unpublished version, which is then offered like any other unpublished content. An orphaned session SHALL never store or publish anything again; versions stored before it was orphaned SHALL stay in history, and how unpublished ones are offered back is specified by `ocu-office-publish` (requirement "Version listing and restore"). A journal entry of the session SHALL be driven to its outcome before the session is marked `orphaned` (`ocu-office-publish`, requirement "Publish journal and recovery"), so an orphaned session holds none; the orphaning then applies to the state the outcome left, by the rule above: a session the outcome put in `closed` or `error`, or in `conflict` with the receipt of a final callback, is not orphaned.

A create request whose own check makes the document's session `orphaned` SHALL then create a new session with a new `document_key` and return 201, with one exception. When the document's newest version is unpublished at that point, the request SHALL create no session and no version and SHALL return 409 `unpublished_version`: a new session would record the workspace content as the newest version and the unpublished content would no longer be offered (`ocu-office-workspace-ui`, requirement "Unpublished content is offered before the editor opens"). The old session stays `orphaned`, so the next create request finds no open session and creates one. A create request for a document that has no open session is never refused for this reason. The documented loss bound SHALL be 5 minutes: after a DocumentServer crash or restart, input since the last committed auto-save may be lost. When DocumentServer cannot be reached for the key check, the create request SHALL return 502 `documentserver_unavailable` and change nothing.

#### Scenario: DocumentServer restarted (B-T11)

- **WHEN** DocumentServer is restarted during a session whose stored versions are all published, and the document is opened again
- **THEN** the old session is `orphaned` with reason `editor_state_lost` and the response is 201 with a new `session_id` and a new `document_key`
- **AND** no workspace file was changed by the orphaning

#### Scenario: DocumentServer restarted with an unpublished auto-save (B-T11)

- **WHEN** DocumentServer is restarted during a session whose newest version is an unpublished `autosave` version, the session is still stored as `editing`, and a create request for the document arrives
- **THEN** the old session is `orphaned` with reason `editor_state_lost`, the response is 409 with reason `unpublished_version`, and no session and no `workspace` version are created
- **AND** the versions listing then reports `open_session` null with the `autosave` version as the newest, unpublished one
- **AND** a second create request returns 201 with a new session and records the workspace content as a `workspace` version

#### Scenario: Conflict session whose editor state was lost (B-T11)

- **WHEN** a save met a conflict, the editor stayed open so the session is `conflict` without the receipt of a final callback, DocumentServer was then restarted, and a create request for the document arrives
- **THEN** the session is `orphaned` with reason `editor_state_lost`, the response is 409 with reason `unpublished_version`, and the conflicting content is still listed as the newest version with `published` false
- **AND** a `conflict` session that holds the receipt of a final callback is returned as a pending conflict without any request to DocumentServer

#### Scenario: Save on a session DocumentServer forgot

- **WHEN** a save is requested and DocumentServer answers that the key is unknown
- **THEN** the session becomes `orphaned`, the response is 409 with reason `session_not_editing` and nothing is stored

#### Scenario: Sessions after a backup restore (B-T14)

- **WHEN** a recovery set is restored, which writes a new restore epoch, and the status of a session created before the restore is requested
- **THEN** it reports `orphaned` with reason `restore_epoch_changed`
- **AND** opening the document again, when its newest version is published, returns a new session with a new `document_key`, while files, versions and broker state are those of the restored set

#### Scenario: Key check impossible

- **WHEN** a document with an `editing` session is opened again and DocumentServer cannot be reached
- **THEN** the response is 502 with reason `documentserver_unavailable` and the existing session is unchanged

### Requirement: Session sweep

OCU's idle-reclamation poll SHALL sweep the Office sessions of every chat, so that no state is left without an exit. For each chat it SHALL first drive any journal entry left by a crash (`ocu-office-publish`) and then check the sessions, so a session the sweep makes `orphaned` holds no journal entry. Versions an orphaned session stored without publishing stay stored and are offered when the file is next opened.

- A session in `opening`, `editing`, `saving` or `closing` that has had no callback and no request for longer than a configured liveness interval SHALL be checked against DocumentServer; when DocumentServer no longer knows its key the session SHALL become `orphaned` with reason `editor_state_lost`. The liveness interval SHALL be longer than the source ticket lifetime.
- A session that has been `saving` for longer than a configured save timeout SHALL be checked against DocumentServer; when DocumentServer still knows its key the session SHALL return to `editing` with reason `save_timeout`, and when it no longer knows the key the session SHALL become `orphaned` as above. A callback for that save that arrives later is still committed (`ocu-office-callback`).
- When DocumentServer cannot be reached the sweep SHALL change no session.

The sweep SHALL NOT change a session in `conflict` or in a final state, SHALL NOT store a version and SHALL NOT change a workspace file. The same poll drives journal entries left by a crash, as specified by `ocu-office-publish`.

#### Scenario: Abandoned session is orphaned

- **WHEN** a session in `opening`, `editing` or `closing` has had no callback and no request for longer than the liveness interval and DocumentServer no longer knows its key
- **THEN** after the next poll the session is `orphaned` with reason `editor_state_lost`, its stored versions are still listed
- **AND** the next create request for the document returns 201 with a new session

#### Scenario: Idle session that DocumentServer still knows

- **WHEN** a session has been idle for longer than the liveness interval and DocumentServer still knows its key
- **THEN** the session keeps its state

#### Scenario: Save that never completes

- **WHEN** a session has been `saving` for longer than the save timeout, no callback for the save arrived and DocumentServer still knows its key
- **THEN** after the next poll the session is `editing` with reason `save_timeout` and `last_committed_seq` is unchanged
- **AND** a new save request is accepted with 202

#### Scenario: DocumentServer unreachable during the sweep

- **WHEN** the poll runs while DocumentServer cannot be reached and sessions are past the liveness interval or the save timeout
- **THEN** no session changes state

#### Scenario: Activity and save timeout have independent clocks

- **WHEN** a successful status request refreshes activity while a session remains `saving`
- **THEN** that request postpones liveness expiry but does not postpone the timeout measured from entry into `saving`
- **AND** an expired save whose key is known returns to `editing` with `save_timeout`, retaining its sequence, intent and pending allocation for late callback handling

#### Scenario: Office-only chat and disabled Office

- **WHEN** a chat has Office state but no sandbox metadata
- **THEN** the existing idle poll still sweeps its eligible sessions
- **WHEN** Office editing is disabled
- **THEN** the poll performs no Office discovery or DocumentServer lookup and keeps its sandbox-reclamation behavior

#### Scenario: Concurrent sweeps preserve unrelated state

- **WHEN** two workers sweep the same overdue session while another committed record exists in the chat state
- **THEN** the canonical per-chat lock serializes eligibility and transition, both workers observe the rule's single resulting state, and the unrelated committed record remains intact

#### Scenario: Close on a pending conflict changes nothing

- **WHEN** a session is in `conflict`, its editor has already ended, and a close is requested
- **THEN** the response is 202, the session is still `conflict` with the same reason, and the conflict is offered when the file is next opened

#### Scenario: Journal entry is driven before the sweep orphans its session

- **WHEN** the poll finds a chat with a journal entry left by a crash whose session DocumentServer no longer knows
- **THEN** the entry is driven to its outcome first, the session is `orphaned` afterwards, and the journal holds no entry

#### Scenario: Recovered save conflict receives the due orphan decision

- **WHEN** an otherwise eligible overdue session has a surviving save obligation, recovery leaves it in conflict without a final receipt, and DocumentServer reports its key unknown
- **THEN** the sweep applies the orphan decision to the recovered state, preserving the unpublished version and leaving no journal entry
- **AND** ordinary pre-existing conflict sessions without a recovered obligation remain excluded from the sweep

#### Scenario: Recovery of a final callback prevents orphaning

- **WHEN** a request or sweep drives a surviving final-callback obligation before an orphan decision
- **THEN** its resulting closed or error state, or conflict with a final receipt, remains unchanged by orphaning
- **AND** unresolved recovery retains the obligation and never marks its session orphaned
