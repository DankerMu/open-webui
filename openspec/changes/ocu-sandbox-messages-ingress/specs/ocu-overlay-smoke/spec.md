## MODIFIED Requirements

### Requirement: Causal network evidence

The smoke SHALL require live positive controls and actual successful HTTP egress to an explicitly allowlisted IPv4 destination before accepting sandbox control-plane isolation. It SHALL use literal addresses, bypass environment proxies and distinguish connection timeout from DNS failure, refusal, missing tools, engine errors and post-connect response timeout. Only a connection-phase timeout against the exact independently live control endpoint SHALL satisfy the negative probe.

#### Scenario: False isolation signals

- **WHEN** a sandbox probe fails due to DNS, a dead listener, missing executable or a timeout after connection
- **THEN** smoke exits nonzero rather than reporting isolation success

#### Scenario: No usable positive egress

- **WHEN** no allowed positive target exists or its HTTP request fails
- **THEN** smoke reports an unsuitable prerequisite or assertion failure and does not report a complete PASS
- **AND** it never changes the allowlist to manufacture success
