# Spec Delta

## Purpose

The DocumentServer-facing control-plane routes of the Office broker in OCU: the source ticket, callback authentication, status handling, the handling order with receipts and `save_seq`, and the persist pipeline that turns a callback into a durable version, with its publish obligation, before it is acknowledged. Source: Plan 2 § 关键设计 2 接口, § 3 保存模型与状态机; design D7 (control-plane routes), D9, D10, D14.

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

#### Scenario: Authentication without callback processing

- **WHEN** a valid callback reaches the authentication-only slice before task 14.2 supplies processing
- **THEN** the response is HTTP 503 with reason `callback_processing_unavailable`, no state or file changes, and no save is acknowledged

#### Scenario: Disabled control-plane preflight

- **WHEN** a non-sandbox peer sends OPTIONS to a source or callback route while Office is disabled
- **THEN** the response is 404 without credential or Office-state evaluation, not a successful generic CORS preflight

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

#### Scenario: Ticket lifetime is independent of session lifecycle

- **WHEN** an unexpired valid ticket binds an existing session, its document and an existing version, but that session is no longer active
- **THEN** source delivery still returns that version's bytes without changing the session

#### Scenario: Stored source integrity fails

- **WHEN** a valid source binding selects a missing, nonregular, symlinked or hash-corrupt stored blob
- **THEN** source delivery fails without reading through a link, returning workspace bytes or changing any stored state

#### Scenario: Source chat data is gone

- **WHEN** a valid source ticket names a chat whose data directory is absent
- **THEN** a non-creating check before the canonical chat lock returns 401 `invalid_ticket`, and neither the directory nor a lock or state file is created

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

#### Scenario: Invalid header cannot fall back to body token

- **WHEN** Authorization is present but malformed or fails JWT verification, while the body carries a valid token
- **THEN** the callback returns 401 `invalid_token`, performs no download and changes no state

### Requirement: Callback status handling

An authenticated callback of an open session that the handling order (requirement "Ordering and idempotence by save_seq") admits for processing SHALL be handled by its DocumentServer status as follows, and SHALL be acknowledged only after the resulting state is durable:

| Status    | Handling                                                                                                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | record the participants; a session in `opening` becomes `editing`; a session in `closing` with a participant still connected returns to `editing` and its close allocation is void; no version, no file change              |
| 2         | final close with changes: persist with `source` `close`, then publish; the session becomes `closed`, `conflict` or `error`                                                                                                  |
| 3         | record the final-save failure; the session becomes `error` with reason `final_save_failed`                                                                                                                                  |
| 4         | closed without changes: no version is added; when the session's latest stored version is unpublished it is published; the session becomes `closed`, `conflict` or `error`                                                   |
| 6         | forcesave result: persist with `source` `save` or `autosave` according to the recorded intent; publish when that intent is `publish`; a session in `saving` for this `save_seq` returns to `editing`, or becomes `conflict` |
| 7         | record the forcesave failure; a session in `saving` for this `save_seq` returns to `editing` with reason `forcesave_failed`                                                                                                 |
| any other | change nothing; record a diagnosable error; answer 422 with reason `unknown_status`                                                                                                                                         |

A status 2 or 4 callback SHALL end the session whether or not a close was requested. A status 6 or 7 callback SHALL never change the state of a session that is `closing` or `conflict`: its result — the version, the receipt and, for intent `publish`, the publish — is applied and the state stays. Which state a publish leaves for each of its outcomes (published, conflict, failed), including the automatic copy when an unattended final publish finds the file gone, is specified by `ocu-office-publish` (requirement "Publish outcomes"). Every status 2, 3, 4, 6 or 7 callback that this table processes to an outcome SHALL be answered `{"error": 0}` and SHALL leave a save receipt (`ocu-office-store`); one whose persist stage is refused is answered with an error and leaves none (requirement "Acknowledge only after the version is durable"). A status 1 callback is answered `{"error": 0}` and leaves no receipt.

