## Why

(#656, third slice of #650; builds on the Messages ingress from #655.) Owner decisions (2026-10-27, #650 comment): Claude Code in the sandbox uses the user's own Open WebUI login token, and its model follows the chat.

Today the terminal's Claude Code runs only with the environment baked into the container at creation (`computer-use-server/docker_manager.py` `_create_container`, ~1105-1165): the server-wide `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` / model variables, which the production-like overlay leaves unset, so Claude Code offers the subscription `/login`. "Open terminal" goes browser → proxy → OCU `POST /terminal/{chat}/start-ttyd` (`app.py:1134-1160`). That handler `exec_run`s ttyd + tmux + bash with no per-start environment, and reuses any running ttyd (`pgrep -x ttyd`). Nothing tells OCU the chat's model; the SPA reads only `embed` from its URL.

Measured 2026-10-27 (#653): Claude Code 2.1.112 in the sandbox image completes multi-turn tool tasks through Open WebUI `/api/v1/messages` with `ANTHROPIC_BASE_URL=<webui>/api`, `ANTHROPIC_AUTH_TOKEN=<user JWT>`, `ANTHROPIC_MODEL` and `ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL=<model>`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`.

## What Changes

**Gateway mode switch (OCU).** The production-like overlay passes `OCU_SANDBOX_MESSAGES_ADDRESS` (already in runtime.env since #655) to `computer-use-server` (`deploy/production-like-test/compose.core.override.yml`, required there). OCU derives the gateway base URL `http://<address>:8080/api` from it. The value is validated at startup: when the variable is set it must be an IPv4 address, otherwise OCU refuses to start naming the variable. Set but empty or whitespace also refuses (misconfiguration fails loud). Gateway mode is also off when the server's `SUBAGENT_CLI` is not `claude`: the Anthropic variables stay out of codex and opencode sandboxes, as at `docker_manager.py:1132-1141`. Where the variable is unset (the development `docker-compose.yml`), gateway mode is off and `start-ttyd` behaves exactly as today, ignoring any `model` field.

**WebUI: the chat's model reaches the terminal.**

- `workspaceRuntimeUrl` (`src/lib/apis/ocu/index.ts:52-56`) takes an optional model id and, for the `terminal` view only, appends `&model=<encodeURIComponent(id)>`. `browser` URLs are unchanged.
- `WorkspaceArtifact.svelte` gets a `modelId` prop. The model in the terminal URL is captured when the terminal view opens: on a view transition into `terminal`, or at mount with the terminal view saved.
  - The capture waits until the displayed chat's own models have loaded. `ChatControls` remounts `WorkspaceArtifact` per `chatId` (`{#key chatId}`, `:379`, `:508`), but `Chat.svelte` sets `chatId` before `loadChat` sets `selectedModels` (`:2290` vs `~:2320`), so a capture at mount could take the previous chat's model. `Chat.svelte` already gates this: `ChatControls` renders only under `{#if !loading}` (`:4267`), and `navigateHandler` sets `loading = true` (`:842`) before `loadChat` changes `chatId` (`:2290`). So `WorkspaceArtifact` remounts only after the new chat's `selectedModels` is set, and capture-at-mount gets the right model. No new `Chat.svelte` state is needed.
  - Later changes of the chat's model do not rebuild the open terminal's URL, so a model switch does not kill a running Claude Code session. Reopening the terminal (switching away and back, or reloading) picks up the current model.
  - A null or empty model id adds no `model` parameter.
  - "The chat's model" is `selectedModelIds[0]`, the value the other `ChatControls` panels already use. It includes a transient `@` mention while one is active, and the first model of a multi-model chat.
- `ChatControls.svelte` (upstream file, minimal diff) passes its existing `modelId` (`selectedModelIds[0]`, `Chat.svelte:4655`) to both `WorkspaceArtifact` render sites (`:379`, `:508`).

**SPA (OCU `static/`).**

- In `embed=terminal`, the SPA reads one `model` query parameter (absent or empty means none) and sends it as `model` in the `start-ttyd` body, on both call sites: `preview.js` (~2036) and `recoverStoppedContainer` in `ocu-request.js` (~111).
- A 422 from `start-ttyd` shows the server's `detail` string in the terminal pane, wrapped in a new i18n message. It skips the stopped/meta status probe and does not call `recoverStoppedContainer`. If the `start-ttyd` inside `recoverStoppedContainer` answers 422, the SPA shows that detail instead of the generic `restore_fail`. A `detail` that is not a string is shown as the generic message.
- Standalone (non-embed) preview sends no `model`, so in gateway mode its terminal answers 422 with the model message. This is an accepted change: Claude Code in the product terminal follows a chat.

**OCU `start-ttyd` in gateway mode.**

- `StartTtydRequest` gains `model: str | None` with no pydantic constraint. All gateway validation happens in the handler and raises `HTTPException(422, detail=<string>)`, so every gateway refusal has a string `detail`. A non-string `model` (for example `5`) is rejected earlier by pydantic with its list `detail`, in both modes; no client sends one. The model must be 1-256 characters of printable ASCII without whitespace (`^[\x21-\x7e]{1,256}$`).
- Order: chat id sanitising, then (gateway mode) token and model checks, then the container lookup. A missing input answers 422 even when the container is stopped, so the SPA never enters the restart flow for it.
- Token: the WebUI JWT from the `token` cookie of the same request. The handler takes `request: Request`; the proxy already forwards `Cookie` after WebUI confirmed chat ownership (`render.py:254`, `/api/v1/ocu/auth`). Parsing uses one shared helper, extracted from `ws_recheck.handshake_cookie` (`ws_recheck.py:93-110`), which then uses it too. OCU does not validate the JWT; it is an opaque string for Open WebUI.
- Missing token or missing or invalid model → 422 with an explicit English `detail` ("Claude Code gateway: …"), no container lookup and no exec.
- Environment for ttyd (and so tmux, bash and Claude Code), passed with `exec_run(environment=…)`, never in the command string:
  - `ANTHROPIC_BASE_URL=http://<address>:8080/api`
  - `ANTHROPIC_AUTH_TOKEN=<token>`
  - `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL` = the model
  - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `DISABLE_TELEMETRY=1`
  - `OCU_TERMINAL_FINGERPRINT=<sha256 hex of base URL, model and token>`

  `_execute_bash` (`docker_manager.py:1388`) gains an optional `environment` argument passed through to `exec_run`; no other caller changes.

- Reuse versus restart: if a ttyd runs and its process environment (`/proc/<pid>/environ` of the oldest `ttyd`) contains exactly `OCU_TERMINAL_FINGERPRINT=<expected>`, it is reused (`{"started": false, "already_running": true}`). In every other case, the handler first runs the existing stop command (`pkill -x ttyd; tmux kill-server`, `app.py:1173`), then starts a fresh ttyd with the new environment. The other cases are: a ttyd running with another fingerprint or none, and no ttyd at all, because a tmux server can outlive ttyd and `new-session -A` would reattach to its old environment. The response is `{"started": true, "already_running": false, "restarted": <whether a ttyd was running>}`. The fingerprint (a hash) may appear in the command string; the token and model values may not.
- Concurrency: in gateway mode the whole check-stop-start sequence for one chat runs under that chat's `_combined_lock` (`docker_manager.py:333`, already used by `app.py:136`, `:637`, `:690`), so two concurrent starts cannot interleave. The lock is a per-chat `RLock` (`docker_manager.py:180-199`) that `_execute_bash` takes again through `_reset_shutdown_timer` (`:1380-1393`). The whole check-stop-start sequence therefore runs inside one `asyncio.to_thread` callable that acquires the lock and calls `_execute_bash` from that same thread. Acquiring it in the event loop and then awaiting further `to_thread` calls would deadlock and leave the chat's lifecycle lock held. Two tabs on different models are last-writer-wins: each open restarts the terminal with its own model. This is documented, not prevented.
- `dangerous_mode` keeps its current meaning (`NO_AUTOSTART=1`).

**Deployment smoke.** `deploy/smoke_deployment.py` `start_product_terminal` sends a fixed placeholder model (`"model": "ocu-smoke-terminal"`) so the gateway-mode start succeeds. The smoke checks the terminal default (bash, no autostart), not Claude Code, so the model is never used.

**Secrets.** Token values never appear in OCU logs or prints, HTTP responses, exception messages, URLs, the exec command string, or WebUI responses. The model id is not secret.

**Docs.** `docs/claude-code-gateway.md` "Open WebUI as the gateway" describes the automatic terminal injection and that the token is the user's WebUI login JWT (default lifetime `JWT_EXPIRES_IN=4w`; an expired token shows as a 401 in Claude Code, and reopening the terminal after signing in again restarts it with the new token). Decision record in this repo.

## Capabilities

### New Capabilities

- `ocu-terminal-claude-gateway`: per-start Claude Code environment for the workspace terminal in gateway mode.

## Impact

- OCU: `computer-use-server/app.py` (`start_ttyd`, startup validation), `docker_manager.py` (`_execute_bash` env passthrough), `ws_recheck.py` (shared cookie helper), `static/preview.js`, `static/ocu-request.js`, `deploy/production-like-test/compose.core.override.yml`, `deploy/smoke_deployment.py`, `docs/claude-code-gateway.md`, tests.
- WebUI: `src/lib/apis/ocu/index.ts`, `src/lib/components/chat/WorkspaceArtifact.svelte`, `src/lib/components/chat/ChatControls.svelte` (two props), tests, decision record.
- Non-goals: live model switching inside a running Claude Code session; reasoning effort for Claude Code; the `sub_agent` MCP path (keeps the server-wide environment); validating the model against WebUI at start (Open WebUI rejects an unknown model on the first request, visibly in Claude Code); token refresh inside a running session.

## Fixture

```text
Fixture level: expanded
Upstream suggested level: absent; expanded: user credential injected into sandbox processes, two repos, upstream spine-adjacent UI file
Blast radius: every workspace terminal in the production-like overlay; a leak exposes a user's WebUI session token; a wrong reuse decision binds the wrong user's token or model; a strict gate wrongly blocks the terminal
Selected risk packs: Auth / permissions / secrets; Public API (start-ttyd body and responses, SPA URL parameter); Config / project setup; Legacy compatibility (gateway off); Error handling; Concurrency / shared state (check-stop-start on the shared ttyd/tmux → per-chat lock, evidence c); UI; Documentation
Not selected: Resource limits (no new allocation); Release / packaging (no image or inventory change; the compose override gains one variable already in runtime.env); Data migration (none)
Must preserve: gateway off → start-ttyd is byte-for-byte today's behaviour and ignores model; dangerous_mode semantics; already-running reuse when nothing changed; stop-ttyd unchanged; embed validation (exactly one embed value, framed) unchanged; browser runtime URL unchanged; chat-owner-only access via the proxy unchanged
Evidence floor: OCU handler tests (gateway on/off, cookie token, env via environment not argv, fingerprint reuse/restart, 422 paths, no token in logs/responses); SPA node tests for both start-ttyd call sites and the 422 display; WebUI vitest for workspaceRuntimeUrl and the capture-at-open rule; make test-frontend, make typecheck, make lint-scoped, make verify-ui-ocu; OCU unit command; acceptance VPS Claude Code Write+Bash task through the ingress on two models
design.md: present
```
