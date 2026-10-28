## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review; `openspec validate ocu-subagent-claude-gateway --strict --no-interactive`.

## 2. Risk packs

- Auth / permissions / secrets — selected: the user's WebUI token is forwarded to OCU and injected into Claude Code. Design evidence a, e, f, j.
- Public API / CLI / script entry — selected: `sub_agent` tool contract (model handling), two MCP headers, `dispatch` and `_execute_bash_capture` signatures. Evidence a, c, d, f.
- Config / project setup — selected: gateway mode switch shared with the terminal (`claude_gateway.gateway_base_url`); per-request context reset. Evidence d, g, j.
- Legacy compatibility — selected: gateway off unchanged; terminal unchanged after the refactor. Evidence d, g.
- Error handling — selected: missing token / invalid model in gateway mode; exception-echo paths. Evidence b, e.
- Release / packaging — selected: the overlay init script installs `sub_agent` again. Evidence k; acceptance i.
- Documentation — selected: `docs/claude-code-gateway.md`, docstrings, decision record. Task 3.5, 4.2.
- Concurrency / shared state — not selected: no new shared state; ContextVars are reset per request by the existing middleware.
- Resource limits, File IO, Schema — not selected: no new allocation, file or persisted format.

## 3. Implement OCU (branch `claude/plan2-subagent-claude-gateway`)

- [x] 3.1 Tests first for design evidence a–g, j, k; record which fail on `main`.
- [x] 3.2 `claude_gateway.py`: move base URL validation and the environment builder out of `app.py`; `app.py` uses it (terminal unchanged).
- [x] 3.3 `context_vars.py` + `mcp_tools.set_context_from_headers` + `_CONTEXT_DEFAULTS`: `x-ocu-gateway-token`, `x-chat-model`; header table in the module docstring.
- [x] 3.4 `sub_agent` gateway branch; `dispatch(environment=, model_verbatim=)`; `_execute_bash_capture(environment=)`; gateway-mode resume `--model` in `cli_adapters/claude.py`.
- [x] 3.5 `openwebui/tools/computer_use_tools.py`: `sub_agent` sends the two headers; docstrings (tool wrapper, `_SUBAGENT_DOC_CLAUDE`); `docs/claude-code-gateway.md` presents the gateway as the deployment default for the terminal and `sub_agent`.
- [x] 3.6 Overlay: `run-init.sh` installs the whole Tool; compose comments; `tests/deploy/test_init_wrapper.py` case for evidence k.
- [x] 3.7 Green: OCU unit command (AGENTS.md), `./tests/test-project-structure.sh`.

## 4. Implement WebUI (branch `claude/ocu-subagent-claude-gateway`)

- [x] 4.1 Route tests for design evidence h on both paths (they pin existing upstream behaviour, so red-before-green is shown by temporarily bypassing the access check; record that run, do not commit it).
- [x] 4.2 Decision record `docs/decisions/implemented/architecture/2026-10-28-subagent-claude-gateway.md`, including the design Risks and the overlay exposure decision.
- [x] 4.3 Green: the new test module, `make lint-scoped`, `make coverage-gate` if it applies, `make doc-gate`, `make decisions-verify`.

## 5. After merge (orchestrator, needs owner go-ahead)

- [ ] 5.1 Build a release with the OCU merge (WebUI unchanged at runtime), upgrade the acceptance VPS, run design evidence i.
