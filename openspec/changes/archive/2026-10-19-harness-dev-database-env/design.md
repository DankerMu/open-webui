## Context

`scripts/dev-env.sh:9-28` validates `DATA_DIR` (either `.run/data` or `.run/data/workspace-ui-*`) and `FRONTEND_BUILD_DIR`, then exports both. `:29-43` prints the parent dotenv-flag label and exports `PYTHON_DOTENV_DISABLED=1`. `scripts/dev-bg.sh:52-53` sources the policy and runs `uv run --quiet uvicorn open_webui.main:app`.

`backend/open_webui/env.py:267-290` reads `DATABASE_URL` first, then rebuilds it whenever all `DB_VARS` are non-empty. A uv env-file is merged into the environment before Python starts, so it takes part in that rebuild.

## Decisions

- Placement: after `export DATA_DIR FRONTEND_BUILD_DIR` and before the provenance label:

  ```bash
  unset DATABASE_TYPE DATABASE_USER DATABASE_PASSWORD DATABASE_HOST DATABASE_PORT DATABASE_NAME UV_ENV_FILE
  export DATABASE_URL="sqlite:///$DATA_DIR/webui.db"
  ```

  One comment names the failure mode: an inherited URL, a complete set, or a uv env-file would move import-time migrations and harness writes off `$DATA_DIR`.

- All three steps are required:
  - pinning alone loses to an env-file-supplied set (the issue's R4);
  - clearing alone loses to a single inherited `DATABASE_URL` (R2);
  - `unset UV_ENV_FILE` covers every `uv run` downstream of a sourcer. That is chosen over per-call-site `--no-env-file`, so future sourcers are covered automatically.
- Silent override rather than fail-loud, for the same reasons as #531 and #543.
- No extra `harness-env:` stderr line. `test_harness_import_rejects_dotenv_content_and_preserves_explicit_config` asserts exactly one label line, and a value-free "dropped" label adds no diagnostic power.

Must preserve:

- `DATA_DIR` / `FRONTEND_BUILD_DIR` validation and symlink refusal.
- The provenance label line and its allowlist.
- `PYTHON_DOTENV_DISABLED=1` and every other existing export.
- `stage_frontend_assets`.
- All existing harness-environment cases (#419, #449, #452, #531, #543).

Governing invariant: every backend started after sourcing `scripts/dev-env.sh` resolves `open_webui.env.DATABASE_URL` to `sqlite:///$DATA_DIR/webui.db` for the validated `DATA_DIR`, whatever `DATABASE_URL`, `DATABASE_*` or `UV_ENV_FILE` the parent supplies.

## Seams and Evidence

The existing `_import_environment(harness=True)` seam sources `scripts/dev-env.sh` and then execs the `_DOTENV_PROBE`. That probe stubs dotenv and prints the resolved `database_url`, and its `DATA_DIR` is `.run/data/workspace-ui-<uuid>`. Extend it with an optional extra environment, or add a sibling helper that shares the same command shape.

Cases, all with harness=True:

- **(a) Inherited `DATABASE_URL`** set to `postgresql://fake-user:fake-password@url-host.invalid:5432/fake_db`.
- **(b) Complete fake set** of six names (`shell-host.invalid`). Reuse `_fake_database_vars`.
- **(c) Real uv env-file.** The helper needs a `tmp_path` parameter for `UV_CACHE_DIR` and `_write_uv_env_file`, and keeps `cwd=ROOT` so `scripts/dev-env.sh` resolves.
  - Command: `bash -c 'source scripts/dev-env.sh && exec uv run --no-project --offline --no-config --python "$1" python -c "$2"' …`, which reuses `_REAL_UV_RUN`'s flags.
  - Environment: `UV_CACHE_DIR` under `tmp_path`, and `UV_ENV_FILE` set to the `_write_uv_env_file` fake file (`uvenv-host.invalid`).
  - The parent environment carries no `DATABASE_*`.

Control, harness=False:

- **(d)** The same inherited `DATABASE_URL` as (a) without sourcing the policy, with dotenv disabled in the parent (`parent_flag='1'`), resolves to that URL. Without the flag the probe's own dotenv `DATABASE_*` set would rebuild the URL. This proves the injection reaches `env.py`, so the green in (a)–(c) cannot come from a broken seam. It asserts only the resolved URL equals the injected value.

Expected in (a)–(c):

- `database_url == f'sqlite:///{data_dir}/webui.db'`, where `data_dir` is the `workspace-ui-*` directory. This also proves the second acceptance criterion: the URL is not the shared `.run/data`.
- No fake host, user or password anywhere in stdout or stderr.

Before the change, all three resolve postgres (red).

The probe imports only `open_webui.env` (no config or main), so no migration ever runs.

Commands:

- `make test-harness-env`: red before the change, green after.
- `make smoke` and `make verify-ui` in a clean environment: runtime evidence with a screenshot and zero console errors.
- `make lint-scoped`.

Non-goals: `env.py`; per-call `--no-env-file`; fail-loud; database tuning variables (`DATABASE_SCHEMA`, pool settings, IAM).

Review focus:

- Is the URL built from the validated `DATA_DIR` (workspace isolation)?
- Is the order right relative to validation?
- Does no existing label or contract assertion change?
- Is there no leak of fake credentials?
