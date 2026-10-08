# Spec Delta

## Purpose

The OCU-served editor host page: a framed `embed=office` mode of the preview page that hosts the DocumentServer editor for one workspace file and talks to its WebUI parent through a closed four-message protocol. Source: Plan 2 § 关键设计 3 and 5; design D8, D9, D15.

## ADDED Requirements

### Requirement: Framed Office editor mode

The authenticated preview page SHALL support a framed `embed=office` mode that renders only the editor surface and the page's own status or error text: no Files listing, view tabs, runtime view, upload control, CLI badge, heartbeat or runtime discovery. The mode SHALL require exactly one `embed` query parameter whose value is `office` and a parent frame. A repeated `embed` parameter, an unrecognised value, or `embed=office` opened without a parent frame SHALL render the visible invalid-embedding error, SHALL issue no Office, listing or runtime request, SHALL load no DocumentServer script and SHALL post no message. Until a valid `ocu:office-open` is accepted the page SHALL issue no Office request.

Office mode admission SHALL follow the server's existing Office enablement. When the
server-to-server DocumentServer address is absent or blank, the preview SHALL retain
its visible invalid-embedding behavior for `embed=office`, SHALL expose no DocumentServer
origin or Office-specific content policy, and SHALL issue no Office, listing or runtime
request and post no message. This SHALL NOT change the other preview modes or introduce
a separate enablement switch.

#### Scenario: Framed mode renders only the editor surface

- **WHEN** a same-origin parent frames `/preview/{chat}?embed=office` and opens a DOCX `file_id`
- **THEN** the page shows the editor container and no Files listing, tabs, upload control or runtime surface
- **AND** no outputs listing, heartbeat, browser discovery or terminal request is issued

#### Scenario: Invalid, repeated or unframed embedding

- **WHEN** the page is requested with `embed=office&embed=office`, with `embed=office&embed=files`, with an unknown embed value, or with `embed=office` as a top-level document
- **THEN** a visible invalid-embedding error is rendered
- **AND** no Office request is issued, no DocumentServer script is requested and no message is posted

#### Scenario: Idle before open

- **WHEN** the framed page has loaded and has not yet accepted an `ocu:office-open`
- **THEN** no request to `/api/office/` has been issued and no editor instance exists

#### Scenario: Office is not configured

- **WHEN** the enabling DocumentServer server-to-server address is absent or blank and a parent frames `embed=office`
- **THEN** the existing preview response renders the visible invalid-embedding error without an Office origin or Office-specific policy
- **AND** no Office, listing or runtime request is issued and no message is posted

### Requirement: Editor API origin and signed configuration

The page SHALL load the DocumentServer JS API only from the configured DocumentServer browser origin delivered in the server-rendered page configuration, never from a URL taken from a message, a query parameter or a session response. The page SHALL create the editor only from the signed configuration returned by `POST /api/office/{chat}/documents/{file}/sessions` and SHALL NOT construct or alter the document, key, callback, permission or token fields of that configuration in the browser. The page configuration and every script served for this mode SHALL contain no internal token, DocumentServer JWT secret, ticket signing secret, model key or MCP key. When session creation returns a session without an editor configuration (a pending conflict whose editor has ended), the page SHALL create no editor and SHALL report that session's state. When the editor API fails to load or the editor cannot be created, the page SHALL show a visible error, SHALL report state `error` with a non-null `reason`, and SHALL create no editor instance.

#### Scenario: Editor created from the session's signed configuration

- **WHEN** session creation succeeds for an opened file
- **THEN** the only external script the page has requested is the editor API on the configured DocumentServer browser origin
- **AND** the editor instance receives the document, key, callback and token values exactly as returned by session creation

#### Scenario: Editor API cannot be loaded

- **WHEN** the editor API script request fails, times out or yields no usable editor constructor
- **THEN** the page shows a visible error and posts `ocu:office-state` with `state: "error"` and a non-null `reason`
- **AND** no editor instance exists and no auto-save timer is running

