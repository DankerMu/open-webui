## ADDED Requirements

### Requirement: Secondary cleanup failures share one recording rule

When a secondary cleanup failure is retained on a propagating primary error, OCU SHALL record it through a single shared implementation. That implementation appends the failure to the primary's `cleanup_errors` tuple in occurrence order, and adds a note of the form `<what> cleanup also failed: <Type>: <error>`. The import-receipt writer and the Office version-blob publisher SHALL use that implementation, and no other server code SHALL assign `cleanup_errors`. Recording a cleanup failure SHALL NOT alter the primary error's identity or any `close_errors` it carries.

#### Scenario: Two cleanup failures on one primary

- **WHEN** two secondary cleanup failures are recorded on the same propagating primary error
- **THEN** its `cleanup_errors` holds both failures in occurrence order and its notes describe each in order

#### Scenario: Existing caller output is unchanged

- **WHEN** an import-receipt replacement fails and its temporary-file removal also fails
- **THEN** the propagating replacement error's `cleanup_errors` contains exactly the removal error
- **AND** its only cleanup note reads `Temporary receipt cleanup also failed: <Type>: <error>`
