# Tasks

## 1. Fixture and failure model

- [x] 1.1 Independently review this expanded fixture and run strict OpenSpec validation before edits; explicitly check the test-scoped real threaded-resolver selection and unchanged configured deadline plus150 ms allowance.
- [x] 1.2 Retain the original `calls == []` failure and distinguish observed facts from timing hypotheses. A bounded disposable pre-DNS dependency-delay control may establish that mechanism; preserve its exact command/result rather than repeatedly retrying the original test.
- [x] 1.3 Retain the actual callback resolver identity and single-variable default-versus-threaded discriminator. Default AsyncResolver returned502 without socket entry; real ThreadedResolver entered and returned502 before release, with bounded cleanup. Do not infer the original full run's exact backend from this current observation.

## 2. Oracle repair

- [x] 2.1 Select aiohttp's real ThreadedResolver in test scope; replace the test-local50 ms shortcut with the unchanged production-configured deadline, explicit resolver entry/release/return events and an owned concurrent POST. The real callback returns502 while DNS is still held, within the original deadline-overrun allowance.
- [x] 2.2 Preserve editing/download_failed, receipts, versions, output bytes and zero origin-hit assertions. Exercise success and assertion-failure cleanup; all owned workers release and join within explicit bounds.

## 3. Qualification and closure

- [x] 3.1 Run the repaired case against unchanged production, reject the disposable per-call-loop/resolver-shutdown-wait control for the intended invariant, and restore the real implementation to green. Record identities and all exits; no live production mutation or downloader stub is permitted.
- [x] 3.2 Run three declared stability trials S1/S2/S3 of the unchanged repaired case after restoration, retaining every outcome. These are qualification trials, not retries to erase a failure; any failed trial requires diagnosis.
- [x] 3.3 Run `tests/orchestrator/test_office_callback_processing.py` and `tests/orchestrator/test_office_download.py` with Python3.12, unchanged server requirements, pytest/pytest-asyncio and `--import-mode=importlib`; record resolved dependency versions, counts, skips and exits. Execute the actual test scenario as the changed CLI surface; do not claim Docker, DocumentServer UI or LAN certification.
- [ ] 3.4 Update source changelog and owning verification rationale, retain evidence, run the expanded independent review and source/central scoped gates, merge paired PRs and archive this fixture. Issue199 remains blocked until the separate #341 prerequisite also closes.

## 4. Risk-pack map

- Selected — Public API: 2.1/2.2 preserve the actual callback status, reason and failure-state boundary; no response stubs.
- Not selected — Config/project setup: no production configuration/dependency changes; use the existing configured deadline.
- Selected — File IO/path safety/overwrite: 2.2 retains existing unchanged-output/version/receipt assertions and fixture-owned data.
- Not selected — Schema/columns/units/field names: no persisted or wire schema changes.
- Not selected — Auth/permissions/secrets: existing callback authentication remains in the real route and owning module tests; no authorization change.
- Selected — Concurrency/shared state/ordering: 2.1/2.2 prove resolver entry, response-before-release and bounded joins on all paths.
- Selected — Resource limits/large input/discovery: 2.2 bounds test workers/readiness/cleanup; large-file or MCP discovery policy is explicitly outside scope.
- Selected — Legacy compatibility/examples: 3.3 retains adjacent callback and downloader regression coverage without changing production.
- Selected — Error handling/rollback/partial outputs: 2.2/3.1 preserve failure transitions and test teardown even for the bad implementation control.
- Not selected — Release/packaging/dependency compatibility: no image or deployment work.
- Selected — Documentation/migration notes: 3.4 records oracle semantics and limits; central `make doc-gate`, `make decisions-verify` and strict OpenSpec validation apply.
