# Spec Delta

## Purpose

Bound continued CDP and terminal access to the captured WebUI session and stop live relay traffic after its authorization is revoked.

## ADDED Requirements

### Requirement: Session-bound authorization checks

Both CDP and ttyd relays SHALL capture the handshake session cookie and route chat identity, perform a bounded initial authorization check, and recheck the same session every30s while connected. Requests SHALL target configured OCU_WEBUI_AUTH_URL with Cookie, X-Chat-Id and server X-OCU-Internal-Token, without overriding user authentication via Authorization. Redirects SHALL not be followed. Concurrent connections SHALL retain isolated credentials.

#### Scenario: Healthy and distinct sessions

- **WHEN** two authorized chats remain connected for multiple ticks
- **THEN** each continues relaying and each auth request contains only its captured session/chat pairing
- **AND** no session cookie/internal token is sent to the sandbox backend

#### Scenario: Missing or invalid configuration

- **WHEN** a configured auth URL is malformed
- **THEN** startup fails without exposing its value
- **AND** missing configuration or a missing session cookie denies WS before backend access rather than disabling authorization

### Requirement: Revocation terminates forwarding

Any periodic non200 authorization response, timeout or transport failure SHALL revoke the connection and close the frontend with4401 within60s. After the revocation decision neither pump SHALL begin another send; already-pending sends SHALL be cancelled before shutdown completes. Redirect status SHALL be treated as denial, never a credential-bearing follow-up request.

#### Scenario: Ownership loss or JWT expiry

- **WHEN** auth changes from200 to403 or401
- **THEN** both CDP and ttyd close4401 within60s and a subsequently queued input marker is not forwarded

#### Scenario: Unavailable auth service

- **WHEN** auth returns500, redirects, times out or disconnects
- **THEN** the relay fails closed4401 and no credential is forwarded to a redirect target

### Requirement: Relay lifecycle cleanup and compatibility

Healthy authorization SHALL not interrupt CDP text or ttyd text/binary traffic and tty subprotocol. Normal disconnect, revocation and cancellation SHALL finish or cancel/await owned relay/auth tasks and bound close cleanup, with no normal-close race replacing4401. Initial denial SHALL happen before backend connection; backend failures SHALL preserve existing failure semantics. Logout SHALL not be advertised as revocation without supported token invalidation.

#### Scenario: Cleanup race

- **WHEN** revocation occurs while both pumps are waiting or forwarding
- **THEN** the client observes4401, both pumps stop, and no recheck task survives route completion

#### Scenario: Normal disconnect and cancellation

- **WHEN** either peer disconnects or the route is cancelled during an auth request
- **THEN** all sibling tasks are cancelled/awaited and cancellation remains observable to the caller
