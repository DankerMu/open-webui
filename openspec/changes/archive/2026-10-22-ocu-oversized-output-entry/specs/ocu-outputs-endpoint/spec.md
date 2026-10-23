## MODIFIED Requirements

### Requirement: Broker-backed compatible metadata

Authorized GET /api/outputs/{chat_id} SHALL reconcile broker state and return chat_id, files, total, timestamp, revision and next_cursor. Entries SHALL carry file_id, path, name, size, mtime_ns, revision, cached hash, too_large, type, mime, url and compatibility modified seconds. An entry over the per-file limit SHALL carry a null hash and too_large true; every other entry SHALL carry too_large false. Files SHALL be ordered by relative path, default page100, maximum1000. HTTP metadata SHALL not start or resume a sandbox.

#### Scenario: Metadata and prefix

- **WHEN** an authorized client lists a nested output whose name contains spaces, Unicode, percent, question or hash
- **THEN** its URL has the configured public prefix exactly once, encodes filename characters and retrieves that file through the existing authenticated files route
- **AND** id/revision/hash come from the persisted broker and modified remains available

#### Scenario: Pagination

- **WHEN** more files exist than the requested limit
- **THEN** the response has the total and a revision-bound next_cursor, and subsequent pages contain the remaining paths without duplication
- **AND** invalid limits return422, malformed/out-of-range cursors400, and stale cursors409

#### Scenario: Oversized file listed

- **WHEN** an authorized client lists a workspace containing one file over the per-file limit
- **THEN** the response is200 with every other file and an entry for the oversized file with too_large true and a null hash

### Requirement: Explicit broker failure mapping

Retryable filesystem instability SHALL return503 with Retry-After1; exceeded resource bounds413, where a single file over the per-file limit is not an exceeded bound for listing; persisted corruption, unsafe paths, unsupported names, durability and other broker/I/O failures500. Details SHALL not expose host filesystem paths. No error SHALL be converted into an empty successful listing or reset broker state.

#### Scenario: Corrupt persisted authority

- **WHEN** an authorized listing encounters a corrupt persisted index
- **THEN** it returns500 without exposing the host path and preserves the index bytes
