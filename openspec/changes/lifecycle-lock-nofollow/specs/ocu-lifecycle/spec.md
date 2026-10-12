## MODIFIED Requirements

### Requirement: Cross-worker lifecycle serialization

OCU SHALL preserve multiple workers and serialize every get/create/start/stop/launch/describe transaction for one canonical chat through one stable process-local lock plus one shared-filesystem flock. Async handlers SHALL execute the transaction off the event loop. A create-name conflict SHALL adopt a running winner or fail explicitly, never delete it.

Each fresh outer acquisition SHALL open the canonical chat directory relative to the trusted configured data-root descriptor without following the chat entry as a symlink, and SHALL open `.lifecycle.lock` relative to that pinned directory without following the lock entry as a symlink. It SHALL verify the acquired lock descriptor is a regular file before flock or protected work. Prior pathname checks SHALL NOT replace these acquisition guarantees. Nested acquisition SHALL reuse the already admitted outer transaction rather than reopen a pathname.

Configured data-root symlinks SHALL remain supported. A non-creating acquisition SHALL NOT create a missing chat directory; acquisition in an existing valid chat SHALL retain creation of its missing regular lock file. Rejected acquisition SHALL retire its owned descriptors, preserve error visibility and leave no inherited flock depth or unreleased process lock. Existing parent-directory synchronization and cross-worker exclusion SHALL remain intact.

#### Scenario: Concurrent workers create one sandbox

- **WHEN** two worker processes receive first-use requests for the same chat
- **THEN** exactly one sandbox is created and both observe it without deleting either attempt

#### Scenario: Stable lock identity

- **WHEN** two threads request the lock for differently cased forms of one chat
- **THEN** both receive the same process-local lock object

#### Scenario: Lock entry changes after the Office precheck

- **WHEN** a deterministic boundary replaces the checked lock entry with a symlink to an external canary after the actual Office precheck succeeds
- **THEN** shared lock acquisition refuses the unsafe entry without opening or flocking the external inode
- **AND** canary bytes and identity remain unchanged, no protected work is admitted, and owned acquisition resources are retired

#### Scenario: Direct and reaper acquisition see a non-regular entry

- **WHEN** a direct caller or the sandbox reap path encounters a symlink or other non-regular lock entry, including a FIFO
- **THEN** no non-regular or redirected external inode is flocked and no protected lifecycle stop is admitted
- **AND** rejection completes within the bounded verification watchdog without relying on sleep-based race timing

#### Scenario: Chat pathname is replaced after directory admission

- **WHEN** the admitted chat directory is renamed and its pathname replaced with an external-directory symlink before the lock leaf is opened
- **THEN** acquisition cannot open or flock the external canary through that replacement
- **AND** any admitted lock remains a regular inode in the originally pinned directory

#### Scenario: Admission fails or the chat disappears

- **WHEN** directory/lock acquisition, regularity inspection or pre-admission setup fails, or a non-creating chat disappears before its directory can be acquired
- **THEN** no failed acquisition leaves an owned descriptor, flock depth or process lock behind
- **AND** missing-chat source/callback/history refusal and non-recreation behavior remain unchanged, and another caller can acquire after the fault is removed

#### Scenario: Valid locks retain their existing modes

- **WHEN** a regular lock is acquired through a configured-root symlink, through an existing chat with no lock file, or through nested and independent-process callers
- **THEN** configured-root support and lock creation remain intact, nested calls reuse admission, and an independent process observes real flock contention until release
- **AND** create-capable parent synchronization remains before admission while nested and non-creating acquisitions add no synchronization
