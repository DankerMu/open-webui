## Purpose

Expose persisted OCU output identity through authenticated, paginated metadata with usable public URLs and safe conditional GET responses.

## ADDED Requirements

### Requirement: Broker-backed compatible metadata

Authorized GET /api/outputs/{chat_id} SHALL reconcile broker state and return chat_id, files, total, timestamp, revision and next_cursor. Entries SHALL carry file_id, path, name, size, mtime_ns, revision, cached hash, type, mime, url and compatibility modified seconds. Files SHALL be ordered by relative path, default page100, maximum1000. HTTP metadata SHALL not start or resume a sandbox.

#### Scenario: Metadata and prefix

- **WHEN** an authorized client lists a nested output whose name contains spaces, Unicode, percent, question or hash
- **THEN** its URL has the configured public prefix exactly once, encodes filename characters and retrieves that file through the existing authenticated files route
- **AND** id/revision/hash come from the persisted broker and modified remains available

#### Scenario: Pagination

- **WHEN** more files exist than the requested limit
- **THEN** the response has the total and a revision-bound next_cursor, and subsequent pages contain the remaining paths without duplication
- **AND** invalid limits return422, malformed/out-of-range cursors400, and stale cursors409

### Requirement: Representation-safe conditional listing

Listing SHALL reconcile and validate the requested page before evaluating If-None-Match. A weak ETag SHALL identify equivalent page metadata excluding request timestamp, including listing revision, effective limit and emitted URLs. GET comparison SHALL accept weak/strong quoted forms, lists and wildcard; malformed values SHALL be nonmatches. Matching validators SHALL yield an empty304 with ETag and the existing no-cache/no-store/must-revalidate policy; mismatches SHALL return200.

#### Scenario: Unchanged versus external changes

- **WHEN** a client repeats a listing with its validator and files are unchanged
- **THEN** the response is304 with no output-content reads and no index rewrite
- **AND** a subsequent observed size/path event with the old validator returns200 and the new revision

#### Scenario: Page identity and authorization

- **WHEN** the request selects a different page or effective limit using another page's validator
- **THEN** it receives200 with the requested representation
- **AND** an unauthorized request remains401 even with a matching validator or wildcard

#### Scenario: Failure precedes validator

- **WHEN** reconciliation or cursor validation fails with If-None-Match present
- **THEN** the response reports the failure rather than304

### Requirement: Explicit broker failure mapping

Retryable filesystem instability SHALL return503 with Retry-After1; exceeded resource bounds413; persisted corruption, unsafe paths, unsupported names, durability and other broker/I/O failures500. Details SHALL not expose host filesystem paths. No error SHALL be converted into an empty successful listing or reset broker state.

#### Scenario: Corrupt persisted authority

- **WHEN** an authorized listing encounters a corrupt persisted index
- **THEN** it returns500 without exposing the host path and preserves the index bytes
