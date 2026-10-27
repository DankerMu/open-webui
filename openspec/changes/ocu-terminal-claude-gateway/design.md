## Context

The terminal tab is the OCU SPA in `embed=terminal`, framed by `WorkspaceArtifact.svelte`. It calls `POST /ocu/terminal/{chat}/start-ttyd` through the cookie gateway, then opens the ttyd WebSocket. nginx authorises the request with `GET /api/v1/ocu/auth` (chat owner only), then forwards it to OCU with the internal bearer, `X-User-*` and the browser's `Cookie` (`deploy/proxy/render.py:210-254`). OCU trusts only the bearer (`auth_guard.py`). The terminal process tree is `ttyd → tmux client → tmux server → bash`; the tmux server keeps the environment it started with and survives a ttyd restart, so only `pkill -x ttyd; tmux kill-server` (the existing stop command) resets it.

Governing invariant: a workspace terminal's Claude Code holds the token of the user who opened that terminal and the model of the chat at open time, or, if either is missing, the terminal does not start and says why. A token never leaves the request, the container exec environment and Open WebUI.

## Goals / Non-Goals

Goals: automatic Claude Code configuration in the terminal in gateway mode; restart when token or model changes; visible failure; no change with gateway mode off.

Non-goals: see proposal. In particular a running Claude Code process cannot be re-pointed; reopening restarts the terminal.

## Decisions

1. **Token from the forwarded cookie, not from the client body.** The `token` cookie is httponly, so the SPA cannot read it, and the proxy already forwards it after an ownership check. A body field would need the SPA to obtain the token another way and would put it in a JSON body that crosses the proxy and the browser. Alternative rejected: a WebUI-issued scoped key (not available; owner chose the login token).
2. **Model via the iframe URL, captured at open.** WebUI already has the chat model next to the workspace (`ChatControls.modelId`). The SPA cannot ask WebUI for it (no route and no credential). Capturing at open avoids killing a running Claude Code when the user changes the model dropdown; the acceptance criterion is "switch the model and reopen the terminal".
3. **Environment via `exec_run(environment=…)`.** Inline `VAR=value` in the command string would put the token into `bash -c` argv, visible through `ps` and Docker exec inspection. `exec_run` environment is not in argv; ttyd passes it to tmux, the new tmux server and bash. Container-level values baked at creation (`ANTHROPIC_AUTH_TOKEN`, model passthrough, `ANTHROPIC_CUSTOM_HEADERS`) are overridden for the keys set; `ANTHROPIC_CUSTOM_HEADERS` is dropped by the ingress header allowlist anyway.
4. **Reuse decision from the running process, not stored state.** The fingerprint is `sha256(base_url + "\0" + model + "\0" + token)` hex, injected as `OCU_TERMINAL_FINGERPRINT`. The handler checks `/proc/<pid>/environ` of the oldest ttyd for that exact entry. Sandbox code cannot change a running process's initial environment. OCU keeps no per-chat state, so an OCU restart cannot cause a wrong reuse. A sandbox process that kills ttyd and starts its own causes at worst a restart of its own terminal.
5. **Restart reuses the existing stop command.** Same semantics as the SPA's Terminate. It ends a running Claude Code; `claude --resume` recovers the conversation. The restart is reported as `restarted: true`; existing clients ignore the extra key.
6. **Gateway mode keyed on `OCU_SANDBOX_MESSAGES_ADDRESS`.** One variable, already validated by `policy.py messages-address` before deployment and present in runtime.env since #655. OCU validates it as IPv4 at startup (fail loud). No separate base-URL setting: the ingress port 8080 and the `/api` path are fixed by #655.
7. **422 for missing inputs.** The request is well-formed but unusable; 422 is distinct from the 404 (container not running) and 5xx paths the SPA already handles, so the SPA can show `detail` instead of probing container status.
8. **Model validation is charset-only.** Docker passes environment values without a shell, so injection is not the risk; control characters and whitespace are rejected so the value is a single printable token. Whether the model exists is Open WebUI's answer on the first request.

## Risks / Trade-offs

