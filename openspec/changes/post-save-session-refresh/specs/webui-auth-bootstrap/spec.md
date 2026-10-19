## ADDED Requirements

### Requirement: Post-update session refresh does not clear a user on transport failure

After a successful account profile/variables save or a user status save or clear, the follow-up current-session refresh SHALL replace the current user only with a user returned by the server. When the refresh resolves without a user because of a transport failure, the existing user SHALL be kept and the successful update result SHALL stand. A refresh that fails with an HTTP error response SHALL keep its existing handling, and authoritative invalid-session handling SHALL remain unchanged.

#### Scenario: Account save followed by a transport-failed refresh

- **WHEN** the profile and variables updates succeed and the session refresh fails without a response
- **THEN** the current user remains set, the save reports success, and the app does not redirect to the sign-in route

#### Scenario: Status update followed by a transport-failed refresh

- **WHEN** a status save or status clear succeeds and the session refresh fails without a response
- **THEN** the current user remains set and the app does not redirect to the sign-in route

#### Scenario: Refresh returns a user or an HTTP error

- **WHEN** the refresh returns a user
- **THEN** the current user is replaced with it
- **WHEN** the refresh fails with an HTTP error response
- **THEN** the existing error handling for that flow applies unchanged
