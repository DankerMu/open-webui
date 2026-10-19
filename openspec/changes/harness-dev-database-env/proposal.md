## Why

`scripts/dev-env.sh` is the shared runtime policy that the dev and UI launchers source: `make dev-bg`, `make smoke`, `make verify-ui`, `make e2e` and the Playwright `webServer`, all through `scripts/dev-bg.sh`. It disables dotenv content (#419), but it pins neither `DATABASE_URL` nor clears the inherited `DATABASE_TYPE/USER/PASSWORD/HOST/PORT/NAME` or `UV_ENV_FILE`.

`open_webui.main` runs `alembic upgrade head` at import. Seed, smoke and Playwright then read and write through that engine. The issue reproduced three ways (#549, fake hosts) to send the harness backend to a database outside `.run/data`:

- a single inherited `DATABASE_URL`;
- a complete set of inherited `DATABASE_*`;
- a `UV_ENV_FILE` that fills in that set. This one wins even over a pinned URL, because `env.py` rebuilds `DATABASE_URL` from it.

The database scripts (#531) and the pytest session (#543) are already pinned; this is the remaining harness entry.

## What Changes

- In `scripts/dev-env.sh`, right after `DATA_DIR` / `FRONTEND_BUILD_DIR` are validated and exported, the script:
  - unsets the six `DATABASE_*` names and `UV_ENV_FILE`;
  - exports `DATABASE_URL="sqlite:///$DATA_DIR/webui.db"`;
  - adds one comment naming the failure mode.

  It uses the validated `$DATA_DIR`, so `workspace-ui-*` instances keep their own database. The override is silent, consistent with #531 and #543: inherited PostgreSQL variables may be legitimate for other work. No new stderr label is added, because the existing provenance contract expects exactly one `harness-env:` line.

- Regression cases on the existing `source scripts/dev-env.sh` probe seam in `backend/open_webui/test/test_harness_environment.py`.

## Capabilities

### Modified Capabilities

- `harness-environment`: adds the requirement "Development and UI launchers resolve the harness database".

## Impact

Changes:

- `scripts/dev-env.sh`
- `backend/open_webui/test/test_harness_environment.py`

Unchanged:

- `backend/open_webui/env.py` (upstream)
- the database scripts
- the pytest harness
- `dev-bg.sh` call sites
- the `DATA_DIR` validation
- ordinary non-harness startup

The tests use fake `*.invalid` hosts only, never run migrations against them, and read no real `.env`.

## Triage

- Issue type: bugfix
- Fixture level: standard. It is the same mechanism as the reviewed #531 and #543 fixes, applied to one shared policy file.
- Upstream suggested level: absent
- Blast radius: a local dev or UI-verification backend migrating and writing harness data into a non-harness database. Deliberately removed capability: every `uv run` after sourcing the policy drops `UV_ENV_FILE`, and `make dev-bg` can no longer be pointed at PostgreSQL through the shell.
- Selected risk packs: Config / project setup; Auth / permissions / secrets (no fake credentials echoed).
- Evidence floor:
  - `make test-harness-env`, red before the change and green after;
  - `make smoke` and `make verify-ui` in a clean environment, as runtime evidence for the launcher;
  - `make lint-scoped`.
