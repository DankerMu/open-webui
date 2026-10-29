## ADDED Requirements

### Requirement: The real-SPA browser harness runs on pull requests

The preview embedding browser harness SHALL run automatically on every pull request that changes the workspace SPA, the server code it captures, or the harness itself, with a pinned Playwright version and its browser, and without repository secrets. Tests that need node SHALL find it through `OCU_TEST_NODE` or `PATH` only and SHALL fail with a message naming `OCU_TEST_NODE` when neither provides one.

#### Scenario: A pull request touching the SPA runs the harness

- **WHEN** a pull request changes a workspace SPA asset or the harness
- **THEN** the harness runs against the pull request head and its result is reported on the pull request

#### Scenario: Node is not available

- **WHEN** node is not on `PATH` and `OCU_TEST_NODE` is unset
- **THEN** the tests that need node fail with a message naming `OCU_TEST_NODE` instead of using a machine-specific path or skipping
