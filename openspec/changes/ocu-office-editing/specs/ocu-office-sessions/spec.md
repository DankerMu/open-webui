# Spec Delta

## Purpose

Edit session lifecycle of the Office broker and its browser-facing session API in OCU: create or join, status with the change notice, save, close, the one-level save model, key stability, orphaning and the connection cap. Source: Plan 2 § 关键设计 2 接口, § 3 保存模型与状态机; design D7, D8, D9, D13 (change notice), D14.

## ADDED Requirements

### Requirement: Office routes exist only when enabled and are guarded as chat routes

OCU SHALL serve the browser-facing Office routes only when Office editing is enabled for the OCU service; when it is not enabled, every request under `/api/office/` that passes the service guard SHALL return 404 without reading or creating Office state and without contacting DocumentServer. This capability defines four of them (paths after the gateway's `/ocu` prefix):

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

`POST /api/office/{chat}/documents/{file}/sessions` SHALL resolve `{file}` through the outputs broker, check the document under the per-chat lock (consulting DocumentServer is not required to happen while the lock is held) and refuse with an explicit error when: the `file_id` is unknown, malformed or tombstoned (404 `unknown_file`); the file name does not end in `.docx`, `.xlsx` or `.pptx`, compared case-insensitively (415 `unsupported_type`); the file is larger than the outputs broker's per-file limit (413 `file_too_large`); the content is not a readable OOXML container of the type its extension names (422 `corrupt_document`); free space is below the storage floor (503 `storage_low`); or DocumentServer is at its connection cap (503 `connection_limit`). How the cap is detected — DocumentServer's own refusal or a queried count — SHALL be as fixed by the B1 verification record; the refusal behaviour is the same either way. A refused request SHALL create no session and no document record, SHALL leave every existing session, version and workspace file unchanged, and SHALL leave the file available for read-only preview and download. A successful creation SHALL return 201 with `session_id`, `file_id`, `document_key`, `state` (`opening`), `joined` (false) and `editor_config`.

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

#### Scenario: Connection cap reached (B-T15)

- **WHEN** DocumentServer is at its connection cap and a session is requested for a document that has no open session
- **THEN** the response is 503 with reason `connection_limit` and no session is created
- **AND** every session that is already open keeps its state, versions and unsaved editor content

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

The create and join responses SHALL include `editor_config`, the DocumentServer editor configuration signed with the DocumentServer JWT secret. Its document key SHALL equal `document_key`. Its document source address SHALL be the source route `/office/source/{ticket}` and its callback address SHALL be `/office/callback/{chat}/{session}`, both on OCU's configured server-to-server address and never on a browser-facing gateway address. The response SHALL NOT contain the internal token, the MCP key, any model API key or the JWT signing secret. A session in `conflict` whose editor has already ended SHALL be returned with `editor_config` null.

#### Scenario: No secret in the response

- **WHEN** a session is created or joined
- **THEN** the response body and headers contain none of: the internal token, the MCP key, a model API key, the DocumentServer JWT secret

#### Scenario: Server-to-server addresses

- **WHEN** the `editor_config` of a new session is inspected
- **THEN** its source and callback addresses use OCU's configured server-to-server address, the callback path names this chat and session, and neither address uses the gateway's host or port

#### Scenario: Configuration is signed

- **WHEN** the `editor_config` token is verified with the configured DocumentServer JWT secret
- **THEN** verification succeeds and the signed payload contains the same document key, source address and callback address as the response

### Requirement: Session states and the status endpoint

A session SHALL be in exactly one of `opening`, `editing`, `saving`, `closing`, `closed`, `conflict`, `error` or `orphaned`. Normal flow SHALL be `opening → editing`, `editing → saving → editing` for each save, and `closing → closed`; `closed`, `error` and `orphaned` SHALL be final. `GET /api/office/{chat}/sessions/{session}` SHALL return 200 with the persisted `session_id`, `file_id`, `document_key`, `state`, `reason` (null when there is nothing to report), `save_seq`, `last_committed_seq`, `last_published_seq` and `workspace_changed`, from any worker process, and 404 `unknown_session` for a session the chat does not have. `last_committed_seq` SHALL be the highest `save_seq` that is complete — its content is stored as a version, or DocumentServer confirmed that it adds nothing to the latest stored version; `last_published_seq` SHALL be the highest `save_seq` whose resulting version was published to the workspace file. The status request SHALL NOT contact DocumentServer and SHALL NOT change a version or a workspace file.

While the session is open the status request SHALL check only the workspace file being edited: read its size and mtime, hash it only when either differs from the previous check, and report `workspace_changed` true when the hash differs from the session baseline or the file is missing, false otherwise. The notice SHALL NOT change the session state and SHALL NOT block a save; the publish-time comparison specified by `ocu-office-publish` is the safety mechanism.

#### Scenario: Status reflects persisted state

- **WHEN** a save callback with `save_seq` 2 has been stored and published and the status is requested from another worker
- **THEN** it returns `state` `editing`, `last_committed_seq` 2 and `last_published_seq` 2

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

#### Scenario: Unknown session

- **WHEN** the status is requested for a `session_id` the chat does not have
- **THEN** the response is 404 with reason `unknown_session`

### Requirement: One-level save model

The user SHALL see one save. The broker SHALL implement it with two internal stages — persist (store the content as a version) and publish (replace the workspace file) — chosen by the intent of each request:

| Trigger                                                                                                             | Request                    | Effect                                                         |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------- |
| Save (WebUI status bar button)                                                                                      | save with intent `publish` | persist, then publish                                          |
| Every 5 minutes when the editor reported a modification since the last save request, driven by the editor host page | save with intent `persist` | persist only; the version is `autosave`, unpublished           |
| Leaving the editor (chat switch, sidebar close, editor close)                                                       | close                      | when the final callback reports changes: persist, then publish |

The editor configuration SHALL leave DocumentServer's user-initiated force save off, so the editor's own save command produces no callback and is not a save in this model; the WebUI status bar button is the only user save. OCU SHALL NOT run an auto-save timer of its own. `POST /api/office/{chat}/sessions/{session}/save` SHALL take a body `{"intent": "publish" | "persist"}`; a missing or other value SHALL return 422 `invalid_request`. It SHALL be accepted only for a session in `editing` (409 `session_not_editing` otherwise), so at most one save of a session is outstanding at a time. On acceptance it SHALL allocate the next `save_seq` (per session, starting at 1, strictly increasing), record the intent with it, set the session to `saving`, ask DocumentServer to deliver the current content with that `save_seq` and intent as the command's user data, and return 202 with `session_id`, `save_seq` and `intent`. The 202 SHALL mean accepted only: no version exists because of it, and `last_committed_seq` and `last_published_seq` advance only when the callback for that `save_seq` is committed. When DocumentServer answers that there is nothing new to save, the request SHALL complete without a callback: the session returns to `editing`, `last_committed_seq` becomes that `save_seq`, and for intent `publish` the session's latest stored version SHALL be published if it is not already. When DocumentServer cannot be reached or rejects the command, the response SHALL be 502 `documentserver_unavailable`, nothing SHALL be stored and the session SHALL be `editing`.

#### Scenario: User save persists and publishes (B-T04)

- **WHEN** a save with intent `publish` is accepted and its callback is committed without conflict
- **THEN** a version with `source` `save` and `published` true exists, the workspace file's bytes equal that version
- **AND** the status reports `state` `editing` and `last_published_seq` equal to the returned `save_seq`

#### Scenario: Auto-save persists without publishing (B-T04)

- **WHEN** a save with intent `persist` is accepted and its callback is committed
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

`POST /api/office/{chat}/sessions/{session}/close` on an open session SHALL allocate the next `save_seq`, set the session to `closing` and return 202 with `session_id`, `save_seq` and `state`. It SHALL NOT store a version, SHALL NOT publish and SHALL NOT end the session: the session ends only when DocumentServer reports the final callback (status 2 or 4), as specified by `ocu-office-callback`. A close request for a session that is already `closing` SHALL return 202 with the `save_seq` already allocated. A close request for a session in `closed`, `error` or `orphaned` SHALL return 409 `session_not_open`.

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

#### Scenario: Close on a finished session

- **WHEN** a close is requested for a session in `closed`, `error` or `orphaned`
- **THEN** the response is 409 with reason `session_not_open`

### Requirement: Orphaned sessions

A session SHALL become `orphaned` when DocumentServer answers a broker request for its `document_key` — on reopening the document or on a save — that it no longer knows the key (reason `editor_state_lost`), or when the restore epoch recorded at its creation differs from the current restore epoch under the chat-data root (reason `restore_epoch_changed`), checked on every session request and every callback. An `opening` session, whose key DocumentServer has not seen yet, SHALL be joined without the key check. An orphaned session SHALL never store or publish anything again; versions stored before it was orphaned SHALL stay in history. A create request that finds the document's session orphaned SHALL return a new session with a new `document_key` (201). The documented loss bound SHALL be 5 minutes: after a DocumentServer crash or restart, input since the last committed auto-save may be lost. When DocumentServer cannot be reached for the key check, the create request SHALL return 502 `documentserver_unavailable` and change nothing.

#### Scenario: DocumentServer restarted (B-T11)

- **WHEN** DocumentServer is restarted during a session that has an auto-saved version, and the document is opened again
- **THEN** the old session is `orphaned` with reason `editor_state_lost` and the response is 201 with a new `session_id` and a new `document_key`
- **AND** the auto-saved version is still listed and no workspace file was changed by the orphaning

#### Scenario: Save on a session DocumentServer forgot

- **WHEN** a save is requested and DocumentServer answers that the key is unknown
- **THEN** the session becomes `orphaned`, the response is 409 with reason `session_not_editing` and nothing is stored

#### Scenario: Sessions after a backup restore (B-T14)

- **WHEN** a recovery set is restored, which writes a new restore epoch, and the status of a session created before the restore is requested
- **THEN** it reports `orphaned` with reason `restore_epoch_changed`
- **AND** opening the document again returns a new session with a new `document_key`, while files, versions and broker state are those of the restored set

#### Scenario: Key check impossible

- **WHEN** a document with an `editing` session is opened again and DocumentServer cannot be reached
- **THEN** the response is 502 with reason `documentserver_unavailable` and the existing session is unchanged
