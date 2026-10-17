# Design

## Context

Change surface: OCU's three existing atomic writers and their upload, output-listing and Office consumers. Existing descriptor utilities distinguish caller policy; none of these writers may infer rollback from final cleanup failure. The shared close operation belongs beside the existing descriptor primitives, not in a second atomic-write implementation.

Governing invariant: final owned-directory cleanup must preserve the atomic resource outcome and the earlier failure while attempting each remaining owned directory exactly once.

Sibling surfaces: broker reconciliation and explicit registration, import-receipt replay, Office state updates, immutable-version ownership cleanup, browser/DocumentServer callbacks, output-listing recovery and publication journal recovery. In particular, `office/versions.py` treats `StateDurabilityError` as postcommit; committed-close outcomes must receive the same retain-referenced-blob treatment without being mislabelled as a synchronization failure.

## Goals / Non-Goals

Must preserve: schema bytes/validation, no-follow acquisition, lock/fence ordering, receipt idempotency, revision and recovery semantics, HTTP status policies, existing directory-fsync classification and ordinary error envelopes.

Non-goals: temporary-file-close behavior, read/acquisition cleanup, retrying failed closes, a generic atomic writer abstraction, new automatic retries, power-loss claims, dependencies, images, pins or deployment. A close error is not proof the kernel retained or retired that descriptor.

The close algorithms in `office/versions.py:_publish_blob`, `_unlink_blob` and `office/callback.py:_replay_barrier` remain outside this three-writer change; their separate owner-cleanup follow-up is [issue473](https://github.com/DankerMu/open-webui/issues/473). Their callers still participate in the in-scope committed-state outcome audit.

## Decisions

- One shared final-directory cleanup implementation collects only expected `OSError` failures and attempts every supplied owned directory once. Writers pass their explicit primary error and completed replacement/synchronization state; avoid inferring primary ownership from an unrelated ambient exception.
- With an earlier error, re-raise that same primary error with its existing cause; attach the actual secondary close errors and a traceback-visible note. Do not replace it with a generic wrapper or an exception group that would bypass existing typed handlers.
- Without an earlier error, raise `descriptor_io.CommittedCloseError`, a shared `RuntimeError` independent of `OSError`, `CommitDurabilityError` and `StateDurabilityError`, retaining the actual close errors, `committed` fact and atomic resource. Explicitly update affected typed handlers rather than mislabelling a completed sync as a durability failure. A close-only outcome occurs after the writer's successful directory synchronization.
- Public mappings keep HTTP500, with `reason: committed_close_failed`, `committed: true`, and `resource` identifying `outputs_index`, `import_receipts` or `office_state`. Keep each surface's existing envelope and omit raw IO text/host paths. The resource qualifier prevents a state/index commit from implying completed workspace publication.
- Audit all postcommit-sensitive consumers, especially version-blob cleanup and publication recovery. Preserve recovery obligations rather than converting the error to successful publication or blind re-registration.

## Evidence and Sequencing

One implementation owner; parent freezes and runs each test-only tracer before source changes. Start with broker close-after-sync, then receipt/replay and Office state/blob/callback slices. Freeze each semantic RED oracle unchanged through GREEN. Add simultaneous primary/cleanup failures and multiple close failures as discriminating controls, including write/replace/fsync and a pre-existing primary cause.

Seams under test: public broker reconciliation, direct receipt persistence and upload HTTP, Office store/version operations, authenticated callback/browser HTTP, plus the actual publication recovery path. Faults retire the real target descriptor before raising and track inode identities/close attempts; emergency test cleanup must not count as production cleanup.

Required evidence: complete predecessor/successor JSON, retained exact version bytes, same-id upload replay with one workspace file, accurate HTTP reason/resource and unchanged directory-fsync mapping; private real-filesystem/loopback HTTP probe plus adjacent regression matrix. All source, oracle, fixture and runner bytes are hash-bound before/after execution; original failures and environment limits remain in durable evidence.

## Risks / Trade-offs

- Preserving primary classification can hide cleanup in ordinary HTTP detail → retain actual secondary errors on the exception and traceback-visible notes; do not leak them to clients.
- A broad postcommit catch can retain blobs on a true precommit failure → distinguish the typed outcome and prove both retained-postcommit and removed-precommit cases.
- Fault injection after real close is deterministic but not a kernel-close reliability proof → report that limit and never retry the uncertain close.

## Migration and Rollback

No persisted format or migration change. Merge paired source/control-plane delivery only after expanded three-seat review and exact-head scoped CI, then archive and manually close the issue. Rollback is a source revert, not deletion or rewriting of committed state; it restores the inaccurate error classification and is not a repair of filesystem failures.
