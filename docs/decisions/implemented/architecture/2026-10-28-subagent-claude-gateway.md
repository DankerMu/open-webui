---
id: 2026-10-28-subagent-claude-gateway
title: sub_agent runs Claude Code with the caller's Open WebUI token and the chat's model
kind: architecture
status: implemented
date: 2026-10-28
supersedes: none
references: DankerMu/open-webui#662, DankerMu/open-webui#650, DankerMu/open-webui#656, DankerMu/open-webui#640, ocu-subagent-claude-gateway, 2026-10-27-terminal-claude-gateway, 2026-10-27-sandbox-messages-ingress
---

# sub_agent runs Claude Code with the caller's Open WebUI token and the chat's model

## Problem

The workspace terminal already ran Claude Code through the Messages ingress with the opener's token and the chat's model (#656). The `sub_agent` tool did not. Its Claude Code saw only the environment written into the sandbox when it was created, and the production-like overlay sets no Anthropic variables there. Its model was the language model's `model` argument, alias-expanded (`sonnet` became `claude-sonnet-4-6`), and a resume passed no model at all. The chat's model never reached Computer Use. For this reason the overlay cut `sub_agent` out of the installed Tool "until a fully internal sub-agent runtime is available".

## Decision

Owner decisions: on #650 (2026-10-27), Claude Code uses the user's own Open WebUI token and its model follows the chat. On #640 and #650 (2026-10-28), the refusal of a model the user may not use is accepted on code and unit evidence. On 2026-10-28, the overlay installs `sub_agent` again once it runs through the gateway.

- **One gateway builder.** OCU's `claude_gateway` module holds the gateway mode switch and the per-call environment that `app.py` used to hold. Gateway mode is on when `OCU_SANDBOX_MESSAGES_ADDRESS` is set and `SUBAGENT_CLI` is `claude`. The terminal and `sub_agent` both use the module. The terminal's 422 detail strings, its ten environment keys and its fingerprint are unchanged.
- **Two headers, on `sub_agent` only.** The Open WebUI Tool sends `X-OCU-Gateway-Token` (`__request__.state.token.credentials`, the token that authenticated the chat request) and `X-Chat-Model` (the chat request's model, `__metadata__["model"]["id"]`). It sends each one only when the value is non-empty and header-safe. The other tools send neither header. The model does not come from `__model__`: Open WebUI injects the task model there (`backend/open_webui/utils/middleware.py:2916-2925`), while the chat's model is in the request metadata (`backend/open_webui/main.py:1261`).
- **Token only for the chat owner.** The Tool sends `X-OCU-Gateway-Token` only when `Chats.is_chat_owner(chat_id, user id)` is true. An admin may run completions in another user's existing chat (`main.py:1472`); there the Tool sends no token, so `sub_agent` returns the missing-token error and the admin's token never reaches the owner's sandbox. A failed or unavailable ownership lookup counts as not owner. `X-Chat-Model` does not depend on ownership.
- **Headers in every deployment.** The Tool sends both headers on every `sub_agent` call, also when OCU is not in gateway mode; OCU then ignores them.
- **Separate context variables.** The two headers feed their own ContextVars. `MCPContextMiddleware` resets them after every request. Container creation never reads them, and the existing `X-Anthropic-Api-Key` channel keeps its meaning.
- **Refusal before sandbox work.** In gateway mode `sub_agent` builds the environment first. A missing token or an unusable model returns `Error: Claude Code gateway: …` with the builder's detail. No container is looked up and no process starts.
- **Chat model verbatim.** The language model's `model` argument is ignored and no alias is expanded. `--model <chat model>` goes into argv on new sessions and on resume; the resume argv gets `--model` in gateway mode only. The result banner names the chat model. Every call uses its own token and model, so a resume after a model switch runs on the new model.
- **Environment only through `exec_run(environment=…)`.** `dispatch` and `_execute_bash_capture` pass the environment to the Claude Code exec and to nothing else. The token is not written to the command string, argv, the container environment, a response, an exception message, or a log line.
- **Gateway off is unchanged.** Without the address, or with another CLI, `sub_agent` ignores both headers. It keeps alias expansion for Claude, codex and opencode keep their own model resolution, and no per-call environment is passed.
- **The overlay installs the shipped Tool whole.** `run-init.sh` no longer removes `sub_agent`. The overlay already requires `OCU_SANDBOX_MESSAGES_ADDRESS` and runs Claude Code as the sandbox CLI, so wherever `sub_agent` is installed, gateway mode is on. The overlay still passes no external Claude, Codex or OpenCode credentials.
- **Open WebUI refuses forbidden models.** Backend route tests pin `POST /api/v1/messages` with `BYPASS_MODEL_ACCESS_CONTROL` off. On an OpenAI-compatible connection it gives the status `POST /api/chat/completions` gives for that model; on the Anthropic passthrough it gives 403. Both refuse before any upstream call, and an allowed model reaches the upstream on both paths. The tests do not depend on the swallowed `count_tokens` 403.

## Alternatives considered

- **Reuse `X-Anthropic-Api-Key`** — `_create_container` copies that value into the sandbox's container environment. A user token sent there would persist in `docker inspect` whenever `sub_agent` creates the sandbox. Outside gateway mode it would also pair the user's token with the server's `ANTHROPIC_BASE_URL` (`https://api.anthropic.com` by default).
- **Keep the language model's `model` argument** — the owner chose the chat's model. Aliases such as `sonnet` name no Open WebUI model, and a second model choice inside one chat would bypass what the user selected.
- **Validate the model against Open WebUI before the call** — OCU has no route to ask. Open WebUI refuses an unknown or forbidden model on Claude Code's first request, and the refusal shows in the sub-agent's result.
- **A separate builder for `sub_agent`** — two validators for one token and one model would drift. One module serves both callers.
- **Keep `sub_agent` out of the overlay** — the removal existed only because no internal runtime existed. The gateway is that runtime, and the owner asked for `sub_agent` back.
- **Inline `VAR=value` in the command** — puts the token in `bash -c` argv, visible through `ps` and Docker exec inspection.

## Consequences

- **Token readable inside the sandbox.** The token sits in Claude Code's process environment, which code running in the sandbox can read. The Open WebUI login token lasts 4 weeks by default (`JWT_EXPIRES_IN`). The sub-agent runs model-chosen commands under `bypassPermissions`, and any background process it starts keeps the token after the call ends. The exposure is wider than the terminal's (#656): it is reached without a user opening a terminal, the token can be an API key that does not expire like the 4-week login token, and it can land in OCU's own logs (next item). A scoped credential is a follow-up.
- **Claude Code can echo the token.** It can print its own environment into its output and into the sub-agent progress lines that OCU prints to its own stdout (`[SUB-AGENT-PROGRESS]`, `mcp_tools.py:~1180`). OCU filters neither.
- **Exposure in the overlay.** The overlay now offers `sub_agent` to every chat. It runs only through the gateway, and the overlay passes no external credentials.
- **API keys and fallback models.** The token is whatever authenticated the chat request, so it can be the user's Open WebUI API key instead of the login token; `/api/v1/messages` accepts both. An API key does not expire like the login token. When `ENABLE_CUSTOM_MODEL_FALLBACK` replaced a custom model, the forwarded model is the fallback model.
- **Detail wording.** The two detail strings were written for the terminal and end with "reopen the terminal". `sub_agent` returns them unchanged, because the builder is shared and the terminal strings must not change.
- **Evidence boundary.** OCU unit tests and WebUI route tests prove the contract with fakes. A real `sub_agent` run on two chat models, a resume after the model switch, and no token in process argv or `docker inspect` are acceptance-VPS evidence after an owner go-ahead.
