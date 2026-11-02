## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review (revise twice, applied; pass); `openspec validate ocu-deploy-model-endpoints --strict --no-interactive`.

## 2. Risk packs

- **Public API / script entry** — selected: `bootstrap-test.sh` gains two inputs. Evidence b.
- **Config** — selected: four fallbacks. Evidence a, b.
- **Schema / field names** — selected: new `runtime.env` and provider-file names; the reranker value is a full URL and the embedding value a base URL. Evidence a, b, d.
- **Auth / secrets** — selected: two new provider keys in the 0600 file, recovery carries them and prints neither; a URL given alone sends `DMXAPI_API_KEY` to that gateway, which the docs state. Evidence a, b, c, d.
- **Concurrency / shared state / ordering** — selected: the database seeded at first boot outranks the environment afterwards. Evidence d, e.
- **Legacy compatibility** — selected: files without the new names behave as today. Evidence a.
- **Error handling** — selected: unsafe URLs refuse before publish. Evidence b.
- **Documentation** — selected: evidence d.
- **File IO / path safety** — not selected: no new file; the provider file's path and mode checks are unchanged.
- **Resource limits** — not selected: no new work scales with input.
- **Release / packaging** — not selected: no release-inventory change; the package is rebuilt after merge, task 5.

## 3. Evidence

- a. `tests/deploy/test_overlay_structure.py`:
  - with only `DMXAPI_*` set, real `docker compose config` resolves embedding URL and key to `DMXAPI_*` and the reranker URL to `<base>/rerank`;
  - the same with the four names present and empty, and no `is not set` warning on stderr;
  - with all four set to distinct values, each setting resolves to its own value and chat stays on `DMXAPI_*`;
  - setting only the embedding pair leaves reranking on the fallback, and the reverse;
  - embedding URL only: that URL with `DMXAPI_API_KEY`. Embedding key only: `DMXAPI_BASE_URL` with that key;
  - reranker URL only: that URL with `DMXAPI_API_KEY`. Reranker key only: `${DMXAPI_BASE_URL}/rerank` with that key;
  - `tests/deploy/interpolation.py` resolves the same nested expressions as real Compose, red before its change.
- b. `tests/deploy/test_bootstrap_runtime.py`: both URLs given are written as given; absent are written empty; each with a space, quote, `$`, `=` or newline exits non-zero naming the variable with neither output file left; sentinel values for both keys, in the provider file and the environment, appear in neither `runtime.env`, stdout nor stderr.
- c. `tests/deploy/test_recovery.py`:
  - a provider file with distinct keys reaches `activation_env` unchanged;
  - `_require_provider_precedence` reports exactly once when only a later key's value is persisted, with `DMXAPI_API_KEY` first in the file; exactly once when two keys are persisted; and stays silent when none is; red before the change;
  - sentinel keys on the `restore` and `activate` success paths and the failing `up.sh` path appear in neither stdout nor stderr.
- d. Docs, by grep plus `./tests/test-project-structure.sh` and the docs-lint gates:
  - `NETWORK-HARDENING.md` says six optional inputs at :215 and lists both URLs and both keys;
  - `:216-217` states the first-boot rule, not only saved values;
  - `:219` residual risk covers the fallback and a URL given alone;
  - the rebuild input list at :357 includes both URLs, and tells the operator to read the current embedding and reranker URLs and keys from the admin UI before rebuilding, not from `runtime.env` or the container environment, because values changed there live only in the database, and to put saved keys in the provider file before bootstrap;
  - the value shapes are stated: `RAG_OPENAI_API_BASE_URL` is a base URL such as `http://host:port/v1`, and `RAG_EXTERNAL_RERANKER_URL` is the complete endpoint such as `http://host:port/v1/rerank`, because `external.py:49-50` posts to the value as given;
  - the upgrade section tells a running deployment to use the admin UI;
  - reindexing, the image section's admin-UI fields, the container reachability check and the chat toggle are present.
- e. Orchestrator, with a local mock gateway against the release `open-webui` image, no WebUI change:
  - seeded from distinct embedding and reranker URLs and keys, an uploaded file's embedding request reaches the embedding mock with its key, and a query reaches the reranker mock with its key;
  - `POST /api/v1/retrieval/embedding/update`, without restart, moves the next embedding request to the new URL and key;
  - `POST /api/v1/retrieval/config/update`, without restart, moves the next rerank request to the new URL and key;
  - restarting on the seeded database with different environment values leaves requests on the database values;
  - with the admin image settings saved, `POST /api/v1/images/generations` sends `qwen-image-2.1`, the size, `response_format: b64_json` and the saved params, accepts `url: null`, and stores a readable PNG;
  - `generate_image` reaches the model only with the chat toggle on, and calling it attaches the image to the saved message.

## 4. Implement OCU

- [x] 4.1 Overlay fallbacks.
- [x] 4.2 Bootstrap inputs and header comment.
- [x] 4.3 `PROVIDER_KEYS` and `_require_provider_precedence`.
- [x] 4.3a `tests/deploy/interpolation.py` nested defaults.
- [x] 4.4 Docs and changelog.
- [x] 4.5 Tests, each red before the change. Merged as DankerMu/open-computer-use#197 `855d7e400a6c427932633045a148a660990b2565`.

## 5. Package

- [x] 5.1 Update `DEPLOY-AGENT.md` in the offline package source with the same inputs, the admin-UI rule and the image section, when the release is packaged. Done in the 2026-11-02 package `zhice-deploy-1c378fa`.