#### Scenario: Pending conflict has no editor (B-T06)

- **WHEN** session creation returns the document's session in `conflict` with no editor configuration
- **THEN** the page creates no editor instance and reports `conflict` with that session's id and reason

#### Scenario: Initial session snapshot supplies persisted state

- **WHEN** creation or joining returns a session without the full status fields
- **THEN** the host reads that session's status once before deriving its reason, publication-sequence dirty state and workspace change notice
- **AND** the initial read uses the request wrapper and does not create a recurring poll loop by itself
- **AND** a failed status read reports `error` with the returned session id and a non-empty reason, never a fabricated clean or conflict state

#### Scenario: No secret in page configuration

- **WHEN** the HTML, the inline configuration and the scripts served for `embed=office` are inspected
- **THEN** none contains the internal token or any signing secret

### Requirement: Restricted parent message protocol

The mode SHALL exchange exactly four message types with its parent, each with the exact key set below and no other key:

| Direction      | `type`               | Exact key set                                                                             |
| -------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| child → parent | `ocu:office-ready`   | `type, chat_id`                                                                           |
| parent → child | `ocu:office-open`    | `type, chat_id, file_id, generation`                                                      |
| child → parent | `ocu:office-state`   | `type, chat_id, file_id, generation, session_id, state, dirty, workspace_changed, reason` |
| parent → child | `ocu:office-command` | `type, chat_id, generation, command` (`command` is `save` or `close`)                     |

The page SHALL act on an incoming message only when its source is the page's parent window, its origin equals the page's own origin, its key set is exact and its `chat_id` equals the page's chat. `generation` SHALL be a non-negative safe integer and `file_id` a non-empty string. The page SHALL post `ocu:office-ready` only after its message listener is installed, and SHALL post every message to its own origin, never to `*`. One page instance SHALL host one edit session: it SHALL accept the first valid `ocu:office-open`, SHALL ignore an `ocu:office-open` whose `generation` is not strictly greater than every generation it has accepted, and SHALL NOT open a second file or create a second session after one was accepted. An `ocu:office-command` SHALL be accepted only when its `generation` equals the generation of the accepted open. Every `ocu:office-state` SHALL carry the `chat_id`, `file_id` and `generation` of the accepted open. A message that fails any check — unknown or missing field, wrong type, wrong origin, wrong source, wrong chat, stale or mismatched generation, unknown command — SHALL cause no request and no state change. The page SHALL never use a parent-supplied path or URL.

#### Scenario: Ready follows listener installation

- **WHEN** the framed page starts
- **THEN** `ocu:office-ready` with exactly `type` and `chat_id` is posted to the page's own origin after the message listener is installed
- **AND** a valid `ocu:office-open` sent in reply to it is processed

#### Scenario: Valid open and command

- **WHEN** the parent sends a valid `ocu:office-open` and later an `ocu:office-command` with the same `generation` and `command: "save"`
- **THEN** exactly one session creation request is issued for that `file_id` and exactly one save request for the resulting session
- **AND** every `ocu:office-state` carries that chat, file and generation

#### Scenario: Rejected senders and malformed messages

- **WHEN** a sibling frame, a nested frame, a cross-origin window or the parent with a different `chat_id` sends an otherwise valid message, or the parent sends a message with an extra field, a missing field, a non-integer generation or a command other than `save` or `close`
- **THEN** no request is issued and the reported state does not change

#### Scenario: Stale generation and second open

- **WHEN** a command carries a generation different from the accepted open, or a further `ocu:office-open` arrives after one was accepted
- **THEN** no save, close or session creation request is issued and the current session is unaffected

### Requirement: State reporting

