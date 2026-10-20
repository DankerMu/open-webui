## ADDED Requirements

### Requirement: Local unit command matches the CI interpreter

The documented local OCU unit-test command SHALL run on the same CPython minor version as the orchestrator CI job, without relying on the interpreter uv would otherwise resolve. The pin SHALL NOT change test oracles, production code, the CI workflow or the deployed image interpreter, and SHALL NOT add interpreter-version skips or log filtering.

#### Scenario: Documented command from a clean checkout

- **WHEN** the documented `uv run --no-project` unit-test command runs from a clean OCU checkout root without an explicit interpreter override, whatever interpreter uv would otherwise resolve
- **THEN** the command runs on CPython 3.13, matching the orchestrator CI job
- **AND** the evidence shows the interpreter from the same invocation

#### Scenario: Cancelled discovery oracle is unchanged

- **WHEN** the MCP discovery cancellation tests run under the documented command
- **THEN** their no-unobserved-error assertion is unchanged and passes without skips or message filtering
