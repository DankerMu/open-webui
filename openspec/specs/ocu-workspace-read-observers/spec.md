# ocu-workspace-read-observers Specification

## Purpose

Keep workspace-content safety observations bound to the actual protected file throughout replacement, without confusing later resources or weakening pause and no-read assertions.

## Requirements

### Requirement: Read observers retain the resource they identify

Workspace-read observers for resolution, restore, publish-fence and notice tests SHALL retain a live descriptor to the protected resource throughout their observation window and derive its identity from that descriptor. A later unrelated resource SHALL NOT be counted as the protected file merely because its numeric identity matches a stale path stat. Hooks SHALL be removed before the owned descriptor is closed, on normal completion and failure.

#### Scenario: Workspace replacement precedes an index read

- **WHEN** an operation replaces the observed workspace file and then reads its index after releasing the pause
- **THEN** the observer remains bound to the retained original workspace resource and does not classify the index read as workspace content
- **AND** actual protected-content reads still satisfy the existing pause assertions

#### Scenario: Protected resource is renamed or unlinked while retained

- **WHEN** the protected file loses its original pathname during the observation window
- **THEN** the observer continues to identify reads of that retained resource rather than switching to another file by pathname
- **AND** ownership ends with hook removal and descriptor closure

### Requirement: Stable observation preserves safety-test strength

The existing pause, read/no-read count, repeated-request, final-content, publication/refusal and resource-safety assertions SHALL remain active with unchanged strength. Every notice read-counter caller SHALL use the explicit observation scope; no compatibility path, pathname exclusion, skip or timeout increase SHALL substitute for resource binding.

#### Scenario: Protected content is read before verified pause

- **WHEN** an injected operation attempts a real read of the protected workspace resource while pause is false
- **THEN** the existing pause assertion fails
- **AND** the original failure remains observable after owned hook and descriptor cleanup

#### Scenario: Repeated notice request does not read content

- **WHEN** the notice tests reset their counter and issue an unchanged-sample repeated request
- **THEN** the same protected-resource counter continues to enforce zero reads
- **AND** the foreign-file, oversized-file and final-content safety assertions remain unchanged
