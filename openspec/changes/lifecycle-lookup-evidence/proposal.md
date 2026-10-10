# Lifecycle lookup evidence

## Why

Issue #65 identifies a launch test whose name promises lookup-failure coverage but exercises only unpause refusal. The current OCU source still has that gap and two unreachable APIError handlers around retirement, whose callee already translates APIError into MigrationRequired. The tautological fixture-restoration test was removed by earlier work; its real teardown assertions remain and must not change.

## What Changes

Add distinct lookup-refusal coverage through the existing Docker fixture and public launch boundary; rename the unpause-only test to its actual behavior. Remove only the two unreachable retirement handlers, retaining the callee's 409 migration-required contract. No launch, route, MCP or fixture-lifecycle behavior changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-lifecycle`: add a verification obligation for the already-required lookup500 and retirement409 outcomes, consistent with its existing credential-isolation verification requirements. Runtime behavior remains unchanged.

## Impact

OCU `tests/orchestrator/test_lifecycle.py` and the two retirement call sites in `computer-use-server/docker_manager.py`. The central canonical lifecycle specification records the verification obligation; existing lifecycle documentation records its failure boundary.

## Triage

Issue type: test
Fixture level: expanded
Upstream suggested level: absent
Blast radius: lifecycle error classification and test isolation if the behavior-preserving cleanup is wrong.
Selected risk packs: public API; file IO/state preservation; legacy compatibility; error handling; documentation.
Evidence floor: focused lifecycle module, a disposable lookup-translation mutant rejected by the added case, an actual HTTP launch-refusal probe using the existing Docker dependency seam, and existing retirement refusal controls.
