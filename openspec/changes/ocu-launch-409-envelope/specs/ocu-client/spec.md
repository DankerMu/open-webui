## MODIFIED Requirements

### Requirement: Unreachable vs never_created

Connection errors and timeouts SHALL raise OcuUnreachable. Launch HTTP409 SHALL produce typed OcuNeverCreated only when its parsed JSON object carries OCU's error envelope with `detail.reason` exactly never_created; a top-level reason, a string detail, or arbitrary text containing that word SHALL not qualify. Every other non-2xx response SHALL raise OcuUpstreamError with upstream status and fixed reason ocu_upstream_error rather than returning a domain payload. Upstream failed response content SHALL not be retained in that error or logged.

#### Scenario: Timeout is unreachable

- **WHEN** the transport times out
- **THEN** the caller observes OcuUnreachable and not a409 result

#### Scenario: Launch never_created

- **WHEN** OCU answers launch with HTTP409 and its error envelope `{"detail": {"detail": "...", "reason": "never_created"}}`
- **THEN** the caller observes a typed never_created result and no container-start assumption
- **AND** the WebUI launch route answers HTTP409 with reason never_created rather than502

#### Scenario: HTTP failures are not payloads

- **WHEN** OCU answers500 with JSON, plain text or an empty body, or401/403/unrelated409 (including a top-level reason never_created)
- **THEN** the caller observes OcuUpstreamError with status and fixed reason, never successful domain data
- **AND** a distinctive upstream marker does not appear in the error or captured logs
