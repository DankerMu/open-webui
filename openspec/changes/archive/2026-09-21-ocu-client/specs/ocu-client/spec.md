# Spec Delta

## Purpose

Server-side HTTP client WebUI uses to call OCU's internal describe/launch/outputs endpoints with the shared internal token.

## ADDED Requirements

### Requirement: Token-bearing internal calls

`OcuClient` SHALL send `Authorization: Bearer {OCU_INTERNAL_TOKEN}` on every request to `OCU_INTERNAL_URL`. `describe` SHALL GET `/internal/describe/{chat_id}`. `launch` SHALL POST `/internal/launch/{chat_id}`. `refresh` SHALL GET `/api/outputs/{chat_id}`. The token SHALL NOT appear in logs, URLs, query strings, or request bodies. Missing URL or token SHALL fail loud.

#### Scenario: Describe carries the token

- **WHEN** `describe("C")` runs with a stubbed transport
- **THEN** the request is GET `{base}/internal/describe/C` with `Authorization: Bearer {token}`

#### Scenario: Token absent from logs

- **WHEN** a client request is made with a distinctive token value and log records are captured
- **THEN** no captured record contains that value

### Requirement: Unreachable vs never_created

Connection errors and timeouts SHALL raise `OcuUnreachable`. Launch HTTP 409 with `never_created` SHALL be a typed result, not `OcuUnreachable`.

#### Scenario: Timeout is unreachable

- **WHEN** the transport times out
- **THEN** the caller observes `OcuUnreachable` and not a 409 result

#### Scenario: Launch never_created

- **WHEN** OCU answers launch with HTTP 409 and reason `never_created`
- **THEN** the caller observes a typed never_created result and no container-start assumption
