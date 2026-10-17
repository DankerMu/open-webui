# Proposal

## Why

Issue #382 identifies skipped descriptor retirement when the shared lifecycle owner's explicit unlock raises. Depth is already removed and the thread lock is released, but the retained open file description can continue to exclude later lifecycle work. Runtime evidence will distinguish observed descriptor ownership from this source-level inference.

## What Changes

- Always attempt the outer owner's handle close and clear its retained handle, including explicit unlock failure.
- Preserve visible unlock/close errors, nested depth, canonical lock identity and cross-process exclusion.
- Add a deterministic release-failure regression and real-descriptor/process acceptance probe; do not change acquisition hardening or the separate committed-writer close boundary (#365).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-lifecycle`: outermost owner release retires descriptors despite unlock failure.

## Impact

OCU `computer-use-server/docker_manager.py` owner release and existing lifecycle-lock tests. WebUI owns this fixture, evidence and the existing lifecycle decision record update; no new configuration, dependency, interface or deployment change.

Issue type: bugfix
Fixture level: expanded
Upstream suggested level: absent; expanded because shared lock ownership, filesystem resources and concurrency are affected.
Blast radius: per-chat lifecycle serialization after a release syscall failure.
Selected risk packs: File IO / path safety / overwrite; Concurrency / shared state / ordering; Legacy compatibility / examples; Error handling / rollback / partial outputs; Documentation / migration notes.
Evidence floor: semantic injected-LOCK_UN RED; same-chat no-sleep reacquisition; real descriptor/process exclusion; focused and adjacent lifecycle regressions; independent review.
