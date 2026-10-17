# Spec Delta

## ADDED Requirements

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