#### Scenario: Status 1 opens the session (B-T04)

- **WHEN** the first status 1 callback arrives for a session in `opening`
- **THEN** the session is `editing`, no version is added and the acknowledgement is `{"error": 0}`

#### Scenario: Status 2 persists and publishes (B-T04)

- **WHEN** a status 2 callback delivers content for a session and the workspace file still matches the baseline
- **THEN** a version with `source` `close` and `published` true exists, the workspace file equals it and the session is `closed`

#### Scenario: Status 2 meets a conflict

- **WHEN** a status 2 callback delivers content and the workspace file exists but no longer matches the baseline
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

#### Scenario: Remaining tab closes without a close request (B-T05)

- **WHEN** a close allocated `save_seq` 3, a status 1 callback with a remaining participant returned the session to `editing`, an auto-save was committed with `save_seq` 4, and DocumentServer then reports status 2 with changes although no further close was requested
- **THEN** the acknowledgement is `{"error": 0}` and not `stale_save_seq`, the content is stored as a version with `source` `close` and published, and the session is `closed`
- **AND** the receipt of that callback holds a `save_seq` higher than 4

#### Scenario: Forcesave result arrives while the session is closing

- **WHEN** a close is requested while a save with intent `publish` is outstanding, and the status 6 callback of that save then arrives
- **THEN** the content is stored as a `save` version and published, and the session is still `closing`

#### Scenario: Forcesave failure arrives while the session is closing

- **WHEN** a close is requested while a save is outstanding, and a status 7 callback for that save then arrives
- **THEN** the failure is recorded with a receipt, no version is added and the session is still `closing`

#### Scenario: Unknown status

- **WHEN** a callback reports a status outside 1, 2, 3, 4, 6 and 7
- **THEN** the response is 422 with reason `unknown_status`, no session, version or file changes and the event is recorded with chat, session and status

#### Scenario: Late result of a timed-out save does not end a newer save

- **WHEN** the save with `save_seq` 3 timed out, the user started a save with `save_seq` 4, and the status 6 callback for 3 arrives while 4 is outstanding
- **THEN** the content of 3 is stored as its intent says and the session stays `saving` until the callback for 4 is handled

### Requirement: Ordering and idempotence by save_seq

A status 6 or 7 callback SHALL be matched to its save by the `save_seq` and intent echoed in its user data. A final callback (status 2, 3 or 4) SHALL take the session's pending close allocation as its `save_seq`, or the next unallocated number when none is pending — no close was requested, or the allocation is void because a status 1 returned the session from `closing` to `editing` (`ocu-office-sessions`) — so that the number of a final callback is never lower than a committed save. That number SHALL be stored with the callback's receipt the first time the callback is processed to an outcome, so a retry never takes another number.

An authenticated callback SHALL be handled in this order, and the first rule that applies decides:

1. A status 2, 3 or 4 callback for a session that already has the receipt of a final callback SHALL return that receipt's answer without downloading anything. A session ends once, so any later final callback for its key is a retry.
2. A status 6 or 7 callback whose `save_seq` has a receipt SHALL return the receipt's answer when its status and content SHA-256 equal those of the receipt, and SHALL otherwise be answered 409 with reason `stale_save_seq`.
3. A status 6 or 7 callback without a `save_seq` that the broker issued for that session SHALL be answered 422 with reason `invalid_userdata`; one whose `save_seq` is lower than the session's `last_committed_seq` and has no receipt SHALL be answered 409 with reason `stale_save_seq`.
4. Otherwise the callback SHALL be processed as the requirement "Callback status handling" specifies.

