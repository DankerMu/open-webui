## MODIFIED Requirements

### Requirement: Explicit broker failure mapping

Retryable filesystem instability and running out of space (an `errno.ENOSPC` OS error, or the Office storage-low refusal, during the listing's index write or publish recovery) SHALL return 503 with `Retry-After: 1`. Exceeded resource bounds SHALL return 413; a single file over the per-file limit is not an exceeded bound for listing. Persisted corruption, unsafe paths, durability and other broker or I/O failures SHALL return 500. An unsupported output name is not a listing failure. Details SHALL not expose host filesystem paths. No error SHALL be converted into an empty successful listing or reset broker state.

#### Scenario: Corrupt persisted authority

- **WHEN** an authorized listing encounters a corrupt persisted index
- **THEN** it returns 500 without exposing the host path and preserves the index bytes

#### Scenario: Disk full during a listing

- **WHEN** a listing's publish recovery or index write fails with an out-of-space OS error
- **THEN** the listing answers 503 with `Retry-After: 1` and no host path, and a later listing succeeds once space returns

#### Scenario: Other filesystem error

- **WHEN** a listing fails with an OS error other than out-of-space
- **THEN** the listing answers 500 as before