- The WebUI JWT in the sandbox environment is a full session token, readable by any code running as `assistant` in that sandbox. Mitigations: the sandbox network reaches only the Messages ingress (#655), and the sandbox belongs to the chat owner. Recorded in the decision record; a scoped credential is a follow-up.
- JWT lifetime (default 4 weeks): a long-lived terminal can hold an expired token. Claude Code shows the 401; reopening after re-login restarts with the new token.
- A model switch while the terminal is open takes effect only on reopen. This is intentional (decision 2).
- `kill-server` ends every tmux session in that sandbox, not only `main`. Same as today's Terminate.
- Every start that is not a reuse now runs the stop command first, including the first open after a container start. When nothing runs it costs one extra exec of a few milliseconds.
- Two tabs of one chat with different models restart each other's terminal (last writer wins). That needs two tabs and a model switch between them; documented, not prevented.

## Evidence

Sibling surfaces:

- Claude Code configuration in the persistent home volume. The entrypoint rewrites `~/.claude/settings.json` (`Dockerfile:384`) and `~/.claude.json` (`Dockerfile:429`) on each container start. It leaves a stored `/login` (`~/.claude/.credentials.json`) and `~/.claude/settings.local.json` alone. Claude Code prefers `ANTHROPIC_AUTH_TOKEN` from the environment over stored OAuth credentials. `env` entries in a settings file the sandbox user writes can override it, but that is the owner's own sandbox. Acceptance l includes a sandbox that previously ran `/login`.
- `SUBAGENT_CLI`: gateway injection only when it is `claude` (see the proposal).
- `~/.mcp.json` (`docker_manager.py:675-697`) and the `sub_agent` MCP path keep the container-level values. Out of scope.
- Standalone preview: 422 in gateway mode (accepted change, proposal).
- Unaffected because they do not read the terminal environment: `stop-ttyd`, `/terminal/{chat}/processes`, `/sessions` and `kill`, `restart-container` and `resurrect-container` (the SPA calls `start-ttyd` after them with the same inputs), CDP and the browser view.

Each item names input and expected output. All OCU handler tests use the existing fake container or `exec_run` doubles; no real Docker.

- a. Gateway on, cookie `token=<jwt>`, body `{"model": "m-1"}`, no ttyd running → one `exec_run` whose `environment` contains the eight keys with the right values and the fingerprint. Its command string contains neither the token nor the model. Response is `{"started": true, ...}`.
- b. Gateway on, ttyd running with the matching fingerprint → no stop, no start, `already_running: true`.
- c. Gateway on:
  - ttyd running with a different fingerprint, or with none (started before this change) → the stop command runs, then a start with the new environment, and the response has `restarted: true`.
  - No ttyd running → the stop command still runs before the start, which covers a tmux server left alive without ttyd. The response has `restarted: false`.
  - Two concurrent starts for one chat run one after the other under `_combined_lock`. With the same inputs, the second is a reuse.
  - Deadlock guard: these cases use the real `_combined_lock` and the real `_execute_bash` against a fake container whose labels carry `chat-id`, so `_reset_shutdown_timer` takes the lock again (`docker_manager.py:1380-1386`, `:1656-1666`). Each start completes within a test timeout, and the lock is free afterwards: another thread can acquire it.
- d. Gateway on:
  - No `token` cookie, or an empty one → 422 naming the token.
  - Model absent, empty, longer than 256, or containing whitespace or control characters → 422 naming the model.
  - In every case `detail` is a JSON string, there is no container lookup and no `exec_run`, and the 422 comes back even when the container is stopped.
- e. Gateway off (variable unset) → the command string and exec call are identical to today's for both `dangerous_mode` values, and any `model` and cookie are ignored (no `environment` passed).
- f. The token value does not appear in the response body, captured stdout or stderr, log records, or exception text for a, c and d (a canary token string).
- g. Startup:
  - `OCU_SANDBOX_MESSAGES_ADDRESS` set to a non-IPv4 value, or set but empty or whitespace → OCU refuses to start, naming the variable.
  - Unset → gateway off.
  - Set while the server's `SUBAGENT_CLI` is not `claude` → gateway off for terminal start (case e behaviour).
- h. Cookie helper: `ws_recheck.handshake_cookie` behaviour is unchanged (its existing tests pass), and the new helper returns the `token` morsel value or `None` for no cookie, a malformed cookie, or an empty token.
- i. SPA. The `TerminalView` cases run in `tests/orchestrator/preview_embedding_browser.cjs`, driven from `test_preview_prefix.py`; the embed matrix is around `:73`, and `mount('?embed=terminal')` around `:1752` and `:2203`.
  - `?embed=terminal&model=m-1` is a valid embed case. Both start-ttyd call sites send `{"dangerous_mode": …, "model": "m-1"}`.
  - With no `model` parameter, `model` is omitted or null.
  - A 422 with a string `detail` shows that detail and makes no status probe or restart-container call.
  - A 422 from the start-ttyd inside `recoverStoppedContainer` shows its detail, not `restore_fail`.
  - A non-string `detail` shows the generic message.
  - Standalone preview sends no `model`.
  - The existing embed validation cases stay green.
- j. WebUI vitest:
  - `workspaceRuntimeUrl` appends an encoded `model` only for `terminal`. A model with `/`, `:` and spaces is encoded. A null or empty model adds nothing. The browser URL is unchanged.
  - In `WorkspaceArtifact`, the terminal URL keeps the model captured at open when `modelId` changes while the terminal view stays open, and uses the new model after switching views away and back.
  - Navigating from chat A to chat B, with B's terminal view saved, gives a URL that carries B's model, not A's. This relies on the `{#if !loading}` gate in `Chat.svelte` (`:4267`), which is not part of this change. The vitest covers `WorkspaceArtifact` mounted with B's `modelId` and a saved terminal view. The decision record names the gate as a precondition.
  - `make verify-ui-ocu` keeps asserting exactly `?embed=terminal` (`e2e/ocu-controls.e2e.ts:499-502`), because the harness chats have no model. The model parameter is covered by vitest, not the e2e.
- k. Deployment smoke: `start_product_terminal` sends `"model": "ocu-smoke-terminal"` (`tests/deploy/test_deployment_smoke.py`). The compose override carries `OCU_SANDBOX_MESSAGES_ADDRESS` for `computer-use-server` (`tests/deploy/test_overlay_structure.py`).
- l. Acceptance VPS (task 4.1, owner go-ahead):
  - In a chat on `deepseek-flash-guan`, open the terminal and run `claude`. It starts without `/login` and completes a Write + Bash task.
  - Switch the chat to `qwen3.8-27b` and reopen the terminal: `claude` uses the new model.
  - Usage appears under the user.
  - In a sandbox that previously ran `/login`, the injected token still wins.
