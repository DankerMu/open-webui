# Crash-cut marker publication

## Why

Crash workers expose their final readiness path before writing the cut text. Local qualified Linux execution observed empty marker reads; a controlled open-before-write probe reproduces the gap in all four producer families, including resolution.

## What Changes

- Publish complete cut text through a closed same-directory staging file and an atomic filesystem publication operation.
- Share the marker writer across publication, copy, retirement and resolution workers without changing their child environment or production fault hooks.
- Add behavioral readiness regression coverage; preserve exact consumer checks, every crash cut, SIGKILL and recovery assertions.

## Capabilities

### New Capabilities

- `ocu-crash-cut-markers`: complete readiness publication for transactional crash-test workers. Existing contention-lifetime and pytest-discovery specs do not define this producer contract.

## Impact

OCU tests only: shared child protocol `_office_store.py`, workers in `test_office_publish_recovery.py`, `test_office_save_as.py`, `test_office_resolution.py`, focused regression coverage and existing test README. Related issue: DankerMu/open-webui#512.

Issue type: test
Fixture level: expanded
Upstream suggested level: absent (concurrency and file-publication triggers)
Blast radius: false crash readiness or altered fault cuts could invalidate recovery evidence.
Selected risk packs: File IO / path safety / overwrite; Concurrency / shared state / ordering; Error handling / rollback / partial outputs; Documentation / migration notes.
Evidence floor: controlled failing-before visibility probe; regression proving incomplete staging is invisible and completed cut visible; saved-publication primitive bypasses fault hooks; qualified Linux affected-module execution with original node inventory and crash assertions preserved; three-seat review.
