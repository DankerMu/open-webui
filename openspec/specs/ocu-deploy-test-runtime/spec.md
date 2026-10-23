# ocu-deploy-test-runtime Specification

## Purpose

Keep the OCU `tests/deploy` suite a working gate in the stock Python image whatever user runs it: non-root runs need no precompile step or extra environment flags, and root runs neither fail for euid reasons nor touch host state.

## Requirements

### Requirement: Recovery CLI tests pass as non-root in the stock image

The recovery CLI tests SHALL give every recovery CLI process they start, and the processes it starts, a writable bytecode cache under the test's temporary root, so that they pass as a non-root user in the stock Python image without a precompile step or extra environment flags.

#### Scenario: Non-root run in the stock image

- **WHEN** `python -m unittest test_recovery` runs from `tests/deploy` as uid 1001 in the plain `python:3.13` image with the CI dependencies and no extra environment flags
- **THEN** every test passes, including the activation cases that start the fake docker hundreds of times

### Requirement: Fake-binary deploy tests pass as non-root in the stock image

The deploy tests that build their environment from the shared fake environment SHALL get a writable bytecode cache from it, inside the per-test temporary directory, so that they pass as a non-root user in the stock Python image without a precompile step or extra environment flags.

#### Scenario: Non-root run of the entry and egress-guard tests

- **WHEN** `python -m unittest test_deploy_entry test_sandbox_egress_guard` runs from `tests/deploy` as uid 1001 in the plain `python:3.13` image with the CI dependencies and no extra environment flags
- **THEN** every test passes, including the held compose-up and held restore cases

#### Scenario: Recovery CLI tests keep passing from the shared setting

- **WHEN** `python -m unittest test_recovery` runs the same way after the recovery-only cache setting is removed
- **THEN** every test passes

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
