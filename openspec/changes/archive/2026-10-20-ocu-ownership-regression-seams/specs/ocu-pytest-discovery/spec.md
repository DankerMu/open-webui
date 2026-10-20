## MODIFIED Requirements

### Requirement: Auth and WebSocket fixtures restore module ownership

The auth-guard app fixture and the WebSocket server-reload fixture SHALL evict and freshly import their owned app-module family only for the owning test, and SHALL restore every owned module key to its exact entry-time object, or to absence when absent at entry, after normal completion and after a test-body failure. They SHALL share the existing module-ownership helper rather than a second restore implementation. The WebSocket server reload SHALL require the scope value its ownership fixture yields, so that a caller cannot import the server outside the owned scope. The ownership regressions SHALL create a prefix-owned module inside the owned scope and SHALL report the child run's captured output when the child times out, crashes or produces no parsable JUnit file. Auth and WebSocket revocation assertions and production behavior SHALL remain unchanged.

#### Scenario: Owner completes normally

- **WHEN** a test uses either owner with its owned modules present at entry, or absent at entry, and completes
- **THEN** after the owner's real pytest teardown each owned key holds its exact entry-time object, and keys absent at entry are absent

#### Scenario: Test body fails

- **WHEN** a real pytest test body using either owner fails, with its owned modules present or absent at entry
- **THEN** that test's failure is reported
- **AND** a following test in the same process observes the owned keys restored to their exact entry-time objects, and keys absent at entry absent

#### Scenario: Direct reload caller

- **WHEN** a WebSocket test calls the server reload directly instead of through the app fixture
- **THEN** the reload accepts only the scope value yielded by the ownership fixture, runs inside that owned scope, and its modules are restored after the test
- **AND** a caller that omits the ownership fixture fails at the reload call with an error that names the ownership fixture, before any server import

#### Scenario: Prefix-owned module imported inside the scope

- **WHEN** an owner with a prefix-owned family runs with that family present or absent at entry, and a module under the prefix is imported inside the owned scope
- **THEN** after the owner's teardown the key holds its exact entry-time object when present at entry, and is absent when absent at entry

#### Scenario: Child run diagnostics

- **WHEN** the body-failure regression's child pytest run times out, exits without writing its JUnit file, or leaves a JUnit path whose content cannot be parsed
- **THEN** the regression fails with a message that contains the child's captured stdout and stderr
