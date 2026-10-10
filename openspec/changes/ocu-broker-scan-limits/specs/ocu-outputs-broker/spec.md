## ADDED Requirements

### Requirement: Discovery work has explicit resource ceilings

Each broker discovery SHALL enforce constructor-configurable positive-integer ceilings no greater than 50000 enumerated entries, 10000 visited directories and256 simultaneous scan directory descriptors. Every enumerated entry SHALL count before filtering or further inspection, including hidden names, symlinks, directories and special files; hidden subtree contents SHALL not be enumerated. The outputs root SHALL count as one visited directory when present. The descriptor count SHALL include the borrowed root, owned current/pending directories and the directory iterator's duplicate descriptor. Exact limits SHALL be allowed; excess work or descriptor acquisition SHALL be refused before it occurs, apart from retrieving the first excess entry to detect overflow.

Exhaustion of these budgets and scan-related directory-open/enumeration EMFILE or ENFILE SHALL raise an explicit resource-limit failure, not retryable filesystem instability or a successful truncated listing. Failed reconciliation SHALL preserve predecessor index bytes, file identities, revisions and counter. Every scan-owned descriptor SHALL be released on failure or success; caller-owned borrowed roots SHALL remain open until their owner closes them. Existing visibility, root safety, active-file/file-size/index/page bounds, hashing and identity semantics SHALL remain unchanged. No new environment or endpoint configuration SHALL widen these ceilings.

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
