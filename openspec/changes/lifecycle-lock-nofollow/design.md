# Design

## Context

The existing owner takes a canonical per-chat RLock, reuses admitted flock depth for nesting, and otherwise opens one file handle. Its create-capable path already pins and synchronizes the data-root parent, but discards the directory descriptors before `Path.open("a+")`. Office's precheck is not the acquisition authority; `reap_idle` has none. See proposal.md for the threat boundary.

## Goals and non-goals

Governing invariant: every fresh outer lock admission uses a regular lock inode opened without traversing a symlink in the canonical chat component or lock leaf; nested admission reuses that verified outer transaction.

Preserve configured-root aliases, canonicalization, cross-worker flock, error visibility and all #214 fsync guarantees. `create=False` must not create an absent chat, but may create a missing lock in an existing chat, as the current owner does. No new HTTP error policy, permissions policy, lock namespace, reaper behavior or platform support.

## Decisions

- Open the configured data root with its existing trusted-root policy, then the canonical chat component with directory/no-follow flags. Hold the chat descriptor through lock acquisition; a later pathname replacement cannot redirect the leaf open.
- Open an existing lock relative to that descriptor, or exclusively create a missing leaf; after a creation conflict, open the winner once. Every path retains read/write, no-follow, close-on-exec and nonblocking flags, with no retry loop or pathname fallback. Verify `fstat` regularity before flock. Nonblocking file acquisition prevents a special entry from stalling before type rejection; flock itself retains blocking exclusion.
- Reuse `descriptor_io`'s flag vocabulary. Its read-only `open_regular` cannot create this lock; do not widen that API or duplicate the Office store. Preserve lock creation mode `0o666` under umask rather than adopting `os.open`'s `0o777` default.
- Preserve the RLock/depth ownership boundary and original exceptions. All newly owned file/directory descriptors retire on acquisition failure, including failures after a lock descriptor exists but before admission. Missing-chat non-creating return still releases its RLock when the context exits.
- Create-capable parent fsync stays before admission, including existing entries; nested and non-creating acquisitions add no fsync. Directory-close failures must not skip release of another acquired descriptor.
- Retarget the three existing `Path.open` fault seams to the actual descriptor-acquisition boundary. For disappearance before chat admission, retain source401/callback404/history404 and non-recreation assertions. A renamed directory already pinned by fd is distinct from a chat missing before acquisition; test parent replacement separately rather than force path-rewalk semantics.

## Verification seams

1. Wrap the real Office `_has_state` precheck and swap only after its first successful return. Record successful opens through both baseline path-open and descriptor-open dependencies and real flock inode identities; assert after the sweep so broad exception isolation cannot hide the evidence. Canary bytes alone are insufficient.
2. Exercise the shared owner directly and through `reap_known_sandboxes` with symlink and non-regular entries. FIFO runs use a bounded child/watchdog; no sleep-based race scheduling. Assert no unsafe flock, no protected operation/container stop and no leaked acquisition state.
3. Replace the chat pathname after directory admission at a controlled open boundary; require the outside canary never be opened/flocked and any admitted lock remain on the pinned directory's regular inode.
4. Reuse existing independent `LOCK_NB` process controls and #214 fault tests. Preserve nesting, configured-root symlinks, missing base/chat, existing-chat lock creation, original error propagation, descriptor retirement and another-thread reacquisition.
5. Parent runs actual filesystem/process probes and the Docker-free source suite using declared dependencies; source tests never replace the lock implementation. Existing independent test-side lock holders remain unchanged.

## Risks and containment

Host writers can still replace regular entries or retarget trusted root configuration; those are not prevented by no-follow acquisition and are not claimed. Test instrumentation must observe returned descriptors, not forbid a harmless no-follow attempt based on pathname resolution. Existing [unlock-failure cleanup #382](https://github.com/DankerMu/open-webui/issues/382) is separate from acquisition hardening.

## Migration and rollback

One in-place owner cutover; no on-disk format or migration. Existing regular lock files remain usable. Revert the issue commit for rollback; no parallel implementation or fallback path. Sequence: independent fixture pass → one post-precheck tracer RED → owner fix/GREEN → remaining fault and consumer proof → expanded review and paired merge/archive.