The page SHALL report `state` as one of `opening`, `editing`, `saving`, `closing`, `closed`, `conflict`, `error`, `orphaned` or `refused`, and SHALL post an `ocu:office-state` whenever any reported value changes. All nine keys SHALL always be present: `session_id` is `null` until the create response returned a session and is that session's id afterwards; `dirty` and `workspace_changed` are booleans; `reason` is a non-empty string for `refused`, `error` and `conflict`, and in every other state is either `null` or the failure that is still to be surfaced (the reason of the latest session status, or of a rejected save or close request while the session stays usable).

`opening` SHALL be reported once the open is accepted. `refused` SHALL be reported only when the broker refuses session creation, such as 409 `unpublished_version` or a validation failure. No session exists: the page SHALL report the broker's reason with `session_id: null`. For the pinned 9.4.0 release the page SHALL NOT synthesize a connection-cap event or interpret connection-loss error `-18` as a cap refusal.

`refused` SHALL be final for the page instance: after reporting it the page SHALL run no status poll and no auto-save timer, SHALL report no other state, and SHALL issue no request for a later `save` or `close` command. In every other case `editing`, `saving`, `closing`, `closed`, `conflict` and `orphaned` SHALL be the persisted session state returned by the broker. `error` SHALL be reported for the persisted state `error` and for a failure the page detects itself (the editor API cannot be loaded, the editor reports a connection failure, the session status cannot be read).

`dirty` SHALL be `true` exactly while content exists that has not been published to the workspace file, that is, while either holds:

- the editor has reported a modification that no committed save covers. A save covers a modification when the save was requested after the modification was reported and the session status reports `last_committed_seq` at or above that save's `save_seq`; a save that is outstanding, refused or failed covers nothing, and the editor's own save command is not a save;
- the latest session status reports `last_committed_seq` above `last_published_seq`.

In every other case `dirty` SHALL be `false`, whatever made `last_published_seq` reach `last_committed_seq`: a completed publish, a publishing save that found nothing new while the latest version was already published, a resolved conflict, or an auto-save whose content equals the already published version. A session reported `closed` SHALL be reported with `dirty: false`. The page SHALL NOT report a save as finished from a click or from an accepted request alone, and a persist-only auto-save that leaves `last_committed_seq` above `last_published_seq` SHALL NOT clear `dirty`. `workspace_changed` SHALL be `true` exactly while the latest session status reports `workspace_changed`.

#### Scenario: Save is reported finished only after publish (B-T04)

- **WHEN** the document is modified, a `save` command is accepted and the broker accepts the save request with `save_seq` N
- **THEN** the page reports `saving` with `dirty: true`
- **AND** it reports `editing` with `dirty: false` only after a session status returns `state` `editing` with `last_published_seq` at least N

#### Scenario: Auto-save leaves the document unpublished (B-T04)

- **WHEN** a persist-only auto-save is committed, so `last_committed_seq` is above `last_published_seq`, and the user makes no further change
- **THEN** the reported `dirty` stays `true`

#### Scenario: Second save with no change ends not dirty (B-T04)

- **WHEN** a publishing save was confirmed with `dirty: false`, the editor reports no further modification, a second `save` command is accepted with `save_seq` N, and the session status then reports `editing` with `last_committed_seq` and `last_published_seq` both N
- **THEN** the page reports `editing` with `dirty: false`
- **AND** no state posted for that second save carries `dirty: true`

#### Scenario: Save after an auto-save with nothing new ends not dirty (B-T04)

- **WHEN** an auto-save left `last_committed_seq` above `last_published_seq`, the editor reports no further modification, a `save` command is accepted with `save_seq` N, and the session status then reports `editing` with `last_committed_seq` and `last_published_seq` both N
- **THEN** the page reports `editing` with `dirty: false`

#### Scenario: Auto-save equal to the published content ends not dirty (B-T04)

- **WHEN** the editor reports a modification, a persist-only auto-save requested afterwards is committed, and the session status reports `last_published_seq` equal to `last_committed_seq` because the persisted content equals the already published version
- **THEN** the page reports `dirty: false`

