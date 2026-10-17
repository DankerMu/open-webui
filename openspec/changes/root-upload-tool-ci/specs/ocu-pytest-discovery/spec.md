# Spec Delta

## ADDED Requirements

### Requirement: Main CI executes upload and tool-consumer regressions

The main build workflow SHALL automatically execute both complete current `tests/test_upload_claim.py` and `tests/test_tools.py` modules for pull requests targeting main and pushes to main. Their pytest invocation SHALL remain separate from the explicit orchestrator selection. A failure in either module SHALL fail the owning CI job; successful collection alone SHALL NOT count as execution evidence. Existing integration behavior and issue199's independent scoped acceptance SHALL remain unchanged.

#### Scenario: Main pull request or push

- **WHEN** the main workflow's non-image pytest job runs for either supported main event
- **THEN** it executes every test in both root modules without a filtering expression or skipped module
- **AND** existing orchestrator, auth-guard and deploy verification remains selected

#### Scenario: Either module fails

- **WHEN** an executed test in either root module fails
- **THEN** the pytest invocation and owning job fail, without swallowed status or continue-on-error

#### Scenario: Collection boundaries remain distinct

- **WHEN** the workflow invokes the root-module tests
- **THEN** that invocation does not mix explicit orchestrator paths into the same pytest collection
- **AND** the existing integration job, dependency installation and main event triggers remain unchanged

#### Scenario: Evidence identifies executed scope

- **WHEN** local or hosted CI evidence is reported for this coverage change
- **THEN** it records actual execution of both complete modules, their exact node inventory and failure-propagation controls separately from collection
- **AND** local step execution is not described as hosted Ubuntu or full-root certification
