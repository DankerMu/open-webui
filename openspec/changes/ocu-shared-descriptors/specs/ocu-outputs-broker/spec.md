# Spec Delta

## ADDED Requirements

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
