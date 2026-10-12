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
