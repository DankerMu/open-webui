## ADDED Requirements

### Requirement: Restore validates broker state without scanning outputs

Restore SHALL validate each live chat's restored broker index with the selected release's broker without scanning the chat's outputs or writing the index, and SHALL compare the surviving cursor with that index's counter. Files present in outputs but not recorded in the index SHALL NOT fail restore; they are indexed by the first listing after activation. A missing index under a positive cursor and an index the selected release cannot read SHALL still fail restore before readiness.

#### Scenario: Outputs changed after the last listing

- **WHEN** an agent added, deleted or resized files in a live chat's outputs after that chat's last listing, and the deployment is backed up and restored
- **THEN** restore succeeds and the restored broker index is byte-identical to the captured one

#### Scenario: Malformed index

- **WHEN** a live chat's restored index is not valid JSON
- **THEN** restore fails before readiness

#### Scenario: Index rejected by the selected release

- **WHEN** a live chat's restored index is valid JSON but fails the selected release's broker validation
- **THEN** restore fails before readiness and the error names the broker's cause
