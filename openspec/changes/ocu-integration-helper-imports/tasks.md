# Tasks

## 1. Canonical helper ownership

- [ ] 1.1 Move existing reusable integration MCP helpers to one unambiguous support owner and migrate all consumers; verify helper AST equivalence, no old re-exports, and unchanged fixture/test assertions.
- [ ] 1.2 Qualify the existing pytest entrypoint: preserve the original full-root import failure; compare focused before/after and full-root integration node-ID sets exactly, with zero collection errors after the repair.
- [ ] 1.3 Run the original full unit-plus-integration command against the isolated full-image stack and record execution separately from collection; preserve every failure/skip and verify owned cleanup. Update existing test guidance/changelog with the import ownership boundary.

## 2. Delivery

- [ ] 2.1 Complete independent correctness/evidence review and source-bound local CI, merge source and companion PRs, and archive only this corrective fixture; the larger Office acceptance remains separate.

## Risk coverage

- Public CLI/script entry — selected: canonical full-root and focused pytest commands, exact integration node-ID equality.
- Config/setup — selected: importlib discovery, helper module identity and unchanged pytest fixture ownership.
- Legacy compatibility — selected: unchanged helper ASTs, test IDs/assertions, credential and MCP request semantics; real integration execution.
- Error handling — selected: collection errors fail; unrelated execution failures remain visible, never filtered into a success claim.
- Documentation — selected: current helper import guidance and changelog; WebUI doc/decision gates and strict fixture validation.
- Auth/secrets — no product change; acceptance uses distinct private synthetic credentials and redacted public receipts.
- File IO, schema, concurrency, resource limits and release/dependency compatibility — no behavior changes. Image inputs, runtime cleanup and prior node-matching fixes are not altered.

The full-root RED is the existing three ImportErrors at source `9233845cb7c4a63087a72bfca4fdc005306aa302`, not a new mock or source-text assertion. It already exercises the intended pytest public boundary. The parent owns final verification; candidate workers do not edit the fixture or retained receipts.
