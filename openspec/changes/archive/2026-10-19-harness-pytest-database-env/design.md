## Context

Change surface: `backend/open_webui/test/ocu_harness.py` (`configure_ocu_test_env()`, which runs at module import, `ocu_harness.py:34`).

Consumers (every in-process path into the application goes through this module first):

- `test/routers/conftest.py`, `test/routers/test_ocu_*.py`, `test/models/test_ocu_chat_state.py`, `test/utils/test_ocu_client.py`, `test/ocu_resource_grants_harness.py`;
- the `ocu_office_flag_process.py` subprocess (`:61`), which imports the harness before it overrides `DATA_DIR` / `DATABASE_URL` to its own directory and then imports `open_webui.main`.

Today no test module imports `open_webui.*` at the top level except through this harness; the others use function-level imports.

## Decisions

- **Fix point:** `configure_ocu_test_env()`, not the Makefile or `coverage-gate.sh` entrypoints. It is the single point every in-process application import passes through, and it covers direct `pytest` too. The entrypoint alternative (the #542 pattern) needs two copies and leaves direct `pytest` exposed.
- **Clearing:** `for name in (six names): os.environ.pop(name, None)` plus `os.environ['PYTHON_DOTENV_DISABLED'] = '1'`, placed before the existing `DATA_DIR` / `DATABASE_URL` assignments.
  - Assign `'1'`, never `setdefault`: an inherited `false` must not win.
  - A uv env-file has already been merged into `os.environ` before Python starts, so popping covers it without touching any uv invocation.
- **Guard (strict, as #543 AC3 asks):** if `'open_webui.env' in sys.modules` when `configure_ocu_test_env()` runs, raise `RuntimeError` naming the requirement ("configure_ocu_test_env must run before open_webui.env is imported"). The message carries no URL, host or credentials.
  - Reason it is strict, not URL-comparing: `env.py` freezes `DATA_DIR` / `DATABASE_URL` and the six names at import. Configuring after that import cannot take effect, whatever URL it happened to resolve.
  - It cannot fire in the current suite. The only repeat call (`test_ocu_chat_state.py:17`) runs at collection, before anything imports env. Every consumer imports the harness as `open_webui.test.ocu_harness`. No collected module imports `open_webui.*` at module level except through the harness (verified by fixture review).
  - `configure_ocu_test_env()` must not import `open_webui.env` itself: the office-flag subprocess changes `DATA_DIR` after importing the harness, and an eager import would freeze the wrong directory.
- **Docstring:** correct the stale `ocu_harness.py:3-4` claim that the harness is imported as a plain module; every consumer imports `open_webui.test.ocu_harness`.
- **`test_ocu_chat_state.py`:** add one regression assertion (green before and after the fix in a clean env; not a red-first case) asserting `open_webui.env.DATABASE_URL == os.environ['DATABASE_URL']`, so `_engine()` and the application engine are proven to agree.
- **Rejected:** importing `open_webui.env` eagerly and validating it, which breaks the office-flag subprocess; a root `conftest.py`, which is a new file and does not cover the subprocess or direct imports of the harness module.

Must preserve:

- The existing `configure_ocu_test_env()` assignments and `setdefault`s: `DATA_DIR`, `DATABASE_URL`, `WEBUI_SECRET_KEY`, the Ollama / OpenAI / offline / version-check defaults, and both OCU flags.
- Office-flag subprocess behavior (its own data dir).
- All existing harness-environment cases (#419 / #449 / #452 / #531).
- `env.py`, the Makefile, `coverage-gate.sh`, ordinary startup.

Governing invariant: once `configure_ocu_test_env()` has run, `open_webui.env.DATABASE_URL` in that process resolves to the harness SQLite URL, whatever the parent shell, a uv env-file or a dotenv file supplies. If the env module was imported before the harness was configured, configuration aborts.

## Seams and Evidence

All new cases live in `backend/open_webui/test/test_harness_environment.py`. They run subprocesses under the existing `_allowlisted_env` (`PATH`, `HOME`, `LANG`) plus `PYTHONPATH=<repo>/backend`, `ENABLE_DB_MIGRATIONS=false`, `DO_NOT_TRACK` / `ANONYMIZED_TELEMETRY` as in `_PROBE_CONFIG`, and a random `WEBUI_SECRET_KEY`.

Every probe in vectors 1–6, before any harness or env import, installs the `_DOTENV_PROBE`-style stubs: `dotenv.find_dotenv` returns a nonexistent path, `DotEnv._get_stream` yields a synthetic stream, and `parse` is counted. The stream is empty except in vector 3. This keeps the real `<repo>/.env` unread even on the red run, where the old harness leaves dotenv enabled. Probes do not set `PYTHON_DOTENV_DISABLED=1` themselves, because that would mask the harness flag being tested.

The probe then imports `open_webui.test.ocu_harness`, then imports only `open_webui.env` (never `open_webui.config` or `main`), and prints JSON:

- the resolved `DATABASE_URL`;
- which of the six names remain in `os.environ`;
- `PYTHON_DOTENV_DISABLED`;
- the dotenv stream-entry count.

The expected URL is the harness URL that `configure_ocu_test_env()` pins, `sqlite:///<repo>/.run/data/webui.db`. The probe never connects to it and runs no migration.

Vectors:

1. **Shell.** Parent env carries a complete fake set (`shell-host.invalid`). Expected: harness URL and no `DATABASE_*` remaining. Pre-fix: `postgresql://…shell-host.invalid…` (red).
2. **Shell plus a false flag.** The same, with parent `PYTHON_DOTENV_DISABLED=false`. Expected: flag `'1'`.
3. **Synthetic dotenv.** Reuse the `_DOTENV_PROBE` stubs (`find_dotenv`, `DotEnv._get_stream`, `parse`) before importing the harness. The stream holds a complete fake set. Expected: harness URL and stream entries 0. Pre-fix: the dotenv-constructed URL (red).
4. **Real uv env-file.** Real `uv run --no-project --offline --no-config --python <sys.executable> python -c <probe>`, with `UV_CACHE_DIR` under `tmp_path`, `UV_ENV_FILE` set to a `tmp_path` file holding a complete fake set (`uvenv-host.invalid`), cwd `tmp_path`, and `PYTHONPATH` set. Expected: harness URL. Pre-fix: red. This proves the pop covers uv's injection on real uv.
5. **Guard, too-early import.** The probe imports `open_webui.env` first, with the shell fake set, then imports the harness. Expected: non-zero exit, `RuntimeError` text naming `configure_ocu_test_env`, and no fake host or password anywhere in stdout or stderr. Pre-fix: exit 0 (red).
6. **Guard, repeat after env import.** Import the harness, import `open_webui.env` (which resolves the harness URL), then call `configure_ocu_test_env()` again. Expected: `RuntimeError`, because the guard is strict. Pre-fix: exit 0 (red).
   6a. **Control (no harness).** The same shell fake set imported straight into `open_webui.env` with the stubs and no harness resolves the rebuilt `postgresql://…shell-host.invalid…` URL. This proves the oracle still detects redirection if a future upstream rebase changes `DB_VARS`.
7. **Office-flag subprocess.** Run `run_office_flag_process(office='true', workspace='true')` (already used by `test_ocu_workspaces.py:64-79`). In the test body, `monkeypatch.setenv` the shell fake set, plus `PYTHON_DOTENV_DISABLED=1`. Vector 3 covers dotenv; the flag here keeps the subprocess from reading a real `.env` on the red run. Setting the names in the test body, after the test process's own configure, makes them actually reach the subprocess, because the helper copies `os.environ` at call time (`ocu_office_flag_process.py:35`).
   - Expected: exit 0, and the payload (fixed shape at `ocu_office_flag_process.py:86-96`) equals that of a clean-env run of the same call.
   - Red-run mechanism, a deliberate and bounded exception to #543 AC2 limited to this vector: the subprocess imports `open_webui.main` with migrations enabled. Before the fix, `internal/db.py` builds a sync engine for `postgresql://…shell-host.invalid…`. That needs psycopg2, which is absent from the locked dev env (only in the `postgres` / `all` extras), so the subprocess fails before `run_migrations()`. If psycopg2 were installed, the connection attempt would fail resolving the reserved `.invalid` TLD. Either way it exits non-zero, and no database other than the harness or office-flag SQLite is ever contacted.
   - The helper's existing `timeout=180` bounds it; on success it migrates only its own `.run/data/office-flag-*` SQLite, which is permitted.

Plus the `test_ocu_chat_state.py` agreement assertion.

Commands:

- `make test-harness-env` (new cases red before the harness change, green after);
- `make test-backend` (full suite green: proves the guard does not trip in a clean environment and the collection order holds);
- `make coverage-gate`, `make lint-scoped`.

Non-goals: `env.py` semantics; `dev-env.sh` / `dev-bg.sh` (report only); inspecting a real `.env` or operator configuration.

Review focus:

- Is the clearing ordered before every possible `open_webui.env` import?
- Can the guard ever fire in a clean CI run, or leak credentials?
- Does the office-flag subprocess stay correct?
- Does no test ever contact a database other than the harness or office-flag SQLite, and does no probe read the real `.env`?
