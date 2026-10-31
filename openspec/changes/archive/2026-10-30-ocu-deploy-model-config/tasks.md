## 1. Fixture

- [x] 1.1 Proposal, design, tasks, spec delta; fixture review (revise once, applied; pass); `openspec validate ocu-deploy-model-config --strict --no-interactive`.

## 2. Risk packs

- **Config** — selected: four optional inputs, `${NAME:-}` interpolation, empty values supported. Evidence a, b.
- **Legacy compatibility** — selected: a `runtime.env` without the names still resolves; with the model set, the generated initializer is byte-identical to `3c68b93`'s; the upgrade step keeps an existing deployment's models. Evidence a, c, e.
- **Error handling** — selected: unsafe values refuse before publish; upstream drift still refuses in both initializer modes. Evidence b, c.
- **Documentation** — selected: NETWORK-HARDENING inputs, admin-UI path, upgrade step; version-record wording. Evidence d.
- **Auth / secrets, Public API, Schema, File IO, Concurrency, Resource limits, Release packaging** — not selected; reasons are in the proposal Fixture block.

## 3. Evidence

- a. `tests/deploy/test_overlay_structure.py`:
  - the WebUI overlay file contains no model-id or provider-URL literal (`qwen` and `dmxapi` absent);
  - with the fake interpolator, each model name resolves to the supplied value, and to `""` for an empty value and for an absent name;
  - real `docker compose config` (as `resolved_stacks` runs it), with the three model names absent from the environment: exit 0, no `is not set` warning on stderr, and the three settings empty in the resolved output.
- b. `tests/deploy/test_bootstrap_runtime.py`:
  - inputs given: the four lines carry the values;
  - inputs absent: the four lines are present and empty, and no `dmxapi.cn` remains;
  - each of the four with a space, quote, `$` or newline: non-zero exit naming the variable, and neither output file exists.
- c. `tests/deploy/test_init_wrapper.py`:
  - model set: existing tests unchanged in substance, plus a check that the generated `init.sh` equals the expected text;
  - model empty or whitespace (replacing `PRIMARY_CHAT_MODEL is required`): log line present, posted `DEFAULT_MODELS` equals the fake server's stored value, no `/api/models` requirement, marker written;
  - drift in the `DEFAULT_MODELS` line or the marker section still refuses with the model empty.
- d. Docs and scripts, checked by grep plus the docs-lint workflow gates (exit 0) and `./tests/test-project-structure.sh`:
  - `NETWORK-HARDENING.md` names all four variables in the inputs list, the upgrade step and rebuild step 2;
  - the #590 side-effects line and rebuild step 8 cover the empty-model case;
  - `BACKUP-RESTORE.md` has the pre-change recovery-set note;
  - `write-deployed-version.sh` contains no `Qwen`;
  - `bootstrap-test.sh` contains no `dmxapi.cn` and its header lists the four inputs.
- e. Next acceptance-VPS upgrade:
  - before it, record the running models from `docker inspect ocu-test-open-webui-1` (`RAG_EMBEDDING_MODEL`, `RAG_RERANKING_MODEL` by name) and from the admin RAG settings (`GET /api/v1/retrieval/config` as admin);
  - add the three names by name before `up.sh`;
  - after it, the same two sources show the same values, and `docker inspect ocu-test-open-webui-init` shows the recorded `PRIMARY_CHAT_MODEL`.
- f. Start the open-webui image of the current release (`ocu-open-webui:1a98ceb…`) against PostgreSQL with `RAG_EMBEDDING_ENGINE=openai`, `RAG_RERANKING_ENGINE=external`, `ENABLE_RAG_HYBRID_SEARCH=true`, and `RAG_EMBEDDING_MODEL`, `RAG_RERANKING_MODEL`, `RAG_OPENAI_API_BASE_URL`, `OPENAI_API_BASE_URL` set to `""`, and `RAG_EXTERNAL_RERANKER_URL=/rerank`: `/health` returns 200 and the log has no traceback.

## 4. Implement OCU

- [x] 4.1 Tests first for a, b, c. Red on `3c68b93`: 35 failed / 165 passed. Every new behaviour test failed except the byte-pinned set-model test, which passes on main by design.
- [x] 4.2 Overlay, bootstrap, wrapper, version record, docs (NETWORK-HARDENING, BACKUP-RESTORE), CHANGELOG.
- [x] 4.3 Green, re-run by the orchestrator at `7411cb6`: 169 passed and 207 subtests passed; structure OK; lychee 0 errors. The docs-lint workflow does not cover `deploy/**`. Modules: `tests/deploy/test_overlay_structure.py`, `test_bootstrap_runtime.py`, `test_init_wrapper.py`, `test_remove_wrapper_model.py`, `test_offline_release.py`; docs-lint gates; structure check.
- [x] 4.4 DankerMu/open-computer-use#196, reviewed head `7411cb6`, merged as `675d010`. Review round 1 was clean on all three seats. Integration's gap was the real initializer with an empty model; the orchestrator closed it on the release image (exit 0, marker written).
- [x] 4.5 Evidence f (orchestrator, local Docker): `ocu-open-webui:1a98ceb…` + postgres:16 with the four settings empty and the reranker URL `/rerank` → `/health` 200 after ~18 s, container env shows the four empty, 0 `Traceback` lines and no error lines in the log.
- [x] 4.6 Evidence e. The acceptance VPS was upgraded `3c68b93` → `675d010` with the three names appended from the running containers. The container env and the stored config rows were identical before and after, and `open-webui` was not recreated.
- [x] 4.7 Rebuild the offline delivery from the merged OCU commit and WebUI `8f99bb7`; replace the NAS package; update its runbook's model section.
