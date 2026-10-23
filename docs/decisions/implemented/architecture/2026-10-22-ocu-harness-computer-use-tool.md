---
id: 2026-10-22-ocu-harness-computer-use-tool
title: The Computer Use tool is attached to every saved chat by the global filter, and every provider model is visible
kind: architecture
status: implemented
date: 2026-10-22
supersedes: none
references: DankerMu/open-webui#590, DankerMu/open-computer-use#165, ocu-harness-computer-use-tool
---

# The Computer Use tool is attached to every saved chat by the global filter, and every provider model is visible

## Problem

The Computer Use tool (`ai_computer_use`) was bound to one wrapper model instead
of to the chat. OCU's init created `qwen3.8-27b (Computer Use)`, a `Models` row
whose `meta.toolIds` named the tool. The global `computer_use_filter` inlet
returned the body unchanged unless the request already named the tool. A chat
with any other model therefore got neither the tool nor the Computer Use system
prompt, and the model told the user it could not create files.

A second, separate gate hid the models themselves. In this fork, a non-admin
sees and may use only models that have a `Models` row with a read grant
(`backend/open_webui/utils/models.py:498-543`, `main.py:1127`). The provider
catalogue has about 511 models and none of them has such a row, so ordinary
users saw only the wrapper.

Owner decisions, recorded on DankerMu/open-webui#590:

1. The tool is a harness capability, not a model capability.
2. There is no per-model opt-out.
3. The wrapper model is not kept.
4. Every raw provider model is visible to ordinary users.
5. Existing deployments delete the wrapper row once.

## Decision

**Tool attachment (OCU filter).** The `computer_use_filter` inlet adds
`ai_computer_use` to `body["tool_ids"]` for every request whose `chat_id` is a
saved-chat id, meaning the full UUID shape, compared without regard to case.
Channel replies (`channel:<id>`), temporary and local chats, and requests
without a `chat_id` are left unchanged. Those chats have no workspace.

- The tool is appended after any tools the user selected, keeping their order,
  and appears exactly once.
- Attachment happens before the `INJECT_SYSTEM_PROMPT` valve is checked, so
  turning that valve off keeps the tool. The system-prompt branch is gated by
  the same predicate, so tool and prompt never diverge.
- The fork needs no code change:
  - The filter is active and global, so `get_model_filter_ids` adds it to every
    model (`utils/filter.py:59-65`).
  - Inlets run at `utils/middleware.py:2635`, before `tool_ids` is read at
    `:2722` and resolved at `:2847-2913`.
  - `get_tools` still checks per-tool access (`utils/tools.py:288-301`), and
    the tool stays public-read.
- Task routes (title, tags, follow-ups) never run function-filter inlets
  (`routers/tasks.py:198-205`), so they get no tool without any special case.

**Wrapper removed.** OCU init no longer creates the wrapper. `run-init.sh`
keeps `PRIMARY_CHAT_MODEL` required. It still writes `DEFAULT_MODELS` from it
and still validates it against `/api/models` before the init marker is written.

**Visibility (OCU deploy overlay).** `compose.webui.override.yml` sets
`BYPASS_MODEL_ACCESS_CONTROL: "true"` on the WebUI service. Scope: the deployment
serves about 20 trusted LAN employees (AGENTS.md, Project Identity).

The flag opens, for every signed-in user:

- model listing: `utils/models.py:502`, `routers/openai.py:937`;
- chat use: `main.py:1127`, `utils/chat.py:159`, `routers/openai.py:1483`;
- embeddings through a chat model: `utils/embeddings.py:42`;
- the Anthropic-compatible passthrough: `routers/openai.py:465`;
- the OpenAI proxy: `routers/openai.py:1864`;
- every existing private custom, arena and pipe model: `routers/functions.py:288`.
- two surfaces that are unreachable in this deployment: the `@model` list in
  channels (`routers/channels.py:977`, while `ENABLE_CHANNELS` is off) and the
  Ollama router checks (`routers/ollama.py`, while `ENABLE_OLLAMA_API` is
  `"false"`).

