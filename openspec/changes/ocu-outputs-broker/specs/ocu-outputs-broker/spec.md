## Purpose

Give OCU outputs persistent file identities and monotonic per-chat revisions with bounded, safe reconciliation, independent of endpoint and UI wiring.

## ADDED Requirements

### Requirement: Persistent identity and event revisions

The broker SHALL persist active path and content-fingerprint indexes, UUID file_ids, tombstones and one monotonic counter per chat. Each observed addition, size change, rename or deletion SHALL increment the counter once and stamp the affected entry or tombstone. Unchanged entries SHALL retain their id and revision. Listing revision SHALL be the current counter, preserved across broker/process restarts. Entry metadata SHALL include relative path, name, size, mtime_ns, revision and cached SHA-256; mtime SHALL not determine identity or version.

#### Scenario: Independent entry stamps

- **WHEN** a.html changes size while b.html does not
- **THEN** the counter increments once, a.html keeps its id with the new stamp, and b.html keeps its id and stamp

#### Scenario: Restart preserves authority

- **WHEN** a new broker/process reads an existing valid index
- **THEN** unchanged entries retain their ids/stamps and the next event advances the persisted counter

### Requirement: Cached hash rename evidence

The broker SHALL hash newly observed files and detected size changes and persist those fingerprints. Equal-size/equal-SHA256 pairs of paths removed and added in the same reconciliation SHALL be matched one-to-one deterministically as renames, retaining id and incrementing revision once. Equal-content files SHALL have distinct identities. Historical tombstones SHALL never be candidates for rename resurrection. Same-size in-place changes remain a documented detection blind spot.

#### Scenario: Rename retains identity

- **WHEN** indexed report.html is renamed to final.html between reconciliations without changing its content
- **THEN** final.html keeps report.html's id, its revision increments once, and the live id is not tombstoned

#### Scenario: Same-size different content is not a rename

- **WHEN** an indexed file disappears and another path appears with the same size but a different SHA-256
- **THEN** the old id is tombstoned and the new path receives a distinct id

#### Scenario: Duplicate content remains distinct

- **WHEN** multiple removed and added paths share one size/hash
- **THEN** deterministic one-to-one matching preserves separate ids without assigning one id to two active entries

### Requirement: Observed deletion and path reuse

A deletion observed by reconciliation SHALL persist a tombstone. A subsequently recreated path SHALL receive a new UUID, even if its bytes equal the tombstoned file. A delete/recreate entirely between polls SHALL follow active-path matching and SHALL be documented as unobservable without a file event system.

#### Scenario: Observed path reuse

- **WHEN** a.txt is indexed, a later reconcile observes it absent, and a subsequent reconcile observes a.txt again
- **THEN** the new entry has a new id and the prior id remains a tombstone

### Requirement: Unchanged discovery and bounded pages

Reconciliation SHALL discover current paths/sizes before reporting unchanged, hash no unchanged files and avoid rewriting an unchanged index. Pages SHALL be sorted by relative path and report total plus a revision-bound next cursor. Malformed/out-of-range/stale cursors SHALL fail explicitly. Defaults SHALL be page100 with maximum1000, active-file limit10000, per-file limit100MiB and index limit64MiB; explicitly configured positive limits SHALL be enforced before publishing a successor, without truncation or counter reset.

#### Scenario: Unchanged large directory

- **WHEN** 5000 previously indexed files remain unchanged
- **THEN** reconciliation computes zero hashes, preserves the counter and index file, and returns the requested page and total5000

#### Scenario: Paginated snapshot changes

- **WHEN** a client requests a subsequent page after a content/path event changed the listing revision
- **THEN** the stale cursor is rejected rather than mixed with the new snapshot

#### Scenario: Configured limit exceeded

- **WHEN** a scan or proposed index exceeds an active-file, file-size or index-size bound
- **THEN** reconciliation fails explicitly and the prior persisted index remains unchanged

### Requirement: Serialized atomic index updates

Every broker read-modify-write SHALL use the same canonical per-chat thread and filesystem lock as sandbox lifecycle. Concurrent processes SHALL not lose revisions or publish conflicting ids. Index updates SHALL atomically replace a complete durable successor. Corrupt indexes and failures before atomic replacement SHALL fail explicitly and preserve the prior index; a durability error after the replacement SHALL be reported and may leave the complete successor visible, never a partial index or reset counter. A read-only current-revision operation SHALL validate the persisted counter without starting a sandbox.

#### Scenario: Concurrent reconciliation

- **WHEN** two processes reconcile the same new file concurrently
- **THEN** both observe the same id/revision and exactly one addition is committed

#### Scenario: Invalid index or failed replacement

- **WHEN** persisted JSON/schema is corrupt or atomic replacement fails
- **THEN** no reset or partial successor is published and the existing index bytes remain intact

### Requirement: Confined regular-file discovery

The broker SHALL enumerate only non-hidden regular files beneath the chat outputs root, without following file/directory symlinks. A symlinked outputs root or index/control path SHALL fail explicitly. Files disappearing/changing during a read SHALL cause a retryable failure without partial index publication; directory-descriptor/no-follow traversal SHALL prevent path races from reading outside outputs.

#### Scenario: Symlink escapes

- **WHEN** outputs contains a file or directory symlink targeting outside data
- **THEN** the link contributes no listed entry and no outside content is opened or hashed

#### Scenario: File changes during hash

- **WHEN** a new or size-changed file cannot be read as a stable observation
- **THEN** reconciliation reports a retryable error and leaves the committed index unchanged
