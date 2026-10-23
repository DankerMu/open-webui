# ocu-office-editor-embed Specification

## Purpose

Keep native Office editing, delivery to DocumentServer, broker persistence and workspace publication as distinct boundaries so host save and close cannot silently discard reported local changes.

## Requirements

### Requirement: Native delivery qualifies save coverage

The host SHALL distinguish SDK-reported modifications pending delivery to DocumentServer from broker-committed or published content. A native delivery acknowledgement SHALL NOT itself clear dirty state or report successful publication. Explicit publishing saves, automatic persistence and existing correlated publishing retries SHALL wait for reported native modifications to be delivered before dispatch. Coverage SHALL bind only to the modification generation eligible when that request is dispatched; an older reply or an unrelated committed watermark SHALL NOT cover a later or undelivered modification. Genuine delivered no-change saves SHALL retain their existing outcomes.

#### Scenario: Save requested before native delivery

- **WHEN** the SDK reports a modification, native readback observes it, and a publishing save is requested before native delivery acknowledgement
- **THEN** the host retains dirty state and does not dispatch that broker save until delivery is acknowledged
- **AND** it clears dirty only when the corresponding broker commit/publication evidence covers that modification

#### Scenario: Delivery acknowledgement is not publication

- **WHEN** the SDK acknowledges delivery but no corresponding broker save has committed and published
- **THEN** the host still reports the modification as dirty and does not fabricate a successful save

#### Scenario: Automatic persistence observes the same boundary

- **WHEN** an automatic persistence tick or an authorized queued publication becomes eligible while native delivery is pending
- **THEN** its request waits for delivery and remains subject to the existing command/lifetime arbitration
- **AND** ordinary status polls and duplicate acknowledgements do not multiply the request

#### Scenario: Modification after save dispatch

- **WHEN** a save dispatched for delivered modification A is pending, modification B is reported, and A's allocation subsequently commits and publishes
- **THEN** B remains dirty and uncovered, whether B's delivery is pending or acknowledged
- **AND** an unrelated allocation or duplicate acknowledgement cannot cover B

#### Scenario: Delivered no-change save

- **WHEN** no native modification is undelivered and a legitimate no-change save reaches its broker-committed and published watermark
- **THEN** the host preserves the existing clean result without waiting for a nonexistent new SDK event

### Requirement: Host close preserves native delivery through release

A host-requested close SHALL wait for delivery of SDK-reported local modifications before sending its broker request. After acceptance, the host SHALL revalidate delivery before releasing the editor, including modifications reported while the close request was outstanding. Delivery and error events SHALL remain effective until release. Broker close acceptance alone SHALL NOT authorize discarding an undelivered modification. Existing broker state, final publication and remaining-participant behavior SHALL remain authoritative.

#### Scenario: Close with pending native input

- **WHEN** a close is requested after a native modification but before its delivery acknowledgement
- **THEN** the editor remains alive and no close request is dispatched until delivery is acknowledged
- **AND** normal close on the corrected lookup path preserves the edit in published workspace bytes and a fresh native editor

#### Scenario: Edit arrives during accepted-close flight

- **WHEN** another native modification is reported after close dispatch but before its accepted response is handled
- **THEN** acceptance does not release the editor until that modification is delivered
- **AND** a subsequent delivery failure is reported visibly rather than as a clean successful close

#### Scenario: Ordinary delivered close

- **WHEN** all reported modifications are delivered and the broker accepts close without a new intervening modification
- **THEN** the editor is released once and the host reports the broker's terminal outcome
- **AND** the corrected lookup path consumes its reserved sequence without the original lock stall

### Requirement: Delivery waits belong to the host lifetime

Pending delivery waits SHALL obey existing command supersession and the host's lifetime. Close SHALL withdraw queued saves that it supersedes. Final/error state SHALL prevent delayed operations from issuing new requests; an undelivered modification SHALL NOT be described as successfully saved merely because another session watermark or terminal state arrives. A native delivery failure SHALL retain a visible failure and the uncommitted modification until safe release or explicit disposal. Forced removal SHALL still release owned resources and SHALL NOT be represented as successful persistence.

#### Scenario: Close supersedes a queued save

- **WHEN** a publication is waiting for native delivery and close supersedes it before acknowledgement
- **THEN** the late acknowledgement cannot dispatch the superseded save
- **AND** close independently observes the delivery boundary

#### Scenario: Retirement while waiting

- **WHEN** the host is disposed while a save or close is waiting, including while a response is being decoded
- **THEN** its waits settle and all owned resources are released
- **AND** late acknowledgements, responses or timers issue no request, post no message, restart no timer and create no editor

#### Scenario: Failure before delivery

- **WHEN** an SDK error or terminal broker state arrives while native delivery is still pending
- **THEN** waiting operations do not resume as successful saves or closes and issue no delayed mutation request
- **AND** the host surfaces the failure without falsely covering the undelivered modification

### Requirement: Transient status failures do not end the editor

After the Office editor page has applied its first session status, it SHALL treat a status request that cannot reach OCU as transient. Transient means one of:

- a network error, other than the page's own abort;
- an HTTP 502, 503 or 504 answer, whatever its body;
- a 2xx answer whose body cannot be parsed.

On a transient failure the page SHALL keep the editor usable and keep the last known session status. It SHALL retry the status request with a delay that grows to at most 10 seconds, until a status is applied or the editor is disposed.

The following SHALL end the editor as before:

- an HTTP 401, 403, 404 or 500 answer, or any other 4xx answer, whether or not its body can be parsed;
- a 2xx answer whose body is not a valid session status;
- a final session state.

Before the first session status has been applied, any failure of the status request SHALL end the editor as before.

#### Scenario: OCU restarts while the user edits

- **WHEN** after the editor has loaded, status requests fail with a network error and then with HTTP 502 for a few seconds while OCU restarts, and a later status request returns the session as `editing`
- **THEN** the editor never shows a final failure, Save remains available, and polling continues at the normal interval after the successful status

#### Scenario: Signed out

- **WHEN** a status request returns HTTP 401 with a non-JSON body
- **THEN** the editor ends with a failure as before

#### Scenario: OCU unreachable when the editor opens

- **WHEN** the first status request after opening returns HTTP 502
- **THEN** the editor ends with a failure as before

### Requirement: A later successful save clears a previous failure reason

While a session is `editing`, a failure reason from an earlier save, for example `storage_low`, SHALL be cleared when a later save reaches one of these outcomes:

- a published version;
- a committed background persist;
- nothing to save, with the latest version already published.

Accepting a save (HTTP 202, the session entering `saving`) SHALL NOT clear the reason, so the reason stays visible until such an outcome. Reasons that belong to a conflict, error or orphaned state SHALL NOT be cleared by this rule.

#### Scenario: Space freed after a storage refusal

- **WHEN** a save is refused with `storage_low`, space is freed, and a new save is accepted and published
- **THEN** the next session status has no reason and the editor shows the document as saved

#### Scenario: Accepted save that has not finished

- **WHEN** after a `storage_low` refusal a new save is accepted and the session is `saving`
- **THEN** the session status still carries `storage_low` until the save reaches a successful outcome
