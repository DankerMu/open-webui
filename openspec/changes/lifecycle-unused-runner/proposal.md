# Proposal

## Why

Issue #304 identifies unused machine-specific runner declarations in OCU lifecycle tests. They are misleading dead code, not evidence of a portability failure.

## What Changes

Remove only the `UV` and `PYTEST_PREFIX` assignments from `tests/orchestrator/test_lifecycle.py`. Preserve every existing test, subprocess invocation and lifecycle behavior. Record the cleanup in the existing changelog after verification.

## Capabilities

No new or modified capabilities. Native OpenSpec supports `skip_specs: true` for behavior-preserving cleanup; use that instead of inventing a requirement. This differs from the workflow reference's older assertion that validation always requires a delta. Compact fixture; no design document.

## Impact

- Issue type: refactor
- Fixture level: compact
- Upstream suggested level: absent
- Blast radius: test-module import only; production code untouched
- Selected risk packs: compatibility and documentation
- Evidence floor: exact deletion equivalence, unchanged lifecycle regressions and real child-process smoke; strict fixture, documentation gates and actual commit hooks

No runner discovery, override, fallback, dependency, security, lifecycle or subprocess redesign. No Linux, Docker or LAN certification.
