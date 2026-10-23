## ADDED Requirements

### Requirement: Egress-guard and recovery-filesystem tests do not fail or touch host state only because they run as root

The `test_sandbox_egress_guard` and `test_recovery_fs` deploy test modules SHALL give the same verdict as root and as a non-root user, and a root run of them SHALL NOT create the production egress lock directory on the host.

#### Scenario: Root run of the egress-guard and filesystem tests

- **WHEN** `python -m unittest test_sandbox_egress_guard test_recovery_fs` runs from `tests/deploy` as root in a fresh plain `python:3.13` container where `/run/ocu-sandbox-egress` does not exist
- **THEN** every test passes or is skipped with a stated reason, and `/run/ocu-sandbox-egress` does not exist afterwards

#### Scenario: Non-root run keeps the default lock test

- **WHEN** the same command runs as uid 1001
- **THEN** every test passes and the default lock path test runs

#### Scenario: Ownership test covers the Python extractor

- **WHEN** the Python extractor is changed to ignore a refused ownership change
- **THEN** the ownership failure test fails as root and as non-root
