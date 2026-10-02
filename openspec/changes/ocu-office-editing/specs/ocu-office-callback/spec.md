# Spec Delta

## Purpose

The DocumentServer-facing control-plane routes of the Office broker in OCU: the source ticket, callback authentication, status handling, ordering and idempotence by `save_seq`, and the persist pipeline that turns a callback into a durable version before it is acknowledged. Source: Plan 2 § 关键设计 2 接口, § 3 保存模型与状态机; design D7 (control-plane routes), D9, D10, D14.

## ADDED Requirements

### Requirement: Control-plane routes and their authentication

OCU SHALL serve `GET /office/source/{ticket}` and `POST /office/callback/{chat}/{session}` for DocumentServer on the control-plane network only; neither SHALL appear in the gateway route table. They SHALL NOT require the internal token and SHALL NOT accept it as a substitute for their own credential: the source route authenticates by its ticket, the callback route by the DocumentServer JWT carried in the request. Both SHALL reject a peer in the sandbox subnet with 403 before any work, and both SHALL return 404 when Office editing is not enabled for the OCU service. The callback route SHALL answer success as HTTP 200 with body `{"error": 0}` and every failure as a non-200 status with a `reason`, so that DocumentServer never takes a failure for a completed save.

#### Scenario: Not reachable through the gateway

- **WHEN** a browser requests `/ocu/office/callback/{chat}/{session}` or `/ocu/office/source/{ticket}` through the gateway
- **THEN** the gateway answers 404 and OCU is not contacted

#### Scenario: Sandbox peer

- **WHEN** a peer in the sandbox subnet calls either route, even with a valid ticket or a validly signed callback
- **THEN** the response is 403 and no version content is served, stored or published

#### Scenario: Internal token is not a credential here

- **WHEN** a callback arrives with the correct internal token and no DocumentServer JWT
- **THEN** the response is 401 with reason `invalid_token` and nothing changes

#### Scenario: Office editing not enabled

- **WHEN** Office editing is not enabled and either route is requested
- **THEN** the response is 404 and no Office state is read or created

### Requirement: Source ticket

A source ticket SHALL be a signed token with a configured short lifetime that binds one chat, one document (`file_id`), one version and one session. `GET /office/source/{ticket}` SHALL return 401 with reason `invalid_ticket`, without reading version content, when the ticket is malformed, its signature does not verify, any bound value was altered, or its lifetime has passed. A valid ticket SHALL return exactly the stored bytes of the bound version — not the current workspace file — and SHALL give access to nothing else.

#### Scenario: Valid ticket returns the bound version

- **WHEN** DocumentServer fetches the source with a valid ticket after the workspace file was changed by the Agent
- **THEN** the response is 200 and its bytes hash to the SHA-256 of the version the ticket binds

#### Scenario: Expired ticket (B-T10)

- **WHEN** the ticket is presented after its lifetime has passed
- **THEN** the response is 401 with reason `invalid_ticket`

#### Scenario: Altered ticket (B-T09)

- **WHEN** the chat, document, version or session inside a ticket is replaced with another user's values, or the signature is changed
- **THEN** the response is 401 with reason `invalid_ticket` and no content is returned

### Requirement: Callback authentication

A callback SHALL be accepted only when its DocumentServer JWT verifies against the configured DocumentServer secret. Status, document key, download address and user data SHALL be taken only from the verified payload; values outside it SHALL be ignored. The key in the payload SHALL equal the `document_key` of the session named in the path, and that session SHALL belong to the chat named in the path. A missing, unverifiable or expired JWT, or a key that does not match, SHALL be answered 401 with reason `invalid_token`; a rejected callback SHALL change no session, version or file and SHALL be recorded as a diagnosable error naming chat, session and reason without the token.

#### Scenario: Bad signature (B-T08)

- **WHEN** a callback is signed with a secret other than the configured one, or carries no JWT
- **THEN** the response is 401 with reason `invalid_token`, no download is attempted and no state changes

#### Scenario: Forged callback for another session (B-T09)

