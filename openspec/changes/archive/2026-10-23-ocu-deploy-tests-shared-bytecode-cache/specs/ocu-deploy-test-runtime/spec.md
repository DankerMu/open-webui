## ADDED Requirements

### Requirement: Fake-binary deploy tests pass as non-root in the stock image

The deploy tests that build their environment from the shared fake environment SHALL get a writable bytecode cache from it, inside the per-test temporary directory, so that they pass as a non-root user in the stock Python image without a precompile step or extra environment flags.

#### Scenario: Non-root run of the entry and egress-guard tests

- **WHEN** `python -m unittest test_deploy_entry test_sandbox_egress_guard` runs from `tests/deploy` as uid 1001 in the plain `python:3.13` image with the CI dependencies and no extra environment flags
- **THEN** every test passes, including the held compose-up and held restore cases

#### Scenario: Recovery CLI tests keep passing from the shared setting

- **WHEN** `python -m unittest test_recovery` runs the same way after the recovery-only cache setting is removed
- **THEN** every test passes
