# ocu-service-key-compare Specification

## Purpose

How computer-use-server compares service keys presented on its internal endpoints: in constant time, with unchanged status codes, details and unset-key behaviour.

## Requirements

### Requirement: Service keys compare in constant time

OCU SHALL compare the `X-Internal-Api-Key` of `/api/skill-stats` with `MCP_TOKENS_API_KEY`, and the bearer token of `/mcp-info` with `MCP_API_KEY`, only through `auth_guard._credential_matches`. It SHALL keep each route's status codes and its behaviour when the key is unset.

#### Scenario: Correct internal key

- **WHEN** `MCP_TOKENS_API_KEY` is `k1` and a request to `/api/skill-stats` carries `X-Internal-Api-Key: k1`
- **THEN** the key is compared through `_credential_matches` and the route answers 200

#### Scenario: Non-latin-1 key rejected

- **WHEN** `MCP_API_KEY` is set and a request to `/mcp-info` carries a bearer token with a non-latin-1 character
- **THEN** the route answers 401, not 500
