# Spec Delta

## MODIFIED Requirements

### Requirement: Deployed port matrix

The smoke SHALL inspect running project services and assert that exactly the two intended proxy TCP ports, the OCU gateway port and the DocumentServer listener port, are published and no other, with required application/proxy services running and DocumentServer among the required running services whether the Office editing flag is on or off. It SHALL corroborate inspected identities and fail malformed or incomplete inventory. It SHALL verify that a connection to the explicitly supplied former OCU publication is refused and that a connection to the explicitly supplied direct DocumentServer address is refused; a successful connection or timeout SHALL not pass either assertion.

#### Scenario: Unexpected publication

- **WHEN** a non-proxy service, including DocumentServer, publishes any host port, or the proxy publishes one or three ports, or either proxy mapping differs from its expected publication
- **THEN** smoke exits nonzero and names the assertion

#### Scenario: Former OCU entry

- **WHEN** the former OCU address accepts a connection, times out or fails for an unrelated reason
- **THEN** smoke refuses to certify that entry as absent

#### Scenario: Direct DocumentServer entry

- **WHEN** the supplied direct DocumentServer address accepts a connection, times out or fails for an unrelated reason
- **THEN** smoke refuses to certify that DocumentServer has no direct entry

#### Scenario: DocumentServer required

- **WHEN** the DocumentServer service is missing from the inspected inventory or is not running
- **THEN** smoke exits nonzero and names the missing or stopped service
