## MODIFIED Requirements

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
