# Spec Delta

## ADDED Requirements

### Requirement: Owned-data interruption preserves later finalizers

The shared smoke-proxy and UI-harness lifecycle SHALL attempt sentinel verification and then run-owned scratch removal when owned-data cleanup raises `KeyboardInterrupt`. After these attempts the original interruption SHALL propagate, never become a successful return. Ordinary sentinel or scratch-removal failures SHALL retain their existing bounded logging and SHALL NOT swallow that interruption. Existing successful and ordinary cleanup-error status handling, process-cleanup ordering and deletion ownership SHALL remain unchanged. This guarantee SHALL NOT add retries or claim protection from another interrupt during a later finalizer.

#### Scenario: Each harness is interrupted during data cleanup

- **WHEN** owned-data cleanup in smoke-proxy or the UI harness raises `KeyboardInterrupt`
- **THEN** its actual sentinel check is attempted before run-owned scratch removal
- **AND** removable scratch is absent afterward, unrelated sentinel state is preserved and the interruption still escapes as non-success

#### Scenario: Sentinel failure follows an interrupted cleanup

- **WHEN** data cleanup is interrupted and sentinel checking reports an ordinary `Fail` or `Exception`
- **THEN** scratch removal is still attempted and the original interruption propagates after the existing redacted failure reporting

#### Scenario: Scratch removal fails after an interruption

- **WHEN** data cleanup is interrupted and scratch removal raises `OSError`
- **THEN** the existing bounded cleanup failure reporting remains, the interruption propagates and the harness does not claim scratch was removed

#### Scenario: Ordinary cleanup results remain compatible

- **WHEN** owned-data cleanup reports its existing ordinary HTTP/transport or `Fail`/`Exception` failure after a run result of0,1or130
- **THEN** the existing final result remains1,1or130 respectively, with unchanged eligible cleanup operations and process/sentinel/scratch ordering
