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

### Requirement: Added Python coverage is enforced per file

The coverage gate SHALL apply the configured minimum independently to every selected fork-added Python file. Any below-threshold file or failed per-file coverage report SHALL fail the gate even when the combined total passes. A file exactly at the configured minimum SHALL pass. The gate SHALL continue evaluating remaining selected files and existing advisory/frontend branches after failure. Source selection, configured threshold, modified-upstream advisory policy, frontend per-file enforcement and test-run status propagation SHALL remain unchanged.

#### Scenario: Aggregate masks a low file

- **WHEN** equal-sized selected added Python files measure60% and100% with an80% minimum
- **THEN** the gate fails despite the80% combined total, in either selection order

#### Scenario: Every file meets the floor

- **WHEN** all selected added Python files meet the configured minimum, including one exactly at that minimum
- **THEN** their coverage checks pass independently

#### Scenario: Reporting continues after failure

- **WHEN** an individual selected file is below threshold or its coverage report fails
- **THEN** the gate remains failed while still evaluating the other selected files and existing advisory/frontend branches
