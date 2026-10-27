## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review; `openspec validate ocu-terminal-claude-gateway --strict --no-interactive`.

## 2. Implement OCU (branch `claude/plan2-terminal-claude-gateway`)

- [x] 2.1 Tests first for design evidence a–i and k; record which fail on `main`.
- [x] 2.2 `ws_recheck.py`: shared `token` cookie helper; `handshake_cookie` uses it.
- [x] 2.3 `app.py`: startup validation of `OCU_SANDBOX_MESSAGES_ADDRESS`; `StartTtydRequest.model`; gateway-mode `start_ttyd` (token, model, environment, fingerprint reuse/restart, 422 paths); gateway-off path unchanged. `docker_manager._execute_bash` optional `environment`.
- [x] 2.4 SPA: `model` parameter in `embed=terminal`, both start-ttyd call sites, 422 display (including from `recoverStoppedContainer`) with a new i18n message; cases in `preview_embedding_browser.cjs`.
- [x] 2.5 `compose.core.override.yml` passes `OCU_SANDBOX_MESSAGES_ADDRESS`; `smoke_deployment.py` placeholder model; `docs/claude-code-gateway.md`.
- [x] 2.6 Green: OCU unit command (AGENTS.md; the two files binding `127.0.0.1:8082` may run in a Linux container if the port is held locally), `./tests/test-project-structure.sh`.

## 3. Implement WebUI (branch `claude/ocu-terminal-claude-gateway`)

- [x] 3.1 Tests first for evidence j.
- [x] 3.2 `workspaceRuntimeUrl` model parameter; `WorkspaceArtifact` `modelId` prop with capture-at-open; `ChatControls` passes `modelId` at both render sites.
- [x] 3.3 Decision record `docs/decisions/implemented/architecture/2026-10-27-terminal-claude-gateway.md`.
- [x] 3.4 Green: `make test-frontend`, `make typecheck`, `make lint-scoped`, `make verify-ui-ocu`, `make doc-gate`, `make decisions-verify`.

## 4. After merge (orchestrator, needs owner go-ahead)

- [ ] 4.1 Build a release with #655, #656 and #657. Upgrade the acceptance VPS (adding `OCU_SANDBOX_MESSAGES_ADDRESS` and its `/32` per NETWORK-HARDENING step 5, values never printed). Run the deployment smoke and design evidence l.