Rules 1 and 2 SHALL apply in every session state, also after the session became `closed`, `conflict` or `error`. Rules 3 and 4 SHALL apply to an open session only: a callback that rules 1 and 2 do not decide and whose session is `closed`, `error` or `orphaned` is answered as the requirement "Callbacks that cannot apply change no file" specifies. A callback answered from a receipt SHALL add no version, no receipt and no `save_seq`. It SHALL NOT publish or change the listing `revision`, with one exception: when the journal still holds the publish obligation that callback left, that entry SHALL be driven to an outcome (`ocu-office-publish`) before the answer is returned. A callback rejected by rule 2 or 3 SHALL never store a version, publish or change which version is published.

#### Scenario: Out-of-order save_seq (B-T08)

- **WHEN** the callback for `save_seq` 4 has been committed and a callback for `save_seq` 3, which has no receipt, arrives afterwards
- **THEN** the response is 409 with reason `stale_save_seq`, the number of versions is unchanged and the workspace file keeps the content of `save_seq` 4

#### Scenario: Retry of an earlier committed save after a later one (B-T08)

- **WHEN** the status 6 callback for `save_seq` 3 was committed and its acknowledgement was lost, the callback for `save_seq` 4 was then committed, and DocumentServer delivers the callback for `save_seq` 3 again with the same content
- **THEN** the response is `{"error": 0}`, no version is added and the workspace file keeps the content of `save_seq` 4

#### Scenario: Duplicate callback (B-T08)

- **WHEN** the callback for `save_seq` 4 is delivered a second time with the same content
- **THEN** the response is `{"error": 0}`, one version and one receipt exist for `save_seq` 4 and the listing `revision` did not change on the second delivery

#### Scenario: Retry after a lost acknowledgement (B-T08)

- **WHEN** the acknowledgement of a committed status 2 callback is lost and DocumentServer delivers it again after the session became `closed`
- **THEN** the response is `{"error": 0}`, nothing is downloaded, no version is added and no file is written

#### Scenario: Final callback without a close request is retried (B-T08)

- **WHEN** a status 2 callback arrives for a session for which no close was requested, is committed with a newly allocated `save_seq`, its acknowledgement is lost and DocumentServer delivers it again
- **THEN** the response is `{"error": 0}`, no download is made, no second version exists and the session's `save_seq` is the one allocated on the first arrival

#### Scenario: Retry of a status 4 or status 3 after the session ended

- **WHEN** a status 4 callback ended a session as `closed`, or a status 3 callback ended it as `error`, and DocumentServer delivers the same callback again
- **THEN** the response is the recorded answer `{"error": 0}`, the session keeps its state and reason, and no version, receipt or `save_seq` is added

#### Scenario: Same save_seq with different content

- **WHEN** a callback repeats a committed `save_seq` but its content hashes differently
- **THEN** the response is 409 with reason `stale_save_seq` and the committed version stays as it is

#### Scenario: Forcesave result without a known save_seq

- **WHEN** a status 6 callback carries no user data, or a `save_seq` the broker never issued for the session
- **THEN** the response is 422 with reason `invalid_userdata` and nothing is downloaded or stored

### Requirement: Confined download and content validation

The broker SHALL accept a callback's download address only when its origin — scheme, host and port — is exactly the configured browser-facing DocumentServer origin or the configured DocumentServer server-to-server origin. From an accepted address it SHALL use only the path and query, and it SHALL fetch that path and query from the server-to-server origin; it SHALL never send a request to the browser-facing origin or to a host named by the callback. An address with any other origin SHALL be rejected with 422 and reason `download_url_rejected` without any outbound request. Every redirect hop SHALL be validated against the server-to-server origin; a redirect elsewhere, a timeout or a failed transfer SHALL be answered 502 with reason `download_failed`. A body larger than the outputs broker's per-file limit SHALL stop the download and be answered 413 with reason `file_too_large`. Before storing, the content SHALL be checked for size, for a type equal to the document's type and for a readable OOXML container of that type; a failure SHALL be answered 422 with reason `invalid_content`. In every one of these cases no version and no receipt SHALL be recorded, nothing SHALL remain under `staging/`, and no workspace file SHALL change.

#### Scenario: Download address on the browser-facing origin

