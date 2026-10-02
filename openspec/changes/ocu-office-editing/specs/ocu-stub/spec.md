# Spec Delta

## ADDED Requirements

### Requirement: Stub serves deterministic Office fixtures

`scripts/ocu-stub.py` SHALL serve deterministic fixtures for the seven browser-facing Office routes, at the paths the gateway forwards after stripping its prefix: `POST /api/office/{chat}/documents/{file}/sessions`, `GET /api/office/{chat}/sessions/{session}`, `POST /api/office/{chat}/sessions/{session}/save`, `POST /api/office/{chat}/sessions/{session}/close`, `POST /api/office/{chat}/sessions/{session}/resolve`, `GET /api/office/{chat}/documents/{file}/versions` and `POST /api/office/{chat}/documents/{file}/restore`. Responses SHALL use the field names of the OCU broker's responses and SHALL be a pure function of the fixture scenario and the requests already received for that chat: the same request sequence SHALL produce the same responses. In the default scenario session creation SHALL return a session that status then reports as `editing`; a save with intent `publish` SHALL lead to a status whose `last_published_seq` equals the returned `save_seq`, add a published version with source `save` and raise the edited file's `revision` in the outputs listing; a save with intent `persist` SHALL add an unpublished version with source `autosave` and advance only `last_committed_seq`; close SHALL lead to `closed`; restore SHALL add a published version with source `restore`. Office requests SHALL be recorded in the private observation record like every other arrival and SHALL NOT echo credentials on public routes. The stub SHALL NOT start a container, and SHALL NOT contact a DocumentServer or any other network service.

#### Scenario: Save round trip

- **WHEN** a session is created for a DOCX fixture, a save with intent `publish` is POSTed and status is read
- **THEN** the status reports `editing` with `last_published_seq` equal to the returned `save_seq`, the versions listing contains one published `save` version and the outputs listing shows a higher `revision` for that file

#### Scenario: Auto-save is not published

- **WHEN** a save with intent `persist` is POSTed for an open session
- **THEN** the versions listing gains an unpublished `autosave` version and the outputs listing is unchanged

#### Scenario: Close and restore

- **WHEN** close is POSTed for an open session and, after status reports `closed`, restore is POSTed for an earlier version
- **THEN** the versions listing gains a published `restore` version and earlier versions are unchanged

#### Scenario: Determinism and isolation

- **WHEN** the same request sequence is replayed against a freshly started stub
- **THEN** every response body is identical apart from documented time fields, and the stub has opened no outbound connection

#### Scenario: Unknown Office path

- **WHEN** an Office-shaped path that is not one of the seven routes, or a listed route with another method, is requested
- **THEN** the response is 404

### Requirement: Stub Office outcomes are selectable

The stub SHALL let a test select, per chat, through its existing fixture-scenario mechanism, the Office outcomes the UI must handle: a save with intent `publish` that ends in `conflict` because the workspace file changed; session creation refused at the connection cap with 503 and reason `connection_limit`; and a session that becomes `orphaned`. For the conflict fixture, resolve with `save_as` SHALL add a new file with a deduplicated name to the outputs listing and return the session to `editing`, and resolve with `overwrite` SHALL publish over the original file and return the session to `editing`. A chat with none of these scenarios SHALL behave as the default fixture.

#### Scenario: Conflict then save as

- **WHEN** the conflict scenario is selected, a save with intent `publish` is POSTed and resolve is POSTed with `save_as`
- **THEN** status first reports `conflict`, then `editing`, and the outputs listing contains the original file unchanged plus a new deduplicated name

#### Scenario: Conflict then overwrite

- **WHEN** the conflict scenario is selected, a save with intent `publish` is POSTed and resolve is POSTed with `overwrite`
- **THEN** status returns to `editing`, the original file's `revision` is raised and no new name appears in the outputs listing

#### Scenario: Refused at the cap

- **WHEN** the cap scenario is selected and session creation is POSTed
- **THEN** the response is 503 with reason `connection_limit` and no session exists

#### Scenario: Orphaned session

- **WHEN** the orphaned scenario is selected and status is read for an open session
- **THEN** the status reports `orphaned` and a later session creation for the same file returns a new session id

### Requirement: Stub editor host page

For `GET /preview/{chat}?embed=office` the stub SHALL serve an editor host page that speaks the four-message protocol of the editor host page (`ocu:office-ready`, `ocu:office-open`, `ocu:office-state`, `ocu:office-command`) with the same key sets and the same source, origin, chat and generation checks, drives the stub's Office fixtures through the prefixed request wrapper with `X-Requested-With: ocu-workspace`, and contains no real editor. The page SHALL load no script and open no frame or connection on any origin other than the stub's public origin, and SHALL NOT require a DocumentServer. It SHALL expose a visible deterministic control that simulates a document modification, so a test can reach `dirty: true`. The existing `embed=files`, `embed=browser`, `embed=terminal` and standalone preview fixtures SHALL be unchanged.

#### Scenario: Protocol without a real editor

- **WHEN** a same-origin parent frames the stub's `embed=office` page, replies to `ocu:office-ready` with a valid `ocu:office-open`, triggers the modification control and sends `save`
- **THEN** the page reports `opening`, `editing`, `editing` with `dirty: true`, `saving` and `editing` with `dirty: false`, each with the exact nine-key state message
- **AND** every request it made went to the stub's own origin

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
