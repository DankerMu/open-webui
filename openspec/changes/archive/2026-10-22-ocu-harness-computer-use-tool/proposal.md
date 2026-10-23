## Why

The Computer Use tool is bound to one wrapper model instead of to the chat (#590). A chat with any other model gets no `ai_computer_use` tool and no Computer Use system prompt, and the model tells the user it cannot create files. The cause is the global filter's inlet: it returns the body unchanged unless the request already names the tool (OCU `openwebui/functions/computer_link_filter.py:341-343`). Only the wrapper model `qwen3.8-27b (Computer Use)` names it, through its `meta.toolIds` (`openwebui/init.sh:305`).

Owner decisions:

1. The tool is a harness-level capability for every model 「工具应该是harness层，跟模型不应该绑定」.
2. There is no per-model opt-out 「不需要针对性的关能力」.
3. The wrapper model is not kept 「包装模型不保留」.
4. (2026-10-22) Every raw provider model is visible to ordinary users.
5. (2026-10-22) Existing deployments delete the wrapper row with a one-off step.

Decisions 4 and 5 are recorded at issuecomment-6335037419.

## What Changes

All changes are in OCU (`DankerMu/open-computer-use`), in one PR. OCU line numbers are at `34dc83c`; these files are unchanged on `origin/main` `e016eb6`.

- **Filter inlet** (`openwebui/functions/computer_link_filter.py`). For every request whose `chat_id` is a saved-chat id (UUID shape), the inlet adds `ai_computer_use` to `body["tool_ids"]`. Channel replies (`channel:<id>`) and temporary or local chats (`temporary:`, `local:`; fork `utils/chat_id.py:4-11`) get no injection:
  - it creates the key when absent, keeps any user-selected tools, and keeps exactly one `ai_computer_use`;
  - tool injection no longer depends on `INJECT_SYSTEM_PROMPT`, which today returns early at `:338`;
  - the existing system-prompt injection then runs as before.
- **`openwebui/init.sh:281-371`.** The wrapper-model creation and update are removed, along with the stale `WORKSPACE_ID=""` (`:142`) and the marker comment's wrapper wording (`:375-376`; line 373 is run-init's `marker_section` anchor text and stays as it is). The active, global filter (`:196-220`) and the native `DEFAULT_MODEL_PARAMS` (`:228-280`) are kept.
- **`deploy/production-like-test/init/run-init.sh`.** Remove `:117-164`: the model-selection rewrite, the wrapper access grant and the trailing `replace` that splices them. Update the comment at `:107-109`. This ships together with the init.sh edit, because run-init's anchors refuse to bootstrap against a changed init.sh. `PRIMARY_CHAT_MODEL` stays the required `DEFAULT_MODELS` value; the `DEFAULT_MODELS` anchor (`:110-116` on `init.sh:258`) is the only anchor that remains. Its `/api/models` validation is still spliced into init.sh through the surviving `marker_section` anchor (`:145-147`). It runs after the `DEFAULT_MODELS` POST, as today (`init.sh:264`, then `:284`), and before the marker is written, so a bad value still fails loud and leaves init re-runnable.
- **Visibility** (decision 4). `deploy/production-like-test/compose.webui.override.yml` sets `BYPASS_MODEL_ACCESS_CONTROL: "true"` on the WebUI service. In this fork, a non-admin sees and may use only models that have a `Models` row with a read grant (`backend/open_webui/utils/models.py:498-543`, `main.py:1127`). The flag skips that check (`env.py:817`; `routers/openai.py:465,937`). The alternative, creating and maintaining grant rows for about 511 provider models, is rejected in the decision record.
- **Existing deployments** (decision 5). An existing deployment never receives the new filter code, because the filter source lives in the WebUI Functions table, and only `init.sh:168-179` writes it, behind the marker check (`init.sh:52-56`). The upgrade is therefore a documented, ordered procedure:
  1. Deploy the new release with `BYPASS_MODEL_ACCESS_CONTROL` live.
  2. Delete the `.computer-use-initialized` marker from the `open-webui-data` volume and re-run the one-shot `open-webui-init` service through `deploy/up.sh` (design.md D4). With the new init.sh, init updates the tool and the filter and creates no wrapper.
  3. Run the one-off removal script `deploy/production-like-test/init/remove-wrapper-model.py`.
     - It runs as a one-off container on the private network, like `open-webui-init`, because WebUI publishes no ports (`compose.webui.override.yml:7`).
     - It first checks that the stored `computer_use_filter` content equals the shipped filter source byte for byte, and refuses with a clear message otherwise. This enforces step 2.
     - It lists DB rows with `GET /api/v1/models/base` (admin only, rows with `base_model_id IS NULL`, fork `routers/models.py:220`, `models/models.py:323-325`). The wrapper's id equals its base id, so the fork stores `base_model_id = None` (`routers/models.py:270-272`, `:817-819`), and `GET /api/v1/models/export` (`Models.get_models`, `base_model_id != None`, `models/models.py:254`) never returns it.
     - It deletes every row whose name ends with ` (Computer Use)` and whose `meta.toolIds` contains `ai_computer_use`, using `POST /api/v1/models/model/delete` (fork `routers/models.py:939-978`). That call also revokes the row's grants (`models/models.py:576`).
     - It is idempotent: a second run reports "nothing to remove" and exits 0.

  The wrapper's id equals the raw id (`init.sh:297-302`, fork `routers/models.py:270-272`), so the row is an override of the base model. Deleting it restores the raw `qwen3.8-27b` under the same id. Existing wrapper chats keep working on the raw model, and the evidence confirms this.