- **WHEN** a validly signed callback names a document key that is not the `document_key` of the session in the path
- **THEN** the response is 401 with reason `invalid_token` and neither session changes

#### Scenario: Unsigned fields are ignored

- **WHEN** a callback's verified payload reports status 1 while an unsigned field of the request body claims status 2 and a download address
- **THEN** the callback is handled as status 1 and nothing is downloaded

### Requirement: Callback status handling

For an authenticated callback of an open session the broker SHALL act on the DocumentServer status as follows and SHALL acknowledge only after the resulting state is durable:

| Status    | Handling                                                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | record the participants; a session in `opening`, or in `closing` while a participant remains connected, becomes `editing`; no version, no file change                                                |
| 2         | final close with changes: persist with `source` `close`, then publish; the session becomes `closed`, or `conflict` when the publish meets a conflict                                                 |
| 3         | record the final-save failure; the session becomes `error` with reason `final_save_failed`                                                                                                           |
| 4         | closed without changes: no version is added; when the session's latest stored version is unpublished it is published; the session becomes `closed`, or `conflict` when that publish meets a conflict |
| 6         | forcesave result: persist with `source` `save` or `autosave` according to the recorded intent; publish when that intent is `publish`; the session returns to `editing`, or becomes `conflict`        |
| 7         | record the forcesave failure; the session is `editing` with reason `forcesave_failed`                                                                                                                |
| any other | change nothing; record a diagnosable error; answer 422 with reason `unknown_status`                                                                                                                  |

A status 2 or 4 callback SHALL end the session whether or not a close was requested. When a publish that follows a persist fails for a reason other than a conflict (reasons specified by `ocu-office-publish`), the version SHALL stay stored and unpublished, and the session SHALL be `editing` with that reason after status 6 and `error` with that reason after status 2 or 4.

#### Scenario: Status 1 opens the session (B-T04)

- **WHEN** the first status 1 callback arrives for a session in `opening`
- **THEN** the session is `editing`, no version is added and the acknowledgement is `{"error": 0}`

#### Scenario: Status 2 persists and publishes (B-T04)

- **WHEN** a status 2 callback delivers content for a session and the workspace file still matches the baseline
- **THEN** a version with `source` `close` and `published` true exists, the workspace file equals it and the session is `closed`

#### Scenario: Status 2 meets a conflict

- **WHEN** a status 2 callback delivers content and the workspace file no longer matches the baseline
- **THEN** the version is stored with `published` false, the workspace file keeps its bytes, the session is `conflict` and the acknowledgement is `{"error": 0}`

#### Scenario: Status 3 (B-T04)

- **WHEN** a status 3 callback arrives
- **THEN** the session is `error` with reason `final_save_failed`, no version is added and no file changes

#### Scenario: Status 4 (B-T04)

- **WHEN** a status 4 callback arrives for a session whose stored versions are all published
- **THEN** the session is `closed`, no version is added and the workspace file keeps its bytes

#### Scenario: Status 4 after an unpublished auto-save

- **WHEN** a status 4 callback arrives for a session whose latest stored version is an unpublished `autosave` version
- **THEN** that version is published and the session is `closed`, or `conflict` when the workspace file no longer matches the baseline

#### Scenario: Status 6 with intent publish (B-T04)

- **WHEN** a status 6 callback carries the `save_seq` of a save recorded with intent `publish`
- **THEN** a `save` version is stored and published and the session is `editing`

#### Scenario: Status 6 with intent persist (B-T04)

- **WHEN** a status 6 callback carries the `save_seq` of a save recorded with intent `persist`
- **THEN** an `autosave` version is stored with `published` false, the workspace file keeps its bytes and the session is `editing`

#### Scenario: Status 7 (B-T04)

- **WHEN** a status 7 callback arrives for a session in `saving`
- **THEN** the session is `editing` with reason `forcesave_failed`, no version is added and no file changes

#### Scenario: A close while another tab is connected (B-T05)

- **WHEN** a session is `closing` and a status 1 callback reports that a participant is still connected
- **THEN** the session is `editing` with the same `document_key`, and no version is stored or published because of the departed tab

