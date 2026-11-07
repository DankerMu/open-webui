# Spec Delta

## Purpose

Wire the deployed OCU skill manager to the WebUI skill registry over the private network, reusing the existing internal token and adding no new secret.

## ADDED Requirements

### Requirement: OCU points at the WebUI registry

The deploy overlay SHALL configure `computer-use-server` as follows:
- `MCP_TOKENS_URL=http://open-webui:8080/api/v1/ocu/skills`;
- `MCP_TOKENS_API_KEY` set from the same source as `OCU_INTERNAL_TOKEN`, written to no repository file, command line or log;
- WebUI gets no new environment variable.

The rendered deployment record SHALL show whether the registry is configured and SHALL NOT show the key.

#### Scenario: Rendered configuration
- **WHEN** the overlay is rendered with a runtime environment that sets `OCU_INTERNAL_TOKEN`
- **THEN** `computer-use-server` receives `MCP_TOKENS_URL` with the WebUI registry URL and `MCP_TOKENS_API_KEY` equal to that token, and the token value appears in no rendered file other than the service environment

#### Scenario: Missing token
- **WHEN** `OCU_INTERNAL_TOKEN` is unset in the runtime environment
- **THEN** the existing bootstrap refusal for a missing `OCU_INTERNAL_TOKEN` still applies and no registry key is rendered
