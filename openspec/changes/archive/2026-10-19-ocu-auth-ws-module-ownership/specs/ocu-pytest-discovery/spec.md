## ADDED Requirements

### Requirement: Auth and WebSocket fixtures restore module ownership

The auth-guard app fixture and the WebSocket server-reload fixture SHALL evict and freshly import their owned app-module family only for the owning test, and SHALL restore every owned module key to its exact entry-time object, or to absence when absent at entry, after normal completion and after a test-body failure. They SHALL share the existing module-ownership helper rather than a second restore implementation. Auth and WebSocket revocation assertions and production behavior SHALL remain unchanged.

#### Scenario: Owner completes normally

- **WHEN** a test uses either owner with its owned modules present at entry, or absent at entry, and completes
- **THEN** after the owner's real pytest teardown each owned key holds its exact entry-time object, and keys absent at entry are absent

#### Scenario: Test body fails

- **WHEN** a real pytest test body using either owner fails, with its owned modules present or absent at entry
- **THEN** that test's failure is reported
- **AND** a following test in the same process observes the owned keys restored to their exact entry-time objects, and keys absent at entry absent

#### Scenario: Direct reload caller

- **WHEN** a WebSocket test calls the server reload directly instead of through the app fixture
- **THEN** it runs inside the same owned scope and its modules are restored after the test
