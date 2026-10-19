## ADDED Requirements

### Requirement: Harness database scripts do not load dotenv contents

The harness database reset and migration round-trip scripts SHALL disable python-dotenv content loading for every Alembic process they start, including the round-trip's nested reset and its own downgrade and upgrade, even when the parent omits the disable flag or supplies a false value. Dotenv-supplied database variables SHALL NOT redirect the harness migration target away from the harness SQLite database. The reset SHALL keep refusing deletion outside `.run/`. Ordinary non-harness startup SHALL keep its existing dotenv behavior. This contract SHALL NOT imply that dotenv path discovery is skipped.

#### Scenario: Parent leaves dotenv enabled for a database script

- **WHEN** the reset or round-trip script runs with the parent disable flag unset or false
- **THEN** every Alembic process it starts receives a truthy disable flag and the harness SQLite `DATABASE_URL`
- **AND** a synthetic in-memory dotenv containing a complete database variable set leaves the URL resolved by the application environment module at the harness SQLite database

#### Scenario: Same dotenv input outside the harness

- **WHEN** the application environment module is imported without the disable flag and with the same synthetic database variables
- **THEN** it resolves the dotenv-constructed database URL, preserving ordinary dotenv behavior
