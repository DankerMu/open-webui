# ocu-contention-test-lifetime Specification

## Purpose

Keep controlled startup failures in Office contention tests diagnostic while releasing and observing the holders those tests actually acquired, and publish the process holder's readiness marker and the callback contention marker only with their complete text.

## Requirements

### Requirement: Contention startup failures retain their diagnostic and local ownership

Office contention tests SHALL preserve the initiating startup failure when otherwise healthy cleanup runs. They SHALL restore temporary patches before outer fixture teardown, release and observe acquired holders, and SHALL NOT join a watchdog that never started. The process holder SHALL publish its readiness marker so that the marker path exists only with its complete exact text.

#### Scenario: Process creation fails

- **WHEN** process-holder creation raises a controlled startup exception
- **THEN** the same exception reaches the owning test without replacement by an unstarted-thread join error
- **AND** temporary patches are restored without attempting cleanup of an unacquired child

#### Scenario: First process readiness marker fails

- **WHEN** the first readiness check raises a controlled exception after a real holder child is acquired
- **THEN** the same exception reaches the owning test after the child is released and reaped, its pipe handles are closed and temporary patches are restored
- **AND** cleanup does not join the unstarted watchdog

#### Scenario: Process holder marker is incomplete

- **WHEN** the real process holder is held after opening its readiness marker for writing and before the text is complete
- **THEN** the final readiness marker path does not exist
- **AND** after release, the final path contains exactly the holder's readiness text

#### Scenario: Thread holder readiness fails

- **WHEN** readiness raises a controlled exception after a real thread holder is acquired
- **THEN** explicit local cleanup releases the holder, observes its future and restores the temporary patch
- **AND** the same readiness exception reaches the owning test without relying on outer fixture teardown or emergency rescue

### Requirement: Startup cleanup preserves successful contention evidence

The successful thread-holder and process-holder tests SHALL retain their existing real contention, pending callback, responsive health endpoint, callback response, watchdog non-expiry, editing-state and zero-origin-hit assertions. Startup-failure evidence SHALL NOT imply production cancellation or general resource-leak guarantees. The process-holder test SHALL publish its callback contention marker so that the marker path exists only with its complete exact outcome text.

#### Scenario: Holders start successfully

- **WHEN** the existing thread and process contention cases execute without injected startup faults
- **THEN** all existing liveness, response and state-conservation assertions pass without weakened assertions, changed timeout policy, retries or skips

#### Scenario: Callback contention marker is incomplete

- **WHEN** the callback contention marker publication is held after opening its marker stage and before the outcome text is written
- **THEN** the final contention marker path does not exist
- **AND** after release, the final path contains exactly the outcome text and no stage remains

#### Scenario: Callback contention is published through the marker writer

- **WHEN** the successful process-holder test observes the callback's lock denial
- **THEN** the denial is published exactly once, with the outcome text `denied`, through the same marker publication
