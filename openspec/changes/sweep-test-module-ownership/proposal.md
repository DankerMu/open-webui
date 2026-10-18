# Office sweep test module ownership

## Why

The canonical root run reaches the real state precheck and installs the canary, then observes no lifecycle-lock open. The same target passes when only that node executes after full-root collection. Issue #445 requires diagnosis of execution-order state, not a change to production lock safety.

## What Changes

- Identify the first post-precheck divergence and the first predecessor that creates it.
- Repair only the established test-state or observer-ownership boundary.
- Retain the positive lock-attempt oracle and every canary identity, bytes, mode and directory-entry assertion.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ocu-pytest-discovery`: Office sweep safety evidence remains reachable under canonical execution order.

## Impact

OCU lifecycle-lock test and proven owning test fixtures/module lifecycle. No production lock, admission, storage, dependency, discovery-policy or consumer changes. The independent receipt identity issue #504 remains separate.

Issue type: bugfix (test infrastructure)
Fixture level: expanded
Upstream suggested level: absent; shared module state and safety-oracle ordering require expanded.
Blast radius: sweep regression reachability and consumers of changed test fixtures.
Selected risk packs: Config / project setup; Concurrency / shared state / ordering; File IO / path safety / overwrite; Error handling / rollback / partial outputs; Legacy compatibility / examples; Documentation / migration notes.
Evidence floor: qualified failing-order trace and minimization, unchanged canary oracle, same-process RED/GREEN, historical bounded selection and canonical full-root execution with all residual outcomes explicit.
