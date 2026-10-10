# Bound broker discovery work

## Why

Issue #68's approved policy bounds scan work that does not contribute to active-file limits: hidden/special entries, directories and the held descriptor frontier. Resource exhaustion must not become a retryable unstable-read error or publish a partial index.

## What Changes

- Add constructor-only, lowerable ceilings: 50,000 enumerated entries, 10,000 visited directories including root, and 256 simultaneous scan directory descriptors including scandir duplicates.
- Reject before excess work/acquisition, classify scan EMFILE/ENFILE as LimitExceededError, and release owned descriptors without closing a borrowed root.
- Preserve predecessor bytes, file identities, revisions and all existing visibility, hashing, pagination and confinement rules. The existing endpoint mapping remains413.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-outputs-broker`: explicit discovery-work limits, resource-failure classification and ownership-preserving unwind.

## Impact

OCU `computer-use-server/outputs_broker.py` and existing broker tests. Existing endpoint failure mapping is exercised, not changed. Central fixture and existing broker decision documentation carry the approved policy; archived history is not edited.

## Triage

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent
Blast radius: filesystem discovery, descriptor ownership, and persisted file identity if a failed scan publishes partial state.
Selected risk packs: public API; file IO; concurrency/state; resource limits; legacy compatibility; error handling; documentation.
Evidence floor: semantic RED before repair; exact/over-limit cases; real-filesystem constrained-RLIMIT child probe; predecessor/identity and resource conservation; existing 80-deep and 5000-file unchanged cases; owning broker and endpoint suites; actual HTTP413 smoke.
