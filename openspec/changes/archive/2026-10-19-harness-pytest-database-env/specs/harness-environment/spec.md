## ADDED Requirements

### Requirement: Backend pytest sessions resolve the harness database

The shared backend test harness SHALL, before any application environment import, remove inherited `DATABASE_TYPE/USER/PASSWORD/HOST/PORT/NAME` and disable python-dotenv content loading, so that the application environment module resolves the harness SQLite database whatever the parent shell, a uv env-file or a dotenv file supplies. If the application environment module was already imported, configuring the harness SHALL fail with an error that names the ordering requirement and does not reveal any database URL, host or credentials. Ordinary application startup outside the test harness SHALL keep its existing database-variable and dotenv behavior. This contract SHALL NOT imply that dotenv path discovery is skipped.

#### Scenario: Inherited database variables in a test session

- **WHEN** a process with a complete set of fake database variables from its parent shell, from a uv env-file, or from a synthetic dotenv stream imports the test harness and then the application environment module
- **THEN** the resolved database URL is the harness SQLite database and none of the database variables remain in the process environment

#### Scenario: Environment module imported before the harness is configured

- **WHEN** the application environment module has already been imported, whether before the first configuration or before a repeat configuration
- **THEN** configuring the harness fails loudly, without printing any fake host or password

#### Scenario: Same inherited variables without the harness

- **WHEN** the application environment module is imported with the same fake shell database variables and without the test harness
- **THEN** it resolves the rebuilt non-harness database URL, preserving ordinary behavior
