# ocu-client Specification

## Purpose

Server-side HTTP client WebUI uses to call OCU's internal describe/launch/outputs endpoints with the shared internal token.

## Requirements

### Requirement: Token-bearing internal calls

`OcuClient` SHALL send `Authorization: Bearer {OCU_INTERNAL_TOKEN}` on every request to `OCU_INTERNAL_URL`. `describe` SHALL GET `/internal/describe/{chat_id}`. `launch` SHALL POST `/internal/launch/{chat_id}`. `refresh` SHALL GET `/api/outputs/{chat_id}`. The token SHALL NOT appear in logs, URLs, query strings, or request bodies. Missing URL or token SHALL fail loud.

#### Scenario: Describe carries the token

- **WHEN** `describe("C")` runs with a stubbed transport
- **THEN** the request is GET `{base}/internal/describe/C` with `Authorization: Bearer {token}`

#### Scenario: Token absent from logs

- **WHEN** a client request is made with a distinctive token value and log records are captured
- **THEN** no captured record contains that value

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
