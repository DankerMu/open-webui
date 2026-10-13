# ocu-missing-root-retirement Specification

## Purpose

Preserve durable save-as outcomes and private deletion authority when the workspace outputs root disappears during publication recovery, without recreating the workspace or collecting unrelated content.

## Requirements

### Requirement: Missing-root completion preserves durable outcome and retirement responsibility

When save-as recovery finds the outputs root missing, it SHALL preserve an already-durable retained failure reason, including `publish_timeout`; without one it SHALL retain ordinary `workspace_missing` behavior. Before recording the terminal result and clearing the journal, it SHALL retire and durably synchronize only private anchor/witness names proven owned by that obligation. It SHALL NOT recreate outputs, scan unrelated private files, alter selected version/history or receipts, or delete foreign objects.

#### Scenario: Retained timeout survives later root loss

- **WHEN** a process dies after durable retained timeout intent and the empty outputs root is removed before fresh recovery
- **THEN** recovery completes with the retained timeout result only after all proven owned private names are retired and synced
- **AND** no outputs directory is recreated and documents, receipts, selected blobs and broker identity remain conserved

#### Scenario: No earlier retained reason preserves ordinary missing-workspace behavior

- **WHEN** missing-root recovery has no durable retained failure reason
- **THEN** safe retirement precedes the ordinary `workspace_missing` terminal result
- **AND** recovery does not invent a prior timeout or modify selected history

#### Scenario: Root disappears during nested-parent fallback

- **WHEN** recovery first observes a missing nested destination and the outputs root disappears before its fallback traversal
- **THEN** the same outcome-precedence and private-retirement requirements apply to the current rebound obligation
- **AND** completion neither recreates the root nor discards updated ownership state

### Requirement: Private retirement resumes proven progress and refuses uncertainty

Recovery SHALL preserve the existing crash-safe bound-private retirement protocol. Already-completed unlink steps SHALL be idempotent; proven absence SHALL NOT create permanent recovery failure. Unproven absence, foreign or substituted identity, symlinked ownership names, unexpected extra links or uncertain retirement durability SHALL retain the obligation instead of deleting unproven objects or claiming completion. Completed recovery SHALL be a no-op when replayed.

#### Scenario: Recovery resumes every durable private retirement boundary

- **WHEN** a worker is killed at retained intent, durable private retirement, after anchor unlink or after witness unlink, and outputs is absent on replay
- **THEN** fresh recovery resumes the same obligation and converges after interruptions stop
- **AND** a remaining verified pin or durable completed retirement permits safe progress without adopting unrelated names

#### Scenario: Lost evidence differs from completed deletion

- **WHEN** both private names are absent without durable retirement evidence
- **THEN** recovery retains the journal and refuses unproven completion
- **WHEN** those names are absent after their retirement was durably recorded
- **THEN** recovery may finish without requiring deletion of nonexistent entries

#### Scenario: Foreign names or extra ownership are preserved

- **WHEN** either bound private name is substituted with same-content foreign data or a symlink, or the owned inode has an unexpected extra hardlink
- **THEN** recovery preserves foreign names, link targets and unrelated private content
- **AND** the journal remains responsible and no terminal success is fabricated from matching bytes

#### Scenario: Directory synchronization fails during retirement

- **WHEN** required private-directory synchronization fails during retirement
- **THEN** recovery retains the obligation and its established outcome rather than claiming completed cleanup
- **AND** later fresh recovery can resume proven progress without modifying selected history

#### Scenario: Completed recovery is replayed

- **WHEN** recovery runs after durable terminal completion
- **THEN** it changes no Office state, selected content or broker revision and does not recreate outputs or collect unrelated files
