# Parent-directory durability

## Why

Issue [#214](https://github.com/DankerMu/open-webui/issues/214) identifies missing parent synchronization when the broker/upload creates `.ocu` or the lifecycle lock creates a chat directory. Child-file and child-directory fsync cannot substitute for publishing the parent entry.

## What Changes

- Synchronize the exact parent of chat/control-directory creation before successful persistence or lock admission.
- Preserve existing file replacement, child synchronization, receipt replay and lock ownership.
- Prove inode-specific ordering and failure propagation with real temporary directories and guarded HTTP uploads; no power-loss simulation claim.

## Capabilities

### Modified Capabilities

- `ocu-outputs-broker`: durable publication of shared chat control-directory entries, including upload receipts.
- `ocu-lifecycle`: durable publication of the canonical chat directory before lock admission.

## Impact

OCU `outputs_broker.py`, `uploads.py`, `docker_manager.py`, their existing tests and source documentation. `app.py` is a consumer under test, not a planned edit. Central fixture, owning decisions and evidence accompany the source PR. No schema, dependencies, image or API change.

## Risk triage

Issue type: bugfix. Fixture level: expanded. Upstream suggested level: absent; file persistence and shared locks require expanded.
Blast radius: false success after metadata creation, lost receipt/index reachability, leaked descriptors or locks.
Selected risk packs: API; file IO/path safety; concurrency/ordering; compatibility; error handling; documentation.
Evidence floor: semantic RED before each boundary fix; real-directory inode/order/fault checks; owning upload/broker/lifecycle and Office-store regression suites; actual HTTP smoke; three-seat review.
