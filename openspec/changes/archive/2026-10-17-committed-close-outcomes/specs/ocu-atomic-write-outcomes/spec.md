# Spec Delta

## Purpose

Preserve the visible atomic-write outcome and failure provenance when final owned-directory cleanup fails in the outputs index, import receipts or Office state writers.

## ADDED Requirements

### Requirement: Final directory cleanup distinguishes committed successors

After replacement and containing-directory synchronization succeed, an owned final-directory close failure SHALL remain an error and SHALL explicitly identify the committed atomic resource: `outputs_index`, `import_receipts` or `office_state`. The complete successor SHALL remain readable; a committed Office successor SHALL retain every immutable version blob it references. The outcome SHALL preserve the underlying close errors and SHALL NOT claim rollback, corrupt state, an unsaved receipt, successful completion of the enclosing publication, or deployment power-loss durability. A failed close SHALL NOT be retried merely to establish descriptor retirement.

#### Scenario: Each atomic writer fails its final close

- **WHEN** the index, receipt or Office writer successfully replaces and synchronizes its successor and a final directory close raises
- **THEN** the operation fails with the committed resource and original close error inspectable, and the complete successor remains readable
- **AND** every remaining owned final-directory descriptor receives its close attempt without rewriting or deleting that successor

#### Scenario: Office version is referenced by committed state

- **WHEN** storing a new immutable version commits its Office metadata and final directory cleanup fails
- **THEN** the committed-close error propagates and the referenced blob retains its exact content
- **AND** cleanup does not treat that outcome as precommit failure

### Requirement: Primary failures retain precedence over final cleanup

An earlier write, replacement or synchronization failure SHALL remain the primary inspectable error with its original classification and cause. Every final-directory close failure SHALL remain inspectable alongside it, and a failed close SHALL NOT prevent attempts on the remaining owned final-directory descriptors. Before replacement, the predecessor SHALL remain intact; after replacement, the complete successor SHALL remain visible without claiming successful synchronization. Existing temporary-file-close behavior and borrowed descriptor ownership SHALL remain unchanged.

#### Scenario: Replacement refusal and cleanup both fail

- **WHEN** replacement fails before publication and one or more final directory closes also fail
- **THEN** the replacement failure remains primary, all cleanup errors are retained and every owned final directory receives one close attempt
- **AND** the predecessor remains byte-identical and no committed-success classification is reported

#### Scenario: Directory synchronization and cleanup both fail

- **WHEN** the containing-directory synchronization fails after replacement and final directory cleanup also fails
- **THEN** the existing synchronization failure remains primary, including the established Office `state_durability` mapping
- **AND** the complete successor remains visible, secondary close errors remain inspectable and all final directory closes are attempted

### Requirement: Public consumers report the committed resource accurately

Upload, outputs listing and affected Office public consumers SHALL retain HTTP500 for a committed-close-only failure and expose the stable reason `committed_close_failed`, `committed: true` and the specific `resource`. These fields SHALL describe only that atomic resource, not successful completion of the entire request. Existing response envelopes SHALL be retained and host paths or close-error text SHALL NOT enter the public detail. Ordinary errors, authentication/refusal order, receipt replay, revision allocation and publication recovery SHALL retain their established policies.

#### Scenario: Receipt close error followed by same-id retry

- **WHEN** an upload commits its attachment receipt but final directory close fails
- **THEN** HTTP500 identifies committed `import_receipts` rather than saying the file was not saved
- **AND** a retry with the same attachment id returns the existing receipt metadata and does not publish another file

#### Scenario: Valid committed Office state is not corruption

- **WHEN** an authenticated Office callback or browser operation reaches a committed-close-only failure in Office state persistence
- **THEN** HTTP500 reports `committed_close_failed` for `office_state`, not `state_corrupt` or `storage_low`
- **AND** the saved state and any referenced version remain valid for the established retry/recovery path

#### Scenario: Outputs index and recovery errors remain distinct

- **WHEN** listing or an affected Office publication consumer observes a committed-close-only failure
- **THEN** the externally reported error identifies the actual committed resource without declaring the whole publication complete
- **AND** retained recovery obligations and existing no-extra-replacement/no-extra-revision behavior remain unchanged
