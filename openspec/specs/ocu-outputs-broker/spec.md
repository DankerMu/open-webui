# ocu-outputs-broker Specification

## Purpose

Give OCU outputs persistent file identities and monotonic per-chat revisions with bounded, safe reconciliation, independent of endpoint and UI wiring.

## Requirements

### Requirement: Persistent identity and event revisions

The broker SHALL persist active path and content-fingerprint indexes, UUID file_ids, tombstones and one monotonic counter per chat. Each observed addition, size change, rename or deletion SHALL increment the counter once and stamp the affected entry or tombstone. Unchanged entries SHALL retain their id and revision. Listing revision SHALL be the current counter, preserved across broker/process restarts. Entry metadata SHALL include relative path, name, size, mtime_ns, revision and cached SHA-256, except that an entry whose size exceeds the per-file limit SHALL carry a null hash; mtime SHALL not determine identity or version.

#### Scenario: Independent entry stamps

- **WHEN** a.html changes size while b.html does not
- **THEN** the counter increments once, a.html keeps its id with the new stamp, and b.html keeps its id and stamp

#### Scenario: Restart preserves authority

- **WHEN** a new broker/process reads an existing valid index
- **THEN** unchanged entries retain their ids/stamps and the next event advances the persisted counter

#### Scenario: File crosses the per-file limit

- **WHEN** an indexed file grows beyond the per-file limit, and later shrinks back below it
- **THEN** each crossing is one size-change event that keeps the file's id, and the entry's hash is null while the file is oversized and a fresh SHA-256 once it is back within the limit

### Requirement: Cached hash rename evidence

The broker SHALL hash newly observed files and detected size changes within the per-file limit and persist those fingerprints. Files over the per-file limit SHALL NOT be read or hashed and SHALL have no fingerprint. Equal-size/equal-SHA256 pairs of paths removed and added in the same reconciliation SHALL be matched one-to-one deterministically as renames, retaining id and incrementing revision once; entries without a hash SHALL never be rename candidates. Equal-content files SHALL have distinct identities. Historical tombstones SHALL never be candidates for rename resurrection. Same-size in-place changes remain a documented detection blind spot.

#### Scenario: Rename retains identity

- **WHEN** indexed report.html is renamed to final.html between reconciliations without changing its content
- **THEN** final.html keeps report.html's id, its revision increments once, and the live id is not tombstoned

#### Scenario: Same-size different content is not a rename

- **WHEN** an indexed file disappears and another path appears with the same size but a different SHA-256
- **THEN** the old id is tombstoned and the new path receives a distinct id

#### Scenario: Duplicate content remains distinct

- **WHEN** multiple removed and added paths share one size/hash
- **THEN** deterministic one-to-one matching preserves separate ids without assigning one id to two active entries

#### Scenario: Oversized files are never paired

- **WHEN** two oversized files of equal size are moved in the same reconciliation
- **THEN** each old id is tombstoned and each new path receives a new id

### Requirement: Observed deletion and path reuse

A deletion observed by reconciliation SHALL persist a tombstone. A subsequently recreated path SHALL receive a new UUID, even if its bytes equal the tombstoned file. A delete/recreate entirely between polls SHALL follow active-path matching and SHALL be documented as unobservable without a file event system.

#### Scenario: Observed path reuse

- **WHEN** a.txt is indexed, a later reconcile observes it absent, and a subsequent reconcile observes a.txt again
- **THEN** the new entry has a new id and the prior id remains a tombstone

### Requirement: Unchanged discovery and bounded pages

Reconciliation SHALL discover current paths/sizes before reporting unchanged, hash no unchanged files and avoid rewriting an unchanged index. Pages SHALL be sorted by relative path and report total plus a revision-bound next cursor. Malformed/out-of-range/stale cursors SHALL fail explicitly. Defaults SHALL be page100 with maximum1000, active-file limit10000, per-file limit100MiB and index limit64MiB; explicitly configured positive limits SHALL be enforced before publishing a successor, without truncation or counter reset. A regular file over the per-file limit SHALL be listed as an entry without a hash instead of failing reconciliation, and SHALL count toward the active-file limit; registering an oversized host write SHALL still fail explicitly.

