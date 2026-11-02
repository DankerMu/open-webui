## Why

(#688.) On the business network the chat, embedding and reranking models sit behind different gateways, but the OCU overlay binds all three to one URL and key:

- `compose.webui.override.yml:27-28` chat: `OPENAI_API_BASE_URL`, `OPENAI_API_KEY` from `DMXAPI_BASE_URL`, `DMXAPI_API_KEY`.
- `:34-35` embedding: `RAG_OPENAI_API_BASE_URL`, `RAG_OPENAI_API_KEY` from the same pair.
- `:44-45` reranking: `RAG_EXTERNAL_RERANKER_URL` fixed to `${DMXAPI_BASE_URL}/rerank`, key from `DMXAPI_API_KEY`.

`deploy/up.sh` refuses tracked-file changes, so the binding cannot be changed on site. Open WebUI itself already separates them, in its environment variables and in the admin UI (`Documents.svelte:1022-1046,1260-1285`), so no WebUI change is needed.

The site also wants its vLLM-Omni image service. It speaks OpenAI `/v1/images/generations`, which Open WebUI's built-in `openai` image engine calls, so it needs operator documentation and verification, not code.

## What Changes

- **Overlay.** Embedding and reranking each read their own variables, named as Open WebUI names them, and fall back to `DMXAPI_*` when unset or empty:
  - `RAG_OPENAI_API_BASE_URL`, `RAG_OPENAI_API_KEY`;
  - `RAG_EXTERNAL_RERANKER_URL` (a full endpoint URL, default `${DMXAPI_BASE_URL}/rerank`), `RAG_EXTERNAL_RERANKER_API_KEY`.
- **Bootstrap.** `bootstrap-test.sh` accepts the two URLs as optional inputs, with the existing `safe_dotenv_value` check, and writes them to `runtime.env`, empty when absent.
- **Credentials.** The two keys live in the existing 0600 provider file next to `DMXAPI_API_KEY`. `deploy/recovery.py` `PROVIDER_KEYS` gains both, so `activation_env` carries them. `_require_provider_precedence` in `deploy/recovery_resources.py` checks every key, once, independent of file order: it returns after the first non-empty key today.
- **Docs.** `NETWORK-HARDENING.md` and `CHANGELOG.md`. `BACKUP-RESTORE.md` needs no change: it names only the provider file, no key.
  - where each model's URL and key is set;
  - these settings take effect from the environment only on a first boot with an empty database, because startup seeds every default into the database; after that the database wins even if no admin ever saved a value, so a running deployment changes them in the admin UI;
  - with only a URL given, `DMXAPI_API_KEY` is sent to that separate gateway;
  - changing the embedding model or endpoint requires reindexing existing files;
  - image generation is configured only in the admin UI (Settings > Images), with the fields the vLLM-Omni service needs, a reachability check from inside the `open-webui` container, and the per-chat toggle users must enable.

## Non-Goals

- No WebUI code change.
- No image variables in the overlay: nothing is added to tracked files, and every field already exists in the admin UI.
- No `/v1/images/edits`, no images in the sandbox or workspace sidebar.

## Fixture

```text
Issue type: feature
Fixture level: expanded
Upstream suggested level: absent
Blast radius: production config and provider secrets for a deployment; a wrong fallback breaks RAG on every existing deployment
Selected risk packs: Public API/script entry, Config, Schema/field names, Auth/secrets, Concurrency/shared state, Legacy compatibility, Error handling, Documentation
Evidence floor: tests/deploy overlay, bootstrap and recovery modules; real docker compose config; mock end-to-end against the release open-webui image
```

## Capabilities

### Modified Capabilities

- `ocu-deploy-model-config`: embedding and reranking endpoints become separately configurable.

## Impact

OCU `deploy/production-like-test/{compose.webui.override.yml,scripts/bootstrap-test.sh,NETWORK-HARDENING.md}`, `deploy/recovery.py`, `deploy/recovery_resources.py`, `CHANGELOG.md`, `tests/deploy/` including `interpolation.py`. The offline runbook `DEPLOY-AGENT.md` is outside the repo and is updated when the release is packaged. Spec: `ocu-deploy-model-config`.
