# ocu-mcp-discovery Specification

## Purpose

Keep workspace-file discovery complete within explicit capacity limits, publish coherent MCP listings across request and worker threads, and report discovery failure independently of committed uploads.

## Requirements

### Requirement: Complete discovery within fixed budgets

A chat discovery SHALL expose at most 10,000 visible regular-file resources and the process SHALL retain at most 20,000 registered workspace-file resources across chats. Resynchronization SHALL replace that chat's contribution without duplicate accumulation or silent eviction of another chat. Preparatory construction and concurrent discovery SHALL be bounded, not merely the final registry. Empty or failed registrations SHALL NOT accumulate chat records.

A scan SHALL enumerate at most 50,000 entries, visit at most 10,000 directories including an existing root, and simultaneously hold at most 256 scan directory descriptors including the borrowed root, explicit children and iterator-owned duplicates. Every enumerated entry SHALL count before filtering, including hidden, symlink, special and directory entries. Hidden directories SHALL NOT be descended. Exact limits SHALL be allowed; overflow SHALL fail before excess metadata inspection, resource construction or descriptor acquisition. Retrieving the first excess entry solely to detect enumeration overflow is permitted.

#### Scenario: Per-chat and global boundaries

- **WHEN** a chat contains exactly 10,000 visible files and registration would bring the process to exactly 20,000 workspace resources
- **THEN** discovery succeeds with all resources, and resynchronization retains the same counts
- **AND** one additional visible file or a replacement exceeding remaining process capacity fails explicitly without truncation, eviction or changing the predecessor listing

#### Scenario: Hidden and special entries consume traversal capacity

- **WHEN** a tree contains visible files, hidden entries, symlinks, special files and directories
- **THEN** all encountered entries count before filtering, hidden subtrees remain unvisited, and only visible regular files appear in successful results
- **AND** exact entry/directory limits succeed while the first excess entry/directory fails before excess inspection/open

#### Scenario: Descriptor pressure and unwind

- **WHEN** wide, deep or mixed trees reach the scan descriptor limit, or root/child/iterator acquisition or enumeration encounters EMFILE or ENFILE
- **THEN** discovery fails explicitly, every owned descriptor is released and a borrowed root remains usable
- **AND** no partial successful listing replaces the previous snapshot

#### Scenario: Concurrent and empty discoveries cannot accumulate preparations

- **WHEN** repeated multi-chat discoveries arrive while an admitted discovery is active, or empty and failing chats are repeatedly synchronized
- **THEN** admissions have a fixed bound and excess requests receive an explicit busy failure rather than accumulating a discovery queue
- **AND** failed/empty chat bookkeeping does not grow and cancellation does not release admission while its worker still owns preparation resources

### Requirement: Reader-visible atomic snapshots

Traversal, metadata collection, sorting and resource construction SHALL execute outside the request event loop. A successful discovery SHALL replace its registered snapshot atomically for actual MCP list/read consumers, including discoveries initiated from worker threads. Scan, resource, capacity and publication failures SHALL preserve the prior successful snapshot. No reader SHALL observe a partially removed or partially inserted replacement.

#### Scenario: Worker replacement overlaps actual readers

- **WHEN** a worker-thread discovery replaces a chat with a distinguishable resource set while real MCP lists and unrelated-chat reads execute
- **THEN** each list observes a complete old or complete new set, unrelated resources remain readable and no iteration failure occurs
- **AND** an injected failure before publication preserves exactly the old resource set

#### Scenario: Nested URI and content compatibility

- **WHEN** visible root and nested text/binary files are synchronized
- **THEN** existing `file://uploads/{chat_id}/...` percent-encoding and MIME/text/binary read behavior are retained
- **AND** hidden paths, symlinks and nonregular entries remain excluded, with no path-confinement weakening

### Requirement: Consumer-visible discovery outcomes

Every discovery initiator SHALL receive an explicit outcome; failure SHALL NOT be reported as successful synchronization. A completed atomic upload SHALL remain a successful file publication with its existing stored filename, size, checksum and receipt behavior, even when subsequent discovery fails. Its response SHALL carry a separate discovery outcome rather than returning a false file-save failure. Lifecycle discovery failure SHALL reach the lifecycle initiator without an apparently successful newly synchronized result. Failure messages SHALL NOT disclose host paths or secrets.

#### Scenario: Committed upload encounters discovery failure

- **WHEN** an upload atomically stores its bytes and discovery subsequently exceeds capacity, is busy or encounters an IO failure
- **THEN** HTTP success still reports the stored file and a separate failed discovery outcome with a stable reason code
- **AND** the bytes and attachment receipt remain committed, previous MCP resources remain intact, and first-party upload consumers expose the discovery warning without retrying file publication

#### Scenario: Lifecycle discovery fails

- **WHEN** sandbox creation initiates discovery and it fails
- **THEN** the initiating lifecycle request receives an explicit failure rather than a swallowed log warning
- **AND** the failure does not misreport a complete MCP synchronization or leak partially acquired discovery resources

### Requirement: Responsive discovery under reference workload

During controlled 100,000-visible-file stress and repeated multi-chat synchronization/list activity, another chat's ordinary resource reads SHALL have p95 latency at most 250 ms and maximum latency at most 500 ms. The idle control SHALL have maximum latency at most 10 ms; otherwise the run SHALL be inconclusive, not passing. Evidence SHALL retain sustained raw samples, workload, runtime and platform identity. These thresholds govern reference-environment acceptance, not arbitrary deployment hardware.

#### Scenario: Sustained competing work

- **WHEN** the actual bounded discovery pipeline repeatedly encounters a 100,000-file tree and repeatedly resynchronizes/lists multiple registered chats while external requests read an unrelated chat's real MCP resource
- **THEN** complete discovery or explicit capacity failure is observed with no silent omissions, the idle control qualifies the run and both loaded latency thresholds pass
- **AND** raw per-request samples and operation intervals distinguish loaded measurements from idle padding