#### Scenario: Unchanged large directory

- **WHEN** 5000 previously indexed files remain unchanged
- **THEN** reconciliation computes zero hashes, preserves the counter and index file, and returns the requested page and total5000

#### Scenario: Paginated snapshot changes

- **WHEN** a client requests a subsequent page after a content/path event changed the listing revision
- **THEN** the stale cursor is rejected rather than mixed with the new snapshot

#### Scenario: Configured limit exceeded

- **WHEN** a scan or proposed index exceeds an active-file or index-size bound, or a host write to be registered exceeds the file-size bound
- **THEN** the operation fails explicitly and the prior persisted index remains unchanged

#### Scenario: Oversized file does not hide the listing

- **WHEN** one regular file in the outputs tree exceeds the per-file limit
- **THEN** reconciliation succeeds without reading that file, and the page lists every other file plus an entry for the oversized file with a file_id, a revision and no hash

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

#### Scenario: Outputs root disappears

- **WHEN** the outputs root is missing while the committed index contains active entries
- **THEN** reconciliation reports a retryable error and preserves the index rather than recording mass deletion
- **AND** a missing root on first use or with no active entries remains an empty listing

### Requirement: Discovery work has explicit resource ceilings

Each broker discovery SHALL enforce constructor-configurable positive-integer ceilings no greater than 50000 enumerated entries, 10000 visited directories and256 simultaneous scan directory descriptors. Every enumerated entry SHALL count before filtering or further inspection, including hidden names, symlinks, directories and special files; hidden subtree contents SHALL not be enumerated. The outputs root SHALL count as one visited directory when present. The descriptor count SHALL include the borrowed root, owned current/pending directories and the directory iterator's duplicate descriptor. Exact limits SHALL be allowed; excess work or descriptor acquisition SHALL be refused before it occurs, apart from retrieving the first excess entry to detect overflow.

Exhaustion of these budgets and scan-related directory-open/enumeration EMFILE or ENFILE SHALL raise an explicit resource-limit failure, not retryable filesystem instability or a successful truncated listing. Failed reconciliation SHALL preserve predecessor index bytes, file identities, revisions and counter. Every scan-owned descriptor SHALL be released on failure or success; caller-owned borrowed roots SHALL remain open until their owner closes them. Existing visibility, root safety, active-file/index/page bounds, hashing and identity semantics SHALL remain unchanged; a file over the per-file limit SHALL be listed without a hash as specified by "Unchanged discovery and bounded pages". No new environment or endpoint configuration SHALL widen these ceilings.

#### Scenario: Entry budget includes otherwise invisible work

- **WHEN** discovery reaches its configured entry limit with any mix of visible files, hidden names, directory entries, symlinks and special files
- **THEN** exactly that many entries may be processed, and the first extra entry causes resource refusal before stat, hash or open work on it
- **AND** no hidden subtree is scanned and no symlink or special file becomes a listed regular file

#### Scenario: Directory allowance includes root

- **WHEN** an existing root and entered children reach the configured directory allowance
- **THEN** the next child-directory acquisition is refused before opening it
- **AND** exact-boundary discovery succeeds if other budgets permit it

#### Scenario: Iterator and frontier descriptors share one bound

- **WHEN** a wide, deep or mixed tree would require a directory or iterator descriptor beyond the configured allowance
- **THEN** discovery refuses before that acquisition and never exceeds its scan descriptor bound
- **AND** owned frontier/current/iterator descriptors are released while the borrowed root remains usable

#### Scenario: Operating-system descriptor exhaustion is not instability

- **WHEN** root or child directory opening, iterator construction or directory enumeration reports EMFILE or ENFILE during discovery
- **THEN** the broker reports resource exhaustion and the existing outputs HTTP consumer returns413 rather than retryable503
- **AND** the predecessor remains byte-identical and no partial listing or reset authority is published

