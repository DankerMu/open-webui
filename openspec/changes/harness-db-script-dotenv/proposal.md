## Why

`scripts/db-reset.sh` and `scripts/db-verify.sh` export a local SQLite `DATABASE_URL` and then run Alembic, which imports `open_webui.env`. That module calls `load_dotenv`. If a repository `.env` filled every `DATABASE_*` variable the scripts leave unset, `open_webui.env` would rebuild `DATABASE_URL` from them and point the harness upgrade/downgrade at a database outside `.run/data` (#449). The other harness launchers already prevent this with `PYTHON_DOTENV_DISABLED=1` (`scripts/dev-env.sh`, `scripts/verify-office.sh`).

## What Changes

- Both database scripts export `PYTHON_DOTENV_DISABLED=1` before any Alembic process. `db-verify.sh` sets it itself as well, because exports made by its child `db-reset.sh` do not reach the parent shell, and the parent runs its own downgrade/upgrade.
- Extend the harness-environment behavior suite: every Alembic process the two scripts start receives the truthy flag even when the parent leaves it unset or `false`; a synthetic in-memory dotenv carrying a complete `DATABASE_*` set cannot redirect the URL that `open_webui.env` resolves in that environment; the same input still redirects it outside the harness (proves the oracle can detect).

## Capabilities

### Modified Capabilities

- `harness-environment`: adds the database-script entrypoints to the dotenv-disabled harness surface.

## Impact

`scripts/db-reset.sh`, `scripts/db-verify.sh`, `backend/open_webui/test/test_harness_environment.py`. No change to `backend/open_webui/env.py`, migrations, the `.run/` deletion bound, Makefile targets or ordinary application startup. No real `.env` is created or read and no database is touched by the tests.

## Triage

- Issue type: bugfix
- Fixture level: expanded. The change sits on script entrypoints that delete the harness DB and run migrations; same shape as the archived #419 fixture (`2026-10-17-harness-dotenv-isolation`), which was expanded.
- Upstream suggested level: absent
- Blast radius: a harness reset/verify migrating or downgrading a non-harness database
- Selected risk packs: Public API / CLI / script entry; Config / project setup; Auth / permissions / secrets; File IO / path safety (test isolation and preserved deletion bound)
- Evidence floor: `make test-harness-env` (new cases red before the script change, green after), `make db-verify` exit 0, `make lint-scoped`