- **WHEN** a validly signed callback names a download address whose origin is the configured browser-facing DocumentServer origin
- **THEN** the broker requests the address's path and query from the server-to-server origin, sends no request to the browser-facing origin, and the content is committed as a version

#### Scenario: Arbitrary download address (B-T08)

- **WHEN** a validly signed callback names a download address whose origin is neither of the two configured DocumentServer origins, including a loopback, metadata or sandbox address
- **THEN** the response is 422 with reason `download_url_rejected` and no request is sent to that address or to DocumentServer

#### Scenario: Redirect leaves the origin

- **WHEN** the fetch from the server-to-server origin is answered with a redirect to another origin
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

For a callback that delivers content the broker SHALL, in this order, validate the callback, download, validate the content, stage it and flush it to disk, and then store the version content, the version record and the save receipt under the per-chat lock. For a callback with publish intent — status 6 whose recorded intent is `publish`, status 2, and status 4 when the session's latest stored version is unpublished — the publish obligation SHALL be part of that state update, as `ocu-office-store` requires of the commit journal, so that a crash after the acknowledgement cannot leave a stored version that nothing will publish. The broker SHALL answer `{"error": 0}` only after that state update is durable. The acknowledgement SHALL depend on the persist stage only: when the publish that follows meets a conflict or fails, the callback SHALL still be acknowledged and the outcome SHALL be reported through the session state.

Any failure before that point SHALL be answered with a non-200 status so that DocumentServer retries, and SHALL leave no version record without its content, no receipt without its version and no journal entry. When the callback answered with such an error — `storage_low`, `invalid_content`, `file_too_large`, `download_failed` or `download_url_rejected` — is the callback of the outstanding save of a session in `saving`, the session SHALL return to `editing` with that reason, and a later delivery of the same callback that succeeds SHALL still be committed.

#### Scenario: Durable before acknowledged (B-T11)

- **WHEN** a callback is acknowledged with `{"error": 0}` and OCU is killed immediately afterwards
- **THEN** after the restart the version record, its `versions/{sha256}` content and the receipt are all present

#### Scenario: Crash before the commit (B-T11)

- **WHEN** OCU is killed after the download and before the version is stored
- **THEN** no acknowledgement was sent, no version or receipt exists after the restart, and the retried callback is committed once

#### Scenario: Crash after the commit and before the publish starts (B-T11)

- **WHEN** OCU is killed after the version, the receipt and the journal entry of a status 2 callback are durable and before its publish starts, and OCU starts again
- **THEN** once the startup sweep has run, or DocumentServer has delivered the callback again and received `{"error": 0}` without a second version or a download, the session is `closed` with the version `published` true and the workspace file equal to it, or `conflict` when the workspace file no longer matches the baseline
- **AND** the journal holds no entry for that publish

#### Scenario: Storage refusal is not a success (B-T11)

- **WHEN** free space is below the storage floor when the content is to be stored
- **THEN** the response is 503 with reason `storage_low` and the session does not report the `save_seq` as committed

#### Scenario: Failed callback of the outstanding save returns the session to editing

- **WHEN** the status 6 callback of a session's outstanding save is answered 502 with reason `download_failed`
- **THEN** the status reports `editing` with reason `download_failed`, `last_committed_seq` is unchanged and no receipt exists for that `save_seq`
- **AND** when DocumentServer delivers the same callback again and the download succeeds, the content is committed as a version and the answer is `{"error": 0}`

#### Scenario: Conflict after persist is acknowledged

- **WHEN** the version is durable and the publish then reports a conflict
- **THEN** the response is `{"error": 0}`, the version is listed with `published` false and the session is `conflict`

#### Scenario: Publishing callback commits its obligation atomically

- **WHEN** a status 6 callback with recorded intent `publish`, or a status 2 callback, reaches durable persist and publication has not started
- **THEN** the persisted successor contains the selected version, its receipt and a journal entry binding that document, version, session, sequence and requester
- **AND** a status 6 callback with recorded intent `persist` has no publication obligation

