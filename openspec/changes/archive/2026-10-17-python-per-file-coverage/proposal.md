# Proposal

## Why

Issue #410 identifies that one combined Coverage.py report applies `--fail-under` to its total. That can accept a below-threshold fork-added Python file despite the configured per-file policy in constraints.yaml. This is independent of test-status propagation delivered by #385 and makes no claim about #295's coverage.

## What Changes

Evaluate each selected fork-added Python file against the existing configured floor, retaining reports for all selected files after a failure. Extend the existing executable coverage-gate regression and demonstrate aggregate-passes/individual-fails with real Coverage.py7.16.1.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `coverage-gate-status`: add the declared per-file Python coverage requirement without changing the runner-status requirement.

## Impact

`scripts/coverage-gate.sh`, existing `test_coverage_gate.py`, testing decision and fixture. No threshold, discovery, dependency, CI or Make target change. Modified-upstream Python stays advisory; frontend per-file enforcement stays intact.

## Risk triage

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded for shared script/Make CLI and coverage-report reader semantics.
Blast radius: a low file can be masked, or valid threshold-boundary files could be rejected.
Selected risk packs: script entry/config, legacy compatibility, error handling, documentation.
Evidence floor: real aggregate false-green baseline, permanent semantic RED, per-file/exact-threshold/order/continuation cases, existing12status regressions, real fixed boundary, scoped lint/doc/decision and expanded review.
