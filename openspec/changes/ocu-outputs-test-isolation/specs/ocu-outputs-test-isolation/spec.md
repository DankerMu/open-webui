# Security outputs fixture isolation

## Purpose

Keep the security suite's real application requests bound to their seeded temporary workspace, independent of cached modules, and restore process state after each fixture lifetime.

## ADDED Requirements

### Requirement: Security requests use one coherent test workspace

The security app fixture SHALL bind application, recovery and broker operations to the same test-owned workspace for its entire client lifetime. Previously collected or executed Office cases SHALL NOT cause a seeded normal outputs request to use another workspace or mismatched error authority. The fixture SHALL exercise the real endpoint and recovery behavior rather than substitute a response or bypass recovery.

#### Scenario: Office modules already exist

- **WHEN** Office cases have been collected or executed before the seeded security outputs request
- **THEN** the request returns HTTP200 against the seeded fixture workspace without an escaped recovery exception
- **AND** the same result holds when the target is executed alone or before those cases under canonical collection

### Requirement: Isolation preserves security assertions

The fixture repair SHALL preserve the existing path-traversal, authentication, retired-upload-route disclosure, upload/download/archive and unknown-chat non-creation assertions. It SHALL NOT skip or weaken them to make the outputs request pass.

#### Scenario: Missing credentials and unsafe paths

- **WHEN** the existing missing-token, malicious-chat and direct traversal cases run with the isolated fixture
- **THEN** their existing401,400 and403 assertions remain active and pass
- **AND** retired read routes expose no seeded filename or content hash and unknown chats remain absent

### Requirement: Fixture lifetime restores prior process state

The fixture SHALL close its client before restoring the prior relevant module objects and complete environment. Restoration SHALL occur on successful completion and on an assertion failure inside the fixture lifetime. Test-owned client or workspace references SHALL NOT be reused across cases.

#### Scenario: Successful request followed by a failing test

- **WHEN** a real request succeeds and the test then raises an intentional assertion
- **THEN** fixture teardown still closes the client and restores the prior module objects and environment
- **AND** the intentional failure remains visible rather than being swallowed
