## Purpose

Keep repository source-format checks independent of generated local review state without hiding formatting errors in tracked files.

## ADDED Requirements

### Requirement: Generated review state is outside the formatting boundary

Repository format commands SHALL exclude `.review-gate.json` without rewriting it or weakening checks on tracked source files. Formatter options, versions and the repository-wide source glob SHALL remain unchanged.

#### Scenario: Nonformatted generated state coexists with formatted source

- **WHEN** formatted tracked source and a non-Prettier-formatted `.review-gate.json` are present
- **THEN** `make fmt-check` succeeds and leaves the generated state byte-identical

#### Scenario: Tracked JSON formatting remains enforced

- **WHEN** a tracked JSON file has deliberately nonconformant formatting while generated state is present
- **THEN** `make fmt-check` fails and identifies the tracked file
- **AND** restoring that file returns the check to success without modifying generated state
