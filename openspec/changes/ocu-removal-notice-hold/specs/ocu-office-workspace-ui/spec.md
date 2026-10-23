## ADDED Requirements

### Requirement: The removal-notice case does not depend on hold-phase duration

The browser case for a listing refresh that drops the open Office file SHALL keep the reconciliation run that set the removal notice from finishing until the notice has been asserted, by holding that run's preference write and then letting it complete. The held write SHALL always be continued, never aborted, so the run ends normally.

#### Scenario: Slow hold phase

- **WHEN** more than 3 seconds pass between the removing refresh and the release of the held Office close
- **THEN** the panel still shows `Selected file was removed` after the release, and the held preference write then completes with a success status
