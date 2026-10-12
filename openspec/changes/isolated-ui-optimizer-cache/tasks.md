# Tasks

## 1. Diagnosis and fixture

- [x] 1.1 Retain the original route failure, exact module URL identities, controlled negative probes, fast real-Vite semantic RED and isolated-cache GREEN, actual registration/import observations, setup-failure distinction and pre-#153 source-history boundary; obtain independent fixture PASS and strict validation.
- [x] 1.2 Add a production-config-driven Playwright regression with real installed dependencies and owned temporary servers/caches; parent observes duplicate-registration RED before the fix. Add the missing/empty private-cache failure case without copying policy or changing existing smoke assertions.

## 2. Owned cache cutover

- [x] 2.1 Add the required harness-only cache setting and its owned scratch value at the existing launch owner; parent proves the unchanged regression GREEN, coherent registration/loading and fail-loud missing/empty configuration while non-harness behavior stays unchanged.
- [x] 2.2 Run full `make verify-ui`, then existing baseline acceptance against the still-running default service; retain screenshots, zero unexpected errors, actual private-cache ownership/removal and unchanged default-cache identities across the isolated run. Preserve every A-T01/A-T10 and Office case; stop only owned services.
- [x] 2.3 Run frontend tests, type ratchet, scoped lint, named harness Python static checks and changed-file formatting; bind current source/test/config identities to the outputs without changing dependencies or thresholds.

## 3. Delivery

- [ ] 3.1 After runtime proof document the optimizer owner in a testing decision, with a supersession check; retain bounded public evidence without authenticated traces, run docs/decisions/strict checks and complete expanded cross-review.
- [ ] 3.2 Publish authorized exact-head local CI and pre-merge evidence, merge, close the issue and archive the verified requirement through a separate docs PR.

## Risk packs

- Selected: Public API / CLI / script entry —2.1/2.2 preserve existing make targets, mandatory cases and failure status; no new user CLI.
- Selected: Config / project setup —1.2/2.1 prove the actual Vite configuration selects a private cache only for the enabled harness and rejects missing/empty required state.
- Selected: File IO / path safety / overwrite —1.2/2.2 keep temporary/cache creation and cleanup under run ownership; no whole-node_modules symlink, default-cache deletion or user-data reset.
- Not selected: Schema / columns / units / field names — no persisted application schema or payload change.
- Not selected: Auth / permissions / secrets — no authority change; 2.2 preserves A-T01, and 3.1 excludes raw authenticated traces from publication.
- Selected: Concurrency / shared state / ordering —1.1/1.2/2.1 exercise real replacement optimizer generations followed by reused-graph invalidation, with first/second registration evidence rather than a restart-only success.
- Selected: Resource limits / large input / discovery —1.2/2.2 require bounded owned-server cleanup and existing automatic browser-test discovery; no new production discovery policy.
- Selected: Legacy compatibility / examples —2.2/2.3 preserve default dev behavior, UI selectors, browser cases and installed dependency versions.
- Selected: Error handling / rollback / partial outputs —1.2/2.1 reject missing configuration and preserve actual exceptions; teardown must run on failure and no retry/timeout relaxation is allowed.
- Not selected: Release / packaging / dependency compatibility — no dependency/image/lockfile change or deployment certification.
- Selected: Documentation / migration notes —3.1/3.2 document ownership, provenance limits and the no-migration cutover, then promote the reviewed requirement.
