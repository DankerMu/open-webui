# coverage-gate-status Specification

## Purpose
Make the standalone coverage gate reflect test-run failure independently of the measured coverage report, while preserving repository baseline conventions.

## Requirements

### Requirement: Coverage gate preserves test runner failures

The standalone coverage gate SHALL fail when selected backend pytest exits nonzero other than5, even if the measured coverage report passes. It SHALL continue coverage reporting after such failure. Exit5 SHALL retain the existing no-tests tolerance but SHALL NOT bypass coverage failure. Existing frontend Vitest failure gating, modified-upstream advisory coverage, no-scope success and independent Make/CI test steps SHALL remain unchanged.

#### Scenario: Failed assertions with sufficient coverage

- **WHEN** backend pytest fails an assertion while selected Python coverage meets the configured threshold
- **THEN** standalone `make coverage-gate` exits nonzero and still runs its coverage report

#### Scenario: Baseline no-tests and report failure

- **WHEN** backend pytest exits5
- **THEN** the gate tolerates that runner status and its existing coverage report still determines coverage success or failure

#### Scenario: Successful and sibling branches

- **WHEN** selected runners and gated reports succeed, or no source files are selected
- **THEN** the gate succeeds
- **AND** a backend gated report failure or frontend Vitest failure still makes it fail
- **AND** modified-upstream coverage remains advisory without masking backend test-run failure