The flag does not open:

- tool access (`utils/tools.py:288-301`);
- knowledge access, while `BYPASS_RETRIEVAL_ACCESS_CONTROL` stays `"false"`
  (`retrieval/utils.py:1412,1431`).

**Upgrade of existing deployments.** The filter source lives in the WebUI
Functions table, and only init writes it, behind the
`.computer-use-initialized` marker. An existing deployment therefore keeps the
old filter until init runs again. The upgrade is an ordered procedure,
documented in OCU `deploy/production-like-test/NETWORK-HARDENING.md`:

1. Deploy the release with the bypass flag live.
2. Delete the marker from the `open-webui-data` volume with a one-off container,
   then re-run the one-shot `open-webui-init` service through `deploy/up.sh`.
   The fallback is `compose up -d --force-recreate open-webui-init`. The
   `open-webui` service itself never runs init.
3. Run `deploy/production-like-test/init/remove-wrapper-model.py` once:
   - It refuses unless the stored `computer_use_filter` content is
     byte-identical to the shipped filter file. This enforces step 2. The
     filter source avoids the substrings that the fork's `replace_imports`
     rewrites on save (`utils/plugin.py:187-201`), and an OCU test asserts
     that.
   - It lists rows from both `GET /api/v1/models/base` and
     `GET /api/v1/models/export`. The wrapper's id equals its base id, so the
     fork stores it with `base_model_id = None` (`routers/models.py:270-272`),
     and export, which keeps only rows with a base model
     (`models/models.py:254`), never returns it.
   - It deletes only rows whose name ends with ` (Computer Use)` and whose
     `meta.toolIds` contains `ai_computer_use`, through
     `POST /api/v1/models/model/delete`. That call also revokes the row's
     grants.
   - A second run reports "nothing to remove" and exits 0.

Re-running init has side effects:

- `DEFAULT_MODELS` is written again.
- The tool and filter valves are reseeded, so admin edits to them are lost.
- The tool is set back to public-read.
- Init signs in with the env `ADMIN_PASSWORD`, so that must be the live
  password.

The wrapper's id equals the raw provider id, so the row was an override of the
base model. Deleting it makes the id resolve to the raw model again. Existing
wrapper chats continue on the raw `qwen3.8-27b`, now with the tool attached by
the filter.

## Alternatives considered

- **Inject the tool in the fork middleware** near `utils/middleware.py:2722`.
  Rejected: it touches the upstream spine (AGENTS.md, Module Boundaries) and
  splits one integration across two repositories. The filter path already
  reaches every model.
- **Keep the wrapper and add more wrappers.** Rejected by owner decisions 1
  and 3. A wrapper per model duplicates the provider catalogue and binds a
  harness capability to model rows.
- **Per-model `Models` rows with read grants** instead of the bypass flag.
  Rejected: about 511 rows to create, and they drift every time the provider
  catalogue changes.
- **An allowlist of visible models.** Rejected by owner decision 4.
- **Remove the wrapper row by hand in the admin UI.** Rejected: unrepeatable,
  and it does not prove that init has re-run with the new filter. The script's
  byte-for-byte filter check does.

## Consequences

- Every saved-chat request carries the tool and its system prompt, including
  requests to models without function-calling support. Such a model may return
  an error or ignore the tool. The owner accepted this with decision 2. The
  acceptance run records the actual behaviour of one such model.
- The composer's tool toggle no longer shows the tool as selected, because the
  server attaches it.
- Automations, notes-assistant, sub-agent and timer chats (all saved with
  uuid4 ids), and API calls that use a saved `chat_id`, also get the tool. API
  callers that pass `tools` explicitly skip server-side tool resolution
  (`utils/middleware.py:2621,2845`).
- Rollback: revert the OCU change, remove the marker and re-run init. Init then
  recreates the wrapper and reinstalls the old filter. Removing the bypass flag
  hides the provider models from non-admins again.