#### Scenario: Resolved conflict ends not dirty (B-T06)

- **WHEN** the page reports `conflict` with `dirty: true`, the editor reports no further modification, and a later session status reports `editing` with `last_published_seq` equal to `last_committed_seq`
- **THEN** the page reports `editing` with `dirty: false`

#### Scenario: Outstanding or failed save does not clear dirty (B-T11)

- **WHEN** the editor reports a modification, a save is accepted with `save_seq` N, and the session status reports `last_committed_seq` below N — while the save is outstanding, or after the session returned to `editing` with a non-null `reason`
- **THEN** every state the page posts carries `dirty: true`

#### Scenario: Save coverage does not acknowledge later edits

- **WHEN** a save is requested after modification A, modification B is reported before that save completes, and status confirms the returned save sequence committed and published
- **THEN** only A is covered and the host still reports dirty because B is not covered
- **AND** a sequence allocated by another tab cannot by itself acknowledge B

#### Scenario: Commit observation precedes the save reply

- **WHEN** a status already proves a save allocation committed before its accepted HTTP reply supplies that allocation's sequence
- **THEN** the host reconciles coverage using the modification generation captured at request dispatch
- **AND** it neither loses that committed coverage nor acknowledges a later modification

#### Scenario: Connection failure is not a cap refusal (B-T15)

- **WHEN** the editor reports connection-loss error `-18`
- **THEN** the page reports `error` with the returned session id and a non-empty failure reason, not a synthetic cap refusal or a successful save
- **AND** a joined session is not closed merely because this tab lost its connection

#### Scenario: Refused by validation (B-T13)

- **WHEN** session creation is refused because the file is unsupported, too large, corrupt, deleted or storage is low
- **THEN** the page reports `refused` with the broker's reason and `session_id: null`, and no editor instance exists

#### Scenario: Refused because unpublished content must be offered first (B-T11)

- **WHEN** session creation is refused with 409 and reason `unpublished_version`
- **THEN** the page reports `refused` with `session_id: null` and `reason: "unpublished_version"`, creates no editor instance and issues no second create request

#### Scenario: Creation unavailable is an error, not an admission refusal

- **WHEN** creation fails with 502 `documentserver_unavailable`, a transport failure or another non-admission server failure
- **THEN** the host reports `error` with `session_id: null` and the broker's non-empty reason when available, otherwise a fixed local failure reason
- **AND** it creates no editor, issues no second creation request and sends no close for another tab's session

#### Scenario: Workspace file changed during editing (B-T07)

- **WHEN** a session status reports `workspace_changed`
- **THEN** the next `ocu:office-state` carries `workspace_changed: true` without changing `state` or `dirty`

#### Scenario: Session orphaned (B-T11)

- **WHEN** a session status reports `orphaned`
- **THEN** the page reports `orphaned` with the session's id, stops its auto-save timer and its status poll and issues no further save request

#### Scenario: Conflict carries its reason (B-T06)

- **WHEN** a session status reports `conflict`
- **THEN** the page reports `conflict` with the session's id, `dirty: true` and the broker's conflict reason

### Requirement: Session requests are owned by the host page

The host page SHALL own session creation, the session status poll, the auto-save timer and the save and close requests; it SHALL NOT call the versions, restore or resolve routes. Every request SHALL go through the existing request wrapper, which applies the configured public prefix once and sends `X-Requested-With: ocu-workspace`. After an accepted open the page SHALL issue one `POST /api/office/{chat}/documents/{file}/sessions`, with `{file}` taken from the open's `file_id`. While a session exists and the page is alive it SHALL poll `GET /api/office/{chat}/sessions/{session}` with at most one poll loop.

