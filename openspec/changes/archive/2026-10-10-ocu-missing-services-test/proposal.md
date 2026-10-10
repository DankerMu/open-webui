## Why

The deploy test class defines the same missing-services test twice. Python retains only the last definition; the earlier copy adds no coverage and triggers Ruff F811.

## What Changes

Remove the earlier duplicate from OCU `tests/deploy/test_check_ports.py`. Preserve the original test body, its collected identity, and all production code.

## Capabilities

No spec-level behavior changes. The existing `ocu-compose-port-matrix` fail-closed preflight requirement remains authoritative. `skip_specs: true` avoids inventing a behavioral delta for test cleanup.

## Impact

Issue: https://github.com/DankerMu/open-webui/issues/101

Issue type: test. Fixture level: compact. Upstream suggested level: absent.
Blast radius: one deploy test file. Selected risk pack: error handling, limited to preserving the existing missing-services rejection proof.
Evidence floor: focused pytest before/after, exact retained-method comparison, Ruff F output with no F811, and real checker valid/invalid input smoke.

No design document: no production design changes. No dependency, release-provenance, formatting, or unrelated F541 repair.

## Workflow deviations

The orchestrator performs the six-line mechanical deletion inline under the operating rule against delegating trivial cleanup. Fixture and code review remain independent. The installed OpenSpec CLI supports `skip_specs` for unchanged behavior; this replaces the workflow's generic delta requirement without changing any product requirement.
