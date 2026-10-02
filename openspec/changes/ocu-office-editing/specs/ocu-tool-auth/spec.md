# Spec Delta

## MODIFIED Requirements

### Requirement: Authorize every tool transport

Every OCU tool request, including health and MCP probes, import-receipt reads and multipart uploads, SHALL carry the process-environment internal token using the service's carrier for that transport. MCP SHALL additionally preserve configured MCP_API_KEY Bearer authentication. Missing/blank internal token SHALL yield a tool configuration error without network work. The internal token SHALL NOT be a Valve, be persisted through Valve APIs, or appear in browser-facing Valve schema/value responses, tool results, emitted events or logs.

#### Scenario: Complete authenticated tool path

- **WHEN** a tool with valid chat identity synchronizes a file and executes with distinct configured internal and MCP credentials
- **THEN** actual outgoing probe, import-receipt, upload and MCP requests satisfy the real guard and the tool result preserves the successful operation

#### Scenario: Credential is removed from a produced request

- **WHEN** the internal token is removed from an otherwise valid produced MCP or upload request
- **THEN** the real OCU guard returns 401 before protected work

#### Scenario: Missing server credential

- **WHEN** a tool is invoked without a usable configured internal token
- **THEN** it returns a recognizable configuration error and sends no requests

#### Scenario: Server credential remains outside Valve APIs

- **WHEN** the WebUI process has an internal token and a tool's Valve schema or values are serialized for a browser
- **THEN** no internal-token field or value is exposed, while outgoing OCU calls use the current environment credential