#### Scenario: Unknown status

- **WHEN** a callback reports a status outside 1, 2, 3, 4, 6 and 7
- **THEN** the response is 422 with reason `unknown_status`, no session, version or file changes and the event is recorded with chat, session and status

### Requirement: Ordering and idempotence by save_seq

A status 6 or 7 callback SHALL be matched to its save by the `save_seq` and intent echoed in its user data; one without a `save_seq` that the broker issued for that session SHALL be answered 422 with reason `invalid_userdata` and change nothing. The final callback (status 2 or 4) SHALL take the `save_seq` allocated by the close request, or the next unallocated one when no close was requested. A callback whose `save_seq` is lower than the session's `last_committed_seq` SHALL be answered 409 with reason `stale_save_seq` and SHALL never store a version, publish or change which version is published. A callback that repeats an already committed `save_seq` with the same content SHA-256 SHALL return the first result — `{"error": 0}` — without adding a version, publishing again or changing the listing `revision`; this SHALL also hold when the session has since become `closed`. A callback that repeats a committed `save_seq` with different content SHALL be answered 409 with reason `stale_save_seq` and change nothing.

#### Scenario: Out-of-order save_seq (B-T08)

- **WHEN** the callback for `save_seq` 4 has been committed and the callback for `save_seq` 3 arrives afterwards
- **THEN** the response is 409 with reason `stale_save_seq`, the number of versions is unchanged and the workspace file keeps the content of `save_seq` 4

#### Scenario: Duplicate callback (B-T08)

- **WHEN** the callback for `save_seq` 4 is delivered a second time with the same content
- **THEN** the response is `{"error": 0}`, one version and one receipt exist for `save_seq` 4 and the listing `revision` did not change on the second delivery

#### Scenario: Retry after a lost acknowledgement (B-T08)

- **WHEN** the acknowledgement of a committed status 2 callback is lost and DocumentServer delivers it again after the session became `closed`
- **THEN** the response is `{"error": 0}` and no version is added and no file is written

#### Scenario: Same save_seq with different content

- **WHEN** a callback repeats a committed `save_seq` but its content hashes differently
- **THEN** the response is 409 with reason `stale_save_seq` and the committed version stays as it is

#### Scenario: Forcesave result without a known save_seq

- **WHEN** a status 6 callback carries no user data, or a `save_seq` the broker never issued for the session
- **THEN** the response is 422 with reason `invalid_userdata` and nothing is downloaded or stored

### Requirement: Confined download and content validation

The broker SHALL download callback content only from the configured DocumentServer server-to-server origin. A download address with another scheme, host or port SHALL be rejected with 422 and reason `download_url_rejected` without any outbound request. Every redirect hop SHALL be validated against the same origin; a redirect elsewhere, a timeout or a failed transfer SHALL be answered 502 with reason `download_failed`. A body larger than the outputs broker's per-file limit SHALL stop the download and be answered 413 with reason `file_too_large`. Before storing, the content SHALL be checked for size, for a type equal to the document's type and for a readable OOXML container of that type; a failure SHALL be answered 422 with reason `invalid_content`. In every one of these cases no version and no receipt SHALL be recorded, nothing SHALL remain under `staging/`, and no workspace file SHALL change.

#### Scenario: Arbitrary download address (B-T08)

- **WHEN** a validly signed callback names a download address on a host other than the configured DocumentServer server-to-server origin, including a loopback, metadata or sandbox address
- **THEN** the response is 422 with reason `download_url_rejected` and no request is sent to that address

#### Scenario: Redirect leaves the origin

- **WHEN** the download address is on the configured origin and answers with a redirect to another host
- **THEN** the redirect is not followed and the response is 502 with reason `download_failed`

#### Scenario: Download times out (B-T08)

- **WHEN** DocumentServer does not deliver the content within the configured timeout
- **THEN** the response is 502 with reason `download_failed`, nothing is stored and a later retry of the same callback can still be committed

#### Scenario: Oversized content

