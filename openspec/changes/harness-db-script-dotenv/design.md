## Context

Change surface: `scripts/db-reset.sh`, `scripts/db-verify.sh`; tests in `backend/open_webui/test/test_harness_environment.py` (`make test-harness-env`).

Consumers: `Makefile` `db-reset` / `db-verify`; CI clean runner `make db-verify` (`.github/workflows/ci.yml`); AGENTS Verification Matrix "DB migration" row.

## Decisions

- Each script exports `PYTHON_DOTENV_DISABLED=1` before its Alembic calls, with a comment naming the failure mode (dotenv `DATABASE_*` rebuilding `DATABASE_URL`) and stating dotenv path discovery still runs. `db-verify.sh` sets it itself; the child reset's exports do not propagate back.
- Not sourcing `scripts/dev-env.sh`: it exports unrelated runtime toggles (OCU, Office, CORS, ports) and a different `DATA_DIR` policy; one export matches the existing `verify-office.sh` precedent.

Must preserve: `db-reset.sh` lines setting `repo_root`, `DATA_DIR`, the `.run/` refusal case, `mkdir`, the three `rm -f` targets, `DATABASE_URL` and `WEBUI_SECRET_KEY` stay byte-identical apart from the added export; `db-verify.sh` step order and exit behavior unchanged; ordinary non-harness `open_webui.env` dotenv loading unchanged; `backend/open_webui/env.py` and migrations untouched.

Governing invariant: every Alembic process started by a harness database script resolves its target from the harness SQLite URL, never from dotenv content.

Sibling surfaces: `scripts/dev-env.sh` and `scripts/verify-office.sh` already set the flag (consistent). Other scripts that import `open_webui` without the flag (for example `scripts/coverage-gate.sh` running pytest over `open_webui`) are an explicit non-goal: report, don't fix.

## Seams and Evidence

Seam: the real scripts, executed as copies inside an isolated temporary git checkout, with a recording `uv` stand-in first on PATH.

- Isolation: `git init` in pytest `tmp_path` (outside the repo); assert `git -C <tmp> rev-parse --show-toplevel` equals `<tmp>` before running; create `<tmp>/backend/open_webui/`. Subprocess env is allowlisted (`PATH`, `HOME`, `LANG` only; no inherited `GIT_*`, `DATABASE_*`, `PYTHON_DOTENV_DISABLED`), with the parent flag then set to unset/`false` per case. `git` stays reachable.
- Recording stand-in accepts `run --quiet alembic …`, records argv, cwd, `PYTHON_DOTENV_DISABLED`, `DATA_DIR`, `DATABASE_URL`, then runs the repository's `_DOTENV_PROBE`-style import of the real `open_webui.env` with `dotenv.find_dotenv` and `DotEnv._get_stream` stubbed so only a synthetic in-memory stream (complete `DATABASE_TYPE/USER/PASSWORD/HOST/PORT/NAME`) can be read, and records the resolved `open_webui.env.DATABASE_URL`.
- Expected: reset → exactly 1 record (`upgrade head`); verify → exactly 3 (nested `upgrade head`, `downgrade -1`, `upgrade head`). Each has a truthy flag, `DATA_DIR`/`DATABASE_URL` under `<tmp>/.run/data`, and resolved URL equal to `sqlite:///<tmp>/.run/data/webui.db`. Pre-fix both parent-flag cases resolve the dotenv-constructed URL (red).
- Control (direct import probe, not through the scripts): same synthetic stream without the flag resolves the dotenv-constructed URL, proving the oracle detects redirection.
- Deletion bound: a pre-created `<tmp>/.run/data/webui.db` is removed and a sentinel file outside `<tmp>/.run/data` survives. The `.run/` refusal branch cannot fire at runtime (DATA_DIR is hardcoded before the check), so its preservation is evidenced by the unchanged diff, not a refusal test.
- Commands: `make test-harness-env`, `make db-verify`, `make lint-scoped`, `make doc-gate`.

Non-goals: inspecting a real `.env`; changing `env.py` dotenv semantics; other launchers.

Review focus: test isolation cannot reach the real `.run/data` or `.env`; every Alembic step covered; control proves detection; diff limited to the export lines.