#### Scenario: Failure preserves authority and releases resources

- **WHEN** any discovery budget is exceeded after a valid index already exists
- **THEN** the index, ids, revisions and counter remain unchanged and owned descriptors and the transaction lock are released
- **AND** a subsequent valid reconciliation uses the same existing authority after the excess work is removed

#### Scenario: Existing bounded discovery remains compatible

- **WHEN** an 80-level directory chain or5000 unchanged regular files fits all configured bounds
- **THEN** iterative discovery succeeds with existing confinement and pagination behavior
- **AND** unchanged files require no content hashes or index rewrite

### Requirement: Confinement preserves caller failure boundaries

Workspace read/directory acquisition and broker acquisition SHALL preserve their distinct caller-visible failure policies while enforcing non-following verified-file confinement. Upload/MCP traversal and missing-file outcomes SHALL remain unchanged; broker unsafe-root/control/index, unstable-read and scan-only resource-exhaustion outcomes SHALL remain unchanged. Sharing acquisition SHALL NOT change publication, receipts, revisions, discovery bounds or file-response semantics. A failed acquisition SHALL release every descriptor it owns and SHALL leave caller-borrowed descriptors usable.

#### Scenario: Caller-specific unsafe and unstable outcomes

- **WHEN** otherwise identical benign filesystem fixtures expose a missing component, symlink, wrong file type or changing entry to upload/MCP and broker consumers
- **THEN** each consumer retains its established exception/status/error outcome without disclosing outside bytes or merging distinct error policies
- **AND** failed broker observation preserves the committed index and upload failures preserve existing bytes and receipts

#### Scenario: Failure stage and resource context remain distinct

- **WHEN** open or post-open metadata/type verification fails, or directory-open EMFILE/ENFILE occurs in scan versus non-scan registration context
- **THEN** each caller preserves its baseline failure classification for that stage/context
- **AND** acquired descriptors close, borrowed roots remain usable and a later valid operation succeeds

#### Scenario: Existing higher-level consumers remain equivalent

- **WHEN** ordinary nested files are uploaded, read through MCP, downloaded individually or as an archive, or reconciled into broker listings
- **THEN** their accepted bytes, identities, revisions, names, headers, receipts and error policies remain unchanged
- **AND** path replacement cannot redirect reads outside the authorized workspace

### Requirement: Control-directory publication precedes persisted success

A successful first broker-index or upload-receipt publication SHALL include synchronization of the chat-root directory entry naming its control directory, in addition to synchronization of the state file and control directory. This SHALL apply to normal upload preparation and direct receipt persistence. Synchronization SHALL use the actual parent directory, without following a substituted control-directory symlink. Parent synchronization failure SHALL prevent success, preserve existing committed state and release owned resources without closing borrowed descriptors. Read-only missing-state operations SHALL remain non-creating.

#### Scenario: First broker index publishes its control entry

- **WHEN** reconciliation first creates the chat control directory and index
- **THEN** the chat parent is synchronized after directory creation and before success, and index-file and control-directory synchronization still occur

#### Scenario: Upload and direct receipt creation

- **WHEN** a first receipt-bearing upload or direct receipt persistence creates the control directory
- **THEN** the chat parent is synchronized before successful acknowledgement, and the receipt file and its containing directory are synchronized
- **AND** upload contents, receipt replay and collision behavior remain unchanged

#### Scenario: Parent synchronization fails

- **WHEN** synchronization of the chat-root inode raises an IO failure during control-directory preparation
- **THEN** no success is returned and no new receipt or index is acknowledged
- **AND** existing committed state remains intact, owned descriptors close and borrowed descriptors remain usable

#### Scenario: Existing directory follows an interrupted creator

- **WHEN** a create-capable operation encounters a control directory left by an earlier failed parent synchronization
- **THEN** existence alone does not bypass the parent durability obligation before persisted success
