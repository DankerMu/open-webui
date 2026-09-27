# Spec Delta

## MODIFIED Requirements

### Requirement: Unreachable vs never_created

Connection errors and timeouts SHALL raise OcuUnreachable. Launch HTTP409 SHALL produce typed OcuNeverCreated only when its parsed JSON object has reason exactly never_created; arbitrary text containing that word SHALL not qualify. Every other non-2xx response SHALL raise OcuUpstreamError with upstream status and fixed reason ocu_upstream_error rather than returning a domain payload. Upstream failed response content SHALL not be retained in that error or logged.

#### Scenario: Timeout is unreachable

- **WHEN** the transport times out
- **THEN** the caller observes OcuUnreachable and not a409 result

#### Scenario: Launch never_created

- **WHEN** OCU answers launch with HTTP409 and JSON reason never_created
- **THEN** the caller observes a typed never_created result and no container-start assumption

#### Scenario: HTTP failures are not payloads

- **WHEN** OCU answers500 with JSON, plain text or an empty body, or401/403/unrelated409
- **THEN** the caller observes OcuUpstreamError with status and fixed reason, never successful domain data
- **AND** a distinctive upstream marker does not appear in the error or captured logs
