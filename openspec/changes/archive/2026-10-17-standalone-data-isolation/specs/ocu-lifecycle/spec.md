# Spec Delta

## ADDED Requirements

### Requirement: Standalone lifecycle tests own their data root

The Docker-manager credential-injection test module SHALL use a private test-owned temporary data root throughout imports, reloads and real metadata writes, under direct standalone and pytest execution. Neither an absent data-root setting nor a previously cached root SHALL redirect writes outside that ownership. Teardown SHALL restore prior data-root environment and relevant module state, and remove fixture-owned data on success or test failure. Existing credential, startup, DNS and runtime-selection assertions SHALL remain intact.

#### Scenario: Standalone without a caller data directory

- **WHEN** the standalone module runs without `BASE_DATA_DIR`
- **THEN** all module tests pass and metadata is written only inside fixture-owned temporary storage, never under `/data`

#### Scenario: Cached or caller-provided root

- **WHEN** a prior import cached `/data` or a caller-owned path before the module's reload helper runs
- **THEN** container-creation metadata still uses the private fixture root
- **AND** the prior root and unrelated files remain unchanged

#### Scenario: Ownership ends after success or failure

- **WHEN** the fixture lifetime completes, including an assertion failure inside a test body
- **THEN** the prior root setting and relevant cached-module state are restored and the private root no longer exists
- **AND** cleanup does not remove caller-owned data

#### Scenario: Pytest retains existing behavior

- **WHEN** pytest selects the module without a caller-supplied data directory and alongside its adjacent lifecycle consumers
- **THEN** existing cases and their assertions pass without skips, changed Docker guards or alternate production metadata behavior
