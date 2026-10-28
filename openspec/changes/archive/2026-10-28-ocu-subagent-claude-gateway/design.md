## Design

Change surface:

- OCU, new `computer-use-server/claude_gateway.py`:
  - `gateway_base_url()` — moved from `app.terminal_gateway_base_url`, same startup validation and config error;
  - `gateway_environment(base_url, token, model)` — the ten keys, raising `GatewayInputError(detail)` with the two existing detail strings.
- OCU, `app.py`:
  - `start_ttyd` keeps reading the token from the `token` cookie and the model from the body;
  - it calls the builder and maps `GatewayInputError` to `HTTPException(422, detail)`;
  - startup validation calls `claude_gateway.gateway_base_url()`.
- OCU, `mcp_tools.py`:
  - `set_context_from_headers` reads `x-ocu-gateway-token` and `x-chat-model` into two new ContextVars (`context_vars.py`);
  - the header table in the module docstring lists both;
  - `sub_agent` gains the gateway branch.
- OCU, `cli_runtime.dispatch(..., environment=None, model_verbatim=False)`; `docker_manager._execute_bash_capture(..., environment=None)`.
- OCU, `cli_adapters/claude.py`: in gateway mode the resume argv also carries `--model <chat model>`. The mechanism is the implementer's choice; the non-gateway resume argv and the codex/opencode adapters stay byte-identical.
- OCU, `mcp_tools._CONTEXT_DEFAULTS`: the two new ContextVars, so `MCPContextMiddleware` resets them.
- OCU, `deploy/production-like-test/init/run-init.sh`: no `sub_agent` removal. Comments are updated in `compose.core.override.yml` and `compose.webui.override.yml`.
- OCU, `openwebui/tools/computer_use_tools.py`:
  - `sub_agent` reads the chat model from `__metadata__["model"]` (not `__model__`, which is the task model) and sends the token only when `Chats.is_chat_owner(chat_id, __user__["id"])` is true;
  - `_run_tool` accepts `extra_headers`, used only by `sub_agent`.

Must preserve:

- Terminal, byte-for-byte:
  - the `start_ttyd` responses;
  - the 422 detail strings;
  - the ten environment keys and the fingerprint formula;
  - lock usage;
  - gateway-off behaviour.
  - All existing `tests/orchestrator/test_terminal_gateway.py` cases pass unedited, except import paths that move with the code.
- `sub_agent` outside gateway mode:
  - LLM model with alias expansion for claude, and codex/opencode's own resolution (for example, codex raises `ValueError` on `sonnet`);
  - `headers_env`, argv (including the resume argv without `--model`), plan file, resume prompt and result banner unchanged;
  - `_execute_bash_capture` called without `environment`.
- Tool wrapper, all other tools: header set unchanged (`X-OCU-Internal-Token`, `X-Chat-Id`, optional `Authorization`, `X-User-Email`, `X-User-Name`, `X-Mcp-Servers`).
- `_create_container` container env unchanged; `current_anthropic_auth_token` / `X-Anthropic-Api-Key` semantics unchanged.

Must add/change: the `sub_agent` gateway branch, with gateway-mode resume `--model`; the two headers the tool sends on `sub_agent`, with their context reset; the shared builder; the overlay installs `sub_agent` again; docs; the WebUI route tests; the decision record.

Governing invariant: in gateway mode, the user's token reaches Claude Code only through an exec environment built per call. OCU and the tool never write it to a command string, argv, the container env, a response, exception text, or a log or print line. Outside gateway mode, no WebUI token is used for Claude Code at all. What Claude Code or sandbox code does with its own environment is outside this invariant; see Risks.

Sibling surfaces:

- Producers of the token:
  - the browser cookie (terminal);
  - `__request__.state.token` (tool).
- Validator: `claude_gateway.gateway_environment`, the single one.
- Exec sinks:
  - `_execute_bash` (terminal);
  - `_execute_bash_capture` (`sub_agent` and codex mkdir; mkdir stays without environment).
