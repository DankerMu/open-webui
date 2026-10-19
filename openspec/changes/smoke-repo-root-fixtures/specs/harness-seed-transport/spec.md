## ADDED Requirements

### Requirement: Smoke fixtures are bound to the script's repository

Generic smoke SHALL pass Hurl only the top-level smoke fixtures of the repository that contains the invoked smoke script, regardless of the caller's working directory, and SHALL establish that repository as its working directory before resolving credentials or starting Hurl. A foreign working directory's own smoke fixtures SHALL NOT be selected.

#### Scenario: Standalone invocation from a foreign directory

- **WHEN** the smoke script is invoked by absolute path from a directory that contains its own smoke fixtures
- **THEN** Hurl runs exactly the script repository's smoke fixtures and none of the foreign ones
- **AND** credential transport remains private and its scratch is removed

#### Scenario: Make invocation from the repository root

- **WHEN** smoke runs through the Make target from the repository root
- **THEN** it runs the repository fixture set as before
