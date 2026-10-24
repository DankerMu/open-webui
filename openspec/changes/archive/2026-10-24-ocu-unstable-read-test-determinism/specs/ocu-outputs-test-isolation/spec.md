## ADDED Requirements

### Requirement: Unstable-read regression is deterministic

The broker's unstable-hash-read regression test SHALL change the file during the read in a way the broker can detect on every supported filesystem, independent of timestamp granularity, and SHALL still assert that the read is rejected and no partial index is written.

#### Scenario: Repeated runs on Linux

- **WHEN** the test runs 30 times in isolation in the `python:3.13` container as a non-root user
- **THEN** every run passes
