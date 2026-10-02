# Spec Delta

## ADDED Requirements

### Requirement: Stub serves deterministic Office fixtures

`scripts/ocu-stub.py` SHALL serve deterministic fixtures for the seven browser-facing Office routes, at the paths the gateway forwards after stripping its prefix: `POST /api/office/{chat}/documents/{file}/sessions`, `GET /api/office/{chat}/sessions/{session}`, `POST /api/office/{chat}/sessions/{session}/save`, `POST /api/office/{chat}/sessions/{session}/close`, `POST /api/office/{chat}/sessions/{session}/resolve`, `GET /api/office/{chat}/documents/{file}/versions` and `POST /api/office/{chat}/documents/{file}/restore`. Responses SHALL use the field names of the OCU broker's responses and SHALL be a pure function of the fixture scenario and the requests already received for that chat: the same request sequence SHALL produce the same responses. In the default scenario session creation SHALL return a session with `joined` false that status then reports as `editing`, and a further session creation for the same file while that session is open SHALL return the same session with `joined` true; a save with intent `publish` SHALL lead to a status whose `last_published_seq` equals the returned `save_seq`, add a published version with source `save` and raise the edited file's `revision` in the outputs listing; a save with intent `persist` SHALL add an unpublished version with source `autosave` and advance only `last_committed_seq`; close SHALL lead to `closed`; restore SHALL add a published version with source `restore`. Office requests SHALL be recorded in the private observation record like every other arrival and SHALL NOT echo credentials on public routes. The stub SHALL NOT start a container, and SHALL NOT contact a DocumentServer or any other network service.

#### Scenario: Save round trip

- **WHEN** a session is created for a DOCX fixture, a save with intent `publish` is POSTed and status is read
- **THEN** the status reports `editing` with `last_published_seq` equal to the returned `save_seq`, the versions listing contains one published `save` version and the outputs listing shows a higher `revision` for that file

#### Scenario: Auto-save is not published

- **WHEN** a save with intent `persist` is POSTed for an open session
- **THEN** the versions listing gains an unpublished `autosave` version and the outputs listing is unchanged

#### Scenario: Close and restore

- **WHEN** close is POSTed for an open session and, after status reports `closed`, restore is POSTed for an earlier version
- **THEN** the versions listing gains a published `restore` version and earlier versions are unchanged

#### Scenario: Second creation joins

- **WHEN** session creation is POSTed twice for the same file without a close in between
- **THEN** the first response has `joined` false, the second has the same `session_id` with `joined` true, and one session exists

#### Scenario: Determinism and isolation

- **WHEN** the same request sequence is replayed against a freshly started stub
- **THEN** every response body is identical apart from documented time fields, and the stub has opened no outbound connection

#### Scenario: Unknown Office path

- **WHEN** an Office-shaped path that is not one of the seven routes, or a listed route with another method, is requested
- **THEN** the response is 404

### Requirement: Stub Office outcomes are selectable

The stub SHALL let a test select, per chat, through its existing fixture-scenario mechanism, the Office outcomes the UI must handle: a save with intent `publish` that ends in `conflict` because the workspace file changed; session creation refused at the connection cap with 503 and reason `connection_limit`; the editor's own refusal at the connection cap, in which session creation succeeds and the stub editor host page then behaves as the real host page does when the editor raises its connection-cap event; a session that becomes `orphaned`; a close that ends in an automatic save-as; a document whose newest version is unpublished while no session is open; and a document whose stale session is found orphaned at session creation while its newest version is unpublished.

For the editor-refusal fixture, a close POSTed for the session that never left `opening` SHALL lead to `closed` at once. For the automatic save-as fixture, the edited file SHALL be absent from the outputs listing once the session is open, and close SHALL lead to a status of `closed` whose `saved_as` carries the new file's `file_id` and `path`, with a new file under a deduplicated name and its own `file_id` in the outputs listing and no file under the old name. For the unpublished-version fixture, the versions listing SHALL end, from the first request, with an unpublished `autosave` version above a published one while no session exists; restore of that version SHALL add a published `restore` version and raise the file's `revision`, and session creation SHALL succeed whether or not restore was called. For the stale-session fixture, the versions listing SHALL first report an `open_session` in `editing` with `editor_ended` false and an unpublished `autosave` version as the newest; the first session creation SHALL return 409 with reason `unpublished_version`; from then on the listing SHALL report `open_session` null with the same versions, and the next session creation SHALL succeed. For the conflict fixture, resolve with `save_as` SHALL add a new file with a deduplicated name to the outputs listing and return the session to `editing`, and resolve with `overwrite` SHALL publish over the original file and return the session to `editing`. A chat with none of these scenarios SHALL behave as the default fixture.

#### Scenario: Conflict then save as

- **WHEN** the conflict scenario is selected, a save with intent `publish` is POSTed and resolve is POSTed with `save_as`
- **THEN** status first reports `conflict`, then `editing`, and the outputs listing contains the original file unchanged plus a new deduplicated name

#### Scenario: Conflict then overwrite

- **WHEN** the conflict scenario is selected, a save with intent `publish` is POSTed and resolve is POSTed with `overwrite`
- **THEN** status returns to `editing`, the original file's `revision` is raised and no new name appears in the outputs listing

