## ADDED Requirements

### Requirement: Repeatable identity-transition browser case

The A-T10 identity-transition browser case SHALL start from the state it asserts on: before its first assertion it SHALL restore the stub scenario rows of the `deleted` and `partial` chats to the values the harness provisioned and SHALL reset the persisted sidebar preferences of those two chats to the empty object through the workspace preferences endpoint, so that a run repeated against one owned stack observes the same initial listing and selection as the first run. The case's transitions and assertions SHALL stay unchanged.

#### Scenario: Repeated run against one owned stack

- **WHEN** A-T10 runs a second time against the same owned stack after a previous run left the `deleted` chat on `deleted_after`, the `partial` chat on `partial_after`, and a persisted selection
- **THEN** the case restores the rows and clears the selection before asserting, finds `report.html` in both chats, and passes

#### Scenario: First run on a fresh stack

- **WHEN** A-T10 runs once on a freshly provisioned stack
- **THEN** the reset writes the provisioned rows and empty preferences, and the case asserts the same states and screenshots as before
