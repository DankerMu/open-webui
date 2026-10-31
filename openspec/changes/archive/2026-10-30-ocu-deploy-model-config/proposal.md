## Why

(#686.) The owner will connect models on the offline business network himself, but the OCU test deployment fixes them. At OCU `origin/main` `3c68b93`:

- `deploy/production-like-test/compose.webui.override.yml` sets these as literals:
  - `RAG_EMBEDDING_MODEL: qwen3-embedding-8b` (:36);
  - `RAG_RERANKING_MODEL: qwen3-rerank` (:41);
  - `PRIMARY_CHAT_MODEL: qwen3.8-27b` on `open-webui-init` (:94).
- `deploy/production-like-test/scripts/bootstrap-test.sh:357` always writes `DMXAPI_BASE_URL=https://www.dmxapi.cn/v1`.
- `deploy/production-like-test/init/run-init.sh:89-91` refuses to start without `PRIMARY_CHAT_MODEL`. When it is set, the wrapper fails unless `/api/models` offers it (:110-127).

`deploy/up.sh` refuses any tracked-file difference from the release commit (`release.verify_tracked_source`), so none of these can be changed on site. On a network without those three model ids, the initializer always fails and RAG names a model that does not exist.

## What Changes

- **Overlay.** `RAG_EMBEDDING_MODEL`, `RAG_RERANKING_MODEL` and `open-webui-init`'s `PRIMARY_CHAT_MODEL` are interpolated as `${NAME:-}` from the runtime environment, with no model default. `OPENAI_API_BASE_URL`, `RAG_OPENAI_API_BASE_URL` and `RAG_EXTERNAL_RERANKER_URL` keep reading `DMXAPI_BASE_URL`.
- **Bootstrap.** `bootstrap-test.sh` accepts `DMXAPI_BASE_URL`, `PRIMARY_CHAT_MODEL`, `RAG_EMBEDDING_MODEL` and `RAG_RERANKING_MODEL` as optional inputs.
  - Each is written to `runtime.env` as given, or as an empty value when absent.
  - Each goes through the existing `safe_dotenv_value` check before anything is published.
  - The dmxapi.cn constant is removed.
- **Initializer wrapper.** `run-init.sh`:
  - with a non-empty `PRIMARY_CHAT_MODEL`, behaves exactly as today;
  - with an empty or whitespace-only one, leaves upstream `init.sh`'s `DEFAULT_MODELS` line unchanged (it keeps the stored value) and adds no model check. It logs one line saying the default model is left to the admin UI. Tool, filter, valves and marker proceed as today.
- **Version record.** `write-deployed-version.sh:86` stops claiming "explicit Qwen model selection" and describes the model selection as taken from the runtime configuration.
- **Docs.** `NETWORK-HARDENING.md`:
  - lists the four optional inputs and the two ways to configure models: by name in `runtime.env` before `up.sh`, or left empty and set in the admin UI, where a saved value takes precedence over the environment;
  - in the upgrade section, tells operators of an existing deployment to add the three model names with their current values to `runtime.env` before `up.sh`. Otherwise RAG has no embedding or reranking model, since an empty variable is not replaced by Open WebUI's default, unless the models were saved in the admin UI.
  - rebuild step 2 carries the four names into bootstrap; rebuild step 8 and the #590 side-effects line cover the empty-model case; `BACKUP-RESTORE.md` notes that a recovery set captured before this change needs the same three lines.
- **Bootstrap header** (`bootstrap-test.sh:5-20`) lists the four optional inputs.
- `CHANGELOG.md` gets an Unreleased entry.

Why not keep the Qwen ids as compose defaults: the owner asked for no fixed models (#686), and a default that silently names a non-existent model is the failure being removed.

## Capabilities

### New Capabilities

- `ocu-deploy-model-config`: deployment model ids and the provider base URL come from the operator.

## Impact

- OCU:
  - `deploy/production-like-test/compose.webui.override.yml`;
  - `deploy/production-like-test/scripts/bootstrap-test.sh`;
  - `deploy/production-like-test/init/run-init.sh`;
  - `deploy/production-like-test/scripts/write-deployed-version.sh`;
  - `deploy/production-like-test/NETWORK-HARDENING.md`;
  - `deploy/BACKUP-RESTORE.md`;
  - `CHANGELOG.md`;
  - tests: `tests/deploy/test_overlay_structure.py`, `tests/deploy/test_bootstrap_runtime.py`, `tests/deploy/test_init_wrapper.py`.
- Acceptance VPS: its `runtime.env` has none of the three model names, so it needs the upgrade step above. It is applied at its next upgrade, not by this change.
- Non-goals:
  - the provider key file (`DMX_ENV_FILE`, `DMXAPI_API_KEY`);
  - renaming the `DMXAPI_*` variables, which recovery and upgrade rely on;
  - the other RAG settings (`RAG_EMBEDDING_ENGINE`, `RAG_RERANKING_ENGINE`, top-k);
  - `ENABLE_OPENAI_API`. With an empty base URL, Open WebUI falls back to its public default, which simply fails offline until the admin sets a connection.

## Fixture

```text
Issue type: feature
Fixture level: expanded
Upstream suggested level: absent; expanded: bootstrap writes a root-only runtime file whose values are interpolated into Compose (config + secrets-adjacent file), and existing deployments lose their literal model ids (legacy compatibility)
Blast radius: bootstrap refuses or publishes an unsafe dotenv line; init refuses to run or writes an empty DEFAULT_MODELS over the admin's choice; an upgraded or restored deployment without the new names runs RAG with no embedding model
Selected risk packs: Config (new optional inputs and interpolation); Legacy compatibility (existing runtime.env without the names, existing init behaviour when the model is set); Error handling (unsafe values refuse before publish); Documentation (NETWORK-HARDENING inputs and upgrade step)
Not selected: Auth / secrets (no new secret; key file unchanged); Public API / CLI (bootstrap's four new optional inputs are covered by Config, evidence b); Schema, File IO, Concurrency, Resource limits (no change); Release packaging (release.json and verify_tracked_source unchanged; the overlay bytes change as tracked source)
Evidence floor: OCU deploy tests with the new assertions red on origin/main; real docker compose config with the names absent; the open-webui image starting with empty model settings; docs-lint; the next VPS upgrade follows the documented step
design.md: present
```