#### Scenario: Refused at the cap

- **WHEN** the cap scenario is selected and session creation is POSTed
- **THEN** the response is 503 with reason `connection_limit` and no session exists

#### Scenario: Editor refuses at the cap

- **WHEN** the editor-refusal scenario is selected, session creation is POSTed and close is then POSTed for the returned session
- **THEN** creation returns 201 with a session in `opening` and `joined` false, and after the close the status reports `closed` and no version was added

#### Scenario: Close ends in an automatic save-as

- **WHEN** the automatic save-as scenario is selected, a session is created for `report.docx` and close is POSTed
- **THEN** the status reports `closed`, the outputs listing contains `report (2).docx` with a new `file_id` and no `report.docx`, and the status names the new file

#### Scenario: Newest version unpublished

- **WHEN** the unpublished-version scenario is selected and the versions listing is read before any session creation
- **THEN** its last entry is an `autosave` version with `published` false and no session exists for the file
- **AND** a restore of that version adds a published `restore` version, and a session creation without restore leaves the listing unchanged

#### Scenario: Stale session with unpublished content

- **WHEN** the stale-session scenario is selected, the versions listing is read, session creation is POSTed twice and the listing is read again
- **THEN** the first listing reports an open session in `editing`, the first creation returns 409 with reason `unpublished_version`, the second listing reports `open_session` null with an unpublished newest version, and the second creation returns 201

#### Scenario: Orphaned session

- **WHEN** the orphaned scenario is selected and status is read for an open session
- **THEN** the status reports `orphaned` and a later session creation for the same file returns a new session id

### Requirement: Stub editor host page

For `GET /preview/{chat}?embed=office` the stub SHALL serve an editor host page that speaks the four-message protocol of the editor host page (`ocu:office-ready`, `ocu:office-open`, `ocu:office-state`, `ocu:office-command`) with the same key sets and the same source, origin, chat and generation checks, drives the stub's Office fixtures through the prefixed request wrapper with `X-Requested-With: ocu-workspace`, and contains no real editor. The page SHALL load no script and open no frame or connection on any origin other than the stub's public origin, and SHALL NOT require a DocumentServer. It SHALL expose a visible deterministic control that simulates a document modification, so a test can reach `dirty: true`. In the editor-refusal scenario the page SHALL, after session creation succeeded, report `refused` with reason `connection_limit` and the session's id, SHALL issue one close request when the create response had `joined` false and none when it had `joined` true, and SHALL report nothing further. The existing `embed=files`, `embed=browser`, `embed=terminal` and standalone preview fixtures SHALL be unchanged.

#### Scenario: Protocol without a real editor

- **WHEN** a same-origin parent frames the stub's `embed=office` page, replies to `ocu:office-ready` with a valid `ocu:office-open`, triggers the modification control and sends `save`
- **THEN** the page reports `opening`, `editing`, `editing` with `dirty: true`, `saving` and `editing` with `dirty: false`, each with the exact nine-key state message
- **AND** every request it made went to the stub's own origin

#### Scenario: Editor refusal on a new session (B-T15)

- **WHEN** the editor-refusal scenario is selected and the parent opens a file that has no session
- **THEN** the page reports `opening` and then `refused` with reason `connection_limit` and a non-null `session_id`, and the stub has recorded exactly one close request for that session

#### Scenario: Editor refusal on a join (B-T15)

- **WHEN** the editor-refusal scenario is selected and the parent opens a file whose session was already created by an earlier request
- **THEN** the page reports `refused` with reason `connection_limit` and that session's id, and the stub has recorded no close request

#### Scenario: Malformed messages are ignored

- **WHEN** the parent sends an `ocu:office-open` with an extra field or for another chat
- **THEN** the stub page issues no request and posts no state

#### Scenario: Other embed modes are unchanged

- **WHEN** the existing `embed=files`, `embed=browser` and `embed=terminal` fixtures are requested
- **THEN** their responses and headers are the same as before this change

### Requirement: Stub drops the upload read routes and lists uploads

The stub SHALL NOT serve `GET /api/uploads/{chat}/manifest` or `GET /api/uploads/{chat}/list`; both SHALL return 404. `POST /api/uploads/{chat}/{path}` SHALL store the upload in that chat's Files fixture so that the next `GET /api/outputs/{chat}` lists it with its own `file_id` and a raised listing `revision`. When the target name already exists in that chat the upload SHALL be stored under a deduplicated name of the form `name (2).ext`, the existing entry SHALL be left unchanged, and the response SHALL return the final stored name.

#### Scenario: Upload read routes are gone

- **WHEN** `GET /api/uploads/{chat}/manifest` or `GET /api/uploads/{chat}/list` is requested
- **THEN** the response is 404

#### Scenario: Upload appears in the Files listing

- **WHEN** `report.docx` is POSTed to the upload route for a chat that has no such file
- **THEN** the response returns `report.docx` and the next outputs listing contains it with a `file_id`

#### Scenario: Same name is deduplicated

- **WHEN** `report.docx` is POSTed a second time to the same chat
- **THEN** the response returns `report (2).docx`, the outputs listing contains both names and the first entry's `file_id` and `revision` are unchanged
