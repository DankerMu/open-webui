# webui-auth-bootstrap Specification

## Purpose

Preserve WebUI session credentials and the current user through non-authoritative bootstrap and post-update refresh failures while preventing stale asynchronous results from changing the current session.

## Requirements

### Requirement: Missing bootstrap responses do not establish invalid authentication

The root bootstrap SHALL preserve a persisted token when session lookup fails without an HTTP response, including transport rejection and abort. It SHALL NOT fabricate an authenticated user or present that failure as confirmed sign-out. An unverified session SHALL offer manual recovery without automatically retrying the lookup or admitting authenticated child content.

#### Scenario: Transport failure with valid persisted credentials

- **WHEN** bootstrap uses a valid persisted token and its session fetch rejects without a response
- **THEN** the token remains unchanged, no authenticated identity is synthesized, and a connection-failure surface offers manual reload rather than a sign-in form
- **AND** manually reloading after transport recovery restores the real server-provided user

#### Scenario: Aborted lookup

- **WHEN** the active bootstrap lookup is aborted without an HTTP response
- **THEN** it does not remove persisted credentials or classify the session as invalid

#### Scenario: Non-authoritative HTTP or parse failure

- **WHEN** bootstrap receives a non-401 HTTP error or an unparseable response instead of a usable session
- **THEN** that result alone does not establish invalid authentication, persisted credentials remain intact, and the unverified-session recovery surface is shown

### Requirement: Authoritative current-session behavior is preserved

Successful current-session lookup SHALL populate the real returned user. An authenticated backend request followed by a confirmed current-session HTTP 401 SHALL retain the existing invalidation behavior. A failed confirmation probe SHALL NOT invalidate the session.

#### Scenario: Successful bootstrap

- **WHEN** the current token receives a successful session response
- **THEN** the real user is populated and the authenticated application can render

#### Scenario: Current session is unauthorized

- **WHEN** the real backend returns 401 and the current-session confirmation also returns 401 while ownership remains current
- **THEN** the invalid token and user state are cleared and normal sign-in routing remains available

#### Scenario: Confirmation is unavailable

- **WHEN** an authenticated request returns 401 but its confirmation probe has a transport failure
- **THEN** the token and existing user state are not cleared on that evidence

### Requirement: Asynchronous auth results retain session ownership

Auth result application SHALL require the active document generation, requested token and observed session state to remain current. A retired or replaced request SHALL NOT clear replacement credentials, overwrite a newer user or apply obsolete post-bootstrap state updates.

#### Scenario: Replacement during delayed success or failure

- **WHEN** a lookup or 401 confirmation is delayed and the token or user is replaced before completion
- **THEN** releasing the old success, failure or 401 does not alter the replacement token or newer session state

#### Scenario: Document retirement and restoration

- **WHEN** a document is retired while auth work is pending and later restored or replaced
- **THEN** old results cannot commit, fresh authenticated requests remain protected, and an unverified restored bootstrap offers manual recovery rather than remaining indefinitely behind a splash

### Requirement: Post-update session refresh does not clear a user on transport failure

After a successful account profile/variables save or a user status save or clear, the follow-up current-session refresh SHALL replace the current user only with a user returned by the server. When the refresh resolves without a user (a transport failure, or an HTTP error response without an error detail), the existing user SHALL be kept and the successful update result SHALL stand. A refresh that fails with an HTTP error response carrying an error detail SHALL keep its existing handling, and authoritative invalid-session handling SHALL remain unchanged.

#### Scenario: Account save followed by a transport-failed refresh

- **WHEN** the profile and variables updates succeed and the session refresh fails without a response
- **THEN** the current user remains set, the save reports success, and the app does not redirect to the sign-in route

#### Scenario: Status update followed by a transport-failed refresh

- **WHEN** a status save or status clear succeeds and the session refresh fails without a response
- **THEN** the current user remains set and the app does not redirect to the sign-in route

#### Scenario: Refresh returns a user or an HTTP error

- **WHEN** the refresh returns a user
- **THEN** the current user is replaced with it
- **WHEN** the refresh fails with an HTTP error response carrying an error detail
- **THEN** the existing error handling for that flow applies unchanged