- Container env sink: `_create_container`, which must not receive the gateway token. Guaranteed because the new header feeds a separate ContextVar.
- `~/.mcp.json` writer (`build_mcp_config`): out of scope, unchanged.
- Consumers of `dispatch`: `sub_agent` only (`git grep -n "dispatch(" computer-use-server` at implementation time; any other caller keeps defaults).
- Failure paths:
  - missing header;
  - invalid model;
  - `cli != claude` with the address set (gateway off, unchanged).
- Text paths that echo exception messages:
  - `_execute_bash_capture`'s `except` (`docker_manager.py:~1494`, `stderr=f"Execution error: {e}"`, which flows into the result);
  - `sub_agent`'s final `return f"Sub-agent error: {e}"` (`mcp_tools.py:~1290`);
  - the progress `print(f"[SUB-AGENT-PROGRESS] {msg}")` (`mcp_tools.py:~1161`).
- Per-request context: `_CONTEXT_DEFAULTS` / `MCPContextMiddleware`.
- Deployment exposure: `run-init.sh` (installed Tool source) and the compose comments.

Seams under test:

- `claude_gateway.gateway_environment`;
- `mcp_tools.sub_agent` with fake container / `_execute_bash_capture` / `dispatch` collaborators (existing patterns in `tests/orchestrator`);
- `cli_runtime.dispatch` with a fake `_execute_bash_capture`;
- the tool wrapper `sub_agent` with a fake MCP client capturing headers (`tests/test_tools.py` patterns);
- the terminal handler (existing tests);
- WebUI `TestClient` on `/api/v1/messages` and `/api/chat/completions`.

Required evidence:

- a. Gateway mode, token `tok-1`, model `m-1`, LLM `model="opus"`:
  - `_execute_bash_capture` receives `environment` with `ANTHROPIC_BASE_URL=http://<addr>:8080/api`, `ANTHROPIC_AUTH_TOKEN=tok-1` and every model key `m-1`;
  - the command string contains `--model m-1` and does not contain `tok-1`;
  - `resolve_subagent_model` is not called;
  - the returned text names `m-1`.
- b. Gateway mode with no token, with no model, or with model `"bad model"` / 257 chars: the result starts with `Error: Claude Code gateway:` and carries the builder's detail. No container lookup and no exec.
- c. Gateway mode with `resume_session_id` `s-1` and chat model `m-2`:
  - the environment carries `m-2` and the call's token;
  - argv is `claude -p <unchanged resume prompt> --resume s-1 --model m-2 <common flags>`;
  - with the address unset, the same resume call has no `--model`.
- d. Gateway off (address unset), and gateway off because `SUBAGENT_CLI=codex` with the address set:
  - the headers are ignored;
  - `dispatch` / `_execute_bash_capture` get no environment;
  - claude expands the alias as before, and codex keeps its own resolution;
  - existing `test_sub_agent_dispatch.py` cases still pass.
- e. Secrets:
  - Across a–c, `tok-1` appears in no captured log record (`caplog` at DEBUG), no captured stdout (`capsys`), no returned string and no exception text.
  - With a fake `exec_run` that raises an exception whose message contains the environment it was given, the `sub_agent` result and logs still do not contain `tok-1`.
  - A container created during the call gets no `ANTHROPIC_AUTH_TOKEN=tok-1`: assert on the `_create_container` env, or that the container-creation collaborator receives no gateway token.
