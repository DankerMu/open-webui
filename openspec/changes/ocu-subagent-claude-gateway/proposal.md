## Why

(#662, fourth and last slice of #650.) The workspace terminal already runs Claude Code through the Messages ingress, with the opener's WebUI token and the chat's model (#656, accepted on the VPS 2026-10-28). The `sub_agent` tool does not. It was an explicit non-goal of #656 (`archive/2026-10-28-ocu-terminal-claude-gateway/proposal.md` Non-goals).

Today, at OCU `main` `8da37a4`:

- `sub_agent` (`computer-use-server/mcp_tools.py:952`) runs `cli_runtime.dispatch` (`cli_runtime.py:248`). That builds `cd <wd> && <headers_env><argv>` and runs it with `_execute_bash_capture` (`docker_manager.py:1453`), which takes no `environment`.
- Claude Code therefore sees only the container-level env written at creation by `_create_container` (`docker_manager.py:1109-1137`), from `current_anthropic_auth_token` / `current_anthropic_base_url` (request headers of the request that created the container) or the server-wide env. The production-like overlay sets neither, so `sub_agent`'s Claude Code has no usable gateway.
- The model is the LLM's `model` argument, alias-expanded by `resolve_subagent_model` (`sonnet` → `claude-sonnet-4-6`). The WebUI tool wrapper documents it as `"sonnet"` or `"opus"` (`openwebui/tools/computer_use_tools.py:904-930`). On resume the Claude adapter passes no `--model` at all (`cli_adapters/claude.py:72-79`). The chat's model never reaches OCU.
- The deployment calls OCU through the shipped WebUI tool (`openwebui/tools/computer_use_tools.py`), not WebUI's tool-server feature. That tool runs inside the chat request:
  - `__request__.state.token` holds the token that authenticated the chat request; WebUI's `AppHTTPMiddleware._set_token` sets it on every HTTP request (`backend/open_webui/utils/asgi_middleware.py:126-132`).
  - the chat's model is `__metadata__["model"]` (`backend/open_webui/main.py:1261`, a dict with `id`). `__model__` is not: Open WebUI injects the task model there (`backend/open_webui/utils/middleware.py:2916-2925`).
  - The tool's `_build_mcp_headers` (`computer_use_tools.py:666-683`) sends only chat id, user email and name.
- The production-like overlay does not install `sub_agent` at all. `deploy/production-like-test/init/run-init.sh:4-5, 93-103` cuts the method out of `computer_use_tools.py` before installing the Tool, "until a fully internal sub-agent runtime is available". `compose.core.override.yml:55-56` and `compose.webui.override.yml:76` say the same. This change provides that internal runtime: WebUI's own Messages endpoint through the ingress, with the user's own token.

Owner decisions:

- 2026-10-27, #650: the user's own WebUI login token, and the model follows the chat.
- 2026-10-28, #640 and #650 comments: the "a model the user may not access is refused" criterion is accepted on code and unit evidence, not on the VPS.
- 2026-10-28: the production-like overlay installs `sub_agent` again once it runs through the gateway.

## What Changes

**One gateway environment builder (OCU).**

- The ingress base URL and the per-call Claude Code environment move out of `app.py` (`terminal_gateway_base_url` `:1156`, `_terminal_gateway_environment` `:1181`) into one new module, `computer-use-server/claude_gateway.py`. The terminal and `sub_agent` both use it.
- Behaviour of the terminal is unchanged:
  - same startup validation of `OCU_SANDBOX_MESSAGES_ADDRESS`;
  - same 422 detail strings;
  - same ten keys and fingerprint.
- The builder takes the token and the model as plain strings and raises a module error with the existing English detail on a missing token or an invalid model (same pattern `^[\x21-\x7e]{1,256}$`). `app.py` maps that error to `HTTPException(422, detail)`; `sub_agent` maps it to a tool error string.

**WebUI tool → OCU: two new headers, `sub_agent` only.**

- `X-OCU-Gateway-Token`: `__request__.state.token.credentials`.
- `X-Chat-Model`: the chat's model id, `__metadata__["model"]["id"]` (a plain string id is also accepted).
- The tool sends a header only when it has a non-empty value.
- The tool sends `X-OCU-Gateway-Token` only when the caller owns the chat (`Chats.is_chat_owner(chat_id, __user__["id"])`). An admin may run completions in another user's existing chat (`main.py:1472`); without this rule the admin's token would reach the owner's sandbox. A non-owner caller, or a lookup that fails, sends no token, so OCU refuses with the missing-token error. `X-Chat-Model` does not depend on ownership.
- The tool sends both headers on every `sub_agent` call, also when OCU is not in gateway mode; OCU then ignores them. Other tools (`bash_tool`, `str_replace`, `create_file`, `view`) send neither.
- The token is whatever authenticated the chat request, so it can be a WebUI API key instead of the login token (`asgi_middleware.py:128-131`). `/api/v1/messages` accepts both. An API key does not expire like the 4-week login token.
- `__metadata__["model"]` is the model the chat request resolved. When `ENABLE_CUSTOM_MODEL_FALLBACK` replaced the selected model (`main.py:1157-1161`), this is the fallback model; that is accepted.
- Why not the existing `X-Anthropic-Api-Key` channel: `_create_container` copies `current_anthropic_auth_token` into the container-level env at creation (`docker_manager.py:1123-1125`, `1132-1135`, and opencode's `ANTHROPIC_API_KEY` at `1146-1147`).
  - Sending the user's token there would persist it in `docker inspect` whenever `sub_agent` creates the container.
  - Outside gateway mode it would pair the user's WebUI token with the server's `ANTHROPIC_BASE_URL`, `https://api.anthropic.com` by default (`:399`).
- The two new headers feed their own `ContextVar`s (`context_vars.py`), read only by the `sub_agent` gateway path. Both are added to `_CONTEXT_DEFAULTS` (`mcp_tools.py:1372-1383`), the list `MCPContextMiddleware` (`:1392`) resets after every request.

**OCU `sub_agent` in gateway mode** (`claude_gateway` base URL is not `None`: `OCU_SANDBOX_MESSAGES_ADDRESS` set and `SUBAGENT_CLI == claude`):

- Before any container work, `sub_agent` builds the environment from the gateway-token and chat-model context values. A missing token or invalid model returns `Error: Claude Code gateway: …` (the builder's detail). No container is created or touched and no Claude Code process starts.
- The chat model is used verbatim:
  - the LLM's `model` argument is ignored;
  - `resolve_subagent_model` is not called;
  - `--model <chat model>` goes into argv, on new sessions and on resume (the Claude adapter's resume argv gains `--model` in gateway mode only);
  - the result banner shows the chat model.
- The environment reaches Claude Code only through `exec_run(environment=…)`. `_execute_bash_capture` gains an optional `environment`, mirroring `_execute_bash` (`docker_manager.py:1388`), and `dispatch` gains an `environment` keyword it passes through.
  - The token never appears in anything OCU or the tool writes: the command string, argv, the container env, a response, an exception message, or a log or print line.
  - `ANTHROPIC_CUSTOM_HEADERS` (user email) keeps its current place in `headers_env`.
- `resume_session_id` uses the current call's token and model.

**Overlay installs `sub_agent` again.**

- `run-init.sh` stops cutting `sub_agent` out of the Tool. The method-removal block and its refusal message are removed. The header comment says the Tool is installed whole and that `sub_agent` runs through the gateway.
- The comments in `compose.core.override.yml:55-56` and `compose.webui.override.yml:76` are updated the same way. They keep the rule that no external Claude, Codex or OpenCode credentials are passed.
- A deploy test asserts that the Tool source the wrapper installs equals the shipped file, and so contains `sub_agent`.
- The overlay already requires `OCU_SANDBOX_MESSAGES_ADDRESS` (#656) and runs Claude Code as the sandbox CLI, so wherever `sub_agent` is now installed, gateway mode is on.

**Outside gateway mode,** `sub_agent` behaves exactly as today:

- it reads neither new header;
- it uses the LLM model with alias expansion, or codex/opencode's own resolution;
- the resume argv has no `--model`;
- `dispatch` passes no `environment`.

**Docs.**

- `docs/claude-code-gateway.md` (OCU) presents Open WebUI as the gateway as the deployment default for both the workspace terminal and `sub_agent`: same ingress, the user's own token (or API key), and the chat's model.
- The `sub_agent` docstrings (OCU `mcp_tools.py` claude variant, WebUI tool wrapper) add that in gateway deployments the chat's model is used and `model` is ignored. The existing aliases stay, because `tests/test-subagent-cli-surface.py` asserts them.
- WebUI decision record `docs/decisions/implemented/architecture/2026-10-28-subagent-claude-gateway.md`, including the risks in design.md.

**WebUI fork tests.** Backend route tests, with `BYPASS_MODEL_ACCESS_CONTROL` off, pin that `POST /api/v1/messages` refuses a model the user may not access before any upstream call, on both of its paths:

- Convert path, the deployment's case (OpenAI-compatible connection): `generate_messages` → `chat_completion` → the model access check. Expected: the same status `POST /api/chat/completions` returns for that model.
- Passthrough path (`utils/anthropic.py:131`: an Anthropic URL or `provider == litellm`): `routers/openai.py:465` → `check_model_access`. Expected: 403.

A model the user may access passes the check, with the upstream call mocked. The tests do not rely on the `count_tokens` 403, which `main.py:1997-2001` swallows.

## Capabilities

### Modified Capabilities

- `ocu-terminal-claude-gateway`: the requirement set now covers `sub_agent` too; one added requirement. The terminal requirement is unchanged.

## Impact

- OCU:
  - `computer-use-server/claude_gateway.py` (new), `app.py`, `mcp_tools.py`, `cli_runtime.py`, `cli_adapters/claude.py`, `docker_manager.py`, `context_vars.py`;
  - `openwebui/tools/computer_use_tools.py`;
  - `deploy/production-like-test/init/run-init.sh`, `compose.core.override.yml`, `compose.webui.override.yml`;
  - `docs/claude-code-gateway.md`;
  - tests: `tests/orchestrator/test_terminal_gateway.py`, a new `tests/orchestrator/test_subagent_gateway.py`, `tests/orchestrator/test_sub_agent_dispatch.py`, `tests/test_tools.py`, `tests/test_subagent_docstring.py`, `tests/test-subagent-cli-surface.py`, `tests/deploy/test_init_wrapper.py`.
- WebUI: backend tests for `/api/v1/messages` model access; the decision record; this fixture. No runtime source change, so the WebUI image is unaffected.
- Non-goals:
  - `~/.mcp.json` (`docker_manager.py:675-697`) and the container-level env;
  - codex/opencode sub-agents;
  - thinking strength (#648);
  - token refresh or model switching inside one running `sub_agent` call;
  - validating the model against WebUI before the call (WebUI refuses an unknown or forbidden model on the first request, visibly in the result);
  - upstream `stream_response` overriding a request's `stream` (`main.py:1170-1171`).

## Fixture

```text
Issue type: feature
Fixture level: expanded
Upstream suggested level: absent; expanded: user credential injected into sandbox processes, refactor of a shared entrypoint helper, deployment exposure change, two repos
Blast radius: the production-like overlay starts offering sub_agent to every chat; a leak exposes a user's WebUI token (container env, argv, logs, error text); a wrong mode decision sends a WebUI token to a third-party base URL or breaks sub_agent outside gateway mode; the refactor can change terminal behaviour
Selected risk packs: Auth / permissions / secrets; Public API / CLI / script entry (sub_agent tool contract, two MCP headers, dispatch signature, resume argv); Config / project setup (gateway mode switch shared with the terminal; per-request context reset); Legacy compatibility (gateway off; terminal unchanged after the refactor; codex/opencode argv); Error handling (missing token/model; error paths that echo exception text); Release / packaging (the overlay's init script installs sub_agent again); Documentation
Not selected: Concurrency (no new shared state beyond two ContextVars reset by the existing middleware); Resource limits (no new allocation); File IO (none); Schema (no persisted format)
Evidence floor: OCU unit command (AGENTS.md) green including the existing terminal gateway tests unchanged; new sub_agent gateway tests (design evidence a–g, j); tool wrapper header tests; deploy test that the installed Tool keeps sub_agent (k); WebUI route tests for /api/v1/messages model access on both paths (h); make lint-scoped, make doc-gate, make decisions-verify; acceptance VPS sub_agent on two models after an owner go-ahead (i)
design.md: present
```
