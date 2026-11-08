# Spec Delta

## Purpose

Wire the deployed OCU skill manager to the WebUI skill registry over the private network, reusing the existing internal token and adding no new secret.

## ADDED Requirements

### Requirement: OCU points at the WebUI registry

The deploy overlay SHALL configure `computer-use-server` as follows:

- `MCP_TOKENS_URL=http://open-webui:8080/api/v1/ocu/skills`;
- `MCP_TOKENS_API_KEY` set from the same source as `OCU_INTERNAL_TOKEN` (already written to `runtime.env` by `bootstrap-test.sh:389`), written to no repository file, command line or log;
- WebUI gets no new environment variable.

No file added by this change SHALL carry the token value, and `MCP_TOKENS_API_KEY` SHALL appear only in the `computer-use-server` service environment. The existing `runtime.env`, which already holds `OCU_INTERNAL_TOKEN`, is pre-existing and out of scope.

The deployment record written by `scripts/write-deployed-version.sh` SHALL carry a registry status line, `configured` `yes` or `no`, following its existing configured-yes/no pattern (`:44-53`), and SHALL NOT show the key.

#### Scenario: Rendered configuration

- **WHEN** the overlay is rendered with a runtime environment that sets `OCU_INTERNAL_TOKEN`
- **THEN** `computer-use-server` receives `MCP_TOKENS_URL` with the WebUI registry URL and `MCP_TOKENS_API_KEY` equal to that token, no file added by this change carries the token value (the pre-existing `runtime.env` is out of scope), and `MCP_TOKENS_API_KEY` appears in no service environment other than `computer-use-server`

#### Scenario: Deployment record status

- **WHEN** the deployment record is written with the registry configured, and again with it unconfigured
- **THEN** the record shows the registry status as `yes` and `no` respectively and never contains the key value

#### Scenario: Missing token

- **WHEN** `OCU_INTERNAL_TOKEN` is unset in the runtime environment
- **THEN** the existing bootstrap refusal for a missing `OCU_INTERNAL_TOKEN` still applies and no registry key is rendered
