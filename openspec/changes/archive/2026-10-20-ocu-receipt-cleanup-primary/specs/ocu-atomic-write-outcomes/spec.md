## ADDED Requirements

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
