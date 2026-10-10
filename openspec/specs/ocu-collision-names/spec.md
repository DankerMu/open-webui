# ocu-collision-names Specification

## Purpose

Keep complete uploaded and Office-copy content publishable under target-directory filename limits without overwriting existing workspace entries or losing recovery responsibility.

## Requirements

### Requirement: Target-directory byte budget for collision names

Workspace collision naming SHALL use the effective target directory `NAME_MAX` and filesystem-encoded byte lengths. Numbered names SHALL retain the existing last-suffix interpretation and `stem (N).suffix` form, reserving the complete suffix and current number before retaining the longest whole-character prefix of the original stem. If no complete stem character fits but one ASCII byte does, the stem SHALL be `_`. The suffix SHALL NOT be truncated, and names SHALL NOT substitute a digest or ellipsis. Budgeting SHALL be recalculated when the number grows. Uploads and Office copies SHALL share this policy.

#### Scenario: Legal original name is free

- **WHEN** a legal requested upload name is free, including names252–255 bytes long on a filesystem that permits them
- **THEN** the complete content is stored under that exact original name without premature truncation
- **AND** ordinary short-name behavior remains unchanged

#### Scenario: ASCII or multibyte collision near capacity

- **WHEN** the requested name is occupied and adding the numbered suffix would exceed the target byte limit
- **THEN** only the stem is shortened to the longest fitting complete-character prefix and the generated name fits that byte limit
- **AND** the complete original extension and uploaded content are preserved

#### Scenario: Number expands from nine to ten

- **WHEN** candidates through ` (9)` are occupied
- **THEN** the ` (10)` candidate receives a newly computed stem budget and fits the same target byte limit without cutting a multibyte character

#### Scenario: Minimal ASCII stem

- **WHEN** no complete original stem character fits but the suffix, current number and one ASCII byte fit
- **THEN** the candidate uses `_` as its stem and retains the entire suffix

### Requirement: Explicit naming refusal without false success

When the minimal stem, complete suffix and current number cannot fit, collision naming SHALL refuse with a distinct name-capacity error. The upload endpoint SHALL return HTTP400 for definite filename-capacity refusal and SHALL NOT publish partial content or a success receipt. When the effective filesystem limit cannot be determined, the operation SHALL fail explicitly rather than assuming255. Office callers SHALL preserve their existing saved-content, cleanup and recovery responsibilities when the shared naming boundary fails.

#### Scenario: Extension leaves no legal candidate

- **WHEN** an occupied legal name has a suffix that leaves no space for a minimal numbered stem
- **THEN** upload returns400, the existing entry is unchanged, no second final file or receipt is created, and private upload staging is released

#### Scenario: Unknown filesystem limit

- **WHEN** a collision requires a budget but the target limit is indeterminate or its lookup fails
- **THEN** no fallback limit or alternate success name is invented, the existing entry remains unchanged, and the failure is explicit

#### Scenario: Office naming failure

- **WHEN** explicit or automatic Office copy reaches a failing shared naming boundary
- **THEN** it reports failure without pretending a copy exists, keeps the stored user version, closes owned descriptors, and follows the existing fence-release and unresolved-marker retention rules while preserving its recovery obligation

### Requirement: Atomic claims and truthful stored-name identity

Collision candidates SHALL be claimed by the existing atomic no-replace hard-link operation. Occupied entries, including symlinks and a concurrent winner, SHALL remain untouched. A lost claim SHALL continue to the next numbered candidate under the same byte policy. Success SHALL report the actual stored name and complete content. Office candidate selection SHALL retain indexed-name exclusion, journal/witness ownership and recovery of an already claimed copy without assigning another identity or making another copy.

#### Scenario: Concurrent or symlink occupation

- **WHEN** another writer claims a bounded candidate first, or a candidate is occupied by a symlink
- **THEN** the winner/link and any link target remain unchanged while the upload chooses another bounded candidate holding its full distinct content

#### Scenario: Office near-limit copy and interrupted claim

- **WHEN** explicit save-as or automatic conflict copy uses a near-limit original basename, including interruption after the claim before stored-name persistence
- **THEN** the actual bounded copy name is reported with its own file_id and full version bytes
- **AND** recovery proves and completes the same owned copy without duplicating content, registration or Office history
