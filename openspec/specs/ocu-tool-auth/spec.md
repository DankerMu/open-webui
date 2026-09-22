# ocu-tool-auth Specification

## Purpose

Authorize server-side Open WebUI tool requests to OCU while keeping chat identity explicit and internal credentials out of user-visible output.

## Requirements

### Requirement: Authorize every tool transport

Every OCU tool request, including health and MCP probes, upload-manifest reads and multipart uploads, SHALL carry the process-environment internal token using the service's carrier for that transport. MCP SHALL additionally preserve configured MCP_API_KEY Bearer authentication. Missing/blank internal token SHALL yield a tool configuration error without network work. The internal token SHALL NOT be a Valve, be persisted through Valve APIs, or appear in browser-facing Valve schema/value responses, tool results, emitted events or logs.

#### Scenario: Complete authenticated tool path

- **WHEN** a tool with valid chat identity synchronizes a file and executes with distinct configured internal and MCP credentials
- **THEN** actual outgoing probe, manifest, upload and MCP requests satisfy the real guard and the tool result preserves the successful operation

#### Scenario: Credential is removed from a produced request

- **WHEN** the internal token is removed from an otherwise valid produced MCP or upload request
- **THEN** the real OCU guard returns 401 before protected work

#### Scenario: Missing server credential

- **WHEN** a tool is invoked without a usable configured internal token
- **THEN** it returns a recognizable configuration error and sends no requests

#### Scenario: Server credential remains outside Valve APIs

- **WHEN** the WebUI process has an internal token and a tool's Valve schema or values are serialized for a browser
- **THEN** no internal-token field or value is exposed, while outgoing OCU calls use the current environment credential

### Requirement: Explicit chat identity before work

Tools SHALL reject absent, None, empty or whitespace-only chat IDs with a tool error before upload synchronization, probes or MCP execution. No tool wrapper SHALL coerce these identifiers to default. Existing non-empty identifiers SHALL remain subject to the service guard.

#### Scenario: Empty chat metadata with uploaded files

- **WHEN** any tool wrapper is invoked with empty chat metadata, including wrappers supplied uploaded files
- **THEN** it returns an error, emits final error status when an emitter is present, and performs no upload or OCU request

### Requirement: Server identity and current configuration

X-User-Email SHALL derive only from injected **user** and SHALL not be overridden by tool arguments, metadata or incoming request headers. Changes to configured URL or credentials SHALL affect the next outgoing call; user identity SHALL remain isolated between calls.

#### Scenario: Successive users and rotated credential

- **WHEN** successive tool calls use different **user** values and the configured internal credential changes between calls
- **THEN** each request carries that call's server-provided identity and current credential, not a cached user's identity or old token
