---
id: 2026-10-27-terminal-claude-gateway
title: The workspace terminal starts Claude Code with the opener's login token and the chat's model
kind: architecture
status: implemented
date: 2026-10-27
supersedes: none
references: DankerMu/open-webui#656, DankerMu/open-webui#650, DankerMu/open-webui#653, ocu-terminal-claude-gateway, 2026-10-27-sandbox-messages-ingress
---

# The workspace terminal starts Claude Code with the opener's login token and the chat's model

## Problem

Claude Code in the workspace terminal only had the environment baked into the sandbox when it was created. The production-like overlay sets no Anthropic variables there, so Claude Code asked for a subscription `/login`. The Messages ingress (#655) gives sandboxes one route to Open WebUI's `/api/v1/messages`, and #653 measured Claude Code completing tool tasks through it with a user's JWT and a chat model. Nothing told the terminal which user opened it or which model the chat uses.

## Decision

Owner decision on #650 (2026-10-27): Claude Code in the sandbox uses the user's own Open WebUI login token, and its model follows the chat.

- **Gateway mode.** The overlay passes `OCU_SANDBOX_MESSAGES_ADDRESS` to Computer Use. Gateway mode is on when it is set and the server's `SUBAGENT_CLI` is `claude`; OCU derives `http://<address>:8080/api`. A set value that is not an IPv4 literal, including empty, stops OCU at startup with an error naming the variable. Unset means `start-ttyd` runs exactly as before and ignores `model` and the cookie.
- **Token from the forwarded cookie.** The proxy already forwards the browser's `Cookie` after `/api/v1/ocu/auth` confirms chat ownership. `start-ttyd` reads the `token` cookie with the same helper as the WebSocket re-check (`ws_recheck.token_cookie`) and treats it as an opaque string.
- **Model through the iframe URL, captured at open.** `WorkspaceArtifact` appends `&model=<encoded selectedModelIds[0]>` to the terminal URL only, captured when the terminal view opens or mounts with the terminal view saved. A null or empty model adds nothing. The SPA reads `model` in `embed=terminal` only and sends it in both `start-ttyd` bodies.
- **Validation before the container lookup.** In gateway mode a missing token, or a model that is not 1-256 printable ASCII characters without whitespace, answers 422 with a string `detail`. Nothing runs in the sandbox, and the answer is the same when the container is stopped. The SPA shows the detail instead of probing container status.
- **Environment only through `exec_run(environment=…)`.** The base URL, the token, the model in `ANTHROPIC_MODEL`, the three `ANTHROPIC_DEFAULT_*_MODEL` variables and `CLAUDE_CODE_SUBAGENT_MODEL`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `DISABLE_TELEMETRY=1` and `OCU_TERMINAL_FINGERPRINT=sha256(base URL, model, token)`. The command string is byte-identical to the gateway-off start; only the fingerprint hash appears in a command (the probe).
- **Reuse from the running process.** A ttyd whose `/proc/<pid>/environ` holds the expected fingerprint is reused. Every other start runs the existing stop command (`pkill -x ttyd; tmux kill-server`) first, also when no ttyd runs, because a tmux server can outlive ttyd and `new-session -A` would reattach its old environment.
- **One worker thread under the chat lock.** Probe, stop, start and the 0.5 s wait run in one `asyncio.to_thread` callable holding `_combined_lock(chat_id)`. The lock is a per-thread `RLock` that `_execute_bash` re-enters through the shutdown timer, so acquiring it on the event loop and awaiting more threads would deadlock.

## Alternatives considered

- **Token in the request body** — the `token` cookie is httponly, so the SPA would need another way to obtain it, and the token would cross the browser and proxy inside a JSON body.
- **A WebUI-issued scoped key** — no such credential exists; the owner chose the login token.
- **Inline `VAR=value` in the command** — puts the token in `bash -c` argv, visible through `ps` and Docker exec inspection.
- **Per-chat reuse state in OCU** — an OCU restart or a sandbox-side ttyd restart would make it wrong. The process environment cannot be changed by sandbox code after start.
- **Follow model changes live** — would kill a running Claude Code on every dropdown change. Reopening the terminal is the switch.
- **A `Chat.svelte` flag for "models loaded"** — `Chat.svelte` already renders `ChatControls` only under `{#if !loading}`, and `navigateHandler` sets `loading` before `chatId` changes, so `WorkspaceArtifact` remounts after the new chat's `selectedModels` is set. A new flag would touch the upstream spine for no new guarantee.
- **Validate the model against Open WebUI at start** — Open WebUI rejects an unknown model on the first request, visibly in Claude Code; OCU has no route to ask.

## Consequences

- **Token in the sandbox.** The WebUI JWT is a full session token, readable by any process running as `assistant` in that sandbox. The sandbox belongs to the chat owner and its network reaches only the Messages ingress (#655). A scoped credential is a follow-up.
- **JWT lifetime.** The token lives as long as the login (`JWT_EXPIRES_IN`, default `4w`). A long-lived terminal can hold an expired token; Claude Code shows the 401, and reopening the terminal after signing in again restarts it with the new token. There is no refresh inside a running session.
- **Last writer wins.** Two tabs of one chat on different models restart each other's terminal on every open. This needs two tabs and a model switch between them; it is documented, not prevented.
- **Precondition: `{#if !loading}`.** Capture at mount is correct only because `Chat.svelte` (`:4267`) renders `ChatControls` under `{#if !loading}` and `navigateHandler` sets `loading = true` (`:842`) before `loadChat` changes `chatId` (`:2290`). If an upstream rebase removes that gate, a chat switch with the terminal saved can carry the previous chat's model; this record must then be revisited.
- "The chat's model" is `selectedModelIds[0]`, the value the other `ChatControls` panels use, including a transient `@` mention and the first model of a multi-model chat.
- Every start that is not a reuse ends a running Claude Code and every tmux session in that sandbox, like Terminate; `claude --resume` recovers the conversation.
- The standalone (non-embedded) preview sends no model, so its terminal answers 422 in gateway mode.
- `start-ttyd` in gateway mode answers `{"started": true, "already_running": false, "restarted": <bool>}` on a start; existing clients ignore the extra keys. The deployment smoke sends the placeholder model `ocu-smoke-terminal`.
- Handler, SPA and WebUI tests prove the contract with fakes. A real Claude Code task on two models through the ingress is acceptance-VPS evidence after deployment.
