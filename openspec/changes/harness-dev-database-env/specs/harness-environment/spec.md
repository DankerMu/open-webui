## ADDED Requirements

### Requirement: Development and UI launchers resolve the harness database

Every backend started after sourcing the shared harness environment SHALL resolve its database URL to the SQLite database in its validated data directory, whatever database URL, database variables or uv env-file the parent supplies. A workspace-scoped data directory SHALL keep its own database. The harness environment SHALL NOT print inherited database values. Ordinary application startup outside the harness SHALL keep its existing database-variable behavior.

#### Scenario: Inherited database target

- **WHEN** the harness environment is sourced with an inherited database URL, a complete set of fake database variables, or a uv env-file holding that set, and the application environment module is then imported
- **THEN** the resolved database URL is the SQLite database in the validated data directory
- **AND** no fake host, user or password appears in the output

#### Scenario: Workspace data directory

- **WHEN** the harness environment runs with a workspace-scoped data directory
- **THEN** the resolved database URL points inside that workspace directory, not at the shared harness database

#### Scenario: Same database URL without the harness

- **WHEN** the application environment module is imported with an inherited database URL and without sourcing the harness environment
- **THEN** the resolved database URL is the inherited one
