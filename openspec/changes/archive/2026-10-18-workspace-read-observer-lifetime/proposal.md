# Workspace read-observer lifetime

## Why

The running-overwrite safety test matches reads against a path-stat identity after that file has been replaced. A descriptor-bound Linux trace shows the old workspace identity reused by a later index file; the assertion misclassifies an index read as unpaused workspace content. Retaining the original workspace descriptor makes the unchanged test pass while preserving the pause oracle.

## What Changes

- Bind the resolution, restore and publish-fence read observers to a live, retained file descriptor for their complete observation window.
- Give the notice read-counter helper an explicit context lifetime and migrate all eight callers (seven notice cases and one callback-recovery case); restore its hook before closing the held descriptor.
- Preserve every pause/read-count/final-content/publication/safety assertion; add no pathname exclusion or production change.

## Capabilities

### New Capabilities

- `ocu-workspace-read-observers`: stable resource identity and bounded ownership for workspace-content safety observations. Existing `ocu-pytest-discovery` and `ocu-crash-cut-markers` specifications do not define this read-observer lifetime.

## Impact

OCU `tests/orchestrator/test_office_resolution.py`, `test_office_restore.py`, `test_office_publish_fence.py`, `test_office_notice.py`, the counter caller in `test_office_callback_publish.py`, and existing test README. Related issue: DankerMu/open-webui#513.

Issue type: test
Fixture level: expanded
Upstream suggested level: absent (resource identity, shared hooks and file lifetime)
Blast radius: false positive or missed forbidden-read observation; leaked descriptor or hook after failure.
Selected risk packs: File IO / path safety / overwrite; Concurrency / shared state / ordering; Error handling / rollback / partial outputs; Documentation / migration notes.
Evidence floor: captured Linux fd resource/identity/pause/read-result, existing target red then unchanged-target retained-FD control green, real unpaused-read negative probe, observer retirement after success/failure, unchanged node inventory, qualified Linux orchestrator run and fresh qualified Darwin full-root acceptance, expanded cross-review.
