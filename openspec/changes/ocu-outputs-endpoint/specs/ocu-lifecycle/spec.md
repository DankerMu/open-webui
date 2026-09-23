## MODIFIED Requirements

### Requirement: Non-mutating describe

Authorized describe SHALL return200 `{state, revision, views, cli_badge}` for every canonical chat without creating or changing a sandbox. State is running, stopped or never_created; revision SHALL be the validated persisted broker counter, or0 if no index exists, without reconciling files or creating an index. Invalid authority SHALL fail explicitly rather than return0. Views include browser/terminal only while running; cli_badge matches `/api/runtime/cli`.

#### Scenario: Running without terminal

- **WHEN** the sandbox is running but ttyd is inactive
- **THEN** describe returns running and does not start anything

#### Scenario: Absent or paused

- **WHEN** the sandbox is paused or absent with valid metadata
- **THEN** describe returns stopped and state remains unchanged

#### Scenario: Persisted revision after reconciliation

- **WHEN** listing has persisted a nonzero revision and describe is called for a running or stopped sandbox
- **THEN** describe returns that revision without scanning outputs or changing the index

#### Scenario: Missing or corrupt index

- **WHEN** describe has no persisted index
- **THEN** it returns revision0 without creating the index
- **AND** a corrupt index instead returns an explicit failure without reset
