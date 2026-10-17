# ocu-pytest-discovery Specification

## Purpose

Preserve the intended OCU selected-test scope and fixture ownership when verification combines root-level and orchestrator tests, without changing fixtures or dependency policy.

## Requirements

### Requirement: Canonical selected pytest discovery

OCU verification guidance SHALL use `tests/` as the single collection root for selections combining root-level and orchestrator tests, with an equivalent module-name `-k` filter, `--import-mode=importlib` and the intended integration exclusion. A changed invocation SHALL be qualified by exact selected node-ID equality, not equal counts alone. Canonical collection SHALL resolve the existing `world` fixture for selected consumers without a fixture/conftest patch or pytest dependency-policy change. Collection and full test execution SHALL be recorded separately; collection success SHALL NOT be described as tests passing.

#### Scenario: Historical selection is preserved

- **WHEN** the recorded sixteen-module selection is compared on source `d670ce86af53fa1c4636a55875e7d4b72ae53ff0` under pytest 9.1.1
- **THEN** explicit-path and canonical-root collection contain exactly the same 864 unique node IDs, and canonical selected consumers resolve `world`
- **AND** the canonical full selected execution has a separate recorded exit and outcome, with its actual environment identified

#### Scenario: Current test growth is retained

- **WHEN** the same intended module selection is qualified on a later source revision
- **THEN** its explicit-path and canonical-root node-ID sets remain equal without deleting or filtering new cases to reproduce the historical count
- **AND** the record identifies that revision and its actual selected count, not a claim that every revision has 864 cases

#### Scenario: Guidance does not patch the fixture boundary

- **WHEN** a maintainer follows the documented canonical command
- **THEN** existing fixture definitions, conftest ownership, test assertions, production behavior and pytest dependency policy remain unchanged
- **AND** a full-suite or selected-suite success claim names the executed scope and result separately from collect-only observations

### Requirement: Integration helpers survive full-root discovery

OCU integration tests SHALL resolve their shared MCP request and response helpers independently of which other suite's conftest was loaded first. Canonical full `tests/` discovery and focused integration discovery with `--import-mode=importlib`, and the documented console `pytest tests/integration/` entrypoint with default prepend imports and no PYTHONPATH override, SHALL retain the same integration test node IDs, assertions and fixture ownership. The change SHALL NOT use skips, test removal, global conftest aliases, path-order overrides or dependency changes to obtain collection success.

#### Scenario: Deploy and integration suites are collected together

- **WHEN** the full `tests/` tree is collected using importlib mode
- **THEN** every integration module resolves its own MCP helper implementation without importing helpers from the deploy conftest
- **AND** the integration node-ID set is identical to focused integration collection after normalizing only the rootdir-dependent `tests/integration/` prefix to integration-relative paths, retaining every test/parameter suffix

#### Scenario: Documented console invocation remains supported

- **WHEN** the console executable runs `pytest tests/integration/` from the checkout root without a PYTHONPATH override
- **THEN** collection succeeds with exactly the same raw node IDs as the pre-repair console invocation, and the same integration-relative IDs as full-root importlib discovery under the prefix normalization above
- **AND** real integration execution retains the existing assertions and fixture ownership

#### Scenario: Focused integration execution remains real

- **WHEN** the unchanged integration suite runs against an isolated real server and the full sandbox image
- **THEN** it exercises the same credential, MCP-tool and workspace lifecycle assertions as before the import repair
- **AND** collection success is reported separately from runtime results, including any failed or skipped cases

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
