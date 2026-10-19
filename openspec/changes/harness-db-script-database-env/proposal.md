## Why

`scripts/db-reset.sh` and `scripts/db-verify.sh` export a local SQLite `DATABASE_URL` and then run Alembic. `open_webui.env` rebuilds `DATABASE_URL` whenever `DATABASE_TYPE/USER/PASSWORD/HOST/PORT/NAME` are all non-empty, whatever their source. #449 blocked the dotenv-content source. Two others remain (#531):

- a parent shell that exports the complete set, for example after work on the PostgreSQL deploy overlay;
- a uv env-file (`UV_ENV_FILE`) that `uv run` injects.

Either source redirects the reset's `upgrade head` and the round-trip's `downgrade -1` / `upgrade head` to a database outside `.run/data`. The issue reproduced both with fake hosts.

## What Changes

- Both scripts `unset DATABASE_TYPE DATABASE_USER DATABASE_PASSWORD DATABASE_HOST DATABASE_PORT DATABASE_NAME` before any Alembic process. `db-verify.sh` does this before its child reset, so the child and its own steps are both covered; `db-reset.sh` does it itself so that a direct invocation is covered too.
- Every Alembic `uv run` in the two scripts passes `--no-env-file`.
- The harness-environment suite gains three things:
  - parent-shell `DATABASE_*` and `UV_ENV_FILE` cases through the existing isolated-checkout seam;
  - a real-uv contract case proving that `--no-env-file` ignores `UV_ENV_FILE` (with a control proving that uv loads the file without the flag);
  - an updated stand-in argv allowlist.

## Capabilities

### Modified Capabilities

- `harness-environment`: the database-script requirement extends from dotenv contents to every inherited database-target source.

## Impact

Changes: `scripts/db-reset.sh`, `scripts/db-verify.sh`, `backend/open_webui/test/test_harness_environment.py`.

Unchanged: `backend/open_webui/env.py` (upstream `DB_VARS` semantics), migrations, the `.run/` deletion bound, Makefile targets, the dotenv handling from #449, and ordinary application startup. The tests use fake hosts only. They create or read no real `.env`, connect to no database, and inspect no operator configuration.

Non-goal, report only: the backend pytest path (`make test-backend`, `scripts/coverage-gate.sh`, `ocu_harness.configure_ocu_test_env`). This is the sibling vector named in the issue and has a different fix point.

## Triage

- Issue type: bugfix
- Fixture level: expanded. Same surface and shape as the archived #449 fixture `2026-10-19-harness-db-script-dotenv`.
- Upstream suggested level: absent
- Blast radius: a harness reset or verify migrating, or downgrading, a non-harness database.
- Selected risk packs: Public API / CLI / script entry; Config / project setup; Auth / permissions / secrets; File IO / path safety.
- Evidence floor:
  - `make test-harness-env`: the new cases go red before the script change and green after.
  - `make db-verify`: exit 0.
  - `make lint-scoped`, `make doc-gate`.
