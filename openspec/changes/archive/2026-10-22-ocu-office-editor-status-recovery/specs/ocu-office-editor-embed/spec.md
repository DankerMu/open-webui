## ADDED Requirements

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
