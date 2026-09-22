# Tasks

## 1. Boundary implementation

- [ ] 1.1 Add behavior tests in OCU tests/test_auth_guard.py and capture semantic red against pre-change production source: HTTP, identity, WebSocket and mounted MCP denial before work, invalid IDs, peer denial, CORS and authorized positives.
- [ ] 1.2 Implement central auth_guard and minimal app/MCP/security wiring; prove distinct MCP credentials cannot substitute, all identity aliases are guarded, valid IDs are not coerced to default, and context does not survive request completion/error.
- [ ] 1.3 Wire production startup preflight and explicit Docker packaging; execute the actual multi-worker command without token and require parent exit non-zero, then configured health and MCP initialization success.
- [ ] 1.4 Migrate affected existing test clients, CI collection/smoke, compose/Helm token configuration and public docs. Preserve unrelated behavior; leave production tool/filter callers to #10/#11 and untracked deploy/ and docs/decisions/ untouched.

## 2. Evidence and review

- [ ] 2.1 Run `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/ -q --import-mode=importlib --ignore=tests/integration` with configured test token, plus `./tests/test-project-structure.sh`; retain output and exit codes. Run the auth module alone for red/green, never count import failure as red.
- [ ] 2.2 Exercise image startup and authenticated MCP using Docker locally or observed CI; run existing Docker integration suite with updated distinct credentials. Record actual availability and results, not expected results.
- [ ] 2.3 Validate this fixture strictly and obtain fixture approval before implementation; obtain correctness, test-evidence/spec-compliance and security review before merge. Verify WebUI client Bearer compatibility and no token disclosure in responses/logs.

## Risk packs

| Pack | Selection and evidence |
| --- | --- |
| Public API / CLI / script entry | Selected: 1.1–1.3 HTTP, WS, mounted MCP and startup |
| Config / project setup | Selected: 1.3–1.4 missing/malformed config and deployment wiring |
| File IO / path safety / overwrite | Selected: 1.1–1.2 denied requests have no IO; existing traversal tests stay meaningful |
| Schema / columns / units / field names | Not selected: no persisted schema changes |
| Auth / permissions / secrets | Selected: 1.1–1.2 and 2.3 independent credential matrix, identity and containment |
| Concurrency / shared state / ordering | Selected: 1.2 successive/concurrent request identity isolation and denial before side effects |
| Resource limits / large input / discovery | Not selected: no new upload limits or resource discovery behavior |
| Legacy compatibility / examples | Selected: 1.4 and 2.1 test/default behavior migration without unauthenticated fallback |
| Error handling / rollback / partial outputs | Selected: 1.1–1.3 startup/denial and no partial protected effects |
| Release / packaging / dependency compatibility | Selected: 1.3–1.4 and 2.2 actual packaged entrypoint; dependency upgrades excluded |
| Documentation / migration notes | Selected: 1.4 paired caller/server configuration, credential carriers and fail-closed contract |
