# Tasks

## 1. Caller cutover

- [ ] 1.1 Extend tests/test_tools.py with behavioral semantic-red cases for all outgoing transports, all empty-chat wrappers, server identity and credential rotation; include real in-process guard acceptance/401 when credentials are stripped. Preserve upload deduplication and cleanup behavior.
- [ ] 1.2 Read the internal token only from process environment at call time; keep it out of Valve schema/value serialization. Migrate MCP/probe/upload header construction and cached-client identity, remove every default fallback, and reject missing chat or unusable credentials before work; prove focused tests green including environment-only rotation and Valve non-disclosure.
- [ ] 1.3 Update directly relevant tool provisioning docs and changelog; verify all changed private-signature callers and keep public tool argument signatures unchanged.

## 2. Verification

- [ ] 2.1 Run focused tests/test_tools.py and the configured OCU non-Docker suite: `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/ -q --import-mode=importlib --ignore=tests/integration`; record output and run the structure check. Do not run Docker; consolidated epic task 19.0 owns it.
- [ ] 2.2 Strict fixture validation and fixture review before implementation; expanded cross-review before merge; publish evidence with exact revision and residual Docker deferral.

## Risk packs

- Public API / CLI / script entry — selected: 1.1–1.2 public tool errors, results and actual transport.
- Config / project setup — selected: 1.2–1.3 missing token and rotation/provisioning.
- Auth / permissions / secrets — selected: 1.1–1.2 real guard, distinct credentials, trusted identity, non-disclosure.
- File IO / path safety / overwrite — selected: 1.1–1.2 no upload before identity validation; preserve existing file dedup/cleanup, no path-policy changes.
- Concurrency / shared state / ordering — selected: 1.1–1.2 cached configuration and per-call identity; no cross-user state.
- Legacy compatibility / examples — selected: 1.2–1.3 stable tool signatures, MCP key and results; documented explicit chat requirement.
- Error handling / rollback / partial outputs — selected: 1.1–1.2 early errors and final error status; no partial unauthorized upload.
- Documentation / migration notes — selected: 1.3 server-only provisioning and paired rollout.
- Schema / columns / units / field names — not selected: no persisted schema change.
- Resource limits / large input / discovery — not selected: no new limits or discovery.
- Release / packaging / dependency compatibility — not selected: standalone tool file, unchanged packaging/dependencies; Docker acceptance deferred explicitly.
