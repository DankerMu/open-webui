## MODIFIED Requirements

### Requirement: Office blob and replay-barrier cleanup attempts every owned close

Office version-blob publication, version-blob removal and the callback replay barrier SHALL attempt to close every owned directory descriptor exactly once without retrying a failed close. An earlier operation or synchronization failure SHALL remain the primary error with every close failure retained on it, through the version store call and the callback route, so that the callback reports it by its own classification and never as `state_close_failed`; a close-only failure SHALL remain observable and SHALL carry every close failure in close order. A close-only failure after a blob is linked SHALL NOT record version metadata for that attempt, and the content-addressed blob SHALL remain reusable by a later publication of the same content. A close-only replay-barrier failure during final or forcesave receipt replay SHALL be reported as HTTP 500 with reason `state_close_failed`, not `state_corrupt`; a replay-barrier synchronization failure SHALL remain `state_durability`, and replay ordering SHALL remain unchanged. On the callback route, `state_close_failed` covers the replay barrier and any close-only version-blob publication failure that reaches the callback; other close-only failures keep their existing classification. No power-loss behavior or post-close descriptor state is claimed.

#### Scenario: A close fails part-way through cleanup

- **WHEN** a close fails at an early or intermediate owned descriptor in any of the three owners
- **THEN** every owned descriptor still receives exactly one close attempt and no close is retried

#### Scenario: Operation failure and close failure coincide

- **WHEN** an owner's operation or synchronization fails and a close also fails during cleanup
- **THEN** the operation or synchronization failure remains primary with the close failure retained on it

#### Scenario: Primary failure keeps precedence through the version store and the callback

- **WHEN** version-blob publication for callback content fails at a non-out-of-space synchronization and a final close also fails
- **THEN** the version store call raises that synchronization error itself, not a close-only error, with the close failure retained on it
- **AND** the callback returns HTTP 500 with reason `state_corrupt`, not `state_close_failed`, records no version and leaves no blob

#### Scenario: Several closes fail in one cleanup

- **WHEN** publishing new version content links and synchronizes the blob and more than one owned directory close fails
- **THEN** every owned descriptor still receives exactly one close attempt
- **AND** the close-only error carries every close failure in close order, taking its error number, message and cause from the first

#### Scenario: Close-only failure after blob publication

- **WHEN** publishing new version content links and synchronizes the blob but a final close fails
- **THEN** the version store call fails, no new version metadata is recorded, and a later publication of the same content records one version reusing the blob

#### Scenario: Close-only replay-barrier failure

- **WHEN** a final or forcesave receipt replay reaches the replay barrier, synchronization succeeds, and a close fails
- **THEN** the callback returns HTTP 500 with reason `state_close_failed`, not `state_corrupt`
- **AND** a replay-barrier synchronization failure still returns `state_durability`
