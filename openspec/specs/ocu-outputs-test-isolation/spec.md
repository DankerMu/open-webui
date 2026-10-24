# ocu-outputs-test-isolation Specification

## Purpose

Keep real output and security test requests bound to their selected temporary workspace and prefix, independent of inherited process configuration or cached modules, and restore process state after each fixture lifetime.

## Requirements

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

### Requirement: Output fixture prefix selection overrides inherited configuration

The output-endpoint app fixture SHALL interpret `prefix=None` as an unset public-prefix variable before application import, independently of the parent environment. Explicit empty-string root mode, explicit `/ocu` mode and the existing default SHALL retain their behavior. Real static requests and generated output URLs SHALL reflect the selected mode. Normal and exceptional fixture exit SHALL restore the complete prior environment and selected prior module objects by identity.

#### Scenario: Inherited prefix does not survive an unset selection

- **WHEN** the parent supplies `/ocu` and the output fixture selects `None`
- **THEN** a real root static request succeeds and seeded output URLs use the root rather than `/ocu`
- **AND** the public-prefix variable is absent during that fixture lifetime

#### Scenario: Explicit root and prefixed modes remain distinct

- **WHEN** the fixture selects an explicit empty string, explicit `/ocu`, or its existing default
- **THEN** static mounts and generated output URLs retain the corresponding root or prefixed behavior
- **AND** explicit empty configuration remains distinguishable from an unset variable

#### Scenario: Parent state survives normal and failing requests

- **WHEN** actual static/output requests finish normally or the test raises an intentional assertion after them
- **THEN** the client closes and the complete original environment and selected original module object identities are restored
- **AND** the intentional assertion remains observable

### Requirement: Unstable-read regression is deterministic

The broker's unstable-hash-read regression test SHALL change the file during the read in a way the broker can detect on every supported filesystem, independent of timestamp granularity, and SHALL still assert that the read is rejected and no partial index is written.

#### Scenario: Repeated runs on Linux

- **WHEN** the test runs 30 times in isolation in the `python:3.13` container as a non-root user
- **THEN** every run passes
