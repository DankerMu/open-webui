# Proposal

## Why

Issue #247 identifies a path-following `.lifecycle.lock` open after Office's regular-file precheck, and direct sandbox-reap acquisition without that precheck. The shared owner validates a chat directory during create-capable setup but closes its directory descriptors before reopening the lock by pathname, so a host-side replacement can redirect acquisition.

## What Changes

- Keep canonical chat-directory acquisition and lock opening descriptor-relative to the trusted configured data root; refuse symlink traversal and require a regular acquired lock before flock.
- Preserve one shared owner, admitted reentrancy, cross-process exclusion, missing-chat semantics, lock creation in an existing chat, and #214's parent-directory synchronization.
- Add deterministic post-precheck and parent-replacement proof, direct/reap non-regular refusal, bounded FIFO and acquisition-cleanup cases; migrate existing fault seams without weakening their public assertions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-lifecycle`: add descriptor-bound regular-file admission to the existing shared lock contract.

## Impact

Source: OCU `computer-use-server/docker_manager.py`; tests in `tests/orchestrator/`, including the existing lifecycle, Office sweep, control-plane and history seams. Reuse `descriptor_io` flags and existing real-flock process helpers. Do not import Office error policy into the lifecycle owner or change the read-only descriptor helper API. Source changelog and the existing lifecycle decision accompany the fix after runtime proof.

The adversary needs host-side write access to the chat control directory. The sandbox mounts its `outputs` child, not the lock. This is not a LAN/remote exploit, and no external file-content write is alleged. Configured data-root symlinks remain supported as trusted configuration. Hard-link policy, arbitrary regular-inode replacement, root-configuration retargeting, Office/workspace data handling and [unlock-failure cleanup #382](https://github.com/DankerMu/open-webui/issues/382) are out of scope.

## Risk triage

Issue type: bugfix.
Fixture level: expanded.
Upstream suggested level: absent; shared filesystem lock, path safety and cross-process ownership require expanded proof.
Blast radius: unsafe lock target, failed exclusion, leaked acquisition resources or changed missing-chat refusal.
Selected risk packs: Public API / CLI / script entry; File IO / path safety / overwrite; Concurrency / shared state / ordering; Resource limits / large input / discovery; Legacy compatibility / examples; Error handling / rollback / partial outputs; Documentation / migration notes.
Evidence floor: tracer-first semantic RED/GREEN, actual opened/flocked inode observations, real cross-process contention, bounded non-regular and setup-failure proof, full affected Docker-free source regression, scoped static/docs/strict checks and expanded review.
