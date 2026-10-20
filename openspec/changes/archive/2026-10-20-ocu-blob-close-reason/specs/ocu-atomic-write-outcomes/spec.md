## ADDED Requirements

### Requirement: Callback reports a close-only version-blob failure as state_close_failed

When a close-only version-blob publication failure reaches the Office callback, the callback SHALL return HTTP 500 with reason `state_close_failed`, not `state_corrupt`. Close-only means the publication failed only because a final owned-directory close failed, with no earlier write, link or synchronization failure. This applies whether the failure came from storing the callback's content or from publication recovery that the callback drives. The callback SHALL log the refusal as an error with that reason, as it does for the replay barrier.

The failure SHALL remain observable as an `OSError` carrying every close failure, so callers outside the callback keep their existing handling.

When the failure came from storing the callback's own content:

- no version metadata SHALL be recorded;
- a later delivery of the same content SHALL reuse the blob;
- for a status-6 forcesave callback, the pending save sequence and saving state SHALL remain unchanged.

A close failure whose error is out-of-space SHALL remain `storage_low`, with its existing recovery. No commit or power-loss durability is claimed.

#### Scenario: Close-only failure while storing callback content

- **WHEN** a callback's content is linked into the version store and synchronized, but a final directory close fails
- **THEN** the callback returns HTTP 500 with reason `state_close_failed`
- **AND** no new version is recorded

#### Scenario: Forcesave keeps its pending save

- **WHEN** a status-6 forcesave callback hits a close-only version-blob failure that is not out-of-space
- **THEN** the session keeps its pending save sequence and saving state

#### Scenario: Retry after a close-only failure

- **WHEN** the same callback content is delivered again after a close-only version-blob failure
- **THEN** the blob is reused and exactly one version is recorded

## MODIFIED Requirements

### Requirement: Office blob and replay-barrier cleanup attempts every owned close

Office version-blob publication, version-blob removal and the callback replay barrier SHALL attempt to close every owned directory descriptor exactly once without retrying a failed close. An earlier operation or synchronization failure SHALL remain the primary error with every close failure retained on it; a close-only failure SHALL remain observable. A close-only failure after a blob is linked SHALL NOT record version metadata for that attempt, and the content-addressed blob SHALL remain reusable by a later publication of the same content. A close-only replay-barrier failure during final or forcesave receipt replay SHALL be reported as HTTP 500 with reason `state_close_failed`, not `state_corrupt`; a replay-barrier synchronization failure SHALL remain `state_durability`, and replay ordering SHALL remain unchanged. On the callback route, `state_close_failed` covers the replay barrier and any close-only version-blob publication failure that reaches the callback; other close-only failures keep their existing classification. No power-loss behavior or post-close descriptor state is claimed.

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
