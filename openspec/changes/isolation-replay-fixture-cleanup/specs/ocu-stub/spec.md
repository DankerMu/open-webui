# Spec Delta

## ADDED Requirements

### Requirement: Isolation and replay smoke retires its owned configuration

The isolation/replay smoke SHALL remove its invocation-owned fixture configuration after its stub lifetimes finish, on success and on either stub startup or assertion/replay failure. It SHALL remove only that exact owned file, preserve the original failure, and retain existing fixture contents, isolation assertions and pagination outcomes.

#### Scenario: Successful replay leaves no owned fixture

- **WHEN** the smoke completes both stub runs and deterministic replay assertions
- **THEN** both child processes have stopped and the invocation-owned fixture file is absent from the runtime temporary directory
- **AND** unrelated files in that directory remain unchanged

#### Scenario: Startup or assertion failure still releases the fixture

- **WHEN** either stub fails readiness or an assertion in either run fails
- **THEN** the acquired stub is stopped through its existing cleanup path before the fixture is removed
- **AND** the original failure remains observable without leaving the owned fixture behind

#### Scenario: Pagination failure controls remain discriminating

- **WHEN** the existing complete-listing and partial-listing smoke fault controls are exercised
- **THEN** each remains rejected by its intended pagination assertion
- **AND** restored fixture behavior passes without an isolation/replay configuration leftover
