# Recovery test environment

## Why

Recovery database tests leave their fake Docker environment in the pytest process. Later integration subprocesses inherit that PATH and invoke the fake instead of the real engine (issue #444).

## What Changes

- Bound the recovery database fake environment to each unittest lifecycle, including setup and body failures.
- Add regression evidence for exact environment restoration and sequential bare-Docker resolution.
- Preserve all existing deploy and real integration assertions.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-pytest-discovery`: recovery fixture state must not contaminate later tests in canonical root execution.

## Impact

OCU `tests/deploy/test_recovery_db.py` and its lifecycle regression coverage; no production, dependency, integration-consumer or fake-parser changes.

Issue type: bugfix (test infrastructure)
Fixture level: expanded
Upstream suggested level: absent; expanded because process-global state crosses suite boundaries.
Blast radius: later subprocess environment and real-Docker inspection.
Selected risk packs: Config / project setup; Concurrency / shared state / ordering; Error handling / rollback / partial outputs; Legacy compatibility / examples; Documentation / migration notes.
Evidence floor: semantic RED/GREEN, lifecycle boundary cases, sequential real Docker inspection, unchanged five real integration cases in canonical root execution, explicit residual failures.