- f. Tool wrapper:
  - `sub_agent` with `__request__.state.token.credentials="tok-1"`, `__metadata__={"chat_id": …, "model": {"id": "m-1"}}` and a caller who owns the chat sends `X-OCU-Gateway-Token: tok-1` and `X-Chat-Model: m-1`;
  - with a task model `__model__={"id": "cheap-m"}` offered too, `X-Chat-Model` is still `m-1`; with `__metadata__` lacking `model`, the header is absent;
  - with no token, the token header is absent;
  - a caller who does not own the chat (an admin in another user's chat), or an ownership lookup that raises, gets no `X-OCU-Gateway-Token`; `X-Chat-Model` is still sent;
  - `bash_tool` sends neither header.
- g. Terminal regression: existing terminal gateway tests green, plus one test that `start_ttyd` still answers 422 with the unchanged detail strings through the moved builder.
- h. WebUI, with `BYPASS_MODEL_ACCESS_CONTROL` off and a user without access to model `restricted-m`:
  - Convert path (OpenAI-compatible connection): `POST /api/v1/messages` returns the same status as `POST /api/chat/completions` for `restricted-m`, before any upstream call.
  - Passthrough path (connection URL on `api.anthropic.com` or `provider == litellm`): `POST /api/v1/messages` returns 403 before any upstream call.
  - A model the user may access reaches the mocked upstream on both paths.
  - The assertions do not depend on the `count_tokens` 403 that `main.py:1997-2001` swallows.
- i. Acceptance VPS (task 5.1, owner go-ahead):
  - the installed Tool lists `sub_agent`;
  - chat on `deepseek-flash-guan`, then `qwen3.8-27b`: the chat model calls `sub_agent` with a Write + Bash task, and the result banner and Claude Code's model usage name the chat model;
  - a resume after the model switch runs on the new model;
  - the token appears in no process argv and no `docker inspect` output of the sandbox;
  - while `sub_agent` runs, `docker inspect` on the Claude Code exec id shows no token in its argv;
  - after the run, `grep -rF <token> /home/assistant/.claude /home/assistant/.claude.json` inside the sandbox finds nothing.
- j. Context reset: a request carrying both new headers, then a request without them, in one process. The second sees the defaults, so `sub_agent` in gateway mode returns the missing-token error.
- k. Deploy: the wrapper's installed `tools/computer_use_tools.py` equals the shipped file and contains `async def sub_agent(` (`tests/deploy/test_init_wrapper.py`). The init script no longer contains the removal block.

Non-goals: see proposal Impact.

Risks (accepted; recorded in the decision record, task 4.2):

- **Token readable inside the sandbox.** The token sits in Claude Code's process environment, which code running in the sandbox can read, and the WebUI login token lasts 4 weeks by default (`JWT_EXPIRES_IN`). The sub-agent runs model-chosen commands under `bypassPermissions`, and any background process it starts keeps the token after the call ends. The exposure is wider than the terminal's (#656): it is reached without a user opening a terminal, the token can be a WebUI API key that does not expire like the 4-week login token, and it can land in OCU's own stdout (next item).
- **Claude Code can echo the token.** It can print its own environment into its output and into the sub-agent progress lines that OCU prints to its own stdout (`[SUB-AGENT-PROGRESS]`, `mcp_tools.py:~1180`). OCU filters neither.
- **Admin completions in another user's chat.** The tool sends no token there, so `sub_agent` is refused with the missing-token error.
- **Headers outside gateway mode.** The tool sends both headers on every `sub_agent` call; OCU ignores them when gateway mode is off.
- **Exposure in the overlay.** The overlay now offers `sub_agent` to every chat. It runs only through the gateway, and the overlay passes no external credentials.

Review focus:

- The token never reaches the container env, argv or logs: check `_create_container`, `dispatch`, the `exec_run` calls and every log line in the new branch.
- Gateway on/off decided only by `claude_gateway.gateway_base_url()`, for both the terminal and `sub_agent`.
- The refactor is behaviour-preserving for the terminal: detail strings, keys, fingerprint, lock.
- The tool sends the new headers only on `sub_agent`, and only with real values.
- Model verbatim in gateway mode: no alias expansion, LLM argument ignored, `--model` also on resume.
- The overlay installs the whole Tool, and nothing else in the overlay depended on `sub_agent` being absent.
