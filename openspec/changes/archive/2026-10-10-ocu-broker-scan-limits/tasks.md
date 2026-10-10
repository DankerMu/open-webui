# Tasks

## 1. Bounded scan implementation

- [x] 1.1 Add the real-filesystem default-budget tracer through reconcile and record a semantic RED before production edits; the predecessor is seeded and Docker is forbidden.
- [x] 1.2 Add strict lowerable constructor ceilings and scan-local entry/directory/FD guards to the existing iterative traversal; verify exact and one-over boundaries, root and iterator accounting, hidden/symlink/special entries, and no post-limit stat/hash/open.
- [x] 1.3 Preserve shared non-scan consumers and owned-resource unwind; verify EMFILE/ENFILE classification at root/child open and iterator creation/advance, real constrained-RLIMIT behavior, borrowed-root usability and no descriptor/lock leak.
- [x] 1.4 Verify failed scans retain index bytes, counter, ids and revisions and later valid reconcile succeeds; run the owning broker/endpoint modules including 80-deep and5000 unchanged compatibility controls.
- [x] 1.5 Exercise actual reconcile plus the existing HTTP413 mapping against temporary data; preserve measured output and remove probes; update the existing broker decision record with the approved policy.
- [x] 1.6 Complete expanded source cross-review and exact-head local CI; attach evidence to the paired source/fixture PRs. Archive this fixture only after both PRs merge.

## 2. Risk packs

- Public API / CLI / script entry: selected; new constructor boundaries and actual HTTP413 smoke through the unchanged mapper.
- Config / project setup: not selected; constructor-only policy, no environment/dependency/CI configuration change.
- File IO / path safety / overwrite: selected; real trees, FD ownership/unwind, predecessor bytes and existing confinement tests.
- Schema / columns / units / field names: not selected; persisted schema unchanged; counts are entries/directories/FDs, not byte units.
- Auth / permissions / secrets: not selected; no authorization change; existing endpoint tests retain path-redacted failure behavior.
- Concurrency / shared state / ordering: selected; scan-local counters, transaction-lock release after refusal and atomic predecessor preservation; existing multiprocess reconciliation remains green.
- Resource limits / large input / discovery: selected; exact/overflow budgets, entry types and tree shapes, native constrained-RLIMIT and iterator-descriptor evidence.
- Legacy compatibility / examples: selected; 80-deep/5000-file cases, existing constructor ceilings, normal pages, hashing/identity and non-scan registration callers.
- Error handling / rollback / partial outputs: selected; limit and OS-exhaustion failures must preserve authority, release owned resources and never return success/truncation or retryable503.
- Release / packaging / dependency compatibility: not selected; no deployment/image/package change.
- Documentation / migration notes: selected; owner-approved policy and unchanged index schema documented, strict OpenSpec/doc-gate/decisions verification.
