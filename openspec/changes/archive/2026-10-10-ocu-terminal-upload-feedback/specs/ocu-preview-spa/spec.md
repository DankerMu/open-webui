## ADDED Requirements

### Requirement: Terminal upload failure feedback and cleanup

Standalone preview and terminal embedding SHALL share upload failure handling. An HTTP failure or rejected upload request SHALL produce visible localized dashboard feedback identifying the failed file and retry action, remove its selected temporary file input, and emit no unhandled rejection. Feedback SHALL render as text without interpreting server response bodies as HTML. A failed selection SHALL NOT be represented as successful completion or automatically retried; already completed files SHALL NOT be rolled back. Successful completion SHALL preserve dashboard refresh and standalone Files refresh.

#### Scenario: HTTP refusal in either mounted surface

- **WHEN** an upload returns HTTP4xx or5xx in standalone preview or `embed=terminal`
- **THEN** the dashboard visibly reports the failed file and retry guidance instead of silently accepting it
- **AND** its selected temporary input is removed and no unhandled rejection occurs

#### Scenario: Network rejection in either mounted surface

- **WHEN** an upload request rejects in either mounted surface
- **THEN** visible failure feedback remains available, its selected temporary input is removed, and no unhandled rejection occurs

#### Scenario: Successful upload after a failure

- **WHEN** the user selects a file again and the upload completes successfully
- **THEN** stale failure feedback is cleared and the dashboard refreshes
- **AND** standalone preview also refreshes Files through its existing completion callback, while terminal embedding does not mount or request Files

#### Scenario: Sequential selection stops on failure

- **WHEN** a selected batch reaches its first failed upload
- **THEN** later files in that selection are not attempted and the batch is not reported as completed
- **AND** earlier successful uploads remain intact without automatic rollback or retry
