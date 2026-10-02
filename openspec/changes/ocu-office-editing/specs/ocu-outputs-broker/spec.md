# Spec Delta

## ADDED Requirements

### Requirement: Resolve a file_id to its current path

The broker SHALL offer a read-only operation that returns the current relative path of an active `file_id` from the chat's persisted index, so that a caller holding a `file_id` follows a rename that reconciliation has recorded. A `file_id` that is unknown, malformed or tombstoned, and a chat that has no index yet, SHALL fail explicitly and distinguishably from a successful result; a tombstoned id SHALL never resolve to a path, including when another file now occupies its former path. The operation SHALL use the same canonical per-chat thread and filesystem lock as every other broker operation and SHALL be callable by a caller that already holds that lock. It SHALL NOT scan or hash the directory, SHALL NOT write the index or advance the counter, and SHALL NOT create, start or unpause a sandbox. A corrupt index SHALL fail explicitly as it does for reconciliation.

#### Scenario: Active id resolves to its path

- **WHEN** `docs/report.docx` is indexed with id F and the operation is called with F
- **THEN** it returns `docs/report.docx`, and the index file and the counter are unchanged

#### Scenario: Renamed file resolves to the new path

- **WHEN** a reconciliation has recorded the rename of `report.docx` (id F) to `final.docx` and the operation is called with F
- **THEN** it returns `final.docx`

#### Scenario: Tombstoned id fails

- **WHEN** a reconciliation has recorded the deletion of the file with id F, a new file was later created at the same path, and the operation is called with F
- **THEN** it fails with an explicit not-found result and does not return the path of the new file

#### Scenario: Unknown id or missing index

- **WHEN** the operation is called with a well-formed id that the index has never contained, with a malformed id, or for a chat without an index
- **THEN** it fails with an explicit not-found result and creates no index

#### Scenario: No sandbox is started

- **WHEN** the operation is called for a chat whose sandbox is stopped, paused or absent
- **THEN** the sandbox state is unchanged

### Requirement: Register a host-side write

The broker SHALL offer an operation that registers a write made by the OCU server to one path beneath the chat's outputs root, executed inside the locked transaction of its caller: the caller already holds the canonical per-chat thread and filesystem lock, and the index successor is durable before the operation returns, with no other broker operation interleaved between the write and its registration. For a path that has an active entry the broker SHALL recompute the SHA-256 from the file's current content, refresh the entry's size, mtime_ns and cached hash, increment the chat counter exactly once and stamp the entry with the new revision, keeping its `file_id`. This SHALL hold when the size is unchanged, which reconciliation alone does not detect. For a path without an active entry the broker SHALL create an entry with a new `file_id`, never one taken from a tombstone, with one counter increment. Registration SHALL change no other entry. A reconciliation that follows a registration with no further change to the directory SHALL report the listing as unchanged and SHALL NOT increment the counter again for the registered write. Registration SHALL fail explicitly, leaving the persisted index and counter unchanged, when the path is absolute, contains a traversal segment or otherwise lies outside the outputs root, when the path or any of its parent components is a symlink, when any path segment is hidden (dot-prefixed), when the target is missing or not a regular file, or when a configured broker limit would be exceeded.

#### Scenario: Same-size host write advances the revision

- **WHEN** the OCU server replaces the content of indexed `report.docx` (id F, revision 7, chat counter 9) with different bytes of the same size and registers the write
- **THEN** the chat counter is 10, the entry keeps id F, its revision is 10 and its cached SHA-256 equals the hash of the new content

#### Scenario: Registration and write share one transaction

- **WHEN** a second process starts a reconciliation of the same chat while the first holds the lock between replacing the file and registering it
- **THEN** the reconciliation waits until the registration has committed, and both processes observe the same id and revision for the file

#### Scenario: Reconciliation after registration does not count twice

- **WHEN** a write that changed the file's size was registered and a reconciliation then runs with no further change to the directory
- **THEN** the reconciliation reports unchanged, the counter stays at the registered value and the entry keeps its id and revision

#### Scenario: Other entries are untouched

- **WHEN** a write to `a.docx` is registered while `b.docx` is indexed and unchanged
- **THEN** `b.docx` keeps its id and revision

#### Scenario: Unindexed path is registered as an addition

- **WHEN** the OCU server writes a new file `report (2).docx` that the index has never contained and registers it
- **THEN** the entry receives a new id, the counter increments once and that id resolves to `report (2).docx`

#### Scenario: Path outside the root

- **WHEN** registration is requested for `../other/a.docx`, for an absolute path, or for a path in another chat's directory
- **THEN** it fails explicitly and the index bytes and counter are unchanged

#### Scenario: Symlink

- **WHEN** registration is requested for a path that is a symlink, or whose parent directory is a symlink
- **THEN** it fails explicitly, nothing outside the outputs root is opened or hashed, and the index is unchanged

#### Scenario: Hidden name

- **WHEN** registration is requested for `.staged.docx` or for `.cache/a.docx`
- **THEN** it fails explicitly and no entry is created

#### Scenario: Missing target

- **WHEN** registration is requested for a path at which no regular file exists
- **THEN** it fails explicitly and the index is unchanged
