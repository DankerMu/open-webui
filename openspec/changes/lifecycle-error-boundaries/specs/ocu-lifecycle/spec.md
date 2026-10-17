## ADDED Requirements

### Requirement: Request lifecycle Docker failures use the existing error contract

Docker exceptions from sandbox get/create lookup or reload, describe lookup or reload, and explicit launch's post-lookup network preparation or restarting readiness SHALL become lifecycle failures with status500 and reason `launch_failed`. These failures SHALL preserve diagnostic operation context and exception cause rather than become an absent sandbox or allow later launch actions. Existing MCP and HTTP consumers SHALL receive their established lifecycle error representation.

#### Scenario: Get/create lookup failure reaches the MCP lifecycle path

- **WHEN** the Docker lookup or its reload fails during sandbox get/create
- **THEN** the service raises a typed lifecycle failure and does not create a replacement sandbox on that evidence
- **AND** a real MCP tool invocation reports the lifecycle error message through its standard error path rather than its generic raw-engine fallback

#### Scenario: Describe lookup failure uses the established HTTP envelope

- **WHEN** the Docker lookup or reload fails during an authorized internal describe request
- **THEN** the response is status500 with `launch_failed` at `detail.reason` and the lifecycle message at `detail.detail`
- **AND** no container mutation is performed

#### Scenario: Existing-container preparation fails

- **WHEN** a Docker exception not already converted by a specific network handler occurs during an admitted existing-container launch preparation
- **THEN** explicit launch exposes status500 and reason `launch_failed` through the existing lifecycle response
- **AND** it performs no later start, unpause or retirement action; any preparation mutation that already occurred remains governed by the existing repair behavior, without new rollback or retries

#### Scenario: Restarting readiness reload fails

- **WHEN** a restarting container's readiness polling reload or final readiness reload raises a Docker exception after successful initial lookup and preparation
- **THEN** launch reports status500 with reason `launch_failed`, not an unstructured exception or a fabricated readiness timeout
- **AND** subsequent sleeper retirement is not attempted

#### Scenario: Existing classified outcomes remain distinct

- **WHEN** lookup reports a missing container through its established get-NotFound path, a specific network NotFound/APIError or incompatibility is mapped, restart readiness merely times out, or sleeper retirement refuses
- **THEN** the existing absence behavior, network error categories, timeout504 and retirement409 `migration_required` remain unchanged
- **AND** initial launch lookup translation, unrelated raw lookup callers, authorization guards and the nested HTTP envelope retain their existing contracts
