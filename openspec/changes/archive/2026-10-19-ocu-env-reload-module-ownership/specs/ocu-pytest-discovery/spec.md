## ADDED Requirements

### Requirement: Environment-reload tests restore module ownership

The startup-warning tests and the OpenCode alias-map tests SHALL evict and freshly import their owned modules only within each test and SHALL restore every owned module key to its exact entry-time object, or to absence when absent at entry, after normal completion and after a test-body failure. They SHALL use the shared module-ownership helper. Existing warning and alias assertions and production behavior SHALL remain unchanged.

#### Scenario: Startup-warning test finishes

- **WHEN** a startup-warning test runs through its real test-case lifecycle, with `docker_manager` present or absent at entry, and its body either completes or fails
- **THEN** afterwards `docker_manager` and its submodule keys hold their exact entry-time objects, and keys absent at entry are absent

#### Scenario: Alias-map test finishes

- **WHEN** an alias-map test imports a fresh CLI runtime, with its owned modules present or absent at entry, and its body either completes or fails
- **THEN** afterwards the CLI runtime, Docker manager and outputs broker keys hold their exact entry-time objects, and keys absent at entry are absent
- **AND** the alias-map tests' automatic fixture still depends on that module ownership
