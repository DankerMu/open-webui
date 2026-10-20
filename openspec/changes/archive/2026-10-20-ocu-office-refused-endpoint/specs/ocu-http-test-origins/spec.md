## ADDED Requirements

### Requirement: Refused DocumentServer endpoints refuse deterministically

Office tests that cover the DocumentServer connection-refused branch SHALL point the client at a loopback port whose socket was closed before the client connects, and SHALL NOT keep a bound, non-listening socket open across the connect. Before use, the shared helper SHALL verify that the port refuses a direct connection, and SHALL fail the test with a diagnostic when it does not. Existing outcome assertions SHALL remain unchanged.

#### Scenario: Refused case on a host that silently drops non-listening connects

- **WHEN** a refused-connection Office test runs on a host where a bound, non-listening loopback port times out instead of refusing
- **THEN** the client still receives a connection refusal promptly and every existing outcome assertion holds

#### Scenario: Endpoint that does not refuse

- **WHEN** the helper's probe of the prepared port does not end in a connection refusal
- **THEN** the test fails with a diagnostic instead of exercising a different failure branch
