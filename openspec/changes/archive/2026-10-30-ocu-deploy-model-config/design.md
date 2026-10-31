## Governing invariant

A deployment whose runtime environment gives a non-empty `PRIMARY_CHAT_MODEL`, `RAG_EMBEDDING_MODEL`, `RAG_RERANKING_MODEL` and `DMXAPI_BASE_URL` resolves to exactly the Open WebUI and initializer settings it had on OCU `origin/main` `3c68b93` when those values equal the old literals. With any of them empty, nothing names a model the operator did not choose.

## Interpolation form

- The model names use `${NAME:-}`, not `${NAME}` or `${NAME:?}`:
  - `${NAME:?}` would make an empty value fatal, which is the case being enabled;
  - bare `${NAME}` makes Compose warn "variable is not set" on every command for a `runtime.env` written before this change, such as the acceptance VPS. `:-` resolves silently to an empty value.
- `DMXAPI_BASE_URL` keeps its bare `${DMXAPI_BASE_URL}` form. Bootstrap always writes the line, possibly empty, and existing deployments already have it.
- `tests/deploy/interpolation.py` already supports `:-` (`INTERPOLATION`, operator `:?[-?]`). The overlay test resolves each name both with a value and with an empty or absent environment.

## Bootstrap inputs

- The four names are optional. Each is read with `${NAME-}` and passed through `safe_dotenv_value` with the other published values, before `runtime.env` or the credential file exists. The publish loop already rejects line breaks, `$`, backtick, backslash, quotes, `=`, spaces and control characters; an empty value passes (`if [ -n "$value" ]` guards the control-character scan).
- They are printed as `NAME=<value>` lines in the `runtime_tmp` block where `DMXAPI_BASE_URL` is today. Order within the file is not a contract: `retarget` rewrites by name.
- A value is not validated as a URL or as a model id. An empty value is a supported choice, and a bad one fails visibly in the admin UI or in the initializer's model check.

## Initializer wrapper

- `run-init.sh` reads `primary_model` as today (:89).
- When it is empty, the wrapper skips the `DEFAULT_MODELS` replacement and the `primary_model_check` insertion, and copies upstream `init.sh` unchanged into the work root. Upstream keeps `cfg.setdefault('DEFAULT_MODELS', cfg.get('DEFAULT_MODELS') or '')`, so an admin's saved default survives re-runs.
- It still checks that the `DEFAULT_MODELS` line and the marker section exist exactly once. Upstream drift must keep failing loud in both modes.
- It prints `[init] PRIMARY_CHAT_MODEL is not set; leaving the default model to the admin UI` to stdout before running init. No credential is logged.
- When the model is set, the generated `init.sh` is byte-identical to what `3c68b93` generates. The test asserts this against a fixed expected string, not by re-running the old wrapper.

## Existing deployments

Open WebUI's `Config.get` returns a stored row when one exists and the environment value otherwise (`backend/open_webui/models/config.py`, `Config.get` and `get_many`). An existing deployment whose admin never saved the RAG settings therefore reads `RAG_EMBEDDING_MODEL` and `RAG_RERANKING_MODEL` from the environment on every start.

`${NAME:-}` hands the container a variable that is set but empty. Open WebUI reads these settings with `os.getenv(name, default)`, so the default applies only when the variable is absent. An empty `RAG_EMBEDDING_MODEL` (`config.py:1002`), `RAG_RERANKING_MODEL` (:1029), `RAG_EXTERNAL_RERANKER_URL` (:1042) or `RAG_OPENAI_API_BASE_URL` (:1092) stays `""`. It does not fall back to Open WebUI's default. Only `OPENAI_API_BASE_URL` falls back for an empty value (:327-328).

Without the new names, an upgraded deployment has RAG with no embedding and no reranking model. Startup does not fail:

- `get_ef` returns `None` for the `openai` engine regardless of model (`routers/retrieval.py:147-167`).
- `get_rf` returns `None` for an empty model (:170-).
- `main.py:663-676` catches and logs any other error.

Uploads that need embedding fail at the first embedding call, and evidence f proves the start.

The upgrade section therefore adds one step before `up.sh`: append `PRIMARY_CHAT_MODEL=…`, `RAG_EMBEDDING_MODEL=…` and `RAG_RERANKING_MODEL=…` with the deployment's current values, by name, without printing the file. `DMXAPI_BASE_URL` is already present. The initializer marker on such a deployment already exists, so `PRIMARY_CHAT_MODEL` matters only if the operator later re-runs init (#590 section).

## Sibling surfaces

These must change with the overlay:

- `NETWORK-HARDENING.md`:
  - **Rebuild step 2.** This step lists the non-secret inputs a rebuild carries over into `env -i … bootstrap-test.sh`. Today a rebuild gets dmxapi.cn from the hard-coded line. After this change, omitting the four names would publish an empty `DMXAPI_BASE_URL`, so step 2 must list all four.
  - **Rebuild step 8** ("the filter, tool and default model were written").
  - **The #590 side-effects line** (:337, "`DEFAULT_MODELS` is written again as `PRIMARY_CHAT_MODEL`").

  Both of the last two get wording for the empty-model case.

- **`bootstrap-test.sh` header** (:5-20) lists the four optional inputs.
- **`BACKUP-RESTORE.md` and `recovery_resources.bind_selected_runtime`.** Restoring a recovery set captured before this change into a newer release keeps the captured keys and adds none. That is the same situation as the upgrade, documented the way BACKUP-RESTORE.md:133 already documents `OCU_SANDBOX_MESSAGES_ADDRESS`.

These are unaffected, and must stay so:

- **`recovery.py retarget`** rewrites only identity keys by name; other lines stay byte for byte.
- **`recovery.parse_dotenv` and `render_dotenv`** accept empty values.
- **`smoke_deployment.py`** depends on no model.
- **`qwen3.8-27b` in `tests/deploy/test_remove_wrapper_model.py`** is test data for the wrapper-row removal, not a deployment value. Evidence a's "no model-id literal" applies to the WebUI overlay file only.

## Must preserve

- With the model set, the generated `init.sh` is identical to `3c68b93`'s: same `DEFAULT_MODELS` assignment and same model check before the marker.
- The upstream-drift refusals in `run-init.sh` stay in both modes.
- `retarget`, `up.sh` and `verify_tracked_source` behave the same: no new required key, no change to the identity keys.
- `DMXAPI_API_KEY` and `DMX_ENV_FILE` handling is unchanged.

## Residual risk

- An empty `DMXAPI_BASE_URL` has three effects:
  - Chat falls back to `https://api.openai.com/v1`, which fails offline until the admin configures a connection.
  - `RAG_OPENAI_API_BASE_URL` is `""`.
  - `RAG_EXTERNAL_RERANKER_URL` is `/rerank`.

  RAG then works only after the admin sets these in the admin UI. This is accepted and documented, not handled.

- The version record no longer states which models were selected. Models are runtime configuration, like the provider URL, which the record already excludes.
