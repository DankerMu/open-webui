## ADDED Requirements

### Requirement: Transport-error regressions distinguish runtime from teardown

Native TTY origin regressions SHALL distinguish a real closed-socket timeout error classified while the owner is running from an error caused after owner shutdown begins. Runtime evidence SHALL establish completed handler error attribution before leaving the running-owner context; client EOF alone SHALL NOT establish that boundary. The runtime case SHALL surface the same unexpected error exactly once, while the teardown case SHALL retain expected-disconnect handling. Both cases SHALL verify bounded worker and accepted/listening-socket retirement before emergency cleanup.

#### Scenario: Runtime error races with client EOF

- **WHEN** closing the accepted socket makes client EOF visible before the handler's timeout operation and error classification finish
- **THEN** the runtime regression waits for completed handler attribution while the owner remains running
- **AND** the actual timeout operation reports EBADF and the owner surfaces that identical error exactly once after retirement

#### Scenario: Timeout configuration occurs during shutdown

- **WHEN** owner shutdown closes the accepted socket before the handler configures its timeout
- **THEN** the teardown contrast observes actual EBADF without reporting an unexpected runtime failure
- **AND** the request worker and accepted/listening sockets are retired

#### Scenario: Injected operation does not produce the expected error

- **WHEN** the runtime test's timeout operation succeeds or is never reached
- **THEN** the regression fails with evidence distinguishing that missing operation/error from a recorded error suppressed by the owner
- **AND** cleanup remains bounded without masking the initiating failure
