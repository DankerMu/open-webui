## ADDED Requirements

### Requirement: Chat-directory publication precedes lock admission

First canonical chat-directory creation SHALL synchronize its exact configured data-root parent before a locked operation can report success. Parent synchronization failure SHALL propagate without admitting the operation, leaking the process lock or establishing a reentrancy depth. Existing cross-worker serialization and nested admission SHALL remain intact; non-creating acquisition of an absent chat SHALL remain non-creating. A later create-capable acquisition SHALL NOT assume an entry left by failed synchronization is durable solely because it exists.

#### Scenario: First chat acquisition
- **WHEN** a create-capable acquisition creates the canonical chat directory
- **THEN** the configured data-root inode is synchronized after mkdir and before entry into the protected operation

#### Scenario: Data-root synchronization refuses admission
- **WHEN** the data-root parent fsync fails
- **THEN** the protected operation is not entered and the error propagates
- **AND** another thread can acquire the process lock after the failure, without inherited flock depth

#### Scenario: Existing and nested acquisitions preserve serialization
- **WHEN** another worker observes the same chat directory, or an admitted transaction nests acquisition
- **THEN** both retain canonical lock identity and serialization, and the nested transaction uses the admitted outer lock
- **AND** missing-chat non-creating acquisition creates no directory or lock file
