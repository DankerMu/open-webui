## ADDED Requirements

### Requirement: Office blob and replay-barrier cleanup attempts every owned close

Office version-blob publication, version-blob removal and the callback replay barrier SHALL attempt to close every owned directory descriptor exactly once without retrying a failed close. An earlier operation or synchronization failure SHALL remain the primary error with every close failure retained on it; a close-only failure SHALL remain observable. A close-only failure after a blob is linked SHALL NOT record version metadata for that attempt, and the content-addressed blob SHALL remain reusable by a later publication of the same content. A close-only replay-barrier failure during final or forcesave receipt replay SHALL be reported as HTTP 500 with reason `state_close_failed`, not `state_corrupt`; a replay-barrier synchronization failure SHALL remain `state_durability`, and replay ordering SHALL remain unchanged. This reason applies only to the replay barrier; other close-only failures keep their existing classification. No power-loss behavior or post-close descriptor state is claimed.

#### Scenario: A close fails part-way through cleanup

- **WHEN** a close fails at an early or intermediate owned descriptor in any of the three owners
- **THEN** every owned descriptor still receives exactly one close attempt and no close is retried

#### Scenario: Operation failure and close failure coincide

- **WHEN** an owner's operation or synchronization fails and a close also fails during cleanup
- **THEN** the operation or synchronization failure remains primary with the close failure retained on it

#### Scenario: Close-only failure after blob publication

- **WHEN** publishing new version content links and synchronizes the blob but a final close fails
- **THEN** the version store call fails, no new version metadata is recorded, and a later publication of the same content records one version reusing the blob

#### Scenario: Close-only replay-barrier failure

- **WHEN** a final or forcesave receipt replay reaches the replay barrier, synchronization succeeds, and a close fails
- **THEN** the callback returns HTTP 500 with reason `state_close_failed`, not `state_corrupt`
- **AND** a replay-barrier synchronization failure still returns `state_durability`