While the session is `editing` the page SHALL keep exactly one 5-minute auto-save timer; on each tick it SHALL request a save with intent `persist` through `POST /api/office/{chat}/sessions/{session}/save` while the editor holds a modification that no committed save covers, and SHALL do nothing otherwise, so an auto-save that failed is requested again at the next tick. A `save` command SHALL issue one save with intent `publish` through the same route. The editor's own save command is not a save in this model: the page SHALL NOT treat it as one, and `dirty` SHALL stay `true` after it. A save that the broker refuses with `session_not_editing` because an auto-save is still outstanding SHALL be retried once the session is `editing` again, not reported as an error. A `close` command SHALL issue `POST /api/office/{chat}/sessions/{session}/close`, stop the auto-save timer, release the editor instance only after that request was accepted so that DocumentServer sees the participant leave after the close is recorded, and keep reporting the persisted session state until it is `closed`, `error` or `orphaned` or the page is torn down.

A rejected or failed save or close request SHALL never be reported as success: the page SHALL keep `dirty` unchanged and SHALL report the failure as a non-null `reason` — with the session state the broker still holds, or with `error` when the session status cannot be read — until a later save or close request is accepted.

A save that was accepted and then failed SHALL be reported the same way. When the session status reports `editing` with a non-null `reason` — `save_timeout`, or the reason with which the broker refused the save's callback (storage floor, invalid content, size limit, failed download) — the page SHALL report `editing` with that `reason` and with `dirty` unchanged, SHALL keep the editor, the status poll and the auto-save timer, and SHALL issue a new save request for a later `save` command, so the failed save can be retried.

When the session status reports `orphaned`, `closed` or `error` the page SHALL stop its status poll and its auto-save timer and SHALL issue no further save or close request.

#### Scenario: Prefixed requests with the workspace header

- **WHEN** the page runs behind the `/ocu` prefix and creates a session, polls status, saves and closes
- **THEN** each request path starts with `/ocu/api/office/{chat}/` exactly once and carries `X-Requested-With: ocu-workspace`

#### Scenario: Auto-save every 5 minutes while modified (B-T04)

- **WHEN** the editor reports a modification and 5 minutes pass without a save, and then a further 5 minutes pass without any modification
- **THEN** exactly one persist-only save request is issued at the first tick and, when that save was committed, none at the second
- **AND** when the first request failed or was refused, the second tick issues it again
- **AND** only one auto-save timer exists for the session

#### Scenario: Close command (B-T12)

- **WHEN** the parent sends `close` for a session with unpublished changes
- **THEN** one close request is issued, the editor instance is released, the page reports `closing` and then the terminal state returned by the session status

#### Scenario: Request failure is not success

- **WHEN** a publishing save is rejected with 502 `documentserver_unavailable` while the session stays `editing`
- **THEN** the page reports `editing` with `dirty: true` and `reason: "documentserver_unavailable"`, and never `dirty: false` for that save
- **AND** when the session status itself cannot be read the page reports `error` with a non-null `reason`

#### Scenario: Editor's own save command

- **WHEN** the user presses the editor's own save shortcut after modifying the document
- **THEN** the page issues no save request, keeps reporting `dirty: true`, and a later `save` command or `close` still publishes the content

#### Scenario: Save while an auto-save is outstanding

- **WHEN** a `save` command arrives while the session is `saving` because of an auto-save, and the save request is refused with `session_not_editing`
- **THEN** the page reports no error, and issues the publishing save once the session status is `editing` again

#### Scenario: Save timed out and is retried (B-T11)

- **WHEN** a save was accepted for a modified document and the session status later reports `editing` with reason `save_timeout`
- **THEN** the page reports `editing` with `dirty: true` and `reason: "save_timeout"`, and its poll and auto-save timer keep running
- **AND** a following `save` command issues one new save request

#### Scenario: Callback refusal is a failed save that can be retried (B-T11)

- **WHEN** a save was accepted and the session status later reports `editing` with the reason of a refused callback, such as the storage floor
- **THEN** the page reports `editing` with `dirty: true` and that reason, never `dirty: false` for that save
- **AND** a following `save` command issues one new save request

#### Scenario: Timers stop on a final session status

