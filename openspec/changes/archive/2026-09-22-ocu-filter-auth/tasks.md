# Tasks

## 1. Filter and configuration cutover

- [x] 1.1 Extend existing filter/startup tests with semantic red for real guarded fetch, cache authority/auth rejection, redirect containment, startup trailing-slash refusal and concrete-file preview/no-file behavior. Preserve successful prompt baseline.
- [x] 1.2 Authenticate filter fetch from env-only token, reject redirects and remove internal-public fallback; bind cache validity to credential/origin and keep authorization rejection separate from transient unreachable fallback. Verify real non-Docker guard cases green.
- [x] 1.3 Implement raw PUBLIC_BASE_URL trailing-slash rejection in the existing server configuration/startup ownership path, before the multi-worker supervisor; remove silent normalization and prove actual production-command rejection plus valid-base header/prompt behavior without Docker.
- [x] 1.4 Switch preview decoration to the first current-chat concrete file, retain archive toggle/idempotency, remove dead browser-only trigger logic. Verify foreign-base/chat, percent-encoded paths, repeated outlet and no-file results.
- [x] 1.5 Update directly affected docs/changelog with strict startup migration, env-only filter token and cookie-file preview contract; record the user-approved scope/behavior decisions.

## 2. Evidence and review

- [x] 2.1 Final configured non-Docker suite: 485 passed, 5 skipped; structure: 24 passed. Focused filter: 55 passed; auth/startup: 93 passed. Command: `uv run --no-project --with pytest --with-requirements computer-use-server/requirements.txt -- python -m pytest tests/ -q --import-mode=importlib --ignore=tests/integration`. Docker remains deferred to epic task 19.0.
- [x] 2.2 Fixture review and strict validation passed. Three-seat review, two repair passes and fresh final re-review clean at `7829193556c7d958aa4953980510a135d8fa8783`. Clarified scope and evidence published at https://github.com/DankerMu/open-computer-use/pull/5#issuecomment-5773651554; Docker is deferred, not passed.

## Risk packs

- Public API / CLI / script entry — selected: 1.1–1.4 filter inlet/outlet and process startup.
- Config / project setup — selected: 1.3 strict PUBLIC_BASE_URL startup and 1.5 rollout docs.
- Auth / permissions / secrets — selected: 1.1–1.2 env-only secret, real guard, redirects, warm-cache rejection.
- Concurrency / shared state / ordering — selected: 1.1–1.2 per-chat/user cache and config authority changes.
- Legacy compatibility / examples — selected: 1.3–1.5 explicit user-approved breaking changes and preserved prompt baseline.
- Error handling / rollback / partial outputs — selected: 1.1–1.3 authorization vs transient failure, no stale authority, startup rejection.
- Release / packaging / dependency compatibility — selected: 1.3 packaged startup command exercised without Docker; no new dependencies.
- Documentation / migration notes — selected: 1.5 trailing-slash removal before rollout and concrete file link behavior.
- File IO / path safety / overwrite — not selected: no file operations changed; browser URL matching is covered under API/auth.
- Schema / columns / units / field names — not selected: no persistence schema changes.
- Resource limits / large input / discovery — not selected: preserve existing bounded LRU; no new discovery/limit behavior.
