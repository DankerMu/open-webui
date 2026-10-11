# Tasks

## 1. Fixture and counterexamples

- [x] 1.1 Review this expanded fixture against approved issue policy and concrete consumer/reader seams; strict OpenSpec validation passes before source edits. Preserve the issue's real baseline stall rather than rerunning it for confirmation.
- [x] 1.2 Add focused behavioral regressions through discovery/list/read and upload/lifecycle boundaries; retain semantic red evidence against the unchanged source for each new failure class before its fix.
  - Owner exception on2026-10-11: accept only the disclosed per-class test-execution sequencing deviation, retaining all assertions, thresholds, qualified negatives, independent review and full CI. Additional20 negative/20 restored cases are late qualification, not original pre-fix history. [Explicit decision](https://github.com/DankerMu/open-webui/issues/199#issuecomment-6106574132).

## 2. Discovery transaction

- [x] 2.1 Enforce exact per-chat/global/entry/directory/descriptor ceilings and bounded admission; prove exact limits, first excess rejection, replacement accounting and no empty/failed-chat accumulation.
- [x] 2.2 Release all owned resources on scan/metadata/construction/OS exhaustion failures and cancellation; prove borrowed-root usability, wide/deep/mixed constrained-FD behavior, and recovery after each failure. Occupy the executor, cancel an admitted queued discovery, release executor occupancy and prove subsequent real list/read synchronization succeeds. Also cancel a running discovery and race cancellation with worker start: admission stays held until ownership ends, with no double release or overlapping preparations.
- [x] 2.3 Prepare off-loop and publish one complete FastMCP snapshot; actual FastMCP list/read under worker replacement sees complete old/new sets and unchanged unrelated content, including failed-replacement conservation.
- [x] 2.4 Migrate upload/lifecycle consumers to explicit outcomes; committed uploads retain bytes, receipts and success fields while consumers report the separate warning, and lifecycle discovery failure reaches its initiator without new orphan creation.

## 3. Independent runtime acceptance

- [x] 3.1 Run source owning tests with Python 3.12 and unchanged requirements, recording resolved dependency versions: `tests/orchestrator/test_mcp_resources.py`, affected upload/lifecycle/consumer modules and any paired discovery regression module. Preserve collected/executed/skipped counts and command exits. Run the repository's affected static/documentation checks without introducing dependency changes.
- [x] 3.2 Exercise actual discovery and actual MCP readers over an external-thread loopback driver with real temporary files. Run an idle control, then at least 10 seconds and 300 completed loaded read samples for each of the 100,000-file rejection and repeated multi-chat sync/list workloads. Record per-request start/end, operation intervals, p95/max, environment/dependency/source identities and all errors. No idle padding in loaded statistics. Require idle max <=10 ms, loaded p95 <=250 ms and max <=500 ms; a noisy idle run is inconclusive, not pass. Keep the raw evidence and remove only owned temporary trees/processes.
- [x] 3.3 Smoke the actual upload route's committed-success/discovery-failure envelope and the lifecycle error boundary with real filesystem/MCP state; mocks may isolate Docker effects but do not certify real Docker lifecycle or the deferred image batch.
- [ ] 3.4 Update the owning decision and source changelog, attach evidence and limitations, run three-seat independent source review and approved local CI, then merge paired PRs and archive the fixture.

## 4. Risk-pack map

- Selected — Public API: 2.4/3.3 cover the additive upload outcome and lifecycle errors at initiating consumers.
- Not selected — Config/project setup: no new configuration knobs; dependency/runtime setup remains unchanged.
- Selected — File IO/path safety/overwrite: 2.1/2.2 and existing symlink/nested-read regressions; preserve descriptor-relative containment and no-replace receipts.
- Not selected — Schema/columns/units/field names: no persisted schema change; response fields are covered by Public API.
- Not selected — Auth/permissions/secrets: preserve existing guards; path-redacted errors verified under 2.4; per-chat MCP authorization remains explicitly out of scope.
- Selected — Concurrency/shared state/ordering: 2.3 tests actual readers and both async/sync initiators, not merely a writer lock.
- Selected — Resource limits/large input/discovery: 2.1/2.2/3.2 cover intermediate as well as committed capacity.
- Selected — Legacy compatibility/examples: 2.4 and existing nested URI/text/binary/receipt tests preserve caller behavior.
- Selected — Error handling/rollback/partial outputs: 2.2/2.4 preserve old snapshots and committed uploads; no successful partial discovery.
- Not selected — Release/packaging/dependency compatibility: pinned MCP is inspected and exercised, not upgraded; no image build or deployment in this source issue.
- Selected — Documentation/migration notes: 3.4 records capacity, admission and consumer error contracts; central `make doc-gate` and `make decisions-verify` plus strict OpenSpec validation.
