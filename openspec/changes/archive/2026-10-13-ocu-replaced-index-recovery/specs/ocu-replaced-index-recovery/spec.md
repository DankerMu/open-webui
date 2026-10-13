# Spec Delta

## Purpose

Preserve non-copy Office publication responsibility across broker-index outages after workspace replacement, and complete recovery without duplicate publication effects or new old-epoch callback admission.

## ADDED Requirements

### Requirement: Index failure preserves post-replacement publication responsibility

For callback save/final and resolve-overwrite publication, an index failure during recovery after workspace replacement SHALL return `interrupted/index_unavailable` and retain the journal until registration and the Office successor are durable. Before replacement, proven pre-replacement index failure SHALL preserve terminal `failed/index_unavailable`. A recorded target path alone SHALL NOT prove replacement; uncertain replacement or ownership evidence SHALL retain responsibility rather than discard potentially completed work. Restore and copy/save_as behavior SHALL remain unchanged.

#### Scenario: Fresh recovery encounters unavailable index after replacement

- **WHEN** a worker is killed after actual workspace replacement and a fresh recovery worker encounters an unavailable index
- **THEN** recovery reports interrupted index unavailability and keeps the obligation
- **AND** selected workspace bytes, immutable versions, history and receipts remain unchanged, with no fabricated completed session projection

#### Scenario: Prepared but not replaced publication encounters unavailable index

- **WHEN** the index is unavailable for an unstarted or provably pre-replacement publication, including one with only a recorded target path
- **THEN** the existing failed index-unavailable outcome is retained without workspace replacement
- **AND** preparation is not misclassified as completed replacement solely because a path was recorded

#### Scenario: Replacement or ownership evidence is uncertain

- **WHEN** fresh recovery cannot safely establish the transaction's replacement state or observes foreign, substituted, linked or contradictory ownership evidence
- **THEN** it retains the obligation and refuses unproven completion or deletion
- **AND** matching bytes or a remembered path do not grant foreign identity ownership

### Requirement: Healthy recovery completes publication without duplicate effects

After index availability returns, recovery SHALL finish the same accepted publication without rewriting already-correct content or duplicating completed registration, broker revisions, receipts or history. It SHALL preserve file identity and the selected version, retain responsibility across another interruption, and remove the journal only with the durable Office outcome. Replaying completed recovery SHALL be a no-op.

#### Scenario: Registration was not completed before outage

- **WHEN** replacement completed but registration did not, and the index becomes available
- **THEN** recovery registers the selected bytes once under the original file identity and completes Office publication state
- **AND** the already-correct workspace inode and selected history are preserved

#### Scenario: Registration already committed before interruption

- **WHEN** the accepted publication's registration is already durably visible but Office completion is pending, including after an index outage
- **THEN** recovery reuses that proven registration without another revision increment or workspace replacement
- **AND** unrelated equal-content index entries cannot stand in for the accepted publication

#### Scenario: Recovery is interrupted again and later replayed

- **WHEN** recovery is interrupted again at a durable replacement, registration or completion boundary
- **THEN** the same obligation remains recoverable without duplicate receipts, versions or registration
- **WHEN** recovery runs after durable Office completion
- **THEN** workspace bytes/inode, Office state, broker revision and receipts remain unchanged

### Requirement: Epoch-first callback admission preserves pending recovery

Current- and old-epoch callback handling SHALL preserve the existing recovery boundary. An old-epoch callback SHALL NOT download, persist or publish its new request content; it may only drive a pre-existing durable obligation before the existing orphan decision. Pending recovery SHALL NOT be orphaned or erased. After healthy recovery, existing requester-specific session outcome and epoch projection rules SHALL apply.

#### Scenario: Current-epoch callback encounters pending index recovery

- **WHEN** a current-epoch callback reaches a pre-existing post-replacement obligation while the index is unavailable
- **THEN** the obligation remains pending rather than being answered as a terminal failed publication
- **AND** eventual recovery and duplicate delivery create no duplicate versions, receipts or publication effects

#### Scenario: Old-epoch callback cannot admit new content during outage

- **WHEN** an old-epoch callback arrives with new, different or malformed request content while a pre-existing post-replacement obligation cannot recover its index
- **THEN** the rejected content is not downloaded or persisted and the pending obligation remains
- **AND** the session is not falsely orphaned before recovery can finish

#### Scenario: Old-epoch callback recovers only accepted work

- **WHEN** index availability returns and an old-epoch callback drives the pre-existing obligation
- **THEN** only the previously accepted content completes and the existing requester-specific terminal or orphan rule applies afterward
- **AND** the rejected callback adds no content-origin hit, version, receipt or new publication authority
