## Context

Change surface: `scripts/db-reset.sh`, `scripts/db-verify.sh`. Tests live in `backend/open_webui/test/test_harness_environment.py` (`make test-harness-env`).

Consumers:

- `Makefile` targets `db-reset` / `db-verify`;
- the CI clean runner's `make db-verify`;
- the AGENTS Verification Matrix row "DB migration".

`open_webui.env` resolves the target as follows (`backend/open_webui/env.py:267-290`). It takes `DATABASE_URL`, then overrides it from `DB_VARS` when all five derived values are non-empty. The `sqlite+sqlcipher` branch applies only when `DATABASE_URL` is unset, and the scripts always set it.

## Decisions

- Unset the six `DATABASE_*` names in each script before its Alembic calls, with one comment naming the failure mode: any complete set rebuilds `DATABASE_URL`, whether it comes from the shell or a uv env-file.
  - In `db-verify.sh`, the unset sits before `bash scripts/db-reset.sh`. Unset names are not inherited, so the child starts clean, and the parent's own `downgrade -1` / `upgrade head` are covered as well.
  - `db-reset.sh` unsets them itself, so a direct `make db-reset` is covered.
- `--no-env-file` on every Alembic `uv run` (three invocations).
  - Chosen over `unset UV_ENV_FILE` because the flag also defeats `UV_ENV_FILE` set by any later mechanism, and uv 0.9.18 documents it (`uv run --help`).
  - Chosen over `UV_NO_ENV_FILE=1` because the flag is local to the call and visible in argv.
- Rejected alternatives:
  - Fail-loud preflight (issue alternative 1). It costs an extra interpreter start per step and must share the exact environment with Alembic. Clearing the sources makes the harness target unconditional, matching the #449 precedent: a harness-scoped override, not a misconfiguration.
  - Moving the logic into `scripts/dev-env.sh` (alternative 2). That file exports unrelated runtime toggles and a different `DATA_DIR` policy, and #449 rejected sourcing it for the same reason.

Must preserve:

- In `db-reset.sh`: `repo_root`, `DATA_DIR`, the `.run/` refusal case, `mkdir`, the three `rm -f` targets, `DATABASE_URL`, `WEBUI_SECRET_KEY` and the `PYTHON_DOTENV_DISABLED` export stay as they are.
- In `db-verify.sh`: step order, echo lines and exit behavior unchanged.
- All existing #449 assertions keep passing: dotenv content is rejected and the flag is truthy in every record.
- `env.py`, the migrations and ordinary non-harness startup are untouched.

Governing invariant: every Alembic process a harness database script starts resolves its target to `sqlite:///<repo>/.run/data/webui.db`, whatever `DATABASE_*` the parent shell or a uv env-file supplies.

Sibling surfaces:

- The backend pytest path is an explicit non-goal (see proposal).
- `scripts/dev-env.sh` consumers (dev server, UI verification) do not run Alembic directly. They do reach `run_migrations()` at import, but they are not named in #531. Report, don't fix.

## Seams and Evidence

Seam: the existing isolated tmp git checkout from `test_database_script_alembic_steps_reject_dotenv_database_target`, with the recording `uv` stand-in.

- **Stand-in argv.** The allowlist accepts `run --quiet [--no-env-file] alembic <step>`, with the flag optional. Any other argv is refused. The stand-in records the argv and then execs the probe. A step that lacks the flag therefore still reaches the env-file model and the URL oracle, so every vector goes red for its own reason; a fix applied to only one vector leaves the other red. The per-step record assertion is what requires `--no-env-file`.
- **Stand-in models uv's env-file loading.** When `--no-env-file` is absent and `UV_ENV_FILE` is set, the stand-in merges that file's `KEY=VALUE` lines into the child environment before the probe, without overriding keys already present. This precedence was observed on uv 0.9.18 and is not documented in `uv run --help`; the contract case below pins it. This lets the pre-fix run go red through the env-file vector as well. The real-uv contract case below anchors the model.
- **Parent-shell vector.** After `_allowlisted_env`, inject a complete fake set (`DATABASE_TYPE=postgresql`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_HOST=shell-host.invalid`, `DATABASE_PORT=5432`, `DATABASE_NAME`). Expected:
  - reset: 1 record; verify: 3 records (child upgrade, downgrade, upgrade);
  - every observation has `database_url == sqlite:///<tmp>/.run/data/webui.db`;
  - no record contains any of the six names. The stand-in records their presence in the environment it actually passes to the probe, after the env-file merge.
  - Pre-fix, the observation resolves `postgresql://…shell-host.invalid…` (red).
- **uv env-file vector.** `UV_ENV_FILE` points to a file in `tmp_path` holding only the six fake names (`uvenv-host.invalid`). The parent has no `DATABASE_*`. Same expectations. Pre-fix it is red through the stand-in model.
- **Real-uv contract.** Use real `uv` from `PATH` with `--no-project --offline --no-config --python <sys.executable>`. Set `UV_CACHE_DIR=<tmp_path>/uv-cache` so that no operator uv configuration is read and no operator cache is written. Set `UV_ENV_FILE` to the fake file, which also holds a precedence key that the parent environment sets to a different value:
  - with `--no-env-file`, a `python -c` printing `DATABASE_HOST` prints nothing (`None`);
  - without the flag (the control), it prints `uvenv-host.invalid`;
  - in both arms the precedence key shows the parent value, which pins the stand-in model's precedence.
  - This proves the flag's real semantics on whichever uv runs the suite (0.9.18 locally; CI installs the latest uv, so a semantic change turns the case red) without importing `open_webui` or touching any project venv. Both arms must run the same command apart from `--no-env-file`.
- **Existing cases.** The dotenv cases (parent flag unset or `false`) and the deletion bound (stale db files removed, outside sentinel kept) stay green with the new argv.
- **Commands.** `make test-harness-env`, `make db-verify`, `make lint-scoped`, `make doc-gate`.

Non-goals: changing `env.py` `DB_VARS` semantics; the pytest path; inspecting a real `.env`, shell profile or uv user configuration.

Review focus:

- Is every one of the three Alembic invocations covered for both vectors?
- Does the env-file model match real uv, as anchored by the contract case?
- Is the isolation intact, with no real `.run/data`, `.env` or network?
- Is the diff limited to the unset lines, the flags and the comment?
