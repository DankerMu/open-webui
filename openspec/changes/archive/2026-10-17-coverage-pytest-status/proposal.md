# Proposal

## Why

Standalone `make coverage-gate` discards backend pytest status through a tail pipeline and `|| true`. Sufficient measured coverage can therefore hide failed assertions. Full check/CI already run tests separately; their protection is not in question. Issue #385 requests status propagation without threshold or discovery changes.

## What Changes

Preserve backend pytest's own status across output truncation, fail the gate for nonzero statuses except the established no-tests exit5, and still run coverage reporting and the frontend branch. Add isolated executable-boundary regression and real pytest/coverage acceptance.

## Capabilities

### New Capabilities

- `coverage-gate-status`: standalone coverage success requires acceptable test-run status as well as current coverage policy.

### Modified Capabilities

None.

## Impact

`scripts/coverage-gate.sh`, focused harness tests/Make target and a testing decision. No thresholds, source selection, dependencies or CI configuration changes. Issue #410's per-file Python threshold is separate.

## Risk triage

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded because this is a shared public script/Make entrypoint.
Blast radius: standalone gate false-green or regression in existing no-tests/advisory/frontend handling.
Selected risk packs: script entry, legacy compatibility, error handling, documentation.
Evidence floor: semantic RED, isolated status matrix, real pytest failure with sufficient coverage followed by real restored success, scoped lint/doc/decision checks and expanded review.
