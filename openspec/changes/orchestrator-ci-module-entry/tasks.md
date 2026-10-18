# Tasks

## 1. Diagnosis and contract

- [x] 1.1 Reproduce exact console invocation on local Ubuntu/Python3.13 with declared pip commands and no PYTHONPATH; retain exit4 before collection, module-entry collection control and exact2874-node same-environment comparison.
- [x] 1.2 Obtain expanded fixture-review pass and strict validation before workflow edits.

## 2. Invocation repair

- [x] 2.1 Change only the orchestrator workflow invocation; verify the diff preserves selection, import mode, all tests/fixtures, sibling commands, job environment, dependency installation and triggers.
- [x] 2.2 Execute the exact corrected command on the frozen candidate in the qualified local Linux environment; retain all test/skip outcomes and source/package/image identities. Verify failure propagation without adding source-text tests.
- [x] 2.3 After runtime proof, update the existing tests README and record precise local-versus-hosted limitations and owned-resource cleanup.

## 3. Delivery

- [ ] 3.1 Publish evidence and expanded independent review; flag the CI-file change, use authorized local CI, merge paired PRs with empty automatic-closing sets, archive and manually close the issue.

## Risk packs

- Selected — Public API/CLI/script entry: exact before/after invocation in1.1/2.2; no product CLI change.
- Selected — Config/project setup: declared Python/dependencies/env and root resolution in1.1/2.1/2.2; no global pytest config.
- Selected — Resource/discovery: exact same-environment node IDs and complete execution in1.1/2.2; no timeout/filter/skip policy change.
- Selected — Compatibility/examples: sibling commands and fixture semantics preserved in2.1; README in2.3.
- Selected — Documentation: current entrypoint guidance and scope/evidence in2.3/3.1.
- Not selected — File publish/path safety, schema, auth behavior, shared-state/concurrency, rollback/partial writes, release/dependency compatibility: no such behavior changes. Existing test assertions stay immutable; failures remain visible. Source snapshots exclude untracked secrets; no LAN/release certification.

## Evidence boundary

The [verification packet](../../../docs/evidence/issue-446/verification.json.gz) records the original console exit 4 and corrected complete 2874-node execution on local Ubuntu 24.04/Python 3.13.11 with the declared pip dependencies and runner Node 22.23.3. The qualified result is 2864 passed, 5 failed, 5 existing live-CLI skips and 3 passing subtests, exit 1: four crash-marker observations are tracked in #512 and one pause/read observation in #513. The entry/import criterion is satisfied; the suite is not green. The initial missing-Node run is retained as unqualified environment evidence. All 948 archived source files remain unchanged; owned containers are gone and the builder is stopped. The unqualified image is removed; the qualified image is retained for those queued diagnoses. No hosted-runner, native non-Docker Linux, LAN or release acceptance is claimed.
