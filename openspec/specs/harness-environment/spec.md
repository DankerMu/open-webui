# harness-environment Specification

## Purpose
Keep development and isolated UI backend startup, and harness database migration scripts, independent of dotenv file contents while preserving ordinary application startup behavior; keep the harness database scripts' migration target and the backend pytest session's database target independent of inherited or uv env-file database variables; and report the overridden parent flag state for runtime provenance.

## Requirements

### Requirement: Harness backend imports do not load dotenv contents

The shared harness environment SHALL disable python-dotenv content loading before backend Python imports, even when the parent omits the disable flag or supplies a false value. Development and isolated UI backend launchers SHALL use that shared policy. Explicit harness configuration SHALL remain unchanged. Ordinary non-harness startup SHALL retain the application's existing dotenv behavior. This contract SHALL NOT imply that dotenv path discovery is skipped.

#### Scenario: Parent leaves dotenv enabled

- **WHEN** either backend launcher starts with the parent disable flag unset or false
- **THEN** its backend receives the shared disabling policy before application imports
- **AND** the actual application environment import enters neither dotenv stream loading nor parsing

#### Scenario: Explicit values and normal application startup

- **WHEN** the harness supplies an explicit configuration value also present in a synthetic in-memory dotenv input
- **THEN** the value stays unchanged and no dotenv-only value enters the harness environment
- **WHEN** the same application import runs outside the harness without disabling dotenv
- **THEN** the normal parser can load that in-memory input while preserving existing values under the library's normal override behavior

### Requirement: Harness database scripts do not load dotenv contents

The harness database reset and migration round-trip scripts SHALL disable python-dotenv content loading for every Alembic process they start, including the round-trip's nested reset and its own downgrade and upgrade, even when the parent omits the disable flag or supplies a false value. Dotenv-supplied database variables SHALL NOT redirect the harness migration target away from the harness SQLite database. Database variables inherited from the parent shell or injected through a uv env-file SHALL NOT redirect that target either. The reset SHALL keep refusing deletion outside `.run/`. Ordinary non-harness startup SHALL keep its existing dotenv behavior. This contract SHALL NOT imply that dotenv path discovery is skipped.

#### Scenario: Parent leaves dotenv enabled for a database script

- **WHEN** the reset or round-trip script runs with the parent disable flag unset or false
- **THEN** every Alembic process it starts receives a truthy disable flag and the harness SQLite `DATABASE_URL`
- **AND** a synthetic in-memory dotenv containing a complete database variable set leaves the URL resolved by the application environment module at the harness SQLite database

#### Scenario: Same dotenv input outside the harness

- **WHEN** the application environment module is imported without the disable flag and with the same synthetic database variables
- **THEN** it resolves the dotenv-constructed database URL, preserving ordinary dotenv behavior

#### Scenario: Parent shell exports a complete database variable set

- **WHEN** the reset or round-trip script runs with a complete set of fake `DATABASE_TYPE/USER/PASSWORD/HOST/PORT/NAME` in its parent environment
- **THEN** no Alembic process it starts, including the round-trip's nested reset, receives any of those variables
- **AND** the URL resolved by the application environment module is the harness SQLite database

#### Scenario: uv env-file supplies a complete database variable set

- **WHEN** the reset or round-trip script runs with `UV_ENV_FILE` naming a file that holds a complete fake database variable set
- **THEN** every Alembic `uv run` it starts passes `--no-env-file`, and the resolved URL is the harness SQLite database
- **AND** real uv, run with the same env-file, hides those variables with `--no-env-file` and exposes them without it

### Requirement: Harness environment reports the overridden parent flag state

Each time it is sourced, before applying its dotenv-disabling policy, the shared harness environment SHALL report the inherited `PYTHON_DOTENV_DISABLED` state of the sourcing command on stderr as one allowlisted label: `unset`, `false`, `1`, or `other` for any other value. The label describes the command whose environment is being constructed, not a previously started process. It SHALL NOT output a non-allowlisted raw value. The child environment SHALL still receive the disabling policy, so the reported parent label and the child flag remain distinct facts. The isolated UI verification runner SHALL relay that label from its environment staging step to its own stderr.

#### Scenario: Parent state is labelled before the override

- **WHEN** the shared harness environment is sourced once with the parent flag unset, `false`, `1`, or another value
- **THEN** stderr carries exactly one line labelling the parent state as `unset`, `false`, `1`, or `other` respectively
- **AND** the other value itself does not appear in the output
- **AND** the child still receives the disabling policy and loads no dotenv content

#### Scenario: UI verification receipt carries the label

- **WHEN** the isolated UI verification runner stages its environment
- **THEN** its own stderr carries the staging step's parent-state label line and no other relayed staging output

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
