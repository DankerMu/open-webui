# harness-environment Specification

## Purpose
Keep development and isolated UI backend startup, and harness database migration scripts, independent of dotenv file contents while preserving ordinary application startup behavior, and report the overridden parent flag state for runtime provenance.

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

The harness database reset and migration round-trip scripts SHALL disable python-dotenv content loading for every Alembic process they start, including the round-trip's nested reset and its own downgrade and upgrade, even when the parent omits the disable flag or supplies a false value. Dotenv-supplied database variables SHALL NOT redirect the harness migration target away from the harness SQLite database. The reset SHALL keep refusing deletion outside `.run/`. Ordinary non-harness startup SHALL keep its existing dotenv behavior. This contract SHALL NOT imply that dotenv path discovery is skipped.

#### Scenario: Parent leaves dotenv enabled for a database script

- **WHEN** the reset or round-trip script runs with the parent disable flag unset or false
- **THEN** every Alembic process it starts receives a truthy disable flag and the harness SQLite `DATABASE_URL`
- **AND** a synthetic in-memory dotenv containing a complete database variable set leaves the URL resolved by the application environment module at the harness SQLite database

#### Scenario: Same dotenv input outside the harness

- **WHEN** the application environment module is imported without the disable flag and with the same synthetic database variables
- **THEN** it resolves the dotenv-constructed database URL, preserving ordinary dotenv behavior

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
