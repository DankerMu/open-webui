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

- [x] 5.1 Build a release with the OCU merge (WebUI unchanged at runtime), upgrade the acceptance VPS, run design evidence i.
  - 2026-10-28: release `058dd36` (WebUI `521032a`) imported, retargeted and brought up on the acceptance VPS; `open-webui-init` re-run after the marker was removed (NETWORK-HARDENING §590 step 2).
  - Deviation: the `open-webui` image was not reproduced (same inputs, new identity, BuildKit cache gone), so the import had to load it again. With the owner's go-ahead the old WebUI container and image were removed first; downtime 11:08:04–11:11:17 UTC. #663 covers the disk need.
  - Installed Tool `ai_computer_use`: md5 equals the shipped `openwebui/tools/computer_use_tools.py` at `058dd36` and contains `async def sub_agent(`.
  - `deepseek-flash-guan` new session and `qwen3.8-27b` new session (Write + Bash): banner names the chat model; the Claude Code process has `ANTHROPIC_BASE_URL=http://172.31.0.254:8080/api`, `ANTHROPIC_MODEL` and argv `--model` equal to the chat model; the token authenticates as the chat owner.
  - Resume after switching to `qwen3.8-27b`: argv carries `--model qwen3.8-27b --resume <session>`; the session log shows `deepseek-flash-guan` turns followed by `qwen3.8-27b` turns.
  - Every watched run: token in 0 process argv, 0 `docker inspect` hits, 0 of the live exec inspect records, 0 server log lines, and 0 files under `/home/assistant/.claude` and `/home/assistant/.claude.json` after the run.
  - Out of scope, reported only: on resume, Claude's path sends a fixed "Continue working on the task" prompt and drops the new `task` (OCU behaviour since the initial release), so a resumed sub-agent repeats its original task.