- **WHEN** the session status reports `orphaned`, `closed` or `error`
- **THEN** the page reports that state, and afterwards no status poll and no auto-save timer is running and no save or close request is issued

#### Scenario: Polling cannot starve auto-save or multiply a queued save

- **WHEN** repeated status reads keep reporting editing without changing the document
- **THEN** there is at most one status request in flight and ordinary polls do not restart the five-minute auto-save deadline
- **AND** repeated editing observations after an attributable auto-save refusal dispatch a queued publishing intent only once

#### Scenario: Rejected close retains an editable session

- **WHEN** a close request fails and the following status confirms the session remains editing
- **THEN** the editor has not been destroyed, dirty is unchanged and the close failure reason remains visible through ordinary successful polls
- **AND** the editing auto-save timer resumes, and a later accepted command may clear the command failure reason

### Requirement: Teardown releases owned resources

When the framed page is removed or unloaded it SHALL release its status poll, its auto-save timer, its message listener, its pending requests and the editor instance. A response or timer that completes after teardown SHALL NOT create an editor instance, start a timer, issue a request or post a message.

#### Scenario: Removal during session creation

- **WHEN** the frame is removed while the session creation request is in flight and the response arrives afterwards
- **THEN** no editor instance is created, no poll or auto-save timer starts and no message is posted

#### Scenario: Repeated mount and removal

- **WHEN** the Office frame is opened and removed 20 times, including removal while editing and while saving
- **THEN** every removed frame leaves zero active timers, listeners and pending polls after its in-flight work settles

#### Scenario: Teardown wins deferred completion and constructor callbacks

- **WHEN** the host is disposed during an outstanding request, response-body decoding, API loading or synchronous editor construction
- **THEN** later completion posts no message, starts no timer and issues no request
- **AND** an editor returned after disposal is destroyed once rather than retained
- **AND** repeated disposal sends no broker close and leaves no owned listener, timer or request

### Requirement: Dedicated content policy for the Office mode

When Office is enabled and the request has exactly one `embed=office` value, its response SHALL carry a Content-Security-Policy that restricts scripts to the page's own assets, its nonce-bound configuration script and the configured DocumentServer browser origin; restricts nested frames to the configured DocumentServer browser origin; restricts connections to the page's own origin; keeps styles, fonts and images to the same-origin and inline/data/blob allowances of the runtime embedding policy; and allows framing only by the same origin. No other external origin SHALL be permitted for script, frame, connection, object or form targets.

#### Scenario: DocumentServer admitted, everything else denied

- **WHEN** the Office mode loads the editor API from the configured DocumentServer origin, the editor opens its frame on that origin, and the page then attempts a script, frame or connection to any other external origin
- **THEN** the editor API and the editor frame load, and the other attempts are blocked by the policy

#### Scenario: Policy is specific to this mode

- **WHEN** the response headers of `embed=office`, `embed=browser`, `embed=terminal` and `embed=files` are compared
- **THEN** only the `embed=office` policy names the DocumentServer origin, and the other responses are unchanged

### Requirement: Existing preview modes are unchanged

The read-only Files embedding and its `ocu:preview-ready` / `ocu:preview-select` / `ocu:preview-state` protocol, the Browser and Terminal runtime embeddings and the standalone preview SHALL behave as before this change. The Office mode SHALL NOT process `ocu:preview-*` messages, and the other modes SHALL NOT process `ocu:office-*` messages, load the DocumentServer API or issue an Office request.

#### Scenario: Read-only preview still works beside the editor

- **WHEN** the existing Files embedding, runtime embedding and standalone preview tests run after the Office mode is added
- **THEN** they pass unchanged, and a Files-only frame that receives an `ocu:office-open` issues no request and posts no message

#### Scenario: Office mode ignores the preview protocol

- **WHEN** the parent sends a valid `ocu:preview-select` to an Office frame
- **THEN** no listing, file or Office request is issued and no state is reported
