## ADDED Requirements

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
