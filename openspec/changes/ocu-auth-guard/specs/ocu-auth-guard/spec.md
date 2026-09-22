## Purpose

Protect the OCU service boundary before chat operations or request identity can affect a sandbox, filesystem or user-scoped prompt.

## ADDED Requirements

### Requirement: Fail-closed startup

The server SHALL exit non-zero before serving when OCU_INTERNAL_TOKEN is absent or blank, including the packaged multi-worker entrypoint. Malformed configured subnet or origin SHALL fail startup. Missing origin SHALL grant no cross-origin permission; missing subnet SHALL not disable token enforcement.

#### Scenario: Packaged command lacks token

- **WHEN** the production startup command runs without OCU_INTERNAL_TOKEN
- **THEN** its parent process exits non-zero without a serving listener or respawning worker loop

### Requirement: Service authorization before protected work

Every chat-bound HTTP route, upload, preview and CDP/ttyd handshake, and the identity endpoints /system-prompt, /skill-list and /skill-mounts SHALL require the internal token before protected work. REST and WebSocket upstream handshakes SHALL accept only Authorization Bearer with the internal token. Credentials SHALL NOT appear in URLs, responses or logs or be propagated to sandboxes.

#### Scenario: Missing or wrong service token

- **WHEN** any protected route is requested without the correct token
- **THEN** HTTP returns 401 or the WebSocket is rejected before upgrade, without filesystem, container or identity work

#### Scenario: Authorized requests remain useful

- **WHEN** a valid upstream service token and valid chat ID are supplied
- **THEN** route processing preserves its existing successful payload and traversal protections

#### Scenario: Public health and unrelated runtime API

- **WHEN** a non-sandbox peer requests health or the unrelated runtime-cli endpoint without a token
- **THEN** their existing public behavior remains available

### Requirement: MCP credentials and context are isolated

MCP SHALL require X-OCU-Internal-Token before interpreting any identity or credential headers. When MCP_API_KEY is configured, MCP SHALL additionally require its existing Authorization Bearer credential. The credentials SHALL NOT substitute for one another. Direct and X-OpenWebUI aliases SHALL obey the same checks and context SHALL not leak across requests.

#### Scenario: Independent MCP credentials

- **WHEN** distinct internal and MCP secrets are configured and either is absent or wrong
- **THEN** MCP rejects with 401 before prompt rendering or chat-bound operations, even if the other credential is valid

#### Scenario: Authenticated MCP identity

- **WHEN** both required credentials and a valid chat ID are supplied
- **THEN** mounted MCP initialization succeeds and trusts only that request's identity, restoring context after completion or failure

### Requirement: Reject unsafe chat identifiers

Chat-bound requests SHALL reject empty, default and temporary:/local:/channel: identifiers after canonical normalization before protected work. SINGLE_USER_MODE SHALL NOT remap valid chat IDs to a shared default sandbox. Supplied invalid IDs on identity endpoints SHALL also be rejected.

#### Scenario: Invalid identifier across entrypoints

- **WHEN** a protected HTTP, WebSocket or MCP request uses an invalid identifier, including normalized or encoded variants
- **THEN** it receives a client error or pre-upgrade rejection and creates or reuses no sandbox

### Requirement: Peer denial and CORS restriction

A transport peer in OCU_SANDBOX_SUBNET SHALL receive 403 before handler execution. Client-supplied forwarding headers SHALL NOT bypass that denial. CORS SHALL permit only OCU_WEBUI_ORIGIN when configured, never wildcard.

#### Scenario: Sandbox peer forges forwarding address

- **WHEN** a sandbox peer supplies valid credentials and an external X-Forwarded-For value
- **THEN** it is denied before handler work

#### Scenario: Foreign browser origin

- **WHEN** an actual or preflight request supplies a foreign Origin
- **THEN** the response contains no Access-Control-Allow-Origin granting that origin, while the configured origin has its explicit CORS permission
