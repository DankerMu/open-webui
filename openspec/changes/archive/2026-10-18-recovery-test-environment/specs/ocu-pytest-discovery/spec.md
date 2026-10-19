## ADDED Requirements

### Requirement: Recovery fake environment is test scoped

Recovery database tests SHALL use their fake Docker environment during execution and restore the complete pre-test process environment after normal completion, a test-body exception, or setup failure after mutation. Later bare Docker subprocesses SHALL inherit their own integration environment. Existing deploy behavior and real workspace integration assertions SHALL remain enabled and unchanged; executable overrides, fake-parser expansion, test filtering and skips SHALL NOT substitute for restoration.

#### Scenario: Normal recovery completion

- **WHEN** a recovery database test completes successfully with fake Docker active
- **THEN** overwritten environment values are restored and keys absent at entry remain absent afterward
- **AND** the complete environment equals the pre-test snapshot

#### Scenario: Recovery body raises

- **WHEN** a recovery test body raises after fake environment activation
- **THEN** the test error remains observable and the complete pre-test environment is restored

#### Scenario: Recovery setup raises

- **WHEN** setup raises after fake environment activation and before the test body runs
- **THEN** the setup error remains observable and the complete pre-test environment is restored without requiring normal teardown

#### Scenario: Later integration inspection

- **WHEN** canonical root execution runs recovery tests before real workspace integration tests
- **THEN** subsequent bare Docker inspection uses the integration executable rather than the deploy fake
- **AND** the five workspace lifecycle cases execute with their unchanged real-engine assertions, with failures and skips reported separately from scoped success
