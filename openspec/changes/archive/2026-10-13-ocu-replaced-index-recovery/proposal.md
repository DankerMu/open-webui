# Proposal

## Why

A broker-index outage during recovery can terminally discard a non-copy publication whose workspace replacement already happened, losing registration and Office-completion responsibility. [Issue 280's approved policy](https://github.com/DankerMu/open-webui/issues/280#issuecomment-6095294430) requires retaining that obligation without admitting new old-epoch callback content.

## What Changes

- Classify index failure at the canonical publication owner using durable replacement evidence, not a recorded path alone; preserve `failed/index_unavailable` before replacement and `interrupted/index_unavailable` after replacement or when completion is uncertain.
- Resume registration and Office completion without rewriting already-correct content or duplicating registration, revisions, receipts or history; completed replay is inert.
- Exercise callback save/final and resolve-overwrite, including current-/old-epoch callback recovery and witness uncertainty. Restore and copy/save_as semantics remain unchanged.

## Capabilities

### New Capabilities

- `ocu-replaced-index-recovery`: retention and idempotent completion of non-copy publication across broker-index outages. The broader publication capability remains in the active Office epic; the canonical missing-root capability concerns the explicitly excluded save-as owner.

### Modified Capabilities

None. Do not edit the active epic or archived change history for this independent follow-up.

## Impact

OCU `computer-use-server/office/publish.py`, owning publication/recovery tests and existing callback/resolution consumers; source changelog and central publication-fence decision. No new service, route workaround, dependency, deployment configuration or production test hook.

## Risk triage

Issue type: bugfix. Fixture level: expanded; upstream suggested level absent. Blast radius: lost publication responsibility, duplicate broker revisions, premature session orphaning and unsafe witness adoption. Selected packs: entrypoints, file IO/path safety, persisted fields, authorization/epoch admission, concurrency/ordering, compatibility, partial-output errors and documentation. Evidence floor: native killed publisher/fresh recovery RED/GREEN; full owning/consumer regression; exact-source scoped checks and three-seat review. Construction/critical evidence is parent-owned and role-separated, not an OS-enforced verifier enclave.