#### Scenario: Rejected forcesave replay cannot drive a surviving entry

- **WHEN** a forcesave receipt still has its publication obligation and a duplicate presents a different status or content hash
- **THEN** the response is 409 `stale_save_seq`, the obligation remains and no publication, version or listing revision changes
- **AND** an accepted same-status, same-hash duplicate drives its obligation before returning the receipt answer without adding a version

#### Scenario: Terminal publish failure does not reject durable content

- **WHEN** durable callback content is followed by `pause_failed`, `publish_timeout`, `unsafe_path` or `index_unavailable`
- **THEN** the callback answers HTTP 200 `{"error": 0}`, the stored version remains unpublished and the completed obligation is absent
- **AND** the outcome update leaves the outstanding save editing or the final callback error, with that reason and the ordering exceptions of Publish outcomes

### Requirement: Callbacks that cannot apply change no file

A callback for a session the chat does not have SHALL be answered 404 with reason `unknown_session`. A callback for a session in `closed`, `error` or `orphaned` that rules 1 and 2 of the handling order (requirement "Ordering and idempotence by save_seq") do not decide SHALL be answered 409 with reason `session_not_open`. Neither SHALL download content, store a version or change a file. The restore epoch check of `ocu-office-store` (requirement "Restore epoch marker") SHALL run before a callback is handled, and a session it makes `orphaned` SHALL be treated as such for that callback.

The final callback of a session that is still open SHALL be processed even when the user has since lost access to the chat, and also when the chat was deleted in WebUI: deleting a chat in WebUI does not remove its OCU data directory, so the callback SHALL be stored and published into that directory like any other, and OCU SHALL need no deletion notice. When the chat's workspace files directory no longer exists while its Office state remains, the final callback's content SHALL still be stored as a version and no directory or file SHALL be created in its place; the session then ends as `error` with reason `workspace_missing`, as specified by `ocu-office-publish` (requirement "Conflict resolution"). When the chat's data directory no longer exists at all, the session is unknown and the callback SHALL create no file and SHALL NOT recreate that directory, which means its existence is checked before the per-chat lock is taken.

#### Scenario: Unknown session

- **WHEN** a validly signed callback names a `session_id` the chat does not have
- **THEN** the response is 404 with reason `unknown_session` and nothing is downloaded

#### Scenario: Late callback for a closed session

- **WHEN** a status 6 callback arrives after the session became `closed` and its `save_seq` has no receipt
- **THEN** the response is 409 with reason `session_not_open`, no version is added and the workspace file keeps its bytes

#### Scenario: Callback from before a backup restore (B-T14)

- **WHEN** a callback arrives for an open session created under an older restore epoch
- **THEN** the session is `orphaned`, the response is 409 with reason `session_not_open` and no version is stored or published

#### Scenario: Final callback after access was revoked (B-T10)

- **WHEN** the user's account is deactivated while a session is open and DocumentServer later sends the final callback with changes
- **THEN** the content is stored as a version and published to the same chat's workspace file

#### Scenario: Chat deleted in WebUI while a session is open (B-T10)

- **WHEN** the chat is deleted in WebUI while an edit session is open, its OCU data directory still exists, and DocumentServer later sends the final callback with changes
- **THEN** the content is stored as a version and published to the workspace file in that directory, and the session is `closed`

#### Scenario: Workspace directory is gone (B-T10)

- **WHEN** the final callback arrives after the chat's workspace files directory was removed while its Office state remains
- **THEN** the version is stored with `published` false, the session is `error` with reason `workspace_missing`, and neither the directory nor any file in it is created

#### Scenario: Chat data is gone (B-T10)

- **WHEN** the final callback arrives after the chat's whole data directory was removed
- **THEN** the response is 404 with reason `unknown_session`, no workspace file or workspace files directory is created, and the chat's data directory is not recreated
