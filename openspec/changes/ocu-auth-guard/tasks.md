# Tasks

## 1. Boundary implementation

- [x] 1.1 Add behavior tests in OCU tests/test_auth_guard.py and qualify semantic red at real boundaries; record base-source assertion failures separately from missing-module setup failures and qualify new-only startup behavior with controlled mutants.
- [x] 1.2 Implement central auth_guard and minimal app/MCP/security wiring; prove distinct MCP credentials cannot substitute, all identity aliases are guarded, valid IDs are not coerced to default, and context does not survive request completion/error.
- [x] 1.3 Wire production startup preflight and explicit Docker packaging; execute the actual multi-worker command without token and require parent exit non-zero, then configured health and MCP initialization success.
- [x] 1.4 Migrate affected existing test clients, CI collection/smoke, compose/Helm token configuration and public docs. Preserve unrelated behavior; leave production tool/filter callers to #10/#11 and untracked deploy/ and docs/decisions/ untouched.

## 2. Evidence and review

- [x] 2.1 Run `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/ -q --import-mode=importlib --ignore=tests/integration` with configured test token, plus `./tests/test-project-structure.sh`; retain output and exit codes. Result: 440 passed, 5 skipped; structure 24 passed. Import failures are not semantic red.
- [ ] 2.2 Deferred to consolidated epic acceptance by user instruction on 2026-09-22: run the existing Docker integration suite with distinct credentials after all development. Image startup and mounted MCP smoke have passed; the full sandbox build was cancelled, and integration is not claimed complete.
- [x] 2.3 Strict fixture validation and fixture review passed; three-seat cross-review plus one fix pass and fresh re-review closed all findings on OCU head `8be4d3c48213436a1933e04016e25d4166986370`. REST Bearer compatibility is preserved.

## Risk packs

| Pack                                           | Selection and evidence                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Public API / CLI / script entry                | Selected: 1.1–1.3 HTTP, WS, mounted MCP and startup                                            |
| Config / project setup                         | Selected: 1.3–1.4 missing/malformed config and deployment wiring                               |
| File IO / path safety / overwrite              | Selected: 1.1–1.2 denied requests have no IO; existing traversal tests stay meaningful         |
| Schema / columns / units / field names         | Not selected: no persisted schema changes                                                      |
| Auth / permissions / secrets                   | Selected: 1.1–1.2 and 2.3 independent credential matrix, identity and containment              |
| Concurrency / shared state / ordering          | Selected: 1.2 successive/concurrent request identity isolation and denial before side effects  |
| Resource limits / large input / discovery      | Not selected: no new upload limits or resource discovery behavior                              |
| Legacy compatibility / examples                | Selected: 1.4 and 2.1 test/default behavior migration without unauthenticated fallback         |
| Error handling / rollback / partial outputs    | Selected: 1.1–1.3 startup/denial and no partial protected effects                              |
| Release / packaging / dependency compatibility | Selected: 1.3–1.4 and 2.2 actual packaged entrypoint; dependency upgrades excluded             |
| Documentation / migration notes                | Selected: 1.4 paired caller/server configuration, credential carriers and fail-closed contract |