- **WHEN** the downloaded body exceeds the per-file limit
- **THEN** the response is 413 with reason `file_too_large` and no partial content remains under `staging/` or `versions/`

#### Scenario: Content is not the document's type

- **WHEN** the downloaded content is not a readable OOXML container, or is a spreadsheet while the document is a `docx`
- **THEN** the response is 422 with reason `invalid_content` and no version is recorded

### Requirement: Acknowledge only after the version is durable

For a callback that delivers content the broker SHALL, in this order, validate the callback, download, validate the content, stage it and flush it to disk, and then store the version content, the version record and the save receipt under the per-chat lock. It SHALL answer `{"error": 0}` only after the version and the receipt are durable. Any failure before that point SHALL be answered with a non-200 status so that DocumentServer retries, and SHALL leave no version record without its content and no receipt without its version. The acknowledgement SHALL depend on the persist stage only: when the publish that follows meets a conflict or fails, the callback SHALL still be acknowledged and the outcome SHALL be reported through the session state.

#### Scenario: Durable before acknowledged (B-T11)

- **WHEN** a callback is acknowledged with `{"error": 0}` and OCU is killed immediately afterwards
- **THEN** after the restart the version record, its `versions/{sha256}` content and the receipt are all present

#### Scenario: Crash before the commit (B-T11)

- **WHEN** OCU is killed after the download and before the version is stored
- **THEN** no acknowledgement was sent, no version or receipt exists after the restart, and the retried callback is committed once

#### Scenario: Storage refusal is not a success (B-T11)

- **WHEN** free space is below the storage floor when the content is to be stored
- **THEN** the response is 503 with reason `storage_low` and the session does not report the `save_seq` as committed

#### Scenario: Conflict after persist is acknowledged

- **WHEN** the version is durable and the publish then reports a conflict
- **THEN** the response is `{"error": 0}`, the version is listed with `published` false and the session is `conflict`

### Requirement: Callbacks that cannot apply change no file

A callback for a session the chat does not have SHALL be answered 404 with reason `unknown_session`. A callback for a session in `closed`, `error` or `orphaned` that does not repeat a committed receipt SHALL be answered 409 with reason `session_not_open`. Neither SHALL download content, store a version or change a file. A session whose restore epoch differs from the current one SHALL be treated as `orphaned` when its callback arrives. The final callback of a session that is still open SHALL be processed even when the user has since lost access to the chat. When the workspace files directory of the chat no longer exists, the content SHALL be stored as a version and SHALL NOT be published, and no directory or file SHALL be created in its place; when the chat's data directory no longer exists at all, the session is unknown and the callback SHALL create no file and SHALL NOT recreate that directory, which means its existence is checked before the per-chat lock is taken.

#### Scenario: Unknown session

- **WHEN** a validly signed callback names a `session_id` the chat does not have
- **THEN** the response is 404 with reason `unknown_session` and nothing is downloaded

#### Scenario: Late callback for a closed session

- **WHEN** a status 6 callback arrives after the session became `closed` and matches no committed receipt
- **THEN** the response is 409 with reason `session_not_open`, no version is added and the workspace file keeps its bytes

#### Scenario: Callback from before a backup restore (B-T14)

- **WHEN** a callback arrives for a session created under an older restore epoch
- **THEN** the session is `orphaned`, the response is 409 with reason `session_not_open` and no version is stored or published

#### Scenario: Final callback after access was revoked (B-T10)

- **WHEN** the user's account is deactivated while a session is open and DocumentServer later sends the final callback with changes
- **THEN** the content is stored as a version and published to the same chat's workspace file

#### Scenario: Workspace directory is gone (B-T10)

- **WHEN** the final callback arrives after the chat's workspace files directory was removed while its Office state remains
- **THEN** the version is stored with `published` false, the session is `conflict` with reason `path_missing`, and neither the directory nor the file is recreated

#### Scenario: Chat data is gone (B-T10)

- **WHEN** the final callback arrives after the chat's whole data directory was removed
- **THEN** the response is 404 with reason `unknown_session`, no workspace file or workspace files directory is created, and the chat's data directory is not recreated
