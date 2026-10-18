# Spec Delta

## ADDED Requirements

### Requirement: Non-Office test origins share bounded ownership

Tool redirect, font archive, deployment smoke fixture/control, initializer fake WebUI and native HTTP/TTY test origins SHALL use the canonical HTTP lifetime owner. Successful test or context exit SHALL follow completion of every admitted handler and closure of its accepted and listening sockets within a finite teardown bound. Fixture-controlled holds SHALL be released or canceled on exceptional exit. Unexpected handler failures SHALL reach the owning test under the existing shared error-attribution contract; failure of one owned server SHALL NOT bypass cleanup of other owned servers or fixture resources.

#### Scenario: Completed and incomplete requests retire before exit

- **WHEN** each named family exits after a completed request or while an admitted handler waits on partial HTTP input
- **THEN** its request worker and accepted/listening sockets are retired before successful owner exit
- **AND** no late worker output is required to discover an error

#### Scenario: Controlled responder or WebSocket hold

- **WHEN** an owning test exits while an initializer marker, deployment response/WebSocket hold or native TTY hold is active
- **THEN** teardown releases or cancels the hold and observes handler completion within its bound
- **AND** cleanup does not rely on later deletion of an unrelated marker or on an emergency rescue

#### Scenario: Body and handler failure remain attributable

- **WHEN** a test body raises, a handler deliberately raises, or both fail in the same lifetime
- **THEN** the original failures remain observable by the owning context or unittest result after resource retirement
- **AND** no broad exception suppression or late socketserver banner substitutes for attribution

#### Scenario: Multiple servers and partial startup

- **WHEN** a deployment fixture owns several listeners and one startup or teardown path fails
- **THEN** all already-acquired servers, handlers and accepted sockets remain eligible for bounded cleanup
- **AND** the initiating failure remains visible rather than being replaced by a false successful teardown

#### Scenario: Existing bind and protocol behavior remains intact

- **WHEN** the deployment control listeners use their existing loopback ports, or redirect/font/init/native HTTP/TTY consumers run normally
- **THEN** addresses, response bytes/framing, protocol handshake and existing behavioral assertions remain intact
- **AND** redirect targets receive no disallowed arrivals, configuration errors remain explicit and credential-absence assertions remain active

#### Scenario: Office consumers and entrypoints remain compatible

- **WHEN** existing Office origins, focused pytest selections, deploy unittest discovery or the affected direct-script entrypoints use the shared owner
- **THEN** they retain their default bind behavior, finite teardown, error attribution and existing outcome assertions without skips or a second lifetime implementation
