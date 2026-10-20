# ocu-atomic-write-outcomes Specification

## Purpose

Preserve the visible atomic-write outcome and failure provenance when final owned-directory cleanup fails in the outputs index, import receipts or Office state writers, when import-receipt temporary-file cleanup fails before commit, and when Office version-blob publication, blob removal or the receipt-replay barrier fails to close an owned directory, recording secondary cleanup failures through one shared rule and reporting a close-only version-blob failure on the callback route as `state_close_failed`.

## Requirements

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

### Requirement: Receipt temporary cleanup retains the primary failure

When an import-receipt write fails before replacement, the receipt writer SHALL attempt to remove its private temporary file and SHALL propagate the failure that entered its pre-commit cleanup as the primary error with its original identity and classification. Existing temporary-descriptor close behavior, which can itself become that failure, SHALL remain unchanged. A temporary-file removal failure other than an already-missing file SHALL remain inspectable on that primary error and SHALL NOT replace it. The predecessor receipts SHALL remain intact, and the upload endpoint SHALL keep its HTTP status and envelope while describing the failure that entered cleanup.

#### Scenario: Pre-commit failure and cleanup failure

- **WHEN** a receipt write, synchronization or replacement fails before replacement, the temporary descriptor closes normally, and removing the temporary file also fails
- **THEN** the initiating failure propagates as the primary error, the removal error is retained on it, and the predecessor receipts are unchanged

#### Scenario: Temporary file already missing

- **WHEN** a pre-commit receipt failure occurs and the temporary file is already absent at cleanup
- **THEN** the initiating failure propagates without any recorded cleanup error

#### Scenario: Upload reports the initiating failure

- **WHEN** an upload's receipt replacement and temporary-file removal both fail
- **THEN** the endpoint returns its existing HTTP 500 response whose detail describes the replacement failure, not the removal failure

### Requirement: Office blob and replay-barrier cleanup attempts every owned close

Office version-blob publication, version-blob removal and the callback replay barrier SHALL attempt to close every owned directory descriptor exactly once without retrying a failed close. An earlier operation or synchronization failure SHALL remain the primary error with every close failure retained on it; a close-only failure SHALL remain observable. A close-only failure after a blob is linked SHALL NOT record version metadata for that attempt, and the content-addressed blob SHALL remain reusable by a later publication of the same content. A close-only replay-barrier failure during final or forcesave receipt replay SHALL be reported as HTTP 500 with reason `state_close_failed`, not `state_corrupt`; a replay-barrier synchronization failure SHALL remain `state_durability`, and replay ordering SHALL remain unchanged. On the callback route, `state_close_failed` covers the replay barrier and any close-only version-blob publication failure that reaches the callback; other close-only failures keep their existing classification. No power-loss behavior or post-close descriptor state is claimed.

#### Scenario: A close fails part-way through cleanup

- **WHEN** a close fails at an early or intermediate owned descriptor in any of the three owners
- **THEN** every owned descriptor still receives exactly one close attempt and no close is retried

#### Scenario: Operation failure and close failure coincide

- **WHEN** an owner's operation or synchronization fails and a close also fails during cleanup
- **THEN** the operation or synchronization failure remains primary with the close failure retained on it

#### Scenario: Close-only failure after blob publication

- **WHEN** publishing new version content links and synchronizes the blob but a final close fails
- **THEN** the version store call fails, no new version metadata is recorded, and a later publication of the same content records one version reusing the blob

#### Scenario: Close-only replay-barrier failure

- **WHEN** a final or forcesave receipt replay reaches the replay barrier, synchronization succeeds, and a close fails
- **THEN** the callback returns HTTP 500 with reason `state_close_failed`, not `state_corrupt`
- **AND** a replay-barrier synchronization failure still returns `state_durability`

### Requirement: Secondary cleanup failures share one recording rule

When a secondary cleanup failure is retained on a propagating primary error, OCU SHALL record it through a single shared implementation. That implementation appends the failure to the primary's `cleanup_errors` tuple in occurrence order, and adds a note of the form `<what> cleanup also failed: <Type>: <error>`. The import-receipt writer and the Office version-blob publisher SHALL use that implementation, and no other server code SHALL assign `cleanup_errors`. Recording a cleanup failure SHALL NOT alter the primary error's identity or any `close_errors` it carries.

#### Scenario: Two cleanup failures on one primary

- **WHEN** two secondary cleanup failures are recorded on the same propagating primary error
- **THEN** its `cleanup_errors` holds both failures in occurrence order and its notes describe each in order

#### Scenario: Existing caller output is unchanged

- **WHEN** an import-receipt replacement fails and its temporary-file removal also fails
- **THEN** the propagating replacement error's `cleanup_errors` contains exactly the removal error
- **AND** its only cleanup note reads `Temporary receipt cleanup also failed: <Type>: <error>`

### Requirement: Callback reports a close-only version-blob failure as state_close_failed

When a close-only version-blob publication failure reaches the Office callback, the callback SHALL return HTTP 500 with reason `state_close_failed`, not `state_corrupt`. Close-only means the publication failed only because a final owned-directory close failed, with no earlier write, link or synchronization failure. This applies whether the failure came from storing the callback's content or from publication recovery that the callback drives. The callback SHALL log the refusal as an error with that reason, as it does for the replay barrier.

The failure SHALL remain observable as an `OSError` carrying every close failure, so callers outside the callback keep their existing handling.

When the failure came from storing the callback's own content:

- no version metadata SHALL be recorded;
- a later delivery of the same content SHALL reuse the blob;
- for a status-6 forcesave callback, the pending save sequence and saving state SHALL remain unchanged.

A close failure whose error is out-of-space SHALL remain `storage_low`, with its existing recovery. No commit or power-loss durability is claimed.

#### Scenario: Close-only failure while storing callback content

- **WHEN** a callback's content is linked into the version store and synchronized, but a final directory close fails
- **THEN** the callback returns HTTP 500 with reason `state_close_failed`
- **AND** no new version is recorded

#### Scenario: Forcesave keeps its pending save

- **WHEN** a status-6 forcesave callback hits a close-only version-blob failure that is not out-of-space
- **THEN** the session keeps its pending save sequence and saving state

#### Scenario: Retry after a close-only failure

- **WHEN** the same callback content is delivered again after a close-only version-blob failure
- **THEN** the blob is reused and exactly one version is recorded
