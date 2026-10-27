## 1. Fixture

- [x] 1.1 Expanded fixture, read-only fixture review, `openspec validate ocu-sandbox-messages-ingress --strict --no-interactive`.

## 2. Implement (OCU, branch `claude/plan2-messages-ingress`)

- [x] 2.1 Tests first for design evidence a–k; record which fail on `main`.
- [x] 2.2 Static ingress nginx config in `deploy/proxy/`, Dockerfile `COPY`, `.dockerignore`; `messages-ingress` service with entrypoint override in `compose.proxy.yml`.
- [x] 2.3 `OCU_SANDBOX_MESSAGES_ADDRESS` validator as a separate `deploy/firewall/policy.py` subcommand; called by the `deploy/up.sh` preflight and by `deploy/production-like-test/scripts/bootstrap-test.sh` (which writes the variable). Rewrite `test_bootstrap_runtime.py:571-574` to the new rule; the shared `fake_env` helper (`tests/deploy/support.py:348-367`, feeding every `up.sh`-running suite) gains `OCU_SANDBOX_MESSAGES_ADDRESS` and the ingress `/32` in its allowlist value, as does the retarget `runtime.env` fixture (`test_recovery_retarget.py:76`); the `DEFAULT_ALLOW` constant and the egress guard/fault tests stay untouched; add a preflight-failure case to `test_deploy_entry.py`.
- [x] 2.4 Narrow exceptions in `deploy/check-ports.sh` and `deploy/check_sandbox_dns.py`.
- [x] 2.5 `deploy/up.sh` restarts `messages-ingress` with `proxy`; `smoke_deployment.py` requires it and adds the two ingress probes; `release.py` `SERVICE_IMAGE_VARS`.
- [x] 2.6 Docs: `NETWORK-HARDENING.md` (lines 211-212 exception, 214 required env, ~255 rollback removal, 336 upgrade carry-over), `docs/claude-code-gateway.md` (base URL `http://<address>:8080/api`).
- [ ] 2.7 Green: OCU unit command (AGENTS.md), the new native runner in `deploy/proxy/tests/`, `bash deploy/proxy/tests/run-entrypoint-smoke.sh` (unchanged gateway), `./tests/test-project-structure.sh`.

## 3. This repo

- [x] 3.1 Decision record `docs/decisions/implemented/architecture/2026-10-27-sandbox-messages-ingress.md`; `make doc-gate`, `make decisions-verify`.

## 4. After merge (orchestrator, needs owner go-ahead)

- [ ] 4.1 Build a release with the OCU merge commit; on the acceptance VPS set `OCU_SANDBOX_MESSAGES_ADDRESS` and add it to `OCU_SANDBOX_EGRESS_ALLOW` in `runtime.env` by variable name (values never printed); upgrade; design evidence l.

## Risk packs

Selected:

- **Auth / permissions / secrets:** path/method restriction, exact header allowlist, no secrets in the ingress, no identity minting; evidence a, c, i, l.
- **Config / project setup:** new required variable, validation, bootstrap, check exceptions; evidence f, g, h, i.
- **Public API / CLI / script entry:** the ingress HTTP contract, `/healthz`, base URL; evidence a, b, c, e.
- **Resource limits / large input:** body limit for declared and chunked bodies, timeouts, response streaming; evidence b, d.
- **Release / packaging / dependency compatibility:** proxy image content, `.dockerignore`, release verification, `up.sh` restart; evidence i, j, 4.1.
- **Legacy compatibility / examples:** existing deployments lack the variable and fail loud until it is set; upgrade note; evidence f, 2.6, 4.1.
- **Error handling / rollback / partial outputs:** rollback to a release without the ingress leaves an orphan container (`COMPOSE_REMOVE_ORPHANS=false`) that the older DNS check rejects; documented removal step; failing ingress restart in `up.sh` is named; evidence j, 2.6.
- **Documentation / migration notes:** hardening doc, gateway doc; 2.6.

Not selected:

- **File IO / path safety / overwrite:** no file handling (URL path traversal is covered under Auth, evidence c).
- **Schema / columns / units / field names:** none.
- **Concurrency / shared state / ordering:** stateless proxy; start/restart order handled by the existing `up.sh` sequence (evidence j).
