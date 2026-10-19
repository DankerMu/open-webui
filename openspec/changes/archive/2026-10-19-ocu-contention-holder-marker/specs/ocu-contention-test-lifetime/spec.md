## MODIFIED Requirements

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