- **Tests.**
  - `tests/test_filter.py:649` is inverted and extended: the key is absent, `[]`, or holds other tools; `INJECT_SYSTEM_PROMPT` is off; and a request without `chat_id` gets no injection.
  - `tests/deploy/test_init_wrapper.py` loses its workspace-model expectations (`:441`, `:514-608`, `:695-699`) and gains "no `(Computer Use)` model is created".
  - The removal script gets a test.
- **Docs.** `docs/INSTALL.md:40-44` (the marker re-run path, which is stale), `:81` and `:102`, `openwebui/tools/README.md:76`, `docs/openwebui-filter.md:5`, the comment at `compose.webui.override.yml:88-89`, and the upgrade procedure above in the deploy docs. `README.md:300-330` and `openwebui/README.md:18-20` are checked and changed only if they describe per-model tool setup.
- **Release manifest.** `deploy/release.py:87` lists the initializer bytes. The removal script is added there if the manifest requires it, and the manifest is regenerated.
- **Overlay test.** `tests/deploy/test_overlay_structure.py:240-241` asserts `BYPASS_MODEL_ACCESS_CONTROL: "true"` in the WebUI env block.

WebUI fork: no code change expected. The global filter already reaches every model (`backend/open_webui/utils/filter.py:59-65`), and a `tool_ids` value written by the inlet is honoured (`utils/middleware.py:2635`, then `:2722`, `:2833-2915`). The fork carries this OpenSpec change and the decision record.

## Capabilities

### New Capabilities

- `ocu-harness-computer-use-tool`: every UI chat gets the Computer Use tool independent of the model; no wrapper model; all provider models visible to users.

## Impact

- Every UI chat request now carries the tool and the Computer Use system prompt, including requests to models without native function calling. Such models may fail or ignore the tool. The owner accepted this with decision 2.
- The composer's tool toggle (`src/lib/components/chat/Chat.svelte:1042-1072`) no longer shows the tool as selected, because the server injects it.
- Ordinary users see about 511 provider models. Cost and exposure follow the owner's decision 4.
- **Scope of "harness-level".** The inlet runs only on `/api/chat/completions`, at `middleware.py:2635` in `process_chat_payload`, which is reached from `main.py:1626`.
  - Task routes (title, tags, follow-ups) never run function-filter inlets (`routers/tasks.py:198-205`), so they get no tool without any special case.
  - Every saved-chat request gets the tool: UI chats, automations that use a saved chat (`utils/automations.py:552,611,626`), and API calls with a saved `chat_id`.
  - API callers that pass `tools` explicitly skip server-side tool resolution (`middleware.py:2621,2845`).

## Triage

```text
Issue type: behaviour change (per-model tool binding -> harness-level)
Fixture level: expanded
Upstream suggested level: M, P2
Blast radius: every chat request (tool + system prompt), deployment bootstrap (init.sh/run-init.sh), model visibility for all users, existing wrapper rows/chats
Selected risk packs: Auth / permissions (model visibility); Public API / contract (filter inlet body mutation); Config / project setup (bootstrap, compose env); Data migration (one-off wrapper removal); Compatibility (existing chats); Documentation
Evidence floor: filter unit tests incl. chat_id absent and channel/temporary/local ids; init/run-init tests with no wrapper; fresh production-like bootstrap on the acceptance VPS; provider request (or tool-written file) from a raw model as admin and as a non-admin; removal script run twice; existing wrapper chat behaviour recorded
```
