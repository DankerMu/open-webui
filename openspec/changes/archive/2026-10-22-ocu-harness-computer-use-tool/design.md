## Context

OCU lines are at `34dc83c`; these files are unchanged on `origin/main`. Fork lines are on the current `main`.

- **Filter coupling.** The filter is marked active and global (`openwebui/init.sh:196-220`, `/toggle/global` `:218`). `get_model_filter_ids` adds every active global filter to every model, including a raw model with no `info.meta` (fork `utils/filter.py:59-65`). The filter has no `toggle` attribute, so it is never a per-chat opt-in (`:79-80`). The inlet's early return is the only tool/model coupling (`computer_link_filter.py:341-343`); the outlet checks valves and `chat_id` only (`:405-419`).
- **Order in the fork middleware.** Inlets run at `middleware.py:2635`. `tool_ids` is popped later, at `:2722`, written to metadata at `:2833`, resolved at `:2847-2913`, and loaded by `get_tools` at `:2916`. So a value the inlet writes into `body["tool_ids"]` is the one that gets resolved. `get_tools` still checks per-tool access (`utils/tools.py:288-301`); `ai_computer_use` is public-read (`init.sh:143`).
- **Native function calling.** `function_calling` defaults to `native` when neither the request nor the model params set it (`main.py:1267-1271`). `DEFAULT_MODEL_PARAMS` also merges `native` (`init.sh:228-280`).
- **Model visibility** is described in the proposal.
- **Bootstrap.**
  - `run-init.sh:89-91` requires `PRIMARY_CHAT_MODEL`, and `:110-116` sets `DEFAULT_MODELS` to it.
  - `:117-164` holds the model-selection rewrite and its anchors, the wrapper public-read grant, and the final splice.
  - The surviving `marker_section` anchor (`:145-147`) is the exact text at `init.sh:372-373`.
  - The init marker (`init.sh:38,51-53`) prevents re-runs.

## Decisions

### D1. Inject from the existing global filter's inlet

```python
if _saved_chat_id(chat_id):
    tool_ids = list(dict.fromkeys([*(body.get("tool_ids") or []), "ai_computer_use"]))
    body["tool_ids"] = tool_ids
```

- **Order and placement.** The tool is appended after the user's tools; user order is preserved and duplicates are removed. This runs before the `INJECT_SYSTEM_PROMPT` check. The system-prompt branch keeps its current behaviour under that valve.
- **`_saved_chat_id`.** It accepts the UUID shape, case-insensitively, that the fork's saved chats use, and rejects `channel:`, `temporary:`, `local:` and an empty value (fork `utils/chat_id.py:4-11`). It is not stricter than the workspace itself, which requires a saved chat. The filter's existing system-prompt branch uses the same predicate, so tool and prompt never diverge.
- **Task requests** need no handling. Task routes call `process_pipeline_inlet_filter` and then `generate_chat_completion` (`routers/tasks.py:198-205`), and that path never runs function-filter inlets. No dead branch is added for them.

_Alternative:_ fork middleware injection near `middleware.py:2722`. Rejected, because it touches the upstream spine and splits the integration across two repos. The filter path already works; evidence (c) proves it end to end.

### D2. Remove the wrapper at its sources

- **init.sh.** Remove `:281-371` and the stale `:142`. Reword only `:375-376`, where the wrapper wording is. Keep line 373, `# Mark as initialized — only if every required step succeeded.`, unchanged: it is the `marker_section` anchor text, and changing it trips run-init's `count != 1` check. The marker logic and the filter/tool registration (`:168-179`) stay.
- **run-init.sh.** Remove `:117-164` and reword `:107-109`.
- **`PRIMARY_CHAT_MODEL`.**
  - It keeps its name and remains required.
  - The `DEFAULT_MODELS` anchor (`:110-116`) remains.
  - The `/api/models` check is spliced through the surviving `marker_section` anchor (`:145-147`). It runs after the `DEFAULT_MODELS` POST and before the marker is written, using init.sh's existing `$AUTH`. Sign-in is not copied into run-init.
  - Renaming the variable is deferred, because it would break existing env files for no behavioural gain.

### D3. Visibility through `BYPASS_MODEL_ACCESS_CONTROL`

One env line in `compose.webui.override.yml`, with an inline comment naming the failure mode: "non-admins see no provider model without per-model rows". Scope: about 20 trusted LAN employees, per AGENTS.md Project Identity.

**Opens:**

- listing: `utils/models.py:502`, `openai.py:937`;
- chat use: `main.py:1127`, `utils/chat.py:159`, `openai.py:1483`;
- embeddings: `utils/embeddings.py:42`;
- the Anthropic passthrough: `openai.py:465`;
- the proxy: `openai.py:1864`;
- existing private custom, arena and pipe models: `functions.py:288`.

**Does not open:** tool access (`utils/tools.py:288-301`), or knowledge access while `BYPASS_RETRIEVAL_ACCESS_CONTROL` stays false (`retrieval/utils.py:1412,1431`).

_Alternatives:_

- Per-model `Models` rows with grants: about 511 rows, which drift as the provider catalogue changes.
- An allowlist: contradicts decision 4.

The decision record lives in the fork at `docs/decisions/implemented/architecture/`. It records the flag, the full blast radius above, and the rejected alternatives.

### D4. Upgrade procedure and one-off removal

See the proposal for the ordered procedure:

