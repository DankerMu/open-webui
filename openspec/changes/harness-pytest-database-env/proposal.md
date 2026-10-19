## Why

The backend pytest session migrates and writes to whatever database `open_webui.env` resolves (#543):

- `backend/open_webui/test/ocu_harness.py` `configure_ocu_test_env()` pins only `DATA_DIR` / `DATABASE_URL`.
- Router tests import `open_webui.main`. `open_webui.config` then runs `alembic upgrade head` at import (`ENABLE_DB_MIGRATIONS` defaults to true), and the tests insert and delete users and chats.
- `open_webui.env` rebuilds `DATABASE_URL` from a complete `DATABASE_TYPE/USER/PASSWORD/HOST/PORT/NAME` set from any source:
  - a parent shell,
  - a `UV_ENV_FILE` that uv injects before Python starts,
  - or a discoverable dotenv file. Here `load_dotenv(override=False)` cannot replace the pinned URL, but it can fill in the six names.

So `make test-backend`, `make coverage-gate` or a direct `pytest` can migrate a non-harness database. Also, `test_ocu_chat_state.py` `_engine()` would keep reading `os.environ['DATABASE_URL']`, so the test engine and the application engine would point at different databases.

## What Changes

- `configure_ocu_test_env()` drops the six `DATABASE_*` names from `os.environ` and sets `PYTHON_DOTENV_DISABLED=1`, before any `open_webui.env` import, with one comment naming the failure mode.
  - Popping also covers the uv env-file vector, because uv has already merged that file into the process environment.
  - One fix point covers `make test-backend`, `make coverage-gate`, direct `pytest`, and the `ocu_office_flag_process.py` subprocess, which imports the harness first.
- Fail-loud guard: if `open_webui.env` is already imported when `configure_ocu_test_env()` runs, raise `RuntimeError` naming the ordering requirement, never a URL or credentials. This turns the current collection-order assumption into a machine check.
- Regression tests in `backend/open_webui/test/test_harness_environment.py` cover:
  - the shell, real-uv env-file and synthetic-dotenv vectors through a subprocess that imports the harness and then only `open_webui.env` (migrations disabled, no config import);
  - the guard;
  - the office-flag subprocess path.
- `test_ocu_chat_state.py` gains an assertion that its direct engine URL equals `open_webui.env.DATABASE_URL`.

## Capabilities

### Modified Capabilities

- `harness-environment`: adds the backend pytest session to the harness database-target isolation surface.

## Impact

Files changed:

- `backend/open_webui/test/ocu_harness.py`
- `backend/open_webui/test/test_harness_environment.py`
- `backend/open_webui/test/models/test_ocu_chat_state.py`

Unchanged:

- `backend/open_webui/env.py` (upstream `DB_VARS` / dotenv semantics)
- the Makefile, `scripts/coverage-gate.sh`, the database scripts (#531), migrations and the `.run/data` location
- ordinary application startup

The tests use only fake hosts. Probes for vectors 1–6 stub dotenv discovery and reading, and vector 7 disables dotenv via the flag, so no real `.env` is created or read, and no operator config is inspected. No database other than the harness or office-flag SQLite is ever contacted. Vector 7's red run fails at engine construction or DNS for a reserved `.invalid` host; see design.md.

Non-goal (report only): `scripts/dev-env.sh` / `scripts/dev-bg.sh` inherit `DATABASE_URL` and `DATABASE_*` into the dev server. This is a different fix point and a wider exposure, listed in #543 as a sibling.

## Triage

- Issue type: bugfix
- Fixture level: expanded. It is the same failure class as #449 and #531, but on the test-harness import path, and it adds a fail-loud guard on a module every OCU backend test imports.
- Upstream suggested level: absent
- Blast radius:
  - a local test session migrating or writing test rows into a non-harness database;
  - after this change, pytest sessions load no dotenv content at all, not just the `DATABASE_*` names;
  - the guard wrongly aborting the whole backend suite.
- Selected risk packs: Config / project setup; Auth / permissions / secrets; Error handling (the guard); Legacy compatibility (existing suites and the collection order keep working).
- Evidence floor:
  - `make test-harness-env`: new cases red before the harness change, green after.
  - The full backend suite (`make test-backend`) green, which proves the guard does not abort the existing suite in a clean env.
  - `make coverage-gate`, `make lint-scoped`.
