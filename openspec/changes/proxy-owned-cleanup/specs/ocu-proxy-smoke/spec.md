## ADDED Requirements

### Requirement: Best-effort cleanup of run-owned data

The smoke harness SHALL attempt all eligible run-owned chat and user cleanup operations even when another cleanup operation fails with an HTTP or transport error. Eligibility SHALL remain limited to this run's recorded IDs and exact owner or foreign email matches. It SHALL report one aggregate cleanup failure containing only operation kinds and HTTP statuses or exception classes. It SHALL NOT include credentials, URLs, identifiers, email addresses, response bodies or exception messages. It SHALL preserve an existing nonzero run status, turn a successful run nonzero on cleanup failure, and continue its existing process, sentinel and scratch cleanup lifecycle without adding retries.

#### Scenario: Failed first owned delete

- **WHEN** the first owned chat deletion returns HTTP 500 or raises a transport error
- **THEN** all remaining owned chats, known users and exact-email fallbacks are attempted, unrelated data stays untouched, and the aggregate is redacted

#### Scenario: Failed email fallback operation

- **WHEN** a fallback lookup fails or one deletion among exact-email results fails
- **THEN** the other eligible result deletions and fallback lookups are attempted without deleting partial email matches

#### Scenario: Cleanup preserves the run verdict and resource cleanup

- **WHEN** data cleanup fails after a run returns 0, 1 or is interrupted with 130
- **THEN** the final code is respectively 1, 1 or 130, with process, sentinel and scratch cleanup retained

#### Scenario: Successful and unauthenticated cleanup

- **WHEN** each owned deletion returns 200, 204 or 404
- **THEN** no cleanup error is reported
- **WHEN** no admin cookie was acquired
- **THEN** cleanup makes no data requests