1. the bypass flag is live;
2. the marker is deleted and init re-run, which refreshes the filter;
3. the removal script runs, and refuses unless the stored `computer_use_filter` content equals, byte for byte, the shipped `openwebui/functions/computer_link_filter.py` (mounted as `/app/source/functions/computer_link_filter.py` in the init container).

**Step 2 in the production-like deployment.** The `open-webui` service never runs init. Only the one-shot `open-webui-init` service does (`compose.webui.override.yml:71-99`, `restart: "no"`, entrypoint `/bootstrap/run-init.sh`). So the procedure is:

- delete `.computer-use-initialized` from the `open-webui-data` volume, using a one-off container that mounts the volume;
- re-run the `open-webui-init` service with `deploy/up.sh`, whose `start_stack` runs `compose up -d` on `webui.up.json` (`deploy/up.sh:286-298`).

Evidence (d) must show that `compose up -d` really restarts the exited one-shot `open-webui-init`. If it does not, the docs name an explicit command for that one service, for example `compose up -d --force-recreate open-webui-init` against the checked snapshot.

**Byte-for-byte check and the import rewrite.** The fork runs `replace_imports` on every function create and update (`routers/functions.py:217,387`; `utils/plugin.py:187-201`). It rewrites the substrings `from utils`, `from apps`, `from main` and `from config`. The new filter source must not contain them, including in comments. Evidence (b2) adds a test that asserts this, so the stored content stays equal to the shipped file.

`docs/INSTALL.md:40-44` (exec `rm` plus restart `open-webui`) does not re-run init under any compose file in the repo. It is corrected in the docs list.

**Side effects of re-running init**, which the upgrade docs list:

- `DEFAULT_MODELS` is written again (`run-init.sh:113-116`);
- the tool and filter valves are re-seeded (`init.sh:131-133`, `:187-189`), so admin edits are reset;
- the tool is set back to public-read;
- init signs in with the env `ADMIN_PASSWORD`. If the password was changed in the UI, sign-in fails, because signup is disabled (`ENABLE_SIGNUP: "false"`). The docs say to restore the env password first.

The script reads the admin credential from the same source as run-init and never prints it. It runs in a one-off container on the private network.

**Expected outcome for existing chats.** The wrapper id equals the raw id, so the row is a base-model override. Deleting it makes the id resolve to the raw provider model, and existing wrapper chats continue on `qwen3.8-27b` with the tool now injected by the filter. Evidence (d) verifies this.

## Must preserve

- Filter system-prompt content and the outlet behaviour.
- The filter stays active and global; the tool stays public-read.
- `function_calling: native` defaults.
- run-init still fails loud on a missing or invalid `PRIMARY_CHAT_MODEL`.
- No fork code change. If one becomes necessary, stop and report: it needs a decision record and minimal-diff rules.

## Required evidence

OCU tests run in the CI-shaped container (`python:3.13`, uid 1001), because the hosted unit job is disabled.

- **(a) Filter tests** (`tests/test_filter.py`):
  - the key is absent, `[]`, or holds other tools, and `ai_computer_use` appears exactly once in user order;
  - `INJECT_SYSTEM_PROMPT` off still injects the tool;
  - no `chat_id`, `channel:<id>`, `temporary:<id>` and `local:<id>` all mean no change.
  - The 38 existing cases that use `"chat_id": "abc"` switch to UUIDs. This is the expected change for the saved-chat predicate, not a weakened test. The predicate is case-insensitive, because OCU normalises chat-id case (`computer-use-server/app.py:507`); one test covers an upper-case UUID.

  The test at `:649` was red before the change.

- **(b) Bootstrap tests** (`tests/deploy/test_init_wrapper.py` and any run-init test):
  - no `(Computer Use)` model is created;
  - an invalid `PRIMARY_CHAT_MODEL` still fails before the marker is written;
  - only the `DEFAULT_MODELS` anchor remains;
  - the overlay test asserts the bypass env.
- **(b2) Removal script tests:**
  - refuses when the stored filter is the old one;
  - deletes only rows that match both the name suffix and the tool id;
  - a second run reports "nothing to remove" with exit 0;
  - never prints the credential.
- **(c) End to end on the acceptance VPS** (production-like, the #173 host, never the LAN instance), after a fresh bootstrap of the merged OCU:
  - `GET /api/v1/models` has no `ai_computer_use` in any `meta.toolIds`, and no model name ends with `(Computer Use)`;
  - an admin chat with `deepseek-flash-guan` writes a file through the tool, and the file appears in the workspace listing;
  - a non-admin user sees the raw models, and a chat writes a file the same way;
  - a chat with one extra user-selected tool keeps it, and the tool appears once (the provider request or the WebUI log);
  - one provider model without tool support is tried, and its actual behaviour (error text or ignored tool) is recorded;
  - values from `runtime.env` and `dmxapi.env` and the admin credentials are never printed.
- **(d) Upgraded deployment.** On the VPS state before the fresh bootstrap, which has the marker and the wrapper row:
  - run the procedure steps 1–3;
  - verify that the stored filter is the new one;
  - run the script a second time and record "nothing to remove";
  - a raw-model chat (`deepseek-flash-guan`) and the old wrapper chat (now on raw `qwen3.8-27b`) each write a file through the tool.
- **(e) Docs.** `grep -rn "(Computer Use)\|toolIds\|enable.*tool" README.md docs openwebui` shows no wrapper or per-model tool instructions, and the upgrade procedure is documented.
