# Tasks

## 1. Canonical helper ownership

- [x] 1.1 Move existing reusable integration MCP helpers to one unambiguous support owner and migrate all consumers; verify helper AST equivalence, no old re-exports, and unchanged fixture/test assertions.
- [x] 1.2 Preserve the original full-root import failure and the candidate console regression. Qualify both `python -m pytest ... --import-mode=importlib` (full and focused) and the documented console `pytest tests/integration/` (default prepend, no PYTHONPATH override). Require exact raw node-ID equality before/after for each focused invocation. For cross-invocation equality, normalize only the rootdir-dependent `tests/integration/` prefix to integration-relative paths, retaining every test/parameter suffix; record raw-to-normalized mappings. Require zero collection errors after repair.
- [x] 1.3 Run the original full unit-plus-integration command against the isolated full-image stack and record execution separately from collection; preserve every failure/skip and verify owned cleanup. Update existing test guidance/changelog with the import ownership boundary.

## 2. Delivery

- [ ] 2.1 Complete independent correctness/evidence review and source-bound local CI, merge source and companion PRs, and archive only this corrective fixture; the larger Office acceptance remains separate.

## Risk coverage

- Public CLI/script entry — selected: canonical full-root/focused importlib commands and the README/CI console focused command; exact integration node-ID equality and real console integration execution.
- Config/setup — selected: importlib discovery, helper module identity and unchanged pytest fixture ownership.
- Legacy compatibility — selected: unchanged helper ASTs, test IDs/assertions, credential and MCP request semantics; real integration execution.
- Error handling — selected: collection errors fail; unrelated execution failures remain visible, never filtered into a success claim.
- Documentation — selected: current helper import guidance and changelog; WebUI doc/decision gates and strict fixture validation.
- Auth/secrets — no product change; acceptance uses distinct private synthetic credentials and redacted public receipts.
- File IO, schema, concurrency, resource limits and release/dependency compatibility — no behavior changes. Image inputs, runtime cleanup and prior node-matching fixes are not altered.

The full-root RED is the existing three ImportErrors at source `9233845cb7c4a63087a72bfca4fdc005306aa302`, not a new mock or source-text assertion. It already exercises the intended pytest public boundary. The parent owns final verification; candidate workers do not edit the fixture or retained receipts.
