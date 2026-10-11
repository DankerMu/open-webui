# frontend-test-discovery Specification

## Purpose

Keep frontend test commands independent of unrelated build snapshots while retaining the repository's official suite coverage.

## Requirements

### Requirement: Shared frontend discovery is bounded to official roots

Frontend test entrypoints SHALL discover suites under the approved `src/` and `scripts/` roots using the supported test/spec filename families and standard dependency/build exclusions. They SHALL NOT discover suites under unrelated roots, including `.run/` snapshots. Selecting tests SHALL NOT require deleting or modifying those snapshots.

#### Scenario: Snapshot copies coexist with official suites

- **WHEN** copied test suites exist beneath `.run/local-test`, `.run/vps-test` or another unrelated build root
- **THEN** the Make and npm frontend test entrypoints select every official suite and none of the copied suites
- **AND** snapshot content remains unchanged

#### Scenario: Coverage uses the same discovery boundary

- **WHEN** the frontend coverage command adds its existing end-to-end exclusion
- **THEN** official suite discovery remains complete and unrelated snapshot suites remain excluded

#### Scenario: Developer adds a supported test filename

- **WHEN** a supported test/spec filename is added within an approved root
- **THEN** discovery includes it without requiring a Git commit or a filename-specific allowlist update
